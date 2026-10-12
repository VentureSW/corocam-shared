// Camera control protocol — packet-level types.
// Reference: Corocam8 "CC8HD" protocol (mod/cc8hdprotocol.py, mod/cc8hdcommands.py).

export type ArgType = 'int' | 'string' | 'data' | 'filelist';
export type CommandAccess = 'none' | 'get' | 'set' | 'both';

export interface CommandDef {
  /** Command number. NOT unique — the source table has two duplicate ids (72, 133). */
  readonly id: number;
  /** Command name. Unique — always look commands up by name, never by id. */
  readonly name: string;
  /** Fixed argument/payload byte length, or -1 if variable-length. */
  readonly argBytes: number;
  readonly argType: ArgType;
  readonly access: CommandAccess;
  /** Human-readable explanation, from docs/CC8HD-Remote.pdf where documented. */
  readonly description: string;
}

export interface RawPacket {
  /** ID byte as received (0x48 for a command echo, 0xC8 for a query reply). */
  readonly id: number;
  readonly seq: number;
  readonly cmd: number;
  readonly args: readonly number[];
  /** Full raw packet bytes including start/id/len/seq/cmd/checksum, for logging. */
  readonly bytes: readonly number[];
}
