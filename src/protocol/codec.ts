// Bridges CommandDef <-> JS values for command arguments (SET) and results (GET).

import { integerToLittleEndian, littleEndianToInteger, listToString } from './packet';
import type { CommandDef } from './types';

export type CommandResult =
  | { kind: 'int'; value: number }
  | { kind: 'string'; value: string }
  | { kind: 'data'; value: number[] };

/**
 * A little-endian integer wider than 6 bytes (48 bits) can exceed
 * Number.MAX_SAFE_INTEGER and silently lose precision as a plain JS number.
 * Fail loudly instead of returning a corrupted value.
 */
const MAX_SAFE_INT_ARG_BYTES = 6;

export function decodeResult(def: CommandDef, args: readonly number[]): CommandResult {
  switch (def.argType) {
    case 'int': {
      if (def.argBytes > MAX_SAFE_INT_ARG_BYTES) {
        throw new Error(
          `Command "${def.name}": ${def.argBytes}-byte int result can't be safely decoded as a JS number`
        );
      }
      const raw = littleEndianToInteger(args);
      // Two's-complement sign extension for commands in SIGNED_COMMANDS (commands.ts) -
      // littleEndianToInteger itself always decodes unsigned, so e.g. ir_tlo's raw 65456
      // (16-bit) must become -80 here, not stay a huge positive number that then clamps
      // to whichever UI item's declared max instead of showing the real reading.
      if (def.signed) {
        const bits = def.argBytes * 8;
        const signBit = 2 ** (bits - 1);
        return { kind: 'int', value: raw >= signBit ? raw - 2 ** bits : raw };
      }
      return { kind: 'int', value: raw };
    }
    case 'string':
      return { kind: 'string', value: listToString(args) };
    case 'data':
      return { kind: 'data', value: [...args] };
    case 'filelist':
      throw new Error(`Command "${def.name}": filelist results are not supported`);
  }
}

export function encodeArgs(
  def: CommandDef,
  value: number | string | readonly number[] | undefined
): number[] {
  switch (def.argType) {
    case 'int': {
      if (def.argBytes < 0) {
        throw new Error(`Command "${def.name}": variable-length int arguments are not supported`);
      }
      if (typeof value !== 'number') {
        throw new Error(`Command "${def.name}": expected a numeric value`);
      }
      return integerToLittleEndian(value, def.argBytes);
    }
    case 'string': {
      if (typeof value !== 'string') {
        throw new Error(`Command "${def.name}": expected a string value`);
      }
      return [...value].map((ch) => ch.charCodeAt(0)).concat(0);
    }
    case 'data': {
      if (!Array.isArray(value)) {
        throw new Error(`Command "${def.name}": expected a byte array value`);
      }
      return [...value];
    }
    case 'filelist':
      throw new Error(`Command "${def.name}": filelist arguments are not supported`);
  }
}
