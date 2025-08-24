#ifndef NAV_UTILS_H
#define NAV_UTILS_H

#include <cstdint>
#include "navmesh.h"

/**
 * Navigation utility functions that mirror the TypeScript NavUtils.ts
 * These functions use the navmesh triangle spatial index for efficient queries
 */

/**
 * Check if a point is inside the navmesh and return the triangle index
 * @param p Point coordinates
 * @param lastTriangle Previously known triangle for optimization (-1 if unknown)
 * @return Triangle index if point is in navmesh, -1 otherwise
 */
int32_t is_point_in_navmesh(Point2 p, int32_t lastTriangle);

/**
 * Get a random triangle from the navmesh
 * @param seed Random seed for deterministic results
 * @return Random triangle index
 */
int32_t get_random_triangle(uint64_t* seed);

/**
 * Get a random triangle within a specified area
 * @param center Center point of search area
 * @param numCellExtents Number of cell extents to search around center
 * @param seed Random seed for deterministic results
 * @return Random triangle index within the area
 */
int32_t get_random_triangle_in_area(Point2 center, int32_t numCellExtents, uint64_t* seed);

/**
 * Get all triangles in a specific spatial index cell
 * @param cellX Cell X coordinate
 * @param cellY Cell Y coordinate
 * @param triangleIds Output buffer for triangle IDs
 * @param maxTriangles Maximum number of triangles to return
 * @return Number of triangles found
 */
int32_t get_triangles_in_cell(int32_t cellX, int32_t cellY, int32_t* triangleIds, int32_t maxTriangles);

/**
 * Check if a point is inside a triangle using barycentric coordinates
 * @param point Point to check
 * @param v1 First triangle vertex
 * @param v2 Second triangle vertex
 * @param v3 Third triangle vertex
 * @return true if point is inside triangle, false otherwise
 */
bool is_point_in_triangle(Point2 point, Point2 v1, Point2 v2, Point2 v3);

int getTriangleFromPoint(const Point2& point);

inline bool test_point_inside_triangle(const Point2& p, int tri_idx) {
    const int32_t v1_idx = g_navmesh.triangles[tri_idx * 3];
    const int32_t v2_idx = g_navmesh.triangles[tri_idx * 3 + 1];
    const int32_t v3_idx = g_navmesh.triangles[tri_idx * 3 + 2];

    const Point2 v1 = g_navmesh.vertices[v1_idx];
    const Point2 v2 = g_navmesh.vertices[v2_idx];
    const Point2 v3 = g_navmesh.vertices[v3_idx];

    // Edge v1-v2
    const float o12 = v1_idx > v2_idx
        ? -((v1.x - v2.x) * (p.y - v2.y) - (v1.y - v2.y) * (p.x - v2.x))
        : (v2.x - v1.x) * (p.y - v1.y) - (v2.y - v1.y) * (p.x - v1.x);
    if (o12 < 0) return false;

    // Edge v2-v3
    const float o23 = v2_idx > v3_idx
        ? -((v2.x - v3.x) * (p.y - v3.y) - (v2.y - v3.y) * (p.x - v3.x))
        : (v3.x - v2.x) * (p.y - v2.y) - (v3.y - v2.y) * (p.x - v2.x);
    if (o23 < 0) return false;

    // Edge v3-v1
    const float o31 = v3_idx > v1_idx
        ? -((v3.x - v1.x) * (p.y - v1.y) - (v3.y - v1.y) * (p.x - v1.x))
        : (v1.x - v3.x) * (p.y - v3.y) - (v1.y - v3.y) * (p.x - v3.x);
        
    return o31 >= 0;
}

