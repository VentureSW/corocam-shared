// Camera connection lifecycle, modeled on the proven shape of the Python CC8_CONTROLLER
// daemon's SystemController: connect -> fetch model (retry until it works) -> load every
// readable setting once (tolerate/report individual failures) -> ready, serving a command
// queue plus a periodic background poll. Any socket failure (or a GET that exhausts its
// retries) routes to one shared reconnect path, mirroring restart_tcp() being the single
// recovery mechanism there.
//
// Merged from two independently-diverged copies (rodxa and the tablet app) when this
// package was created: startupValues (a one-time settings baseline, for a "reset to
// original" UI feature) came from the tablet; activityLog/CMD_SENT/CMD_ACKED (driven by
// commandQueue.ts's tcp_ack support) came from rodxa. The two touch disjoint context
// fields and transitions, so this is a straightforward union, not a behavioral merge.

import { assign, fromCallback, fromPromise, setup } from 'xstate';
import type { CommandResult } from './codec';
import { CommandQueue, type SetJob } from './commandQueue';
import { POLLED_COMMAND_NAMES, STARTUP_COMMAND_NAMES } from './commands';
import { createCameraConnection } from './connection';
import { decodeBlockFields, STARTUP_BLOCK_FIELDS, STARTUP_STATUS_BLOCK_FIELDS } from './registers';
import type { Transport, TransportFactory } from './transport';

export interface ActivityEntry {
  name: string;
  value: SetJob['value'];
  kind: 'sent' | 'acked';
  at: number;
}

// Internal housekeeping SETs the machine itself issues (watchdog ping, enabling
// tcp_ack) - real noise, not something a user pressed, so kept out of the log.
const INTERNAL_COMMAND_NAMES = new Set(['watchdog', 'tcp_ack']);
const ACTIVITY_LOG_LIMIT = 50;

export interface CameraContext {
  host: string;
  port: number;
  transport: Transport | null;
  transportFactory: TransportFactory;
  queue: CommandQueue | null;
  values: Record<string, CommandResult>;
  // Snapshot of `values` taken the instant loadingInitialSettings finishes — i.e. the
  // real readings the camera reported for each command at connect time, before any
  // user edit or poll response could touch them. Unlike `values` (kept live by
  // pollWatchedRegisters and every SET's optimistic update), this is written once and
  // never updated again for the lifetime of a connection — consumers use it as the
  // "what this was when we started" baseline for a long-press reset. Deliberately not
  // re-taken on reconnect: reconnecting resumes the same session from the user's
  // perspective, not a fresh baseline.
  startupValues: Record<string, CommandResult>;
  failedStartupCommands: string[];
  reconnectAttempt: number;
  lastError: string | null;
  activityLog: ActivityEntry[];
}

export type CameraEvent =
  | { type: 'CONNECT' }
  | { type: 'DISCONNECT' }
  | { type: 'CONNECTION_READY'; transport: Transport; queue: CommandQueue }
  | { type: 'TCP_CONNECTED' }
  | { type: 'TCP_ERROR'; error: string }
  | { type: 'TCP_CLOSED' }
  | { type: 'VALUE_UPDATED'; name: string; result: CommandResult }
  | { type: 'CMD_SENT'; name: string; value: SetJob['value'] }
  | { type: 'CMD_ACKED'; name: string; value: SetJob['value'] };

function appendActivity(
  log: readonly ActivityEntry[],
  name: string,
  value: SetJob['value'],
  kind: ActivityEntry['kind']
): ActivityEntry[] {
  if (INTERNAL_COMMAND_NAMES.has(name)) return log as ActivityEntry[];
  const entry: ActivityEntry = { name, value, kind, at: Date.now() };
  return [...log.slice(-(ACTIVITY_LOG_LIMIT - 1)), entry];
}

const BASE_RECONNECT_DELAY_MS = 1000;
const MAX_RECONNECT_DELAY_MS = 10000;
const POLL_INTERVAL_MS = 1000;
const WATCHDOG_INTERVAL_MS = 15000;

