# Plan: Transition to New Navmesh Data

This document outlines the step-by-step plan to transition the application to use the new, high-performance, data-oriented navmesh format. The transition is phased to minimize disruption and allow for iterative testing, with an initial goal of restoring existing functionality before introducing new polygon-based pathfinding logic.

The transition will be a breaking change with no rollbacks.
The old ways must be completely replaced with the new ones.
The app must fail fast. No defensive fallback allowed.
The existing initialization order works and should be used as a reliable example.

## Key files:

Description of the idea behind the new navmesh: new_navmesh.md
The root script generating the new navmesh: src/mapgen/build_navmesh.ts
The script generating the binary: src/mapgen/nav_data_io.ts
The description of the old navmesh: navmesh.md
ts navmesh file: src/logic/navmesh/Navmesh.ts
cpp navmesh structures: src/wasm/data_structures.h
ts navmesh index: src/logic/navmesh/NavTriIndex.ts
cpp navmesh index: src/wasm/nav_tri_index.cpp
the description of agents that use navmesh and index: src/logic/navmesh/agent_movement.md

## Guiding Principles

-   **Memory Sharing:** The primary navmesh data will reside in a `SharedArrayBuffer` to be accessible by both the main JavaScript thread and the WebAssembly (WASM) module without copying.
-   **WASM-Centric Processing:** Computationally expensive tasks, such as parsing the binary navmesh and building spatial indices, will be handled by the WASM module.
-   **Incremental Rollout:** The initial goal is to get the game running with the new data format using the existing triangle-based navigation. Polygon-based pathfinding will be implemented in a subsequent phase.
-   **Behavioral Parity:** The behavior of agents in the TypeScript simulation and the C++ (WASM) simulation must remain identical throughout the transition.

---

## Phase 1: Data Loading & Preparation (JavaScript)

This phase focuses on updating the client-side code to load and parse the new `navmesh.bin` format.

1.  **Update Build Script Output:**
    -   In `src/mapgen/build_navmesh.ts`, modify the output settings to rename `buildings.json` to `map_render_buildings.geojson`. This clarifies its role as a data source for map rendering only, distinct from the navmesh data used for simulation.

2.  **Update Navmesh Data Structure (`Navmesh.ts`):**
    -   Extend the `Navmesh` class in `src/logic/navmesh/Navmesh.ts` to include all fields from the new data format as specified in `new_navmesh.md`.
    -   Add typed array properties for: `polygons`, `poly_centroids`, `poly_verts`, `poly_tris`, `poly_neighbors`, `buildings`, `building_verts`, and `blob_buildings`.
    -   Add an array to hold the parsed `building_meta` data. Take advantage of the fact that building ids start from 0 and are consequitive.

3.  **Implement Binary Navmesh Loader:**
    -   Create a new loading path (e.g., in `LogicMapDataLoader.ts`) to fetch `navmesh.bin`.
    -   For now it will act synchronously in the main thread.
    -   Implement a parser for the `navmesh.bin` file. This function will take an `ArrayBuffer` as input.
    -   **Parsing Logic:**
        -   Read the BBOX and header information (containing array lengths) first. The layout can be inferred from `writeNavmeshBinary` in `src/mapgen/nav_data_io.ts`.
        -   Create `TypedArray` views (`Float32Array`, `Int32Array`) over the single `ArrayBuffer` for each data array (`vertices`, `triangles`, etc.). This is the core of the memory sharing mechanism and avoids data duplication.
        -   The final section of the buffer contains the `building_meta` string. Extract this part of the buffer, decode it from UTF-8, and parse the JSON. This parsing happens in JavaScript, as WASM will not be responsible for this metadata.
        -   Populate the extended `Navmesh` object with all the data views and the parsed `building_meta`.

---

## Phase 2: WebAssembly Integration

This phase focuses on making the navmesh data available to the C++ simulation environment.

1.  **Share Navmesh `ArrayBuffer` with WASM:**
    -   During the WASM module's initialization sequence, transfer the `ArrayBuffer` containing the entire `navmesh.bin` data to the WASM.

2.  **Develop WASM Navmesh Parser:**
    -   In C++, create a function (e.g., `init_navmesh_from_buffer`) that accepts the raw buffer.
    -   This function will read the header to determine the offsets and lengths of each data array within the buffer.
    -   Set up C++ pointers to point directly into the memory locations of each array (`vertices`, `triangles`, etc.) within the shared buffer. This establishes the zero-copy data access.
    -   add trinagle_centroids that are needed for the current navigation algorithm.