inline bool test_point_inside_poly_bi(const Point2 p, int poly_idx) {
    int32_t poly_start = g_navmesh.polygons[poly_idx];
    int32_t poly_end = g_navmesh.polygons[poly_idx + 1];
    int32_t poly_vert_count = poly_end - poly_start;

    if (poly_vert_count < 4) {
        // For 3-vertex polygons, use triangle logic
        const int32_t v1_idx = g_navmesh.poly_verts[poly_start];
        const int32_t v2_idx = g_navmesh.poly_verts[poly_start + 1];
        const int32_t v3_idx = g_navmesh.poly_verts[poly_start + 2];

        const Point2 v1 = g_navmesh.vertices[v1_idx];
        const Point2 v2 = g_navmesh.vertices[v2_idx];
        const Point2 v3 = g_navmesh.vertices[v3_idx];

        // Edge v1-v2
        const float o12 = v1_idx > v2_idx
            ? -((v1.x - v2.x) * (p.y - v2.y) - (v1.y - v2.y) * (p.x - v2.x))
            : (v2.x - v1.x) * (p.y - v1.y) - (v2.y - v1.y) * (p.x - v1.x);
        if (o12 < 0) return false;

        // Edge v2-v3
        const float o23 = v2_idx > v3_idx
            ? -((v2.x - v3.x) * (p.y - v3.y) - (v2.y - v3.y) * (p.x - v3.x))
            : (v3.x - v2.x) * (p.y - v2.y) - (v3.y - v2.y) * (p.x - v2.x);
        if (o23 < 0) return false;

        // Edge v3-v1
        const float o31 = v3_idx > v1_idx
            ? -((v3.x - v1.x) * (p.y - v1.y) - (v3.y - v1.y) * (p.x - v1.x))
            : (v1.x - v3.x) * (p.y - v3.y) - (v1.y - v3.y) * (p.x - v3.x);
            
        return o31 >= 0;
    }

    const int32_t v0_idx = g_navmesh.poly_verts[poly_start + 0];
    const int32_t mid_offset = (poly_vert_count + 1) / 2;
    const int32_t vmid_idx = g_navmesh.poly_verts[poly_start + mid_offset];

    const Point2& v0 = g_navmesh.vertices[v0_idx];
    const Point2& vmid = g_navmesh.vertices[vmid_idx];
    const int32_t v1_idx = g_navmesh.poly_verts[poly_start + 1];
    const Point2& v1 = g_navmesh.vertices[v1_idx];

    // Use cross product to determine which side of the diagonal v0-vmid the point p lies on.
    const float p_side = (p.x - v0.x) * (vmid.y - v0.y) - (p.y - v0.y) * (vmid.x - v0.x);

    // If winding is counter-clockwise, ref_side should always be positive
    // So we just need to check if p_side >= 0 (assuming CCW winding)
    if (p_side >= 0) {  // or p_side <= 0 for CW winding
        // Test first half
        for (int i = 0; i < mid_offset; ++i) {
            const int32_t a_idx = g_navmesh.poly_verts[poly_start + i];
            const int32_t b_idx = g_navmesh.poly_verts[poly_start + i + 1];
            const Point2 a = g_navmesh.vertices[a_idx];
            const Point2 b = g_navmesh.vertices[b_idx];
            const float o = a_idx > b_idx
                ? -((a.x - b.x) * (p.y - b.y) - (a.y - b.y) * (p.x - b.x))
                : (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
            if (o < 0) return false;
        }
    } else {
        // Point is on the other side. Test the boundary edges for that sub-polygon.
        // Check all edges except the last one in the loop
        for (int i = mid_offset; i < poly_vert_count - 1; ++i) {
            const int32_t a_idx = g_navmesh.poly_verts[poly_start + i];
            const int32_t b_idx = g_navmesh.poly_verts[poly_start + i + 1];
            const Point2 a = g_navmesh.vertices[a_idx];
            const Point2 b = g_navmesh.vertices[b_idx];
            const float o = a_idx > b_idx
                ? -((a.x - b.x) * (p.y - b.y) - (a.y - b.y) * (p.x - b.x))
                : (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
            if (o < 0) return false;
        }
        
        // Handle the last edge that wraps around (last vertex to first vertex)
        const int32_t a_idx = g_navmesh.poly_verts[poly_start + poly_vert_count - 1];
        const int32_t b_idx = g_navmesh.poly_verts[poly_start + 0];
        const Point2 a = g_navmesh.vertices[a_idx];
        const Point2 b = g_navmesh.vertices[b_idx];
        const float o = a_idx > b_idx
            ? -((a.x - b.x) * (p.y - b.y) - (a.y - b.y) * (p.x - b.x))
            : (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
        if (o < 0) return false;
    }

    return true;
}



// inline bool test_point_inside_poly_i_debug_positive(const Point2& p, int poly_idx) {    
//     // Now run again with detailed logging
//     printf("DEBUG: Polygon %d claims point (%.3f, %.3f) as INSIDE\n", poly_idx, p.x, p.y);
    
//     int32_t poly_start = g_navmesh.polygons[poly_idx];
//     int32_t poly_end = g_navmesh.polygons[poly_idx + 1];
//     int32_t poly_vert_count = poly_end - poly_start;
    
//     printf("  Polygon: start=%d, end=%d, vert_count=%d\n", poly_start, poly_end, poly_vert_count);

//          // Check all edges except the last one
//      for (int i = 0; i < poly_vert_count - 1; ++i) {
//          int32_t v1_idx = g_navmesh.poly_verts[poly_start + i];
//          int32_t v2_idx = g_navmesh.poly_verts[poly_start + i + 1];

//          const Point2& v1 = g_navmesh.vertices[v1_idx];
//          const Point2& v2 = g_navmesh.vertices[v2_idx];

//          printf("  Edge %d: v1_idx=%d (%.3f,%.3f), v2_idx=%d (%.3f,%.3f)\n", 
//                 i, v1_idx, v1.x, v1.y, v2_idx, v2.x, v2.y);

//          bool flip = v1_idx > v2_idx;
//          float orientation = flip
//              ? -((v1.x - v2.x) * (p.y - v2.y) - (v1.y - v2.y) * (p.x - v2.x))
//              : (v2.x - v1.x) * (p.y - v1.y) - (v2.y - v1.y) * (p.x - v1.x);
         
//          printf("    flip=%s, orientation=%.6f, ok=%s\n", 
//                 flip ? "true" : "false", orientation, (orientation >= 0) ? "true" : "false");
         
//          if (orientation < 0) {
//              printf("  Result: OUTSIDE (failed edge %d)\n", i);
//              return false;
//          }
//      }
     
//      // Check the last edge 
//      int32_t v1_idx = g_navmesh.poly_verts[poly_start + poly_vert_count - 1];
//      int32_t v2_idx = g_navmesh.poly_verts[poly_start + 0];
     
//      const Point2& v1 = g_navmesh.vertices[v1_idx];
//      const Point2& v2 = g_navmesh.vertices[v2_idx];
     
//      printf("  Edge %d (last): v1_idx=%d (%.3f,%.3f), v2_idx=%d (%.3f,%.3f)\n", 
//             poly_vert_count-1, v1_idx, v1.x, v1.y, v2_idx, v2.x, v2.y);
     
//      bool flip = v1_idx > v2_idx;
//      float orientation = flip
//          ? -((v1.x - v2.x) * (p.y - v2.y) - (v1.y - v2.y) * (p.x - v2.x))
//          : (v2.x - v1.x) * (p.y - v1.y) - (v2.y - v1.y) * (p.x - v1.x);
     
//      printf("    flip=%s, orientation=%.6f, ok=%s\n", 
//             flip ? "true" : "false", orientation, (orientation >= 0) ? "true" : "false");
     
//      if (orientation < 0) {
//          printf("  Result: OUTSIDE (failed last edge)\n");
//          return false;
//      }
    
//     printf("  Final result: INSIDE\n\n");
//     return true;
// }

inline bool test_point_inside_poly(const Point2& p, int poly_idx) {
    int32_t poly_start = g_navmesh.polygons[poly_idx];
    int32_t poly_end = g_navmesh.polygons[poly_idx + 1];
    int32_t poly_vert_count = poly_end - poly_start;

         // Check all edges except the last one with strict inequality
     for (int i = 0; i < poly_vert_count - 1; ++i) {
         int32_t v1_idx = g_navmesh.poly_verts[poly_start + i];
         int32_t v2_idx = g_navmesh.poly_verts[poly_start + i + 1];

         const Point2& v1 = g_navmesh.vertices[v1_idx];
         const Point2& v2 = g_navmesh.vertices[v2_idx];

         bool flip = v1_idx > v2_idx;
         float orientation = flip
             ? -((v1.x - v2.x) * (p.y - v2.y) - (v1.y - v2.y) * (p.x - v2.x))
             : (v2.x - v1.x) * (p.y - v1.y) - (v2.y - v1.y) * (p.x - v1.x);
         
         if (orientation < 0) {
             return false;
         }
     }
     
     // Check the last edge with inclusive boundary (like triangle approach)
     int32_t v1_idx = g_navmesh.poly_verts[poly_start + poly_vert_count - 1];
     int32_t v2_idx = g_navmesh.poly_verts[poly_start + 0];
     
     const Point2& v1 = g_navmesh.vertices[v1_idx];
     const Point2& v2 = g_navmesh.vertices[v2_idx];
     
     bool flip = v1_idx > v2_idx;
     float orientation = flip
         ? -((v1.x - v2.x) * (p.y - v2.y) - (v1.y - v2.y) * (p.x - v2.x))
         : (v2.x - v1.x) * (p.y - v1.y) - (v2.y - v1.y) * (p.x - v1.x);
     
          if (orientation >= 0) {
        //  test_point_inside_poly_i_debug_positive(p, poly_idx);
         return true;
     }
     return false;
}

inline bool test_point_inside_poly_t(const Point2& p, int poly_idx) {
    int32_t tri_start_idx = g_navmesh.poly_tris[poly_idx];
    int32_t tri_end_idx = g_navmesh.poly_tris[poly_idx + 1];

    for (int32_t i = tri_start_idx; i < tri_end_idx; ++i) {
        if (test_point_inside_triangle(p, i)) {
            return true;
        }
    }

    return false;
}

#endif // NAV_UTILS_H 