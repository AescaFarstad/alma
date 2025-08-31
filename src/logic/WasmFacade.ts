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
  _set_selected_wagent_idx?: (idx: number) => void;
  
  // Navmesh data access functions
  _get_g_navmesh_ptr?: () => number;
  _get_navmesh_bbox_ptr?: () => number;
  _get_spatial_index_data?: () => number;
  _wasm_impulse: (code: number) => void;
  
  // Pathfinding test function
  _test_find_corridor?: (startX: number, startY: number, endX: number, endY: number, pathFreeWidth: number, pathWidthPenaltyMult: number, resultPtr: number, maxLength: number) => number;
  _get_agent_corridor?: (agentIdx: number, resultPtr: number, maxLength: number) => number;
  
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
  setSelectedWAgentIdx?: (idx: number | null) => void;
  // Convenience: request agent's corridor by index (emits via events on next sim update)
  requestAgentCorridorByIndex?: (idx: number | null) => void;
  // Synchronous fetch of an agent's corridor by index
  getAgentCorridorByIndex?: (idx: number, maxLength?: number) => number[];
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

  wasmModule.setSelectedWAgentIdx = function(idx: number | null){
    if (this._set_selected_wagent_idx) {
      this._set_selected_wagent_idx(idx == null ? -1 : idx|0);
    }
  }

  // TS API: request agent corridor by index.
  // This leverages the existing selected-agent mechanism in WASM which
  // broadcasts the selected agent's corridor at the end of the next
  // simulation update via EVT_SELECTED_CORRIDOR.
  wasmModule.requestAgentCorridorByIndex = function(idx: number | null){
  if (typeof this.setSelectedWAgentIdx === 'function') {
    this.setSelectedWAgentIdx(idx);
  }
  }

  // Synchronous API: copies corridor into a TS array immediately.
  wasmModule.getAgentCorridorByIndex = function(idx: number, maxLength: number = 2048): number[] {
  const out: number[] = [];
  if (!this._get_agent_corridor || !this._wasm_alloc || !this._wasm_free) return out;
  if (idx == null || idx < 0) return out;
  const bytes = (maxLength|0) * 4;
  const buf = this._wasm_alloc(bytes);
  if (!buf) return out;
  try {
    const count = this._get_agent_corridor(idx|0, buf|0, maxLength|0) | 0;
    if (count > 0) {
      const base = (buf >>> 2);
      const heap32 = this.HEAP32 as Int32Array;
      for (let i = 0; i < count; i++) out.push(heap32[base + i] | 0);
    }
  } finally {
    this._wasm_free(buf);
  }
  return out;
  }

  return wasmModule;
}

export { wasmModule as WasmFacade };
