// Wires a Transport <-> CommandQueue together for one camera session. The caller injects
// which concrete Transport class to construct (see transport.ts) — this file never names
// a platform-specific implementation itself.

import { CommandQueue, type SetJob } from './commandQueue';
import type { Transport, TransportFactory } from './transport';

export interface CameraConnectionCallbacks {
  onConnect: () => void;
  onError: (err: Error) => void;
  onClose: () => void;
  onSetSent?: (name: string, value: SetJob['value']) => void;
  onAck?: (name: string, value: SetJob['value']) => void;
}

export interface CameraConnection {
  transport: Transport;
  queue: CommandQueue;
}

export function createCameraConnection(
  host: string,
  port: number,
  callbacks: CameraConnectionCallbacks,
  TransportImpl: TransportFactory
): CameraConnection {
  // `queue` is referenced by the transport's onPacket before it's constructed below —
  // resolved via this forward-declared binding.
  let queue: CommandQueue;

  const transport: Transport = new TransportImpl({
    host,
    port,
    onPacket: (pkt) => queue.handlePacket(pkt),
    onConnect: callbacks.onConnect,
    onError: callbacks.onError,
    onClose: () => callbacks.onClose(),
  });

  queue = new CommandQueue({
    send: (bytes) => transport.send(bytes),
    // An exhausted-retries GET means the connection is no longer answering —
    // treat it the same as a socket-level error (mirrors restart_tcp()'s role
    // as the single reconnect trigger in the Python reference).
    onTimeoutExhausted: callbacks.onError,
    onSetSent: callbacks.onSetSent,
    onAck: callbacks.onAck,
  });

  return { transport, queue };
}