3.  **Migrate Spatial Index Construction to WASM:**
    -   Port the logic from the `buildIndex` method in `src/logic/navmesh/NavTriIndex.ts` to C++. (Check if it is already implemented though....)
    -   The WASM initialization process will now be responsible for building the spatial index for triangles (`spatial_index_for_triangles`).
    - another spatial index must be created for walkable polygons, blobs and buildings. All spatial indexes store the respective ids. All of them are constant, so the memory must be allocated precisely. All of them use the same structure, the same cell size (256). They must cover the are which is wider than the navmesh bounding box (by 50)    
    -   The results of the index construction (cell offsets and triangle lists) should be written to the shared memory and made available in the corresponding indexes in ts.

4.  **Implement Auxiliary Structures in WASM:**
    -   As per `new_navmesh.md`, build the auxiliary lookup maps (`triangle_to_polygon`, `building_to_blob`) in C++ during the initialization phase. These are int32 arrays.

5.  **Update JS `NavTriIndex`:**
    -   Refactor `NavTriIndex.ts` to rely entirely on the WASM-built index. The `readWasmIndex` method provides a starting point. The `buildIndex` method in JS must be deleted. ts NavTriIndex will function as usual, but will read from arrays provided by c++.

---

## Phase 3: Initial Integration (Triangle-Based Navigation) - COMPLETED

The goal of this phase was to restore full application functionality using the new data pipeline but without altering the core pathfinding algorithm.

1.  **Adapt Navigation Logic to Data Views:** ✅ COMPLETED
    -   ✅ Reviewed all modules that interact with the `Navmesh` object (`AgentNavigation.ts`, `AgentMovePhys.ts`, `Raycasting.ts`, etc.).
    -   ✅ Updated them to correctly access data from the new `TypedArray` views on the `Navmesh` object.
    -   ✅ Updated neighbor validation logic: instead of checking for -1 neighbors, neighbor indices are now compared to `navmesh.walkable_triangle_count`.

---
## Completed

-   **Phase 1, Step 1:** In `src/mapgen/build_navmesh.ts`, modify the output settings to rename `buildings.json` to `map_render_buildings.geojson`. This clarifies its role as a data source for map rendering only, distinct from the navmesh data used for simulation.
-   **Phase 1, Step 2:** Extend the `Navmesh` class in `src/logic/navmesh/Navmesh.ts` to include all fields from the new data format as specified in `new_navmesh.md`.
-   **Phase 1, Step 3:** Implement a parser for the `navmesh.bin` file in `LogicMapDataLoader.ts` (via `NavmeshLoader.ts`) that uses `TypedArray` views over a single `ArrayBuffer` to avoid data duplication.

-   **Phase 2, Step 1 & 2:** Share Navmesh `ArrayBuffer` with WASM and develop a WASM Navmesh Parser. The entire `navmesh.bin` buffer is loaded in TS, copied to the WASM heap, and a pointer is passed to a C++ `init_navmesh_from_buffer` function (named `init` in `main.cpp`). This C++ function reads the header and sets up pointers to the data arrays within the shared buffer. It also now calculates `triangle_centroids`.

-   **Phase 3: Initial Integration (Triangle-Based Navigation) - COMPLETED:** All navigation logic has been adapted to work with the new navmesh data format while maintaining existing triangle-based pathfinding behavior:
    -   Updated property references: Changed `navmesh.points` → `navmesh.vertices` and `navmesh.centroids` → `navmesh.triangle_centroids` in `useNavmeshDebug.ts`, `WasmAgentSystem.ts`, and `PointInTriangleBenchmark.ts`.
    -   Updated neighbor validation logic: Changed all `neighbor === -1` checks to `neighbor >= navmesh.walkable_triangle_count` in `Raycasting.ts` (4 instances) to properly handle the new neighbor index format.
    -   Verified that existing navigation files (`NavTriIndex.ts`, `pathCorridor.ts`, `pathCorridorByEdge.ts`, `AgentNavigation.ts`, `AgentMovePhys.ts`) already use the correct data access patterns.
    -   All modules now correctly access vertex coordinates using `navmesh.vertices[index * 2]` and triangle centroids using `navmesh.triangle_centroids[index * 2]`.
    -   The application should now run with the new navmesh format while maintaining identical navigation behavior to the old implementation.

---
## Next Steps

With Phase 3 completed, the application should be ready for testing with the new navmesh format. Before proceeding to polygon-based pathfinding, verify:

1. **Test Phase 3 Implementation:** Ensure the application runs without errors and agent navigation behavior is identical to the previous implementation.

2. **Complete Phase 2 (if needed):** Verify that Phase 2 Steps 3-5 are fully implemented:
   - **Step 3:** Spatial index construction migrated to WASM  
   - **Step 4:** Auxiliary structures (`triangle_to_polygon`, `building_to_blob`) implemented in WASM
   - **Step 5:** JS `NavTriIndex` updated to use WASM-built indices

3. **Future Phase 4:** Implement polygon-based pathfinding using the new polygon data structures (`polygons`, `poly_centroids`, `poly_neighbors`) for improved performance on large-scale navigation.