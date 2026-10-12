// Splits a raw TCP byte stream into discrete camera-protocol packets.
//
// Unlike BLE notifications (one characteristic write = one discrete packet), TCP delivers
// an undifferentiated byte stream: a single `data` event can contain zero, one, several, or
// a fraction of a packet. This buffers incoming bytes and extracts complete packets as they
// become available. Originally ported from mod/cc8hdprotocol.py's StripHdrPkt.

import { PACKET_ID, START_BYTE, parsePacket } from './packet';
import type { RawPacket } from './types';

/** Safety cap: max garbage bytes dropped while resyncing in a single push() call. */
const MAX_RESYNC_BYTES = 4096;

export class FramingDesyncError extends Error {}

export class PacketFramer {
  private buffer: number[] = [];

  reset(): void {
    this.buffer = [];
  }

  push(chunk: ArrayLike<number>): RawPacket[] {
    for (let i = 0; i < chunk.length; i++) this.buffer.push(chunk[i]);

    const packets: RawPacket[] = [];
    let dropped = 0;

    while (this.buffer.length > 0) {
      if (this.buffer[0] !== START_BYTE || (this.buffer[1] & 0x7f) !== PACKET_ID) {
        // Not looking at a valid packet header — drop one byte and try to resync.
        if (this.buffer.length < 2) break; // wait for the next byte before judging
        this.buffer.shift();
        dropped++;
        if (dropped > MAX_RESYNC_BYTES) {
          this.buffer = [];
          throw new FramingDesyncError(
            `Dropped >${MAX_RESYNC_BYTES} bytes without finding a valid packet header`
          );
        }
        continue;
      }

      if (this.buffer.length < 3) break; // need the LEN byte to know the packet size

      const pktEnd = this.buffer[2] + 5;
      if (pktEnd > this.buffer.length) break; // incomplete packet, wait for more data

      const candidate = this.buffer.slice(0, pktEnd);
      try {
        packets.push(parsePacket(candidate));
        this.buffer = this.buffer.slice(pktEnd);
      } catch {
        // Malformed candidate (bad checksum/length) — drop one byte and resync rather
        // than trusting or repeatedly retrying the same bad header.
        this.buffer.shift();
        dropped++;
        if (dropped > MAX_RESYNC_BYTES) {
          this.buffer = [];
          throw new FramingDesyncError(
            `Dropped >${MAX_RESYNC_BYTES} bytes without finding a valid packet`
          );
        }
      }
    }

    return packets;
  }
}
