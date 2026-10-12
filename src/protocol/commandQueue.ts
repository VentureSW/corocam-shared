// Single-writer command queue: serializes everything sent to the camera over one
// TCP connection (mirrors the Python reference's "one thread owns the socket" design).
//
// GET waits for a matching reply (by CMD + SEQ, per CC8_INTERFACE.get_command_value's
// validation) with a timeout + limited retries. SET is fire-and-forget — the protocol
// never replies to a SET by default (CameraController.set_command_value sends with
// answ=False) — so it resolves as soon as the bytes are written and never occupies the
// in-flight slot. tcp_ack (see commands.ts) is the one opt-in exception: once enabled,
// the camera spontaneously sends an ack after a SET completes, tracked below via
// recentSets/onSetSent/onAck.

import { decodeResult, encodeArgs, type CommandResult } from './codec';
import { getCommandByName } from './commands';
import { makeCommandPacket } from './packet';
import type { CommandDef, RawPacket } from './types';

interface GetJob {
  kind: 'get';
  name: string;
  resolve: (result: CommandResult) => void;
  reject: (err: Error) => void;
}
export interface SetJob {
  kind: 'set';
  name: string;
  value: number | string | readonly number[] | undefined;
  resolve: () => void;
  reject: (err: Error) => void;
}
type Job = GetJob | SetJob;

interface PendingRequest {
  seq: number;
  cmd: number;
  def: CommandDef;
  job: GetJob;
  retriesLeft: number;
  timer: ReturnType<typeof setTimeout>;
}

export interface CommandQueueOptions {
  send: (bytes: readonly number[]) => void;
  timeoutMs?: number;
  retries?: number;
  /** A GET exhausted its retries — the caller treats this as a connection-level failure. */
  onTimeoutExhausted?: (err: Error) => void;
  /** A reply arrived with nothing in flight, or that didn't match what's in flight. */
  onUnsolicited?: (pkt: RawPacket) => void;
  /** A SET was just written to the wire (before any confirmation it was applied). */
  onSetSent?: (name: string, value: SetJob['value']) => void;
  /**
   * The camera confirmed a SET actually completed (see tcp_ack in commands.ts) — only
   * fires once tcp_ack has been enabled; SETs sent before that point or while it's
   * disabled just never get this callback.
   */
  onAck?: (name: string, value: SetJob['value']) => void;
}

const DEFAULT_TIMEOUT_MS = 800;
const DEFAULT_RETRIES = 2;
const TCP_ACK_CMD_ID = getCommandByName('tcp_ack').id;
// Bounds recentSets below in case acks are disabled/lost - entries are only ever meant
// to live a few hundred ms (one round trip), this is just a safety net against
// unbounded growth, not a real operating limit.
const MAX_RECENT_SETS = 32;

function toError(err: unknown): Error {
  return err instanceof Error ? err : new Error(String(err));
}

export class CommandQueue {
  private readonly opts: CommandQueueOptions;
  private seq = 0;
  private queue: Job[] = [];
  private inFlight: PendingRequest | null = null;
  // Tracks SETs awaiting a tcp_ack confirmation, keyed by the seq they were sent with
  // (the packet counter the camera's ack will echo back). See handlePacket.
  private readonly recentSets = new Map<number, { name: string; value: SetJob['value'] }>();

  constructor(opts: CommandQueueOptions) {
    this.opts = opts;
  }

  get(name: string): Promise<CommandResult> {
    return new Promise((resolve, reject) => {
      const def = this.resolveDef(name, reject);
      if (!def) return;
      if (def.access !== 'get' && def.access !== 'both') {
        reject(new Error(`Command "${name}" is not readable`));
        return;
      }
      this.queue.push({ kind: 'get', name, resolve, reject });
      this.pump();
    });
  }

  set(name: string, value?: number | string | readonly number[]): Promise<void> {
    return new Promise((resolve, reject) => {
      const def = this.resolveDef(name, reject);
      if (!def) return;
      if (def.access !== 'set' && def.access !== 'both') {
        reject(new Error(`Command "${name}" is not writable`));
        return;
      }
      this.queue.push({ kind: 'set', name, value, resolve, reject });
      this.pump();
    });
  }

