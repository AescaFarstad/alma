export interface ConstantsOffsets {
  STUCK_PASSIVE_X1: number;
  STUCK_DST_X2: number;
  STUCK_CORRIDOR_X3: number;
  STUCK_DECAY: number;
  STUCK_DANGER_1: number;
  STUCK_DANGER_2: number;
  STUCK_DANGER_3: number;
  PATH_LOG_RATE: number;
  CORNER_OFFSET: number;
  CORNER_OFFSET_SQ: number;
}

// Offsets in bytes; MUST stay in sync with src/wasm/constants_layout.h
export const CONSTANTS_OFFSETS: ConstantsOffsets = {
  STUCK_PASSIVE_X1: 0,
  STUCK_DST_X2: 4,
  STUCK_CORRIDOR_X3: 8,
  STUCK_DECAY: 12,
  STUCK_DANGER_1: 16,
  STUCK_DANGER_2: 20,
  STUCK_DANGER_3: 24,
  PATH_LOG_RATE: 28,
  CORNER_OFFSET: 32,
  CORNER_OFFSET_SQ: 36,
};

export const CONSTANTS_BUFFER_SIZE_BYTES = 40; // last offset 36 + 4 bytes

import { WasmModule } from "../../WasmModule";
import {
  STUCK_PASSIVE_X1,
  STUCK_DST_X2,
  STUCK_CORRIDOR_X3,
  STUCK_DECAY,
  STUCK_DANGER_1,
  STUCK_DANGER_2,
  STUCK_DANGER_3,
  PATH_LOG_RATE,
} from "../Agent";
import { CORNER_OFFSET, CORNER_OFFSET_SQ } from "../AgentNavUtils";

/**
 * Allocates a small constants buffer inside WASM, writes current TS constant values into it,
 * and registers it via _set_constants_buffer. Returns the buffer pointer.
 */
export function allocateAndUploadConstantsBuffer(wasm: WasmModule): number {
  // Allocate buffer in WASM memory
  const ptr = (wasm as any)._wasm_alloc
    ? (wasm as any)._wasm_alloc(CONSTANTS_BUFFER_SIZE_BYTES) >>> 0
    : wasm.ccall("wasm_alloc", "number", ["number"], [CONSTANTS_BUFFER_SIZE_BYTES]) >>> 0;
  if (!ptr) {
    throw new Error("Failed to allocate constants buffer in WASM");
  }

  // Write constants into the WASM heap
  const view = new DataView(wasm.HEAPU8.buffer, ptr, CONSTANTS_BUFFER_SIZE_BYTES);

  // All floats except PATH_LOG_RATE (int32)
  view.setFloat32(CONSTANTS_OFFSETS.STUCK_PASSIVE_X1, STUCK_PASSIVE_X1, true);
  view.setFloat32(CONSTANTS_OFFSETS.STUCK_DST_X2, STUCK_DST_X2, true);
  view.setFloat32(CONSTANTS_OFFSETS.STUCK_CORRIDOR_X3, STUCK_CORRIDOR_X3, true);
  view.setFloat32(CONSTANTS_OFFSETS.STUCK_DECAY, STUCK_DECAY, true);
  view.setFloat32(CONSTANTS_OFFSETS.STUCK_DANGER_1, STUCK_DANGER_1, true);
  view.setFloat32(CONSTANTS_OFFSETS.STUCK_DANGER_2, STUCK_DANGER_2, true);
  view.setFloat32(CONSTANTS_OFFSETS.STUCK_DANGER_3, STUCK_DANGER_3, true);
  view.setInt32(CONSTANTS_OFFSETS.PATH_LOG_RATE, PATH_LOG_RATE | 0, true);
  view.setFloat32(CONSTANTS_OFFSETS.CORNER_OFFSET, CORNER_OFFSET, true);
  view.setFloat32(CONSTANTS_OFFSETS.CORNER_OFFSET_SQ, CORNER_OFFSET_SQ, true);

  // Register with WASM
  if (!(wasm as any)._set_constants_buffer) {
    throw new Error("WASM module does not export _set_constants_buffer");
  }
  (wasm as any)._set_constants_buffer(ptr);
  return ptr;
} 