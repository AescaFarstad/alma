// Compact, single-buffer event stream utilities for JS<->WASM turns.
// Layout per event (all little-endian):
// - header u32: low 16 bits = type, high 16 bits = size in dwords (including header)
// - payload: packed words; floats read via Float32 view.

export const EVENT_BUFFER_WORDS = 65536;

export class EventBuffer {
  u32!: Uint32Array;
  f32!: Float32Array;
  capWords: number = 0;
  cursor: number = 0;

  constructor(buffer: ArrayBuffer, basePtrBytes: number, capWords: number) {
  this.u32 = new Uint32Array(buffer, basePtrBytes, capWords);
  this.f32 = new Float32Array(buffer, basePtrBytes, capWords);
  this.capWords = capWords;
  this.cursor = 0;
  }

  public writeHeader(type: number, sizeWords: number): void {
  if (this.cursor + sizeWords >= this.capWords) throw new Error("event buffer full");
  this.u32[this.cursor] = ((sizeWords & 0xffff) << 16) | (type & 0xffff);
  }

  public beginFrame(): void {
  this.cursor = 0;
  }

  public commitFrame(): void {
  this.u32[this.cursor] = 0;
  }
}
/*
export function forEachEvent(
  buf: EventBuffer,
  handlers: {
  mixed?: (x: number, y: number) => void;
  unknown?: (type: number, sizeWords: number, startWord: number) => void;
  },
): void {
  let p = 0;
  const cap = buf.capWords;
  while (true) {
  const header = buf.u32[p] >>> 0;
  if (header === 0) break;
  const type = header & 0xffff;
  const size = header >>> 16;
  if (size <= 0 || p + size > cap) break; // malformed; stop

  switch (type) {
    case EVT_MIXED: {
    const x = buf.f32[p + 1];
    const y = buf.f32[p + 2];
    handlers.mixed?.(x, y);
    break;
    }
    default:
    handlers.unknown?.(type, size, p);
    break;
  }

  p += size;
  }
}
*/