export const cameraMachine = setup({
  types: {
    context: {} as CameraContext,
    events: {} as CameraEvent,
    input: {} as { host: string; port: number; transportFactory: TransportFactory },
  },
  actors: {
    // Owns one Transport + CommandQueue for the lifetime of the `online` state.
    // Exiting `online` (from anywhere) automatically stops this actor, which runs the
    // cleanup below — no separate teardown action is needed elsewhere.
    connectionWatcher: fromCallback<
      CameraEvent,
      { host: string; port: number; transportFactory: TransportFactory }
    >(({ input, sendBack }) => {
      const { transport, queue } = createCameraConnection(
        input.host,
        input.port,
        {
          onConnect: () => sendBack({ type: 'TCP_CONNECTED' }),
          onError: (err) => sendBack({ type: 'TCP_ERROR', error: err.message }),
          onClose: () => sendBack({ type: 'TCP_CLOSED' }),
          onSetSent: (name, value) => sendBack({ type: 'CMD_SENT', name, value }),
          onAck: (name, value) => sendBack({ type: 'CMD_ACKED', name, value }),
        },
        input.transportFactory
      );
      sendBack({ type: 'CONNECTION_READY', transport, queue });
      transport.connect();
      return () => {
        queue.clear(new Error('Connection torn down'));
        transport.disconnect();
      };
    }),
    fetchModel: fromPromise<CommandResult, { queue: CommandQueue }>(({ input }) => input.queue.get('model')),
    loadInitialSettings: fromPromise<
      { values: Record<string, CommandResult>; failed: string[] },
      { queue: CommandQueue }
    >(async ({ input }) => {
      const values: Record<string, CommandResult> = {};
      const failed: string[] = [];

      // One bulk blockaddr=0 blockdata read replaces 24 of the individual GETs below -
      // see STARTUP_BLOCK_FIELDS/docs/corocam-command-testing.md's `blockdata` entry for
      // exactly which names and why not more (a confirmed NIOS firmware bug means only
      // word 0-121 of SystemSettings_s is reachable at all this way, and 244 - not the
      // source-predicted 248 - is the real bisected safe ceiling). This is a latency
      // optimization, not something startup should ever hard-fail on - any failure here
      // just falls through to the per-name loop fetching these same names individually,
      // identical to how every other name already behaves.
      try {
        const bytes = await input.queue.readSettingsBlock(244);
        const decoded = decodeBlockFields(bytes, STARTUP_BLOCK_FIELDS);
        for (const [name, value] of Object.entries(decoded)) {
          values[name] = { kind: 'int', value };
        }
      } catch {
        // Fall through - the loop below fetches these individually instead.
      }

      // A second bulk read, SystemStatus_s this time (BLOCKDATA_STATUS_SELECT), replaces
      // 7 more. `exposure` needs its 16-bit decode masked to a byte - see
      // STARTUP_STATUS_BLOCK_FIELDS's own comment for why (an AE sentinel value that
      // only diverges from the 8-bit wire value at exactly -1/0xFFFF).
      try {
        const bytes = await input.queue.readStatusBlock(212);
        const decoded = decodeBlockFields(bytes, STARTUP_STATUS_BLOCK_FIELDS);
        for (const [name, value] of Object.entries(decoded)) {
          values[name] = { kind: 'int', value: name === 'exposure' ? value & 0xff : value };
        }
      } catch {
        // Fall through - the loop below fetches these individually instead.
      }

      for (const name of STARTUP_COMMAND_NAMES) {
        if (name in values) continue; // already filled by the block read above
        try {
          values[name] = await input.queue.get(name);
        } catch {
          failed.push(name);
        }
      }
      return { values, failed };
    }),
    pollWatchedRegisters: fromPromise<Record<string, CommandResult>, { queue: CommandQueue }>(async ({ input }) => {
      const values: Record<string, CommandResult> = {};
      for (const name of POLLED_COMMAND_NAMES) {
        values[name] = await input.queue.get(name);
      }
      return values;
    }),
    sendWatchdogPing: fromPromise<void, { queue: CommandQueue }>(({ input }) => input.queue.set('watchdog', 60)),
  },
  delays: {
    RECONNECT_DELAY: ({ context }) =>
      Math.min(BASE_RECONNECT_DELAY_MS * 2 ** context.reconnectAttempt, MAX_RECONNECT_DELAY_MS),
  },
}).createMachine({
  id: 'camera',
  context: ({ input }) => ({
    host: input.host,
    port: input.port,
    transport: null,
    transportFactory: input.transportFactory,
    queue: null,
    values: {},
    startupValues: {},
    failedStartupCommands: [],
    reconnectAttempt: 0,
    lastError: null,
    activityLog: [],
  }),
  initial: 'disconnected',
  // Handled here (root) so they apply no matter which nested state is active,
  // including deep inside `online.ready`'s parallel regions.
  on: {
    CONNECTION_READY: {
      actions: assign({
        transport: ({ event }) => event.transport,
        queue: ({ event }) => event.queue,
      }),
    },
    VALUE_UPDATED: {
      actions: assign({
        values: ({ context, event }) => ({ ...context.values, [event.name]: event.result }),
      }),
    },
    CMD_SENT: {
      actions: assign({
        activityLog: ({ context, event }) => appendActivity(context.activityLog, event.name, event.value, 'sent'),
      }),
    },
    CMD_ACKED: {
      actions: assign({
        activityLog: ({ context, event }) => appendActivity(context.activityLog, event.name, event.value, 'acked'),
      }),
    },
    TCP_ERROR: {
      target: '.reconnectWait',
      actions: assign({ lastError: ({ event }) => event.error }),
    },
    TCP_CLOSED: { target: '.reconnectWait' },
    DISCONNECT: { target: '.disconnected' },
  },
  states: {
    disconnected: {
      on: { CONNECT: 'online' },
    },
    online: {
      invoke: {
        src: 'connectionWatcher',
        input: ({ context }) => ({
          host: context.host,
          port: context.port,
          transportFactory: context.transportFactory,
        }),
      },
      initial: 'connecting',
      states: {
        connecting: {
          on: { TCP_CONNECTED: 'fetchingModel' },
        },
        fetchingModel: {
          invoke: {
            src: 'fetchModel',
            input: ({ context }) => ({ queue: context.queue! }),
            onDone: {
              target: 'loadingInitialSettings',
              actions: assign({
                values: ({ context, event }) => ({ ...context.values, model: event.output }),
                // A successful command round-trip proves the link is healthy again — clear
                // any stale error from a prior connection attempt so it doesn't linger in
                // the UI forever after a successful reconnect.
                lastError: () => null,
              }),
            },
            onError: '#camera.reconnectWait',
          },
        },
        loadingInitialSettings: {
          invoke: {
            src: 'loadInitialSettings',
            input: ({ context }) => ({ queue: context.queue! }),
            onDone: {
              target: 'ready',
              actions: assign({
                values: ({ context, event }) => ({ ...context.values, ...event.output.values }),
                // Only ever populated from an *empty* startupValues, so a later
                // reconnect's own loadingInitialSettings pass (this same onDone,
                // running again) leaves an already-captured baseline alone. A command
                // that failed on the very first connect (see failedStartupCommands)
                // never gets a startupValues entry even if a later reconnect fetches
                // it successfully — an accepted gap, not fixed here.
                startupValues: ({ context, event }) =>
                  Object.keys(context.startupValues).length === 0 ? event.output.values : context.startupValues,
                failedStartupCommands: ({ event }) => event.output.failed,
              }),
            },
            onError: '#camera.reconnectWait',
          },
        },
        ready: {
          type: 'parallel',
          entry: ({ context }) => {
            // Fire-and-forget, matching the protocol's SET semantics — no need to await.
            context.queue?.set('watchdog', 60).catch(() => {});
            // Enables tcp_ack (commands.ts) so subsequent SETs get a real completion
            // confirmation instead of resolving the instant the bytes are written —
            // see commandQueue.ts's onAck/recentSets.
            context.queue?.set('tcp_ack', 1).catch(() => {});
          },
          states: {
            pollingLoop: {
              initial: 'waiting',
              states: {
                waiting: { after: { [POLL_INTERVAL_MS]: 'polling' } },
                polling: {
                  invoke: {
                    src: 'pollWatchedRegisters',
                    input: ({ context }) => ({ queue: context.queue! }),
                    onDone: {
                      target: 'waiting',
                      actions: assign({
                        values: ({ context, event }) => ({ ...context.values, ...event.output }),
                      }),
                    },
                    onError: 'waiting',
                  },
                },
              },
            },
            watchdogLoop: {
              initial: 'waiting',
              states: {
                waiting: { after: { [WATCHDOG_INTERVAL_MS]: 'pinging' } },
                pinging: {
                  invoke: {
                    src: 'sendWatchdogPing',
                    input: ({ context }) => ({ queue: context.queue! }),
                    onDone: 'waiting',
                    onError: 'waiting',
                  },
                },
              },
            },
          },
        },
      },
    },
    reconnectWait: {
      id: 'camera.reconnectWait',
      entry: assign({ reconnectAttempt: ({ context }) => context.reconnectAttempt + 1 }),
      after: {
        RECONNECT_DELAY: 'online',
      },
    },
  },
});
