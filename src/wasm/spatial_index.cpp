#include "spatial_index.h"
#include <cmath>
#include <algorithm>
#include <iostream>
#include <limits>
#include <vector>
#include <cstdint>
#include <cstring>

SpatialIndex::SpatialIndex() {}

SpatialIndex::~SpatialIndex() {
    cleanup();
}

void SpatialIndex::cleanup() {
    // Note: We don't delete the arrays here as they point to WASM memory
    // managed by the TypeScript side. We just reset pointers.
    cellOffsets = nullptr;
    cellItems = nullptr;
}

void SpatialIndex::initializeFromWasm(uint32_t cellOffsetsPtr, uint32_t cellItemsPtr, 
                                     uint32_t cellOffsetsCount, uint32_t cellItemsCount,
                                     int gridWidth, int gridHeight, float cellSize,
                                     float minX, float minY, float maxX, float maxY,
                                     void* wasmBuffer) {
    // Set up pointers to WASM memory
    this->cellOffsets = reinterpret_cast<uint32_t*>(cellOffsetsPtr);
    this->cellItems = reinterpret_cast<int32_t*>(cellItemsPtr);
    
    // Copy grid parameters
    this->cellOffsetsCount = cellOffsetsCount;
    this->cellItemsCount = cellItemsCount;
    this->gridWidth = gridWidth;
    this->gridHeight = gridHeight;
    this->cellSize = cellSize;
    this->minX = minX;
    this->minY = minY;
    this->maxX = maxX;
    this->maxY = maxY;
}

std::vector<int> SpatialIndex::query(Point2 p) const {
    std::vector<int> results;
    if (cellOffsets == nullptr || cellItems == nullptr) {
        return results;
    }

    int cellX = static_cast<int>((p.x - minX) / cellSize);
    int cellY = static_cast<int>((p.y - minY) / cellSize);
    
    if (cellX < 0 || cellX >= gridWidth || cellY < 0 || cellY >= gridHeight) {
        return results;
    }

    int cellIndex = cellY * gridWidth + cellX;
    if (cellIndex < 0 || cellIndex >= static_cast<int>(cellOffsetsCount) - 1) {
        return results;
    }

    uint32_t start = cellOffsets[cellIndex];
    uint32_t end = cellOffsets[cellIndex + 1];
    for (uint32_t i = start; i < end; ++i) {
        results.push_back(cellItems[i]);
    }
    return results;
}

std::vector<int> SpatialIndex::queryArea(float areaMinX, float areaMinY, float areaMaxX, float areaMaxY) const {
    std::vector<int> results;
    
    if (cellOffsets == nullptr || cellItems == nullptr) {
        return results;
    }

    // Calculate cell bounds
    int startCellX = std::max(0, static_cast<int>((areaMinX - minX) / cellSize));
    int endCellX = std::min(gridWidth - 1, static_cast<int>((areaMaxX - minX) / cellSize));
    int startCellY = std::max(0, static_cast<int>((areaMinY - minY) / cellSize));
    int endCellY = std::min(gridHeight - 1, static_cast<int>((areaMaxY - minY) / cellSize));
    
    // Collect items from all cells in the area
    for (int cellY = startCellY; cellY <= endCellY; cellY++) {
        for (int cellX = startCellX; cellX <= endCellX; cellX++) {
            int cellIndex = cellY * gridWidth + cellX;
            
            if (cellIndex < 0 || cellIndex >= static_cast<int>(cellOffsetsCount) - 1) {
                continue;
            }

            uint32_t start = cellOffsets[cellIndex];
            uint32_t end = cellOffsets[cellIndex + 1];

            for (uint32_t i = start; i < end; ++i) {
                int itemId = cellItems[i];
                
                // Check for duplicates (can occur when items span multiple cells)
                if (std::find(results.begin(), results.end(), itemId) == results.end()) {
                    results.push_back(itemId);
                }
            }
        }
    }

    return results;
} 