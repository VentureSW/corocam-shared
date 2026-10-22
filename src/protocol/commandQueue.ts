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
import { integerToLittleEndian, makeCommandPacket } from './packet';
import {
  BLOCKDATA_STATUS_SELECT,
  decodeBlockFields,
  getRegisterAddress,
  STARTUP_BLOCK_FIELDS,
  STARTUP_STATUS_BLOCK_FIELDS,
} from './registers';
import type { CommandDef, RawPacket } from './types';

interface GetJob {
  kind: 'get';
  name: string;
  /**
   * Raw argument bytes to send with the GET request itself. Every command except
   * read_register sends none (see dispatch) — this only exists for read_register's
   * 2-byte register address, which the wire protocol genuinely needs on the request
   * side of a query. See CommandQueue.readRegister.
   */
  args?: readonly number[];
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

  get(name: string, args?: readonly number[]): Promise<CommandResult> {
    return new Promise((resolve, reject) => {
      const def = this.resolveDef(name, reject);
      if (!def) return;
      if (def.access !== 'get' && def.access !== 'both') {
        reject(new Error(`Command "${name}" is not readable`));
        return;
      }
      this.queue.push({ kind: 'get', name, args, resolve, reject });
      this.pump();
    });
  }

  /**
   * Reads one raw system register — command 72 (read_register), confirmed against the
   * original Python reference (not the PDF spec, which only says "Query arbitrary system
   * registers... not documented here"). Unlike every other GET, this one sends a 2-byte
   * LE register address as its own request argument; the reply is the register's 2-byte
   * value. Pass a number for a raw word-address, or a name from registers.ts
   * (case-insensitive) to resolve one — see getRegisterAddress for how name collisions
   * between the settings/status maps are resolved.
   */
  async readRegister(addressOrName: number | string): Promise<number> {
    const address = this.resolveRegisterAddress(addressOrName);
    const result = await this.get('read_register', integerToLittleEndian(address & 0xffff, 2));
    if (result.kind !== 'int') {
      throw new Error(`read_register: unexpected result kind "${result.kind}"`);
    }
    return result.value;
  }

  /**
   * Writes one raw system register — command 72 (write_register). The wire argument
   * packs two 2-byte LE fields into one 4-byte payload (address then value); encoding
   * that as the single 32-bit number `address | (value << 16)` through the existing
   * 4-byte int encodeArgs path produces the identical bytes, so this just reuses set()
   * rather than needing a bespoke composite encoder. Fire-and-forget, like every other
   * SET — no reply, no confirmation the write was applied.
   */
  writeRegister(addressOrName: number | string, value: number): Promise<void> {
    const address = this.resolveRegisterAddress(addressOrName);
    const packed = (address & 0xffff) | ((value & 0xffff) << 16);
    return this.set('write_register', packed);
  }

  /**
   * IR temperature display unit — register `IR_Fahrenheit` (settings, address 118, see
   * registers.ts). Pure display-unit toggle on the camera's own OSD: every underlying
   * temperature register (ir_tlo/ir_thi/env_temp/etc.) always stays in Celsius regardless
   * of this setting (confirmed from docs/CC8/control.c and cc6-hd-nios's m81func.c, whose
   * rendering sites all read Celsius then conditionally convert right before formatting).
   * No numbered command reaches this - register-only, live-tested 2026-10-21 (read/write/
   * read-back round-tripped cleanly, connection stayed healthy throughout).
   */
  async getTemperatureUnit(): Promise<'C' | 'F'> {
    const raw = await this.readRegister('IR_Fahrenheit');
    return raw ? 'F' : 'C';
  }

  setTemperatureUnit(unit: 'C' | 'F'): Promise<void> {
    return this.writeRegister('IR_Fahrenheit', unit === 'F' ? 1 : 0);
  }

