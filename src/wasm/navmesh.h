#ifndef NAVMESH_H
#define NAVMESH_H

#include <cstdint>
#include "data_structures.h"
#include "spatial_index.h"

const size_t SIMD_ALIGNMENT = 16;

struct Navmesh {
    // Core navigation mesh data
    Point2* vertices;             // Array of Point2 vertices
    int32_t* triangles;           // Layout: [t1_v1_idx, t1_v2_idx, t1_v3_idx, ...]
    int32_t* neighbors;           // Layout: [t1_n1_idx, t1_n2_idx, t1_n3_idx, ...]
    Point2* triangle_centroids;   // Array of Point2 triangle centroids
    float bbox[4];                // [minX, minY, maxX, maxY] - Real/original bounding box
    float buffered_bbox[4];       // [minX, minY, maxX, maxY] - Enlarged bounding box used for triangulation
    
    // Metadata
    int32_t walkable_triangle_count;
    int32_t walkable_polygon_count;
    
    // Extended polygon data
    int32_t* polygons;
    Point2* poly_centroids;
    int32_t* poly_verts;
    int32_t* poly_tris;
    int32_t* poly_neighbors;
    
    // Building data
    int32_t* buildings;
    int32_t* building_verts;
    int32_t* blob_buildings;
    
    // Auxiliary structures
    int32_t* triangle_to_polygon;
    int32_t* building_to_blob;
    
    // Array sizes for memory management
    int32_t vertices_count;
    int32_t triangles_count;
    int32_t neighbors_count;
    int32_t triangle_centroids_count;
    int32_t polygons_count;
    int32_t poly_centroids_count;
    int32_t poly_verts_count;
    int32_t poly_tris_count;
    int32_t poly_neighbors_count;
    int32_t buildings_count;
    int32_t building_verts_count;
    int32_t blob_buildings_count;
    int32_t triangle_to_polygon_count;
    int32_t building_to_blob_count;
    
    // Four spatial indices for fast queries
    SpatialIndex triangle_index;   // For triangle queries
    SpatialIndex polygon_index;    // For polygon queries  
    SpatialIndex building_index;   // For building queries
    SpatialIndex blob_index;       // For blob queries
};

/**
 * NAVMESH DATA STRUCTURE DESIGN NOTES (from new_navmesh.md)
 * 
 * DATA LAYOUT & INDEXING:
 * - All data stored in flat, typed arrays (Structure of Arrays) for cache-friendly access
 * - Uses "countless" indexing scheme: for data array and index array, item i is at slice 
 *   [index_array[i], index_array[i+1]). Index arrays have N+1 sentinel entry at end.
 * 
 * SENTINEL IMPLEMENTATION (from build_navmesh.ts pipeline):
 * - polygons[]: N+1 entries, sentinel = poly_verts.length (points past last valid data)
 * - poly_verts[]: ends with -1 sentinel value appended after all polygon vertex data
 * - poly_tris[]: N+1 entries, sentinel = total_triangles (set by finalize_navmesh.ts)
 * - buildings[]: N+1 entries, sentinel = building_verts.length 
 * - building_verts[]: ends with -1 sentinel value appended after all building vertex data
 * - blob_buildings[]: N+1 entries, sentinel = total_processed_buildings_count
 * - Example: polygons[i] to polygons[i+1] gives slice into poly_verts[] for polygon i
 * 
 * KEY ARRAYS:
 * - vertices: float32 {x,y} - unified array for all vertex coordinates
 * - triangles: int32 {v1,v2,v3} - SORTED BY PARENT POLYGON ID (all tris for poly 0, then poly 1, etc)
 * - neighbors: int32 {tri1,tri2,tri3} - tri-to-tri neighbors, REMAPPED to match sorted triangle order
 * - polygons: int32 {poly_verts_start} - index into poly_verts, has num_polygons+1 entries (w/ sentinel)
 * - poly_verts: int32 {v1,v2,...} - vertex indices for all polygons, stored contiguously
 * - poly_neighbors: int32 {neighbor_poly1,...} - neighbor across edge poly_verts[i] to poly_verts[i+1]
 * - buildings: int32 {building_verts_start} - Index into building_verts. Stores the original, high-detail geometry of buildings, which is separate from the simplified blob polygons used for navigation.
 * - blob_buildings: int32 {start_index,...} - Maps a blob ID (which is a polygon ID >= walkable_polygon_count) to the original buildings that were simplified to create it. This is for metadata/lookup, not for geometry.
 * 
 * WALKABLE vs IMPASSABLE:
 * - walkable_polygon_count: Polygons with an ID < this value are walkable. Polygons with an ID >= this value are impassable obstacles, referred to as "blobs".
 * - walkable_triangle_count: number of triangles in walkable area
 * - Blobs are the impassable polygons in the navmesh, created by simplifying and merging the geometry of one or more original buildings.
 * - The original, high-detail vertices of the source buildings are preserved in `building_verts` for informational purposes (e.g., drawing).
 */

// Global navmesh instance
extern Navmesh g_navmesh;

// Initialization functions
void initialize_navmesh_structure();

inline size_t alignTo(size_t size, size_t alignment) {
    return (size + alignment - 1) / alignment * alignment;
}

#endif // NAVMESH_H 