#ifndef NAV_TRI_INDEX_H
#define NAV_TRI_INDEX_H

#include "data_structures.h"
#include <vector>
#include <cstdint>

struct NavTriIndexData {
    uint32_t* cellOffsets;
    int32_t* cellTriangles;
    
    int gridWidth;
    int gridHeight;
    float cellSize;
    float minX;
    float minY;
    float maxX;
    float maxY;

    // For JS to read sizes
    int cellOffsetsCount;
    int cellTrianglesCount;
};

// This will be a singleton instance in the WASM module
extern NavTriIndexData g_navTriIndexData;

extern "C" {
    // Global packed descriptor exposed to JS as a symbol; JS reads it directly via Module._g_navTriIndexPackedHeader
    extern uint32_t g_navTriIndexPackedHeader[11];

    // Builds the index and stores it in g_navTriIndexData.
    // Navmesh data must be initialized before calling this.
    void build_nav_tri_index();
    // Returns pointer to the packed descriptor for JS (matches TS reader layout)
    uint32_t get_nav_tri_index_data_ptr();
}

std::vector<int> query_nav_tri_index(const Point2& point);
int is_point_in_navmesh(const Point2& point, int start_tri_idx);
int get_random_triangle();
int get_random_triangle_in_area(float centerX, float centerY, int numCellExtents, uint64_t seed);

#endif // NAV_TRI_INDEX_H