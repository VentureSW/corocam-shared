// The byte-transport contract connection.ts/machine.ts depend on. Each consuming project
// supplies its own concrete implementation (rodxa wraps Node's `net`, the tablet app wraps
// react-native-tcp-socket) — this package owns none of them, since they're inherently
// platform-specific. Both existing implementations already share this exact shape, so
// adopting it is just adding `implements Transport` to each as a compile-time cross-check.

import type { RawPacket } from './types';

export interface TransportOptions {
  host: string;
  port: number;
  onPacket: (pkt: RawPacket) => void;
  onConnect?: () => void;
  onError?: (err: Error) => void;
  onClose?: (hadError: boolean) => void;
  /** Platform-dependent default — Node's `net.connect`/RN's TcpSocket otherwise hang
   * forever with no error on an unreachable/wrong/filtered port instead of failing visibly. */
  connectTimeoutMs?: number;
}

export interface Transport {
  connect(): void;
  send(bytes: readonly number[]): void;
  disconnect(): void;
}

/** Passed as a class (not an instance) — connection.ts constructs it once it has the
 * onPacket callback wired up to the CommandQueue it's also constructing. */
export type TransportFactory = new (opts: TransportOptions) => Transport;
