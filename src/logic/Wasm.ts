import { mapInstance } from '../map_instance';
import { WasmFacade } from './WasmFacade';
import { GameState } from './GameState';
import { Point2 } from './core/math';

export class Wasm {
  static cameraMatrixPtr: number = 0;

  static testFindCorridor(startPoint: Point2, endPoint: Point2, pathFreeWidth: number, pathWidthPenaltyMult: number): { corridor: number[], iterations: number, length: number } | null {
    if (!WasmFacade._test_find_corridor || !WasmFacade._wasm_alloc || !WasmFacade._wasm_free) {
      console.error("WASM pathfinding functions not available");
      return null;
    }

    try {
      const maxLength = 1000;
      const resultPtr = WasmFacade._wasm_alloc(maxLength * 4); // 4 bytes per int32
      
      const corridorLength = WasmFacade._test_find_corridor(
        startPoint.x, startPoint.y, 
        endPoint.x, endPoint.y, 
        pathFreeWidth, pathWidthPenaltyMult,
        resultPtr, maxLength
      );
      
      if (corridorLength <= 0) {
        WasmFacade._wasm_free(resultPtr);
        return null;
      }

      // Read corridor from WASM memory
      const corridor: number[] = [];
      const heap32 = WasmFacade.HEAP32;
      const base = resultPtr >>> 2; // Convert to int32 index
      
      for (let i = 0; i < corridorLength; i++) {
        corridor.push(heap32[base + i]);
      }

      WasmFacade._wasm_free(resultPtr);
      
      return {
        corridor,
        iterations: -1, // WASM doesn't currently expose iteration count
        length: 0 // Would need to calculate based on corridor
      };
      
    } catch (error) {
      console.error("Error calling WASM test_find_corridor:", error);
      return null;
    }
  }

  // Render only: uses fresh map data to render agents without simulation
  static render(gameState: GameState): void {
    if (Wasm.cameraMatrixPtr == 0) {
      return;
    }

    // Get fresh map data to ensure immediate response to map changes
    const map = mapInstance.map;
    if (!map) {
      return;
    }

    const view = map.getView();
    const center = view.getCenter();
    if (!center) {
      return;
    }

    const resolution = view.getResolution()!;
    const mapElement = map.getTargetElement();
    const cssW = mapElement.clientWidth;
    const cssH = mapElement.clientHeight;
    const dpr = window.devicePixelRatio || 1;
    const widthPx = Math.max(1, Math.floor(cssW * dpr));
    const heightPx = Math.max(1, Math.floor(cssH * dpr));

    // Compute world-to-clip matrix (same logic as Pixie.ts)
    const worldTopLeftX = center[0] - (cssW / 2) * resolution;
    const worldTopLeftY = center[1] + (cssH / 2) * resolution;
    const s_px = (1 / resolution) * dpr; // world units -> device pixels

    const a = 2 * s_px / widthPx;
    const c = -1 - worldTopLeftX * a;
    const e = 2 * s_px / heightPx;
    const f = 1 - worldTopLeftY * e;
    // Row-major 3x3
    const m3x3RowMajor = [a, 0, c, 0, e, f, 0, 0, 1];

    // Upload matrix to WASM memory
    const heap = WasmFacade.HEAPF32 as Float32Array;
    const base = Wasm.cameraMatrixPtr >>> 2; // float index
    for (let i = 0; i < 9; i++) heap[base + i] = m3x3RowMajor[i];

    // Call render-only with dt=0 since we're not doing simulation
    if (WasmFacade._render) {
      WasmFacade._render(0, gameState.wagents.length, Wasm.cameraMatrixPtr, widthPx, heightPx, dpr);
    }
  }
}