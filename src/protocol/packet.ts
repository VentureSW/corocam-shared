// Packet builder/parser for the CC8HD camera protocol.
// Wire format: [0x01, ID, LEN, SEQ, CMD, ...ARGS, CHECKSUM]
//   ID      = 0x48 for a command, OR 0x80 in for a query/GET (0xC8)
//   LEN     = 1 (CMD byte) + ARGS.length
//   SEQ     = rolling 0-255 counter, owned by the caller (see commandQueue.ts)
//   CHECKSUM = XOR of every preceding byte
//
// A GET's ARGS is empty for every command except read_register (commands.ts id 72),
// which sends its 2-byte register address as the GET's own request argument — nothing
// in this wire format actually forbids a GET from carrying args, every other command
// just never needs to. See CommandQueue.get's optional `args` param.
//
// Originally ported from mod/cc8hdprotocol.py (MakeCmdPkt/CalcCrc/StripHdrPkt/GetPktArgs).

import type { RawPacket } from './types';

export const START_BYTE = 0x01;
export const PACKET_ID = 0x48;
export const QUERY_BIT = 0x80;

export function calcChecksum(bytes: readonly number[]): number {
  let crc = 0;
  for (const v of bytes) crc ^= v;
  return crc;
}

export function makeCommandPacket(
  cmd: number,
  args: readonly number[],
  isQuery: boolean,
  seq: number
): number[] {
  const id = isQuery ? PACKET_ID | QUERY_BIT : PACKET_ID;
  const pkt = [START_BYTE, id, args.length + 1, seq & 0xff, cmd, ...args];
  pkt.push(calcChecksum(pkt));
  return pkt;
}

export function integerToLittleEndian(value: number, byteCount: number): number[] {
  let v = value < 0 ? 2 ** (byteCount * 8) + value : value;
  const bytes: number[] = [];
  for (let i = 0; i < byteCount; i++) {
    bytes.push(v & 0xff);
    v = Math.floor(v / 256);
  }
  return bytes;
}

export function littleEndianToInteger(bytes: readonly number[]): number {
  let value = 0;
  for (let i = bytes.length - 1; i >= 0; i--) {
    value = value * 256 + bytes[i];
  }
  return value;
}

/** Reads a NUL-terminated byte list as an ASCII string, stopping at the first 0 byte. */
export function listToString(bytes: readonly number[]): string {
  let s = '';
  for (const b of bytes) {
    if (b === 0) break;
    s += String.fromCharCode(b);
  }
  return s;
}

/** Extracts the ARGS bytes (excludes CMD, and the leading START/ID/LEN/SEQ header + trailing checksum). */
export function getPacketArgs(packetBytes: readonly number[]): number[] {
  return packetBytes.slice(5, -1);
}

export class PacketFramingError extends Error {}

/**
 * Parses one already-delimited packet (as produced by PacketFramer) into a RawPacket.
 * Throws PacketFramingError if the structure or checksum is invalid.
 */
export function parsePacket(packetBytes: readonly number[]): RawPacket {
  if (packetBytes.length < 6) {
    throw new PacketFramingError(`Packet too short: ${packetBytes.length} bytes`);
  }
  if (packetBytes[0] !== START_BYTE) {
    throw new PacketFramingError(`Bad start byte: 0x${packetBytes[0].toString(16)}`);
  }
  const len = packetBytes[2];
  if (packetBytes.length !== len + 5) {
    throw new PacketFramingError(
      `Length mismatch: LEN=${len} implies ${len + 5} bytes, got ${packetBytes.length}`
    );
  }
  const checksum = packetBytes[packetBytes.length - 1];
  const calculated = calcChecksum(packetBytes.slice(0, -1));
  if (checksum !== calculated) {
    throw new PacketFramingError(`Checksum mismatch: got 0x${checksum.toString(16)}, expected 0x${calculated.toString(16)}`);
  }
  return {
    id: packetBytes[1],
    seq: packetBytes[3],
    cmd: packetBytes[4],
    args: getPacketArgs(packetBytes),
    bytes: packetBytes,
  };
}
