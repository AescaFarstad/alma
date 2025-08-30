import { calculateAgentsMemory, initializeAgents } from "./AgentsInit";
import { calculateConstMemory, initializeConst } from "./NavConstInit";
import { calculateNavmeshMemory, initializeNavmesh } from "./NavmeshInit";
import { RenderInit } from "./RenderInit";
import { WasmFacade, createWasmModule } from "../WasmFacade";
import { GameState } from "../GameState";

export const INIT_LOGGING = false;
let wasmModule: WasmFacade;

export class WasmInit {
  async initializeWasm(gameState: GameState) {
    if (!wasmModule) {
      wasmModule = await createWasmModule();
    }

    // Phase 1: Fetch required files
    const navmeshBin = await this.fetchNavmeshBin();
    
    // Phase 2: Calculate memory requirements
    const totalMemoryRequired = 
      calculateConstMemory() +
      calculateNavmeshMemory(navmeshBin, INIT_LOGGING) +
      calculateAgentsMemory();

    // Phase 3: Single contiguous allocation
    if (!wasmModule._wasm_alloc) {
      throw new Error("wasm_alloc is not exported from the WASM module.");
    }
    const wasmMemoryPtr = wasmModule._wasm_alloc(totalMemoryRequired);
    if (wasmMemoryPtr === 0) {
      throw new Error("Failed to allocate memory in WASM heap for navmesh.");
    }
    const wasmMemory = wasmModule.HEAPU8.buffer;

    // Phase 4: Sequential initialization
    let offset = wasmMemoryPtr;
    const memoryEnd = wasmMemoryPtr + totalMemoryRequired;
    
    const constUsed = initializeConst(wasmModule, wasmMemory as ArrayBuffer, offset);
    offset += constUsed;
    
    const navmeshAvailable = memoryEnd - offset;
    const navmeshUsed = await initializeNavmesh(wasmModule, wasmMemory as ArrayBuffer, offset, navmeshBin, gameState.navmesh, navmeshAvailable, INIT_LOGGING);  
    offset += navmeshUsed;
    
    const agentsUsed = initializeAgents(gameState.wasm_agents, gameState, wasmModule, wasmMemory as ArrayBuffer, offset);
    offset += agentsUsed;
    
    const memoryUsed = offset - wasmMemoryPtr;
    console.log(`WASM initialization complete. Allocated: ${totalMemoryRequired}, Used: ${memoryUsed}`);
    
    // Initialize WASM renderer after core WASM is ready
    await RenderInit.initializeRenderer(wasmModule, '#wasm-agents-canvas', '/img/base.webp');
    
    return wasmModule;
  }

  private async fetchNavmeshBin(): Promise<ArrayBuffer> {
    const response = await fetch('/data/navmesh.bin');
    if (!response.ok) {
      throw new Error(`Failed to fetch navmesh.bin: ${response.statusText}`);
    }
    return response.arrayBuffer();
  }
} 