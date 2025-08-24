#include "nav_utils.h"
#include "math_utils.h"
#include "navmesh.h"
#include <algorithm>
#include <cmath>
#include <vector>
#include <iostream> // Added for logging

// External reference to global navmesh
extern Navmesh g_navmesh;

static bool check_triangle(int32_t triIdx, const Point2& point) {
    if (triIdx < 0 || triIdx >= g_navmesh.walkable_triangle_count) {
        return false;
    }
    
    return test_point_inside_triangle(point, triIdx);
}

int32_t is_point_in_navmesh(Point2 p, int32_t lastTriangle) {
    // Try the last triangle first if provided
    if (lastTriangle >= 0 && lastTriangle < g_navmesh.walkable_triangle_count) {
        if (check_triangle(lastTriangle, p)) {
            return lastTriangle;
        }
    }

    std::vector<int> candidateTriangles = g_navmesh.triangle_index.query(p);
    for (int32_t triIdx : candidateTriangles) {
        if (check_triangle(triIdx, p)) {
            return triIdx;
        }
    }
    return -1;
}

int32_t get_random_triangle(uint64_t* seed) {
    uint64_t local_seed = *seed;
    const int32_t maxAttempts = 10;
    
    for (int i = 0; i < maxAttempts; i++) {
        float randomX = math::seed_to_random_no_advance(&local_seed);
        float randomY = math::seed_to_random_no_advance(&local_seed);
        
        float x = g_navmesh.triangle_index.minX + randomX * (g_navmesh.triangle_index.maxX - g_navmesh.triangle_index.minX);
        float y = g_navmesh.triangle_index.minY + randomY * (g_navmesh.triangle_index.maxY - g_navmesh.triangle_index.minY);
        
        int32_t triIndex = is_point_in_navmesh({x, y}, -1);
        if (triIndex != -1) {
            return triIndex;
        }
    }
    
    // Fallback: return a random triangle index
    const int32_t numTriangles = g_navmesh.walkable_triangle_count;
    if (numTriangles > 0) {
        float randomValue = math::seed_to_random_no_advance(&local_seed);
        return static_cast<int32_t>(randomValue * numTriangles);
    }
    
    return -1;
}

int32_t get_random_triangle_in_area(Point2 center, int32_t numCellExtents, uint64_t* seed) {
    uint64_t local_seed = *seed;
    const int32_t maxAttempts = 20;
    
    const float halfExtent = numCellExtents * g_navmesh.triangle_index.cellSize;
    const float minX = center.x - halfExtent;
    const float maxX = center.x + halfExtent;
    const float minY = center.y - halfExtent;
    const float maxY = center.y + halfExtent;
    
    const float clampedMinX = std::max(minX, g_navmesh.triangle_index.minX);
    const float clampedMaxX = std::min(maxX, g_navmesh.triangle_index.maxX);
    const float clampedMinY = std::max(minY, g_navmesh.triangle_index.minY);
    const float clampedMaxY = std::min(maxY, g_navmesh.triangle_index.maxY);
    
    // Try random points in the area
    for (int i = 0; i < maxAttempts; i++) {
        float randomX = math::seed_to_random_no_advance(&local_seed);
        float randomY = math::seed_to_random_no_advance(&local_seed);
        
        float x = clampedMinX + randomX * (clampedMaxX - clampedMinX);
        float y = clampedMinY + randomY * (clampedMaxY - clampedMinY);
        
        Point2 point = {x, y};
        int32_t triIndex = is_point_in_navmesh(point, -1);
        if (triIndex != -1) {
            return triIndex;
        }
    }
    
    // Fallback: collect triangles from cells in the area
    std::vector<int32_t> candidateTriangles = g_navmesh.triangle_index.queryArea(clampedMinX, clampedMinY, clampedMaxX, clampedMaxY);
    
    if (!candidateTriangles.empty()) {
        float randomValue = math::seed_to_random_no_advance(&local_seed);
        int32_t randomIndex = static_cast<int32_t>(randomValue * candidateTriangles.size());
        return candidateTriangles[randomIndex];
    }
    
    // Final fallback
    return get_random_triangle(&local_seed);
}

int32_t get_triangles_in_cell(int32_t cellX, int32_t cellY, int32_t* triangleIds, int32_t maxTriangles) {
    const int32_t cellIndex = cellX + cellY * g_navmesh.triangle_index.gridWidth;
    
    if (cellIndex < 0 || cellIndex >= static_cast<int32_t>(g_navmesh.triangle_index.cellOffsetsCount) - 1) {
        return 0;
    }
    
    const uint32_t start = g_navmesh.triangle_index.cellOffsets[cellIndex];
    const uint32_t end = g_navmesh.triangle_index.cellOffsets[cellIndex + 1];
    
    const int32_t count = std::min(maxTriangles, static_cast<int32_t>(end - start));
    
    for (int32_t i = 0; i < count; i++) {
        triangleIds[i] = g_navmesh.triangle_index.cellItems[start + i];
    }
    
    return count;
}

int getTriangleFromPoint(const Point2& point) {
    std::vector<int> possibleTris = g_navmesh.triangle_index.query(point);

    for (int triIdx : possibleTris) {
        if (test_point_inside_triangle(point, triIdx)) {
            return triIdx;
        }
    }

    return -1;
}

int getPolygonFromPoint(const Point2& point) {
    std::vector<int> possiblePolys = g_navmesh.polygon_index.query(point);
    for (int polyIdx : possiblePolys) {
        if (test_point_inside_poly_t(point, polyIdx)) {
            return polyIdx;
        }
    }
    return -1;
}

int getBlobFromPoint(const Point2& point) {
    std::vector<int> possibleBlobs = g_navmesh.blob_index.query(point);
    for (int blobIdx : possibleBlobs) {
        if (testPointInsideBlob(point, blobIdx)) {
            return blobIdx;
        }
    }
    return -1;
}

int getTriangleFromPolyPoint(const Point2& point, int poly_idx) {
    const int32_t poly_start = g_navmesh.poly_tris[poly_idx];
    const int32_t poly_end = g_navmesh.poly_tris[poly_idx + 1];

    for (int i = poly_start; i < poly_end; i++) {
        if (test_point_inside_triangle(point, i)) {
            return i;
        }
    }

    return -1;
}
