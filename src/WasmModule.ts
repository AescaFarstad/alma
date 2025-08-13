// @ts-ignore
// WASM module factory is attached on window by index.html as window.__createWasmModule

export interface WasmModule {
    _init: (sharedBuffer: number, navmeshBuffer: number, maxAgents: number, seed: number) => void;
    _add_agent: (x: number, y: number) => number;
    _update: (dt: number, m3x3Ptr: number, widthPx: number, heightPx: number, dpr: number) => void;
    _update_simulation: (dt: number) => void;
    _load_blob_data: (blobBuffer: number, bufferSize: number) => void;
    _clear_blob_data: () => void;
    _get_blob_count: () => number;
    _g_navTriIndexPackedHeader?: number;
    _set_rng_seed?: (seed: number) => void;
    _set_constants_buffer?: (ptr: number) => void;
    _set_renderer_debug?: (enable: number) => void;
    
    ccall: (fname: string, returnType: string | null, argTypes: string[], args: any[]) => any;
    cwrap: (fname: string, returnType: string | null, argTypes: string[]) => Function;
    
    HEAPU8: Uint8Array;
    HEAP32: Int32Array;
    HEAPF32: Float32Array;

    // Optional exported allocation helpers
    wasm_alloc?: (size: number) => number;
    wasm_free?: (ptr: number) => void;
}

export interface BlobGeometry {
    id: number;
    points: Array<{x: number, y: number}>;
}

declare global {
  interface Window {
    __createWasmModule?: () => Promise<WasmModule>;
    wasmOverlay?: {
      enable: () => void;
      disable: () => void;
      toggle: () => void;
    }
  }
}

let wasmModule: WasmModule;

export async function initWasmModule() {
  if (!window.__createWasmModule) {
    throw new Error('WASM module factory not found on window. Ensure index.html loads /wasm_module.js first.');
  }
  const createWasmModule = window.__createWasmModule as () => Promise<WasmModule>;
  wasmModule = await createWasmModule();

  // Expose a tiny console API to toggle the magenta overlay
  window.wasmOverlay = {
    enable: () => { try { (wasmModule as any)._set_renderer_debug?.(1); } catch {} },
    disable: () => { try { (wasmModule as any)._set_renderer_debug?.(0); } catch {} },
    toggle: () => {
      try {
        // Not tracking current state in TS; just enable for quick visual confirmation
        (wasmModule as any)._set_renderer_debug?.(1);
      } catch {}
    }
  };
}

export function getWasmModule() {
  return wasmModule;
}

export class WasmBlobLoader {
    private module: WasmModule;
    
    constructor(wasmModule: WasmModule) {
        this.module = wasmModule;
    }
    
    /**
     * Loads blob geometry data into the WASM module
     * @param blobs Array of blob geometry data
     */
    loadBlobs(blobs: BlobGeometry[]): void {
        if (blobs.length === 0) {
            return;
        }
        
        // Calculate buffer size needed
        let bufferSize = 4; // int32 for numBlobs
        for (const blob of blobs) {
            bufferSize += 4; // int32 for blobId
            bufferSize += 4; // int32 for numPoints
            bufferSize += blob.points.length * 8; // 2 float32s per point
        }
        
        // Allocate buffer in WASM memory
        const allocPtr = (this.module as any)._wasm_alloc
            ? (this.module as any)._wasm_alloc(bufferSize)
            : this.module.ccall('wasm_alloc', 'number', ['number'], [bufferSize]);
        const bufferPtr = allocPtr >>> 0;
        if (!bufferPtr) {
            throw new Error("Failed to allocate WASM memory for blob data");
        }
        
        try {
            // Create a view of the allocated memory
            const buffer = new Uint8Array(this.module.HEAPU8.buffer, bufferPtr, bufferSize);
            const dataView = new DataView(buffer.buffer, bufferPtr, bufferSize);
            
            let offset = 0;
            
            // Write number of blobs
            dataView.setInt32(offset, blobs.length, true);
            offset += 4;
            
            // Write each blob
            for (const blob of blobs) {
                // Write blob ID
                dataView.setInt32(offset, blob.id, true);
                offset += 4;
                
                // Write number of points
                dataView.setInt32(offset, blob.points.length, true);
                offset += 4;
                
                // Write points
                for (const point of blob.points) {
                    dataView.setFloat32(offset, point.x, true);
                    offset += 4;
                    dataView.setFloat32(offset, point.y, true);
                    offset += 4;
                }
            }
            
            // Call WASM function to load the data
            this.module._load_blob_data(bufferPtr, bufferSize);
            
        } finally {
            // Free the allocated memory
            if ((this.module as any)._wasm_free) {
                (this.module as any)._wasm_free(bufferPtr);
            } else {
                try { this.module.ccall('wasm_free', null, ['number'], [bufferPtr]); } catch {}
            }
        }
    }
    
    /**
     * Clears all blob data from the WASM module
     */
    clearBlobs(): void {
        this.module._clear_blob_data();
    }
    
    /**
     * Gets the number of blobs currently loaded in WASM
     * @returns The number of loaded blobs
     */
    getBlobCount(): number {
        return this.module._get_blob_count();
    }
    
    /**
     * Loads blob data from a JavaScript GameState object (matching the original TS structure)
     * @param gameState The game state object containing blobsById
     */
    loadBlobsFromGameState(gameState: any): void {
        if (!gameState.blobsById) {
            return;
        }
        
        const blobs: BlobGeometry[] = [];
        
        for (const [id, blob] of Object.entries(gameState.blobsById)) {
            if (blob && (blob as any).geometry && Array.isArray((blob as any).geometry[0])) {
                const points = (blob as any).geometry[0].map((p: number[]) => ({
                    x: p[0],
                    y: p[1]
                }));
                
                blobs.push({
                    id: parseInt(id),
                    points: points
                });
            }
        }
        
        this.loadBlobs(blobs);
    }
} 