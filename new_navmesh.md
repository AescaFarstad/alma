# Reimagined Navmesh System Design

This document outlines the design for a new, high-performance navigation mesh system tailored for a large-scale 2D city map. The design prioritizes a data-oriented approach for runtime efficiency, offloading complex computations to an offline generation step and a runtime worker thread.

## 1. Generation Pipeline

The navmesh and its associated data structures are generated offline through a multi-stage pipeline.

### 1.1. Obstacle Processing (Blobs)

1.  **Combine:** Individual building polygons that are too close for an agent to pass between are merged into larger impassable polygons called "blobs."
2.  **Simplify:** The vertex count of these blobs is reduced using simplification algorithms to create a lower-detail representation for navmesh generation.
3.  **Preserve:** The original, high-detail vertices of the source buildings are stored separately for accurate proximity checks and other gameplay logic.

### 1.2. Triangulation

A **Constrained Delaunay Triangulation (CDT)** is used to generate the mesh. This is a critical decision, as a standard Delaunay triangulation would incorrectly create triangles that cut through obstacles.

-   The **walkable area** is triangulated first, using the simplified blobs as holes/constraints.
-   The **interior of the impassable blobs** is then triangulated separately.
-   **Rationale for Blob Triangulation:** While these triangles are not traversable, they are stored for spatial queries. A point-in-concave-polygon test is complex and computationally expensive, often requiring on-the-fly triangulation. Pre-calculating these triangles makes this a simple lookup.

### 1.3. Polygonization

To accelerate pathfinding, the dense graph of walkable triangles is simplified into a smaller graph of larger, convex polygons.

1.  **Initial Merging:** A greedy algorithm, such as Hertel-Mehlhorn, is used to perform an initial merge of adjacent triangles into convex polygons.
2.  **Further Optimization:** Advanced heuristics like k-opt and random restarts are then applied to find a more optimal polygon layout, minimizing the total number of polygons. This expensive optimization is acceptable in an offline step as it improves runtime pathfinding for all clients.

## 2. Data Structure Format

All data is stored in flat, typed arrays (Structure of Arrays) to ensure cache-friendly, high-performance access at runtime.

-   `vertices`: `float32 {x, y}` - A single, unified array for all vertex coordinates.
-   `triangles`: `int32 {v1, v2, v3}` - Ordered as `[passable][impassable][fake outer edge]`.
-   `neighbours`: `int32 {tri1, tri2, tri3}` - Triangle neighbors.
-   `polygons`: `int32 {count, meta_info, verts_start, ...}` - A uniform structure for both walkable polygons and impassable blobs.
-   `poly_centroids`: `float {x, y}` - Pre-calculated centroids for polygons.
-   `poly_verts`: `int32 {v1, v2, ...}`
-   `poly_tris`: `int32 {tri1, tri2, ...}`
-   `poly_neighbors`: `int32 {neighbor_poly1, ...}`
-   `buildings`: `int32 {id, count, verts_start}` - Metadata for original buildings.
-   `building_verts`: `int32 {v1, v2, ...}` - Original high-detail vertices.
-   `blob_buildings`: `int32 {id | count, id1, id2 ...}` - Maps blobs back to their constituent buildings.
-   `building_meta`: A binary representation of a JS object.
    -   **Rationale:** Storing this as binary data (e.g., using MessagePack) avoids slow `JSON.parse()` calls on the main thread at startup and is more robust than relying on file line numbers as IDs.

### Special Case: `meta_info` Field

The `meta_info` field in the `polygons` structure uses a bit-flag to differentiate between single-building blobs and multi-building blobs.

-   **Rationale:** This allows the data structure for walkable polygons and impassable blobs to remain identical. This uniformity is crucial for allowing them to be neighbors in the navigation graph, which simplifies traversal and query logic significantly.

## 3. Runtime Auxiliary Structures

To further optimize runtime performance, several auxiliary data structures are constructed in a **Worker Thread** upon loading the primary navmesh data. This prevents blocking the main UI thread.

### 3.1. Direct Mapping Arrays

