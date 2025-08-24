#ifndef SPATIAL_INDEX_H
#define SPATIAL_INDEX_H

#include <cstdint>
#include <vector>
#include "point2.h"

class SpatialIndex {
public:
    // Core data arrays - match TypeScript SpatialIndex structure
    uint32_t* cellOffsets = nullptr;    // Maps from cell index to start in cellItems
    int32_t* cellItems = nullptr;       // Item IDs in each cell (was itemIds)
    
    // Grid parameters
    int gridWidth = 0;
    int gridHeight = 0;
    float cellSize = 128.0f;
    float minX = 0.0f;
    float minY = 0.0f;
    float maxX = 0.0f;
    float maxY = 0.0f;
    
    // Array sizes
    uint32_t cellOffsetsCount = 0;
    uint32_t cellItemsCount = 0;        // Item count (was itemIdsCount)

    SpatialIndex();
    ~SpatialIndex();
    
    // Query methods
    std::vector<int> query(Point2 p) const;
    std::vector<int> queryArea(float minX, float minY, float maxX, float maxY) const;
    
    // Initialize from WASM memory pointers (called by TypeScript)
    void initializeFromWasm(uint32_t cellOffsetsPtr, uint32_t cellItemsPtr, 
                           uint32_t cellOffsetsCount, uint32_t cellItemsCount,
                           int gridWidth, int gridHeight, float cellSize,
                           float minX, float minY, float maxX, float maxY,
                           void* wasmBuffer);

private:
    void cleanup();
};

#endif // SPATIAL_INDEX_H