  handlePacket(pkt: RawPacket): void {
    if (!this.inFlight || pkt.cmd !== this.inFlight.cmd || pkt.seq !== this.inFlight.seq) {
      // A spontaneous tcp_ack packet for an earlier SET: real GET replies to tcp_ack
      // itself are already handled above via inFlight (same cmd id, different seq
      // semantics), so only treat this as an ack if its counter matches a SET we're
      // still tracking.
      if (pkt.cmd === TCP_ACK_CMD_ID) {
        const entry = this.recentSets.get(pkt.seq);
        if (entry) {
          this.recentSets.delete(pkt.seq);
          this.opts.onAck?.(entry.name, entry.value);
          return;
        }
      }
      // Unsolicited, or a stale/mismatched reply to a request we've already given up on
      // (e.g. after a retry re-sent with a fresh seq) — ignore and keep waiting.
      this.opts.onUnsolicited?.(pkt);
      return;
    }
    const req = this.inFlight;
    clearTimeout(req.timer);
    this.inFlight = null;
    try {
      req.job.resolve(decodeResult(req.def, pkt.args));
    } catch (err) {
      req.job.reject(toError(err));
    }
    this.pump();
  }

  /** Rejects everything in-flight and queued. Call on disconnect/teardown. */
  clear(reason: Error): void {
    if (this.inFlight) {
      clearTimeout(this.inFlight.timer);
      this.inFlight.job.reject(reason);
      this.inFlight = null;
    }
    const pending = this.queue;
    this.queue = [];
    for (const job of pending) job.reject(reason);
  }

  private resolveDef(name: string, reject: (err: Error) => void): CommandDef | null {
    try {
      return getCommandByName(name);
    } catch (err) {
      reject(toError(err));
      return null;
    }
  }

  private nextSeq(): number {
    const s = this.seq;
    this.seq = (this.seq + 1) & 0xff;
    return s;
  }

  private pump(): void {
    if (this.inFlight || this.queue.length === 0) return;
    const job = this.queue.shift()!;
    this.dispatch(job, this.opts.retries ?? DEFAULT_RETRIES);
  }

  private dispatch(job: Job, retriesLeft: number): void {
    const def = this.resolveDef(job.name, job.reject);
    if (!def) {
      this.pump();
      return;
    }
    const seq = this.nextSeq();

    if (job.kind === 'set') {
      let args: number[];
      try {
        args = encodeArgs(def, job.value);
      } catch (err) {
        job.reject(toError(err));
        this.pump();
        return;
      }
      try {
        this.opts.send(makeCommandPacket(def.id, args, false, seq));
      } catch (err) {
        job.reject(toError(err));
        this.pump();
        return;
      }
      // Recorded regardless of whether tcp_ack is actually enabled right now - a stale
      // entry just sits harmlessly until MAX_RECENT_SETS evicts it.
      this.recentSets.set(seq, { name: job.name, value: job.value });
      if (this.recentSets.size > MAX_RECENT_SETS) {
        const oldestSeq = this.recentSets.keys().next().value;
        if (oldestSeq !== undefined) this.recentSets.delete(oldestSeq);
      }
      this.opts.onSetSent?.(job.name, job.value);
      job.resolve();
      this.pump(); // fire-and-forget: never occupies `inFlight`, keep draining immediately
      return;
    }

    // GET
    const timeoutMs = this.opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const req: PendingRequest = {
      seq,
      cmd: def.id,
      def,
      job,
      retriesLeft,
      timer: setTimeout(() => this.onTimeout(req), timeoutMs),
    };
    this.inFlight = req;
    try {
      this.opts.send(makeCommandPacket(def.id, [], true, seq));
    } catch (err) {
      clearTimeout(req.timer);
      this.inFlight = null;
      job.reject(toError(err));
      this.pump();
    }
  }

  private onTimeout(req: PendingRequest): void {
    if (this.inFlight !== req) return; // already resolved/rejected — stale timer
    this.inFlight = null;
    if (req.retriesLeft > 0) {
      this.dispatch(req.job, req.retriesLeft - 1);
      return;
    }
    const err = new Error(`Command "${req.job.name}" timed out with no response`);
    req.job.reject(err);
    this.opts.onTimeoutExhausted?.(err);
    this.pump();
  }
}
