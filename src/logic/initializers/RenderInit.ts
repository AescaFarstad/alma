import { WasmFacade } from '../WasmFacade';
import { baseAtlas } from '../BaseAtlas';
import { Wasm } from '../Wasm';

export class RenderInit {
  /**
   * Initialize the WASM WebGL2 renderer with the given canvas selector
   */
  static initRenderer(wasmModule: WasmFacade, canvasSelector: string): void {
    if (!wasmModule._sprite_renderer_init || !wasmModule._wasm_alloc) {
      console.warn('WASM renderer functions not available');
      return;
    }

    // Convert canvas selector string to C string in WASM memory
    const selectorBytes = new TextEncoder().encode(canvasSelector + '\0');
    const selectorPtr = wasmModule._wasm_alloc(selectorBytes.length);
    wasmModule.HEAPU8.set(selectorBytes, selectorPtr);
    
    // Initialize the renderer
    wasmModule._sprite_renderer_init(selectorPtr);
    
    // Free the temporary string
    if (wasmModule._wasm_free) {
      wasmModule._wasm_free(selectorPtr);
    }
  }

  /**
   * Upload atlas image and frame data to WASM renderer
   */
  static async uploadAtlasFromUrl(wasmModule: WasmFacade, url: string): Promise<void> {
    if (!wasmModule._sprite_upload_atlas_rgba || !wasmModule._wasm_alloc) {
      console.warn('WASM atlas upload functions not available');
      return;
    }
    
    // Load and upload atlas image
    const img = await fetch(url).then(r => r.blob()).then(createImageBitmap);
    const w = img.width, h = img.height;
    const off = new OffscreenCanvas(w, h);
    const ctx = off.getContext('2d', { willReadFrequently: true })!;
    ctx.drawImage(img, 0, 0);
    const data = ctx.getImageData(0, 0, w, h).data; // Uint8ClampedArray
    const bytes = new Uint8Array(data.buffer.slice(0)); // copy to Uint8Array
    const ptr = wasmModule._wasm_alloc(w * h * 4) >>> 0;
    wasmModule.HEAPU8.set(bytes, ptr);
    wasmModule._sprite_upload_atlas_rgba(ptr, w, h);
    if (wasmModule._wasm_free) wasmModule._wasm_free(ptr);

    // Load atlas data through BaseAtlas and upload frame table to WASM
    try {
      await baseAtlas.loadAtlas('/img/base.json', w, h);
      const atlasData = baseAtlas.data;
      
      if (atlasData && wasmModule._sprite_upload_frame_table) {
        const uvBytes = new Uint8Array(atlasData.uvCoordinates.buffer);
        const uvPtr = wasmModule._wasm_alloc!(uvBytes.byteLength) >>> 0;
        wasmModule.HEAPU8.set(uvBytes, uvPtr);
        wasmModule._sprite_upload_frame_table(uvPtr, atlasData.sortedFrameNames.length);
        if (wasmModule._wasm_free) wasmModule._wasm_free(uvPtr);
      }
    } catch (error) {
      console.error('Failed to load atlas data:', error);
    }
  }

  /**
   * Complete renderer initialization - call after WASM module is ready
   */
  static async initializeRenderer(wasmModule: WasmFacade, canvasSelector: string, atlasUrl: string): Promise<void> {
    this.initRenderer(wasmModule, canvasSelector);
    await this.uploadAtlasFromUrl(wasmModule, atlasUrl);
    Wasm.cameraMatrixPtr = wasmModule._wasm_alloc!(9 * 4);
  }

  static allocCameraMatrix(wasmModule: WasmFacade): number {
    if (!wasmModule._wasm_alloc) {
      throw new Error("_wasm_alloc is not available in wasmModule");
    }
    // Allocate space for a 3x3 float matrix (9 floats * 4 bytes/float)
    return wasmModule._wasm_alloc(9 * 4);
  }
} 