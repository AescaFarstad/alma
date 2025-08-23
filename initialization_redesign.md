# WASM Initialization Redesign

## 1. Overview & Problem Statement

The current application architecture suffers from a scattered and fragile initialization process for the WebAssembly (WASM) module and its related systems. Initialization logic is spread across multiple files (`main.ts`, `WasmModule.ts`, `WasmAgentSystem.ts`), leading to several problems:

-   **Fragile Order of Operations:** The system relies on a specific, non-obvious sequence of function calls. A change in this order can lead to runtime errors that are difficult to debug.
-   **Lack of Clear Ownership:** It is not clear which module "owns" the WASM instance or the shared memory buffers. Responsibilities are split, with some parts allocating memory and others initializing it.
-   **Hidden Dependencies:** Modules implicitly depend on global state (e.g., pointers stored on the WASM module object) being set by other, seemingly unrelated, modules.
-   **Memory Inefficiency:** The process involves multiple memory allocations and potential redundancies, such as parsing data more than once or not having all critical data in a contiguous, cache-friendly block.

This document proposes a redesigned architecture that centralizes control, enforces a clear and robust initialization sequence, and improves memory layout for better performance.

## 2. Core Principles of the New Design

1.  **Centralized Orchestration:** A single module (`WasmInit.ts`) will be responsible for orchestrating the entire WASM initialization sequence.
2.  **Single Contiguous Memory Allocation:** All persistent simulation data (Constants, Navmesh, Agents) will reside in a single, contiguous memory block in the WASM heap to maximize data locality.
3.  **Strict Separation of Concerns:**
    -   **Initialization (`...Init.ts`)** logic will be completely separate from **runtime data access (`.ts`)** and **execution logic (`WasmFacade.ts`)**.
    -   Modules will have a single, clear responsibility.
4.  **Explicit Dependencies:** Modules will be explicitly configured with the data they need, eliminating reliance on global state.
5.  **Efficiency:** The process will avoid redundant work.

## 3. Proposed Module Structure

-   `WasmInit.ts`: The central orchestrator for the entire initialization process.
-   `WasmFacade.ts`: A type-safe wrapper for all runtime WASM function calls (`_update_simulation`, `_add_agent`, etc.). Also handles transient memory operations like renderer uploads.
-   `NavConst.ts`: Holds the runtime data views for shared constants.
-   `initializers/NavConstInit.ts`: Calculates memory size for and initializes the `NavConst.ts` data views.
-   `Navmesh.ts`: Provides typed access to the shared views of navmesh data.
-   `initializers/NavmeshInit.ts`: Orchestrates navmesh-related initialization.
-   `NavIndex.ts`: A runtime data structure providing views for spatial indexes.
-   `initializers/NavIndexInit.ts`: A submodule for `NavmeshInit`, calculates memory and initializes `NavIndex.ts` views.
-   `Agents.ts`: Provides the SoA views for all agent data.
-   `initializers/AgentsInit.ts`: Calculates memory size and initializes the `Agents.ts` data views.

**Note:** `Agent.ts` refers to the legacy TypeScript agent logic and is distinct from the new `Agents.ts` module.

## 4. The Two-Phase Initialization Process

To solve the challenge of not knowing the total required memory size upfront without redundant work, we introduce a two-phase initialization process orchestrated by `WasmInit`.

### Phase 1: Memory Calculation

The goal of this phase is to ask each initializer module exactly how much memory it needs for all its data structures, including those generated at runtime.

### Phase 2: Final Allocation and Initialization

1.  **Single Contiguous Allocation:** `WasmInit.ts` makes **one call** to `_wasm_alloc(totalMemoryRequired)` to reserve the final memory block.
2.  **Sequential Initialization:** `WasmInit.ts` iterates through the initializers again, this time calling an `initialize()` method on each. It passes the main buffer and a starting offset and whatever else the module needs.
3.  **Module Responsibility:** Inside its `initialize` method, each module is responsible for:
    -   **Writing Data:** Copying initialization data (like `navmeshBin`) into its designated slice of the buffer.
    -   **Calling WASM:** Invoking any necessary C++ functions to process the data.
    -   **Initializing Views:** Setting up the typed `ArrayBufferView`s in the corresponding runtime modules (e.g., `Navmesh.ts`, `Agents.ts`).
4.  **Finalize:** After all modules are initialized, the system reports teh actuall used memory size. The runtime modules are fully configured and can be used by the rest of the application.

## 5. Rendering Data Handling

As discussed, rendering assets like the sprite atlas are transient. They are needed only to create WebGL textures on the GPU. Therefore, they will **not** be part of the main persistent shared memory block.