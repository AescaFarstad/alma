import { Wasm } from "./Wasm";
import { WasmImpulse } from "./wasm_impulse_codes";

export interface WasmFacade {
  _init_agents: (sharedBuffer: number, maxAgents: number, seed: number, eventsBasePtr: number, eventsCapWords: number) => void;
  _init_navmesh_from_bin: (offset: number, binarySize: number, totalMemorySize: number, cellSize: number, enableLogging: boolean) => number;
  _finalize_init: () => void;
  _add_agent: (x: number, y: number) => number;
  _update: (dt: number, m3x3Ptr: number, widthPx: number, heightPx: number, dpr: number) => void;
  _update_simulation: (dt: number, active_agents: number) => void;
  _load_blob_data: (blobBuffer: number, bufferSize: number) => void;
  _clear_blob_data: () => void;
  _get_blob_count: () => number;
  _g_navTriIndexPackedHeader?: number;
  _set_rng_seed?: (seed: number) => void;
  _set_constants_buffer: (ptr: number, debug : boolean) => void;
  
  // Navmesh data access functions
  _get_g_navmesh_ptr?: () => number;
  _get_navmesh_bbox_ptr?: () => number;
  _get_spatial_index_data?: () => number;
  _wasm_impulse: (code: number) => void;
  
  // Pathfinding test function
  _test_find_corridor?: (startX: number, startY: number, endX: number, endY: number, pathFreeWidth: number, pathWidthPenaltyMult: number, resultPtr: number, maxLength: number) => number;
  
  ccall: (fname: string, returnType: string | null, argTypes: string[], args: any[]) => any;
  cwrap: (fname: string, returnType: string | null, argTypes: string[]) => Function;
  
  HEAPU8: Uint8Array;
  HEAP32: Int32Array;
  HEAPU32: Uint32Array;
  HEAPF32: Float32Array;

  _wasm_alloc?: (size: number) => number;
  _wasm_free?: (ptr: number) => void;

  _sprite_renderer_init?: (selectorPtr: number) => void;
  _sprite_upload_atlas_rgba?: (ptr: number, w: number, h: number) => void;
  _sprite_upload_frame_table?: (ptr: number, frameCount: number) => void;
  _render?: (dt: number, active_agents: number, mPtr: number, w: number, h: number, dpr: number) => void;
  _set_renderer_debug?: (enable: number) => void;
  _sprite_renderer_clear?: () => void;
  triggerPointInTriangleBench: () => void;
  triggerPointInPolygonBench: () => void;
}

declare global {
  interface Window {
  __createWasmModule?: () => Promise<WasmFacade>;
  wasmOverlay?: {
    enable: () => void;
    disable: () => void;
    toggle: () => void;
  }
  }
}

let wasmModule: WasmFacade;

export async function createWasmModule(): Promise<WasmFacade> {
  if (!window.__createWasmModule) {
  throw new Error('WASM module factory not found on window. Ensure index.html loads /wasm_module.js first.');
  }
  const createWasmModule = window.__createWasmModule as () => Promise<WasmFacade>;
  wasmModule = await createWasmModule();

  wasmModule.triggerPointInTriangleBench = function(){
  this._wasm_impulse(WasmImpulse.POINT_IN_TRIANGLE_BENCH);
  }

  wasmModule.triggerPointInPolygonBench = function(){
  this._wasm_impulse(WasmImpulse.POINT_IN_POLYGON_BENCH);
  }

  return wasmModule;
}

export { wasmModule as WasmFacade };