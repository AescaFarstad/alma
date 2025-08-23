# Reimagined Navmesh System Design

This document outlines the design for a new, high-performance navigation mesh system tailored for a large-scale 2D city map. The design prioritizes a data-oriented approach for runtime efficiency, offloading complex computations to an offline generation step and a runtime worker thread.

## 1. Generation Pipeline

The navmesh and its associated data structures are generated offline through a multi-stage pipeline.

### 1.1. Obstacle Processing (Blobs)

1.  **Combine:** Individual building polygons that are too close for an agent to pass between are merged into larger impassable polygons called "blobs."
2.  **Simplify:** The vertex count of these blobs is reduced using simplification algorithms to create a lower-detail representation for navmesh generation.
3.  **Preserve:** The original, high-detail vertices of the source buildings are stored separately for accurate proximity checks and other gameplay logic.

### 1.2. Boundary Generation

An impassable boundary is generated to fully enclose the playable area. This prevents agents from pathfinding or moving into the void outside the map.

1.  **Define Geometry:** An outer bounding box for the entire map is determined. Let its vertices be `x1` (top-left), `x2` (top-right), `x3` (bottom-right), and `x4` (bottom-left). Four new points (`N`, `E`, `S`, `W`) are projected outwards from the midpoint of each of the box's four edges. The projection distance for each point is equal to the length of the adjacent edge.
2.  **Define Blobs:** Two large, non-convex, impassable polygons ("blobs") are defined using these vertices. These two blobs completely encompass the original box.
    -   **Blob 1 (East):** A 6-vertex polygon defined by the hull `(x1, N, E, S, x3, x2)`.
    -   **Blob 2 (West):** A 6-vertex polygon defined by the hull `(x3, S, W, N, x1, x4)`.
3.  **Explicit Triangulation:** The interiors of these blobs must be triangulated into a specific set of 8 triangles (4 per blob), as shown in the reference diagram. This is not left to an algorithm. All triangles follow counter-clockwise (CCW) winding order.
    -   **Blob 1 Triangles:** `(x1, N, x2)`, `(x2, E, x3)`, `(N, E, x2)`, `(E, S, x3)`
    -   **Blob 2 Triangles:** `(x3, S, x4)`, `(x4, W, x1)`, `(S, W, x4)`, `(W, N, x1)`
4.  **Create Fake Buildings:** Two corresponding "fake" building entries are created, named `outside1` and `outside2`, one for each boundary blob.
5.  **Inject into Pipeline:** The boundary triangles are injected during the triangulation process and become part of the impassable triangles. The boundary blobs themselves are NOT added to the hole polygons used for Constrained Delaunay Triangulation. Instead, the pre-calculated boundary triangles are added directly to the impassable triangle set before the 'Step 3: Combine all triangles and create unified vertex/triangle arrays' step.

### 1.3. Triangulation

A **Constrained Delaunay Triangulation (CDT)** is used to generate the mesh. This is a critical decision, as a standard Delaunay triangulation would incorrectly create triangles that cut through obstacles.

-   The **walkable area** is triangulated first, using the simplified blobs as holes/constraints.
-   The **interior of the impassable blobs** is then triangulated separately.
-   **Rationale for Blob Triangulation:** While these triangles are not traversable, they are stored for spatial queries. A point-in-concave-polygon test is complex and computationally expensive, often requiring on-the-fly triangulation. Pre-calculating these triangles makes this a simple lookup.

### 1.4. Polygonization

To accelerate pathfinding, the dense graph of walkable triangles is simplified into a smaller graph of larger, convex polygons. The impassable blobs are not polygonized; the original simplified blob polygons are used directly as the final impassable geometry.

1.  **Initial Merging:** A greedy algorithm, such as Hertel-Mehlhorn, is used to perform an initial merge of adjacent walkable triangles into convex polygons.
2.  **Further Optimization:** Advanced heuristics like k-opt and random restarts are then applied to find a more optimal polygon layout, minimizing the total number of polygons. This expensive optimization is acceptable in an offline step as it improves runtime pathfinding for all clients.

### 1.5. Validation

After the navmesh geometry is generated, a validation step is run to ensure data integrity.

1.  **Vertex Proximity Check:** The system verifies that no two vertices in the entire navmesh are closer to each other than a minimum threshold (1 unit).
2.  **Implementation:** To perform this check efficiently on a large number of vertices, a spatial grid (cell size 128x128) is used.

## 2. Data Structure Format

All data is stored in flat, typed arrays (Structure of Arrays) to ensure cache-friendly, high-performance access at runtime. The data is serialized into a binary file for production use, with an optional human-readable text file for debugging and a new `buildings.json` with updated IDs for mapping.

All variable-length data is accessed using a "countless" indexing scheme. For a data array (e.g., `poly_verts`) and an index array (e.g., `polygons`), the data for item `i` is located in the slice from `index_array[i]` up to (but not including) `index_array[i+1]`. To support this, the index arrays have a final `N+1`-th sentinel entry that points to a dummy sentinel value at the end of the corresponding data array. This allows lookups like `data_array[index_array[i+1]]` to always be valid without bounds checks.

