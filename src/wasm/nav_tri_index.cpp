#include "nav_tri_index.h"
#include "data_structures.h"
#include "math_utils.h"
#include <vector>
#include <cmath>
#include <algorithm>
#include <iostream>
#include <iomanip> // Required for std::fixed and std::setprecision

// The global instance of our spatial index data
NavTriIndexData g_navTriIndexData;

// The navmesh data from main.cpp
extern NavmeshData navmesh_data; 
extern NavmeshBBox navmesh_bbox;

// A compact struct exposed to JS providing pointers and metadata
// Layout must match TS reader in NavTriIndex.ts
extern "C" { uint32_t g_navTriIndexPackedHeader[11]; }

// Helper to check for AABB intersection. Equivalent to triangleAABBIntersectionWithBounds in TS
bool triangleAABBIntersection(const Point2 triPoints[3], const Point2& cellMin, const Point2& cellMax) {
    float triMinX = std::min({triPoints[0].x, triPoints[1].x, triPoints[2].x});
    float triMaxX = std::max({triPoints[0].x, triPoints[1].x, triPoints[2].x});
    float triMinY = std::min({triPoints[0].y, triPoints[1].y, triPoints[2].y});
    float triMaxY = std::max({triPoints[0].y, triPoints[1].y, triPoints[2].y});

    return triMaxX >= cellMin.x && triMinX <= cellMax.x &&
           triMaxY >= cellMin.y && triMinY <= cellMax.y;
}

extern "C" {

void build_nav_tri_index() {
    g_navTriIndexData.cellSize = 256.0f;
    g_navTriIndexData.minX = navmesh_bbox.minX;
    g_navTriIndexData.minY = navmesh_bbox.minY;
    g_navTriIndexData.maxX = navmesh_bbox.maxX;
    g_navTriIndexData.maxY = navmesh_bbox.maxY;
    
    float width = g_navTriIndexData.maxX - g_navTriIndexData.minX;
    float height = g_navTriIndexData.maxY - g_navTriIndexData.minY;
    
    g_navTriIndexData.gridWidth = static_cast<int>(std::ceil(width / g_navTriIndexData.cellSize));
    g_navTriIndexData.gridHeight = static_cast<int>(std::ceil(height / g_navTriIndexData.cellSize));

    int gridCellCount = g_navTriIndexData.gridWidth * g_navTriIndexData.gridHeight;
    std::vector<std::vector<int32_t>> tempGrid(gridCellCount);

    for (int i = 0; i < navmesh_data.numTriangles; ++i) {
        // Gather triangle points
        int32_t p1Index = navmesh_data.triangles[i * 3 + 0];
        int32_t p2Index = navmesh_data.triangles[i * 3 + 1];
        int32_t p3Index = navmesh_data.triangles[i * 3 + 2];

        std::vector<Point2> triPoints = {
            navmesh_data.points[p1Index],
            navmesh_data.points[p2Index],
            navmesh_data.points[p3Index]
        };

        // Precompute triangle bounds
        float triMinX = std::min({triPoints[0].x, triPoints[1].x, triPoints[2].x});
        float triMaxX = std::max({triPoints[0].x, triPoints[1].x, triPoints[2].x});
        float triMinY = std::min({triPoints[0].y, triPoints[1].y, triPoints[2].y});
        float triMaxY = std::max({triPoints[0].y, triPoints[1].y, triPoints[2].y});
        Point2 triMin = {triMinX, triMinY};
        Point2 triMax = {triMaxX, triMaxY};

        int startX = std::max(0, static_cast<int>(std::floor((triMinX - g_navTriIndexData.minX) / g_navTriIndexData.cellSize)));
        int endX = std::min(g_navTriIndexData.gridWidth - 1, static_cast<int>(std::floor((triMaxX - g_navTriIndexData.minX) / g_navTriIndexData.cellSize)));
        int startY = std::max(0, static_cast<int>(std::floor((triMinY - g_navTriIndexData.minY) / g_navTriIndexData.cellSize)));
        int endY = std::min(g_navTriIndexData.gridHeight - 1, static_cast<int>(std::floor((triMaxY - g_navTriIndexData.minY) / g_navTriIndexData.cellSize)));

        for (int cy = startY; cy <= endY; ++cy) {
            for (int cx = startX; cx <= endX; ++cx) {
                Point2 cellMin = { g_navTriIndexData.minX + cx * g_navTriIndexData.cellSize, g_navTriIndexData.minY + cy * g_navTriIndexData.cellSize };
                Point2 cellMax = { g_navTriIndexData.minX + (cx + 1) * g_navTriIndexData.cellSize, g_navTriIndexData.minY + (cy + 1) * g_navTriIndexData.cellSize };
                
                // Use detailed triangle vs cell intersection (parity with TS)
                if (math::triangleAABBIntersectionWithBounds(triPoints, triMin, triMax, cellMin, cellMax)) {
                    tempGrid[cx + cy * g_navTriIndexData.gridWidth].push_back(i);
                }
            }
        }
    }

    g_navTriIndexData.cellOffsetsCount = gridCellCount + 1;
    g_navTriIndexData.cellOffsets = new uint32_t[g_navTriIndexData.cellOffsetsCount];
    
    int totalTriangles = 0;
    for (int i = 0; i < gridCellCount; ++i) {
        g_navTriIndexData.cellOffsets[i] = totalTriangles;
        totalTriangles += static_cast<int>(tempGrid[i].size());
    }
    g_navTriIndexData.cellOffsets[gridCellCount] = totalTriangles;

    g_navTriIndexData.cellTrianglesCount = totalTriangles;
    g_navTriIndexData.cellTriangles = new int32_t[g_navTriIndexData.cellTrianglesCount];
    
    int offset = 0;
    for (int i = 0; i < gridCellCount; ++i) {
        if (!tempGrid[i].empty()) {
            std::copy(tempGrid[i].begin(), tempGrid[i].end(), g_navTriIndexData.cellTriangles + offset);
            offset += static_cast<int>(tempGrid[i].size());
        }
    }

    // Build or rebuild packed descriptor
    // Layout (int32 slots):
    // 0: cellOffsetsPtr, 1: cellTrianglesPtr, 2: gridWidth, 3: gridHeight
    // 4: cellSize (float32 in two slots 4 as float), 5: minX(float32), 6: minY(float32)
    // 7: maxX(float32), 8: maxY(float32), 9: cellOffsetsCount, 10: cellTrianglesCount
    // We store pointers in first two int slots; floats are reinterpreted by JS using HEAPF32
    g_navTriIndexPackedHeader[0] = reinterpret_cast<uint32_t>(g_navTriIndexData.cellOffsets);
    g_navTriIndexPackedHeader[1] = reinterpret_cast<uint32_t>(g_navTriIndexData.cellTriangles);
    g_navTriIndexPackedHeader[2] = static_cast<uint32_t>(g_navTriIndexData.gridWidth);
    g_navTriIndexPackedHeader[3] = static_cast<uint32_t>(g_navTriIndexData.gridHeight);

    // Write floats through a float* view casted to the same memory
    reinterpret_cast<float*>(g_navTriIndexPackedHeader)[4] = g_navTriIndexData.cellSize;
    reinterpret_cast<float*>(g_navTriIndexPackedHeader)[5] = g_navTriIndexData.minX;
    reinterpret_cast<float*>(g_navTriIndexPackedHeader)[6] = g_navTriIndexData.minY;
    reinterpret_cast<float*>(g_navTriIndexPackedHeader)[7] = g_navTriIndexData.maxX;
    reinterpret_cast<float*>(g_navTriIndexPackedHeader)[8] = g_navTriIndexData.maxY;

    g_navTriIndexPackedHeader[9]  = static_cast<uint32_t>(g_navTriIndexData.cellOffsetsCount);
    g_navTriIndexPackedHeader[10] = static_cast<uint32_t>(g_navTriIndexData.cellTrianglesCount);
}

// Returns pointer to the packed descriptor (see above)
uint32_t get_nav_tri_index_data_ptr() {
    return reinterpret_cast<uint32_t>(g_navTriIndexPackedHeader);
}

}

