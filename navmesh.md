# Navmesh Generation

## Goal

The primary goal of the navmesh generation step is to produce a data structure that represents all "walkable" areas on the game map.

The final output is a triangular mesh.

## Design Decisions & Learned Caveats

### The Challenge: Triangulating with Holes

The core of the problem is not just to triangulate a set of points, but to triangulate the area *between* a set of complex, impassable polygons (the building blobs). This is often referred to as "triangulating a polygon with holes."

### Initial Approach and Its Critical Flaw

Our first implementation attempted to use a standard, fast Delaunay triangulation library (`d3-delaunay`).

This approach has a **fundamental and critical flaw**. A standard Delaunay algorithm's objective is to create well-proportioned triangles; it has no concept of "barriers" or "walls." In scenarios with long, thin obstacles, the algorithm would often find it optimal to create a large triangle that cut straight through the middle of an impassable building.

**Caveat:** A standard Delaunay triangulation **cannot** be used to generate a navmesh with complex, non-convex obstacles. The assumption that its edges will respect obstacle boundaries is incorrect.

### The Correct Approach: Constrained Delaunay Triangulation (CDT)

The robust solution, and the one we adopted, is to use a **Constrained Delaunay Triangulation (CDT)**. A CDT algorithm is specifically designed to work with pre-defined edges that it is not allowed to cross.

This led to the decision to switch to the `poly2tri` library, which correctly implements a CDT for polygons with holes. The process is much cleaner and more reliable:

1.  An outer, rectangular polygon is defined, representing the edges of the walkable world.
2.  This outer polygon is used to initialize a "sweep context."
3.  Each impassable building blob is then added to this context as a "hole."
4.  The triangulation is then performed. The library guarantees that no triangle edge will cross the boundary of the outer polygon or any of the holes.

This method completely eliminates the need for manual triangle filtering and produces a geometrically correct and reliable navmesh.

## Boundary and Debugging

-   **World Boundary:** To contain the navmesh, a large bounding box is defined around the area of interest. This box is inflated by 100 units to create a clear margin around the map's edges. This inflated box forms the outer contour for the CDT.

-   **Debugging Feature:** Processing the entire map can be slow during development. To facilitate faster testing, the script includes a `DEBUG_BBOX` constant. By setting this constant to a specific area (e.g., `[-1000, -1000, 1000, 1000]`), a developer can generate a navmesh for just that region. To process the entire map, this constant can be set to `null`.

## Output Format

The navmesh is saved to `navmesh.txt` with a custom format designed for efficient loading.

-   `points:[x1,y1,x2,y2...]`
  -   A single, flat, semicolon-delimited array of vertex coordinates.

-   `triangles:[tri1_v1_idx,tri1_v2_idx,tri1_v3_idx,...]`
  -   A flat, semicolon-delimited array of indices that define the triangles.
  -   **Important:** An index in this array refers to a **vertex index** (logical vertex index). To get the coordinates of vertex `vertex_idx`: `x = points[vertex_idx * 2]` and `y = points[vertex_idx * 2 + 1]`. 


# Navmesh Representation

Due to its huge size, the navmesh is stored in memory using optimized, flat typed arrays. This section describes the primary data structures.

### 1. Points Array (`points`)
A single `Float32Array` that holds the coordinates for all vertices in the navmesh. The coordinates are stored sequentially as `[x1, y1, x2, y2, ...]`. This is the source of truth for all vertex locations.

### 2. Triangles Array (`triangles`)
An `Int32Array` that defines the structure of the mesh. It is a flat list of **logical vertex indices**.

-   **Triangle Index (`tri_idx`):** This is the index of a triangle in the mesh. `tri_idx = 0` is the first triangle, `tri_idx = 1` is the second, and so on.
-   **Logical Vertex Index (`v_idx`):** This is an index stored within the `triangles` array. It refers to a vertex, and coordinates are accessed as `x = points[v_idx * 2]` and `y = points[v_idx * 2 + 1]`.

### How It All Connects: An Example
Let's find the coordinates of the second vertex of the tenth triangle (`tri_idx = 9`).

1.  **Find the start of the triangle's data:**
  `start_index_in_triangles_array = tri_idx * 3 = 9 * 3 = 27`

2.  **Find the logical index of the second vertex:**
  `v2_logical_idx = triangles[start_index_in_triangles_array + 1] = triangles[28]`

3.  **Use the logical index to find the coordinates in the `points` array:**
  `x = points[v2_logical_idx * 2]`
  `y = points[v2_logical_idx * 2 + 1]`

### Other Data Arrays
The `neighbors` and `centroids` arrays are both indexed by the **Triangle Index (`tri_idx`)**.

#### Neighbors (`neighbors`)
An `Int32Array` that stores the neighbors for each triangle.

-   **Structure:** Every three consecutive entries represent the three neighbor triangle indices for a single triangle. A value of `-1` means there is no neighbor on that edge.
-   **Accessing Neighbors:** For a triangle `tri_idx` with vertices `v1, v2, v3`:
  -   Neighbor across edge `v1-v2` = `neighbors[tri_idx * 3]`
  -   Neighbor across edge `v2-v3` = `neighbors[tri_idx * 3 + 1]`
  -   Neighbor across edge `v3-v1` = `neighbors[tri_idx * 3 + 2]`

#### Centroids (`centroids`)
A `Float32Array` that stores the pre-calculated centroid for each triangle.

-   **Structure:** A flat list of coordinates, `[c1x, c1y, c2x, c2y, ...]`.
-   **Accessing Centroid:** The centroid of the triangle `tri_idx` is at `centroids[tri_idx * 2]` (x) and `centroids[tri_idx * 2 + 1]` (y).

#### Spatial Index (`triIndex`)

-   **Structure:** The index is a grid that covers the entire map area. Each cell in the grid contains a list of all the triangles that overlap with it.