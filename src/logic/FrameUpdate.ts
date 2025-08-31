// A lightweight, global per-frame update signal for UI components
// Components can subscribe to receive a callback each game frame.

export type FrameListener = (dt: number, time: number) => void;

const listeners = new Set<FrameListener>();

export function subscribeFrameUpdate(listener: FrameListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function dispatchFrameUpdate(dt: number, time: number): void {
  for (const l of listeners) {
    try {
      l(dt, time);
    } catch (e) {
      console.error('[FrameUpdate] listener error', e);
    }
  }
}