std::vector<int> query_nav_tri_index(const Point2& point) {
    std::vector<int> results;
    if (point.x < g_navTriIndexData.minX || point.x > g_navTriIndexData.maxX ||
        point.y < g_navTriIndexData.minY || point.y > g_navTriIndexData.maxY) {
        return results;
    }

    int cellX = static_cast<int>((point.x - g_navTriIndexData.minX) / g_navTriIndexData.cellSize);
    int cellY = static_cast<int>((point.y - g_navTriIndexData.minY) / g_navTriIndexData.cellSize);
    cellX = std::max(0, std::min(g_navTriIndexData.gridWidth - 1, cellX));
    cellY = std::max(0, std::min(g_navTriIndexData.gridHeight - 1, cellY));

    int cellIndex = cellY * g_navTriIndexData.gridWidth + cellX;
    uint32_t start = g_navTriIndexData.cellOffsets[cellIndex];
    uint32_t end = g_navTriIndexData.cellOffsets[cellIndex + 1];

    for (uint32_t i = start; i < end; ++i) {
        results.push_back(g_navTriIndexData.cellTriangles[i]);
    }

    return results;
}

int is_point_in_navmesh(const Point2& point, int start_tri_idx) {
    // 1) Check the last known triangle first
    if (start_tri_idx != -1) {
        Point2 p1 = navmesh_data.points[navmesh_data.triangles[start_tri_idx * 3]];
        Point2 p2 = navmesh_data.points[navmesh_data.triangles[start_tri_idx * 3 + 1]];
        Point2 p3 = navmesh_data.points[navmesh_data.triangles[start_tri_idx * 3 + 2]];
        if (math::isPointInTriangle(point, p1, p2, p3)) {
            return start_tri_idx;
        }
        // 2) Optimization: check neighbors of the last triangle
        for (int i = 0; i < 3; ++i) {
            int neighbor_idx = navmesh_data.neighbors[start_tri_idx * 3 + i];
            if (neighbor_idx != -1) {
                Point2 n1 = navmesh_data.points[navmesh_data.triangles[neighbor_idx * 3]];
                Point2 n2 = navmesh_data.points[navmesh_data.triangles[neighbor_idx * 3 + 1]];
                Point2 n3 = navmesh_data.points[navmesh_data.triangles[neighbor_idx * 3 + 2]];
                if (math::isPointInTriangle(point, n1, n2, n3)) {
                    return neighbor_idx;
                }
            }
        }
    }

    // 3) Query spatial index cells
    std::vector<int> candidate_tris = query_nav_tri_index(point);
    for (int tri_idx : candidate_tris) {
        Point2 p1 = navmesh_data.points[navmesh_data.triangles[tri_idx * 3]];
        Point2 p2 = navmesh_data.points[navmesh_data.triangles[tri_idx * 3 + 1]];
        Point2 p3 = navmesh_data.points[navmesh_data.triangles[tri_idx * 3 + 2]];
        if (math::isPointInTriangle(point, p1, p2, p3)) {
            return tri_idx;
        }
    }

    return -1;
}