-   **BBOX**: `float32 {minX, minY, maxX, maxY}` - The axis-aligned bounding box encompassing all vertices in the navmesh.
-   **walkable_triangle_count**: `int32` - The number of triangles that are part of the walkable area.
-   **walkable_polygon_count**: `int32` - The number of polygons that are part of the walkable area. Polygons with an ID `< this value` are walkable, all others are blobs.
-   `vertices`: `float32 {x, y}` - A single, unified array for all vertex coordinates.
-   `triangles`: `int32 {v1, v2, v3}` - **Sorted by parent polygon ID.** All triangles for polygon 0 come first, then polygon 1, etc.
-   `neighbours`: `int32 {tri1, tri2, tri3}` - Triangle-to-triangle neighbors. **Indices are re-mapped to match the new sorted order of the `triangles` array.**
-   `polygons`: `int32 {poly_verts_start}` - Index into `poly_verts`. Has `num_polygons + 1` entries (including sentinel). Also used to index `poly_neighbors`.
-   `poly_verts`: `int32 {v1, v2, ...}` - Vertex indices for all polygons, stored contiguously. Contains a sentinel value at the end.
-   `poly_centroids`: `float {x, y}` - Pre-calculated centroids for polygons.
-   `poly_tris`: `int32 {triangles_start}` - Index into the re-sorted `triangles` array. Has `num_polygons + 1` entries (including sentinel).
-   `poly_neighbors`: `int32 {neighbor_poly1, ...}` - The neighbor polygon across the edge formed by `poly_verts[i]` and `poly_verts[i+1]`. Indexed via the `polygons` array. Contains a sentinel value at the end. `-1` indicates no neighbor.
-   `buildings`: `int32 {building_verts_start}` - Index into `building_verts`. Has `num_buildings + 1` entries (including sentinel). The main building metadata is stored in `building_meta`.
-   `building_verts`: `int32 {v1, v2, ...}` - Original high-detail vertices for all buildings, stored contiguously. Contains a sentinel value at the end.
-   `blob_buildings`: `int32 {start_index, ...}` - Index into the reordered `buildings` array, mapping blobs to their constituent buildings. Has `num_blobs + 1` entries (including sentinel).
-   `building_meta`: A list of binary strings representing JSON of building's properties. Written one line per buildings in th eorder of their ids.

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

`src/
└── mapgen/
    ├── build_navmesh.ts       # Main orchestrator script
    ├── navmesh_struct.ts      # Type definitions for navmesh data structures
    ├── populate_navmesh.ts    # Populates the navmesh data arrays from intermediate results
    ├── finalize_navmesh.ts    # Final processing steps (e.g., re-sorting, neighbor mapping)
    ├── triangulate.ts         # Core triangulation logic
    ├── hertel_mehlhorn.ts     # Hertel-Mehlhorn polygonization
    ├── k_opt.ts               # k-opt polygon optimization
    ├── nav_data_io.ts         # Handles loading inputs and writing final navmesh file
    ├── nav_summary.ts         # Prints summary and finalizes statistics
    ├── nav_draw.ts            # Generates a visualization of the navmesh
    └── navmesh_validation.ts  # Performs validation checks on the generated navmesh
`
### 5.2. Module Responsibilities

1.  **`build_navmesh.ts` (Orchestrator)**
    -   Parses command-line arguments.
    -   Calls the I/O module to load blob and building data.
    -   Invokes the triangulation module for both walkable areas and blob interiors.
    -   Calls the polygonization and optimization modules in sequence for the walkable areas.
    -   Calls the population and finalization modules to build the final data structure.
    -   Calls the I/O module to save the final, complete navmesh data structure.

2.  **`triangulate.ts`**
    -   Contains the core logic for performing the Constrained Delaunay Triangulation.
    -   Will encapsulate the usage of the `poly2tri` library.
    -   The main triangulation loop from the current `build_navmesh.ts` will be moved here.

3.  **`hertel_mehlhorn.ts`**
    -   Implements the greedy Hertel-Mehlhorn algorithm to merge triangles into convex polygons.

4.  **`k_opt.ts` (and other optimizers)**
    -   Each file will implement a specific optimization heuristic (like k-opt or random restarts) to be run on the polygon set produced by the initial merge.

5.  **`nav_data_io.ts`**
    -   Handles all file system interactions.
    -   **Input:** Will contain the logic for reading and parsing the `blobs.txt` file and the original building GeoJSON data.
    -   **Output:** Will contain the logic for serializing all the final navmesh data structures into the flat-array format and writing it to a file. It will also output the buildings geoJSON file.

6.  **`nav_draw.ts`**
    -   Generates a 2000x2000 PNG image visualizing the generated navmesh.
    -   Draws all triangles with black outlines.
    -   Fills impassable blobs with solid black.
    -   Colors each walkable polygon with a unique color, ensuring no two adjacent polygons share the same color.
    -   The coordinate system is centered in the image.

7.  **`populate_navmesh.ts`**
    -   A collection of functions responsible for taking the raw output from triangulation and polygonization (vertices, triangles, polygons) and populating the final, flat `NavmeshData` arrays.

8.  **`finalize_navmesh.ts`**
    -   Performs the final data processing steps that can only occur after the main data has been populated. This includes re-sorting triangles by polygon ID and re-mapping triangle neighbor indices to match the new sorted order.

9.  **`nav_summary.ts`**
    -   Calculates and prints a final summary of the generated navmesh, including statistics on vertices, triangles, and polygons.

10. **`navmesh_struct.ts`**
    -   Contains the TypeScript type and interface definitions for the core navmesh data structures, ensuring type safety across the generation pipeline.

11. **`navmesh_validation.ts`**
    -   Contains validation logic to ensure the integrity of the generated navmesh data.
    -   Currently includes a check to ensure no two vertices are too close to each other, using a spatial grid for efficiency.

This modular approach will make the pipeline much easier to develop, debug, and maintain as we implement the full feature set of the new navmesh system. 