  /**
   * Reads raw bytes from SystemSettings_s via blockdata (command 39) - always starting
   * at byte 0, regardless of what blockaddr is set to: a confirmed NIOS firmware bug
   * means Baddr is never added to the copy source pointer, so arbitrary-offset reads
   * don't work on this firmware (see docs/corocam-command-testing.md's `blockdata`
   * entry). `blocklen` is capped by the caller; 244 is the live-bisected safe ceiling
   * used by STARTUP_BLOCK_FIELDS (the camera's own spec, CC8HD-Remote.pdf section 7.59,
   * documents 248 bytes as the Ethernet/TCP-interface limit - 244 lands just under that,
   * confirmed by stepping sizes up live rather than assumed from the spec number alone).
   * SETs blockaddr=0
   * explicitly every time rather than assuming it's already 0 - an earlier test session
   * left it nonzero, and this queue has no way to know what state a previous session (or
   * another client) left it in.
   */
  async readSettingsBlock(blocklen: number): Promise<number[]> {
    await this.set('blockaddr', 0);
    await this.set('blocklen', blocklen);
    const result = await this.get('blockdata');
    if (result.kind !== 'data') {
      throw new Error(`blockdata: unexpected result kind "${result.kind}"`);
    }
    return result.value;
  }

  /**
   * Same as readSettingsBlock, but reads SystemStatus_s instead - blockdata's own
   * address-space selector (BLOCKDATA_STATUS_SELECT, see registers.ts) is unrelated to
   * read_register/write_register's +0x2000 status offset; don't conflate the two.
   */
  async readStatusBlock(blocklen: number): Promise<number[]> {
    await this.set('blockaddr', BLOCKDATA_STATUS_SELECT);
    await this.set('blocklen', blocklen);
    const result = await this.get('blockdata');
    if (result.kind !== 'data') {
      throw new Error(`blockdata: unexpected result kind "${result.kind}"`);
    }
    return result.value;
  }

  /**
   * Fetches every block-readable startup value in one call: one bulk read of
   * SystemSettings_s (readSettingsBlock(244)) plus one of SystemStatus_s
   * (readStatusBlock(212)) - 6 round-trips total instead of one get() per name.
   * Covers the 31 names in STARTUP_BLOCK_FIELDS/STARTUP_STATUS_BLOCK_FIELDS; see
   * docs/corocam-command-testing.md's `blockdata` entry (rodxa repo) for why exactly
   * these 31 and not more - a confirmed NIOS firmware bug caps what's reachable this
   * way, both in which struct and how much of it.
   *
   * Each half is independently best-effort and this never throws: a failure in one
   * doesn't lose the other, and any name missing from the result here (including all
   * of them, if both halves failed) just means the caller should fall back to its own
   * individual get() calls for that name - exactly what machine.ts's loadInitialSettings
   * does, and the same pattern any other consumer of this queue should follow.
   */
  async getStartupBlockValues(): Promise<Record<string, CommandResult>> {
    const values: Record<string, CommandResult> = {};

    try {
      const bytes = await this.readSettingsBlock(244);
      for (const [name, value] of Object.entries(decodeBlockFields(bytes, STARTUP_BLOCK_FIELDS))) {
        values[name] = { kind: 'int', value };
      }
    } catch {
      // Best-effort - see doc comment above.
    }

    try {
      const bytes = await this.readStatusBlock(212);
      for (const [name, value] of Object.entries(decodeBlockFields(bytes, STARTUP_STATUS_BLOCK_FIELDS))) {
        // exposure's wire value is 8-bit; SonyIris (the backing struct field) is a full
        // 16-bit word - see STARTUP_STATUS_BLOCK_FIELDS's own comment for why this needs
        // masking (invisible except at the AE/-1 sentinel, 0xFFFF vs 0xFF).
        values[name] = { kind: 'int', value: name === 'exposure' ? value & 0xff : value };
      }
    } catch {
      // Best-effort - see doc comment above.
    }

    return values;
  }

  private resolveRegisterAddress(addressOrName: number | string): number {
    if (typeof addressOrName === 'number') return addressOrName;
    const address = getRegisterAddress(addressOrName);
    if (address === undefined) {
      throw new Error(`Unknown register name: "${addressOrName}"`);
    }
    return address;
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
      this.opts.send(makeCommandPacket(def.id, job.args ?? [], true, seq));
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