-   `triangle_to_polygon`: `int32 {poly_id}`
-   `building_to_blob`: `int32 {poly_id}`
-   **Rationale:** These maps provide an O(1) lookup to find the parent polygon/blob for any given triangle or building. The alternative—deducing this with spatial queries at runtime—is extremely slow. The memory cost (`~200-300 KB`) is negligible compared to the massive performance gain.

### 3.2. Spatial Indices

Three separate grid-based spatial indices are created, similar in structure to the existing `NavTriIndex`.

1.  `spatial_index_for_triangles`
2.  `spatial_index_for_polygons` (walkable only)
3.  `spatial_index_for_blobs` (impassable only)

-   **Rationale for Separation:** Creating distinct indices for different data types provides a clean, high-performance API for game logic. Pathfinding can query the polygon index and receive a list of guaranteed-walkable polygons without any need for runtime filtering. Likewise, physics or AI can query the blob index to get a list of only obstacles.

## 4. Runtime Usage

### 4.1. Pathfinding

The pathfinding process uses the different levels of data hierarchy.

1.  **Goal Finding:** To navigate to a building, the system finds the building's parent blob, then finds the walkable polygons adjacent to that blob. One of these adjacent polygons becomes the goal for the A* search.
2.  **Corridor Search:** A* is run on the high-level **polygon graph** to find a "corridor" of polygons from the start to the goal.
3.  **Path Smoothing:** The polygon corridor is then passed to a smoothing algorithm (like the Funnel Algorithm) that uses the underlying triangle geometry to find the optimal, straightest path.

### 4.2. Line of Sight (LOS)

The existing `Raycasting.ts` implementation provides a "triangle walk" or "tunnel" raycast. This method efficiently checks for line of sight within the walkable areas of the navmesh by stepping through adjacent triangles along the ray's path. This is suitable for all pathing-related visibility checks. 

## 5. Generation Script Architecture

To manage complexity, the navmesh generation pipeline will be broken down into several single-responsibility modules, orchestrated by a main `build_navmesh.ts` script.

### 5.1. Proposed File Structure

```
src/
└── mapgen/
    ├── build_navmesh.ts       # Main orchestrator script
    │─- triangulate.ts    # Core triangulation logic
    │─- hertel_mehlhorn.ts  # Hertel-Mehlhorn polygonization
    │─- k_opt.ts          # k-opt polygon optimization
    │─- data_io.ts        # Handles loading inputs and writing final navmesh file
```

### 5.2. Module Responsibilities

1.  **`build_navmesh.ts` (Orchestrator)**
    -   Parses command-line arguments.
    -   Calls the I/O module to load blob and building data.
    -   Invokes the triangulation module for both walkable areas and blob interiors.
    -   Calls the polygonization and optimization modules in sequence.
    -   Calls the I/O module to save the final, complete navmesh data structure.

2.  **`navmesh/triangulate.ts`**
    -   Contains the core logic for performing the Constrained Delaunay Triangulation.
    -   Will encapsulate the usage of the `poly2tri` library.
    -   The main triangulation loop from the current `build_navmesh.ts` will be moved here.

3.  **`navmesh/hertel_mehlhorn.ts`**
    -   Implements the greedy Hertel-Mehlhorn algorithm to merge triangles into convex polygons.

4.  **`navmesh/k_opt.ts` (and other optimizers)**
    -   Each file will implement a specific optimization heuristic (like k-opt or random restarts) to be run on the polygon set produced by the initial merge.

5.  **`navmesh/data_io.ts`**
    -   Handles all file system interactions.
    -   **Input:** Will contain the logic for reading and parsing the `blobs.txt` file and the original building GeoJSON data. The blob parsing logic from `build_navmesh.ts` will move here.
    -   **Output:** Will contain the logic for serializing all the final navmesh data structures into the flat-array format and writing it to a file. The output formatting and file writing logic from `build_navmesh.ts` will move here.

This modular approach will make the pipeline much easier to develop, debug, and maintain as we implement the full feature set of the new navmesh system. 