int get_random_triangle() {
    if (navmesh_data.numTriangles == 0) {
        return -1;
    }
    return math::random_int(0, navmesh_data.numTriangles - 1);
}

int get_random_triangle_in_area(float centerX, float centerY, int numCellExtents, uint64_t seed) {
    if (navmesh_data.numTriangles == 0) return -1;

    uint64_t current_seed = seed;

    const float halfExtent = numCellExtents * g_navTriIndexData.cellSize;
    const float minX = std::max(g_navTriIndexData.minX, centerX - halfExtent);
    const float maxX = std::min(g_navTriIndexData.maxX, centerX + halfExtent);
    const float minY = std::max(g_navTriIndexData.minY, centerY - halfExtent);
    const float maxY = std::min(g_navTriIndexData.maxY, centerY + halfExtent);

    // Try a number of uniform samples within the clamped bounds
    const int maxAttempts = 20;
    for (int i = 0; i < maxAttempts; ++i) {
        float randomX = math::seed_to_random_no_advance(&current_seed);
        float randomY = math::seed_to_random_no_advance(&current_seed);

        float rx = minX + randomX * (maxX - minX);
        float ry = minY + randomY * (maxY - minY);
        int tri = is_point_in_navmesh({rx, ry}, -1);
        if (tri != -1) {
            return tri;
        }
    }

    // Fallback: gather candidate triangles from grid cells overlapping the area
    int startCellX = std::max(0, static_cast<int>(std::floor((minX - g_navTriIndexData.minX) / g_navTriIndexData.cellSize)));
    int endCellX = std::min(g_navTriIndexData.gridWidth - 1, static_cast<int>(std::floor((maxX - g_navTriIndexData.minX) / g_navTriIndexData.cellSize)));
    int startCellY = std::max(0, static_cast<int>(std::floor((minY - g_navTriIndexData.minY) / g_navTriIndexData.cellSize)));
    int endCellY = std::min(g_navTriIndexData.gridHeight - 1, static_cast<int>(std::floor((maxY - g_navTriIndexData.minY) / g_navTriIndexData.cellSize)));

    std::vector<int> candidates;
    candidates.reserve(1024);

    for (int cy = startCellY; cy <= endCellY; ++cy) {
        for (int cx = startCellX; cx <= endCellX; ++cx) {
            int cellIndex = cy * g_navTriIndexData.gridWidth + cx;
            uint32_t start = g_navTriIndexData.cellOffsets[cellIndex];
            uint32_t end = g_navTriIndexData.cellOffsets[cellIndex + 1];
            for (uint32_t i = start; i < end; ++i) {
                int triIdx = g_navTriIndexData.cellTriangles[i];
                // Deduplicate: linear check acceptable for small sets
                if (std::find(candidates.begin(), candidates.end(), triIdx) == candidates.end()) {
                    candidates.push_back(triIdx);
                }
            }
        }
    }

    if (!candidates.empty()) {
        float r_val = math::seed_to_random_no_advance(&current_seed);
        int r_idx = static_cast<int>(r_val * candidates.size());
        if (r_idx >= static_cast<int>(candidates.size())) {
            r_idx = static_cast<int>(candidates.size()) - 1;
        }
        return candidates[static_cast<size_t>(r_idx)];
    }

    // Final fallback: use seeded global selection with local seed for parity
    // with TS getRandomTriangle(navmesh, currentSeed)
    int numTriangles = navmesh_data.numTriangles;
    if (numTriangles <= 0) return -1;
    float r_val = math::seed_to_random_no_advance(&current_seed);
    int idx = static_cast<int>(r_val * numTriangles);
    if (idx >= numTriangles) idx = numTriangles - 1;
    return idx;
}