import type { SnapshotFrom } from 'xstate';
import type { cameraMachine } from './machine';

export type CameraStatus =
  | 'disconnected'
  | 'connecting'
  | 'fetchingModel'
  | 'loadingInitialSettings'
  | 'ready'
  | 'reconnectWait';

export function selectStatus(snapshot: SnapshotFrom<typeof cameraMachine>): CameraStatus {
  if (snapshot.matches('disconnected')) return 'disconnected';
  if (snapshot.matches('reconnectWait')) return 'reconnectWait';
  if (snapshot.matches({ online: 'connecting' })) return 'connecting';
  if (snapshot.matches({ online: 'fetchingModel' })) return 'fetchingModel';
  if (snapshot.matches({ online: 'loadingInitialSettings' })) return 'loadingInitialSettings';
  if (snapshot.matches({ online: 'ready' })) return 'ready';
  return 'disconnected';
}
