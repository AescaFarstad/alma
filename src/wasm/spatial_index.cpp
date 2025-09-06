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

// Static helper: append items from cell without dedup
void SpatialIndex::addCellItemsNoDedup(const SpatialIndex* self, int cx, int cy, std::vector<int>& out) {
  if (!self) return;
  if (cx < 0 || cy < 0 || cx >= self->gridWidth || cy >= self->gridHeight) return;
  const int idx = cy * self->gridWidth + cx;
  if (idx < 0 || idx >= static_cast<int>(self->cellOffsetsCount) - 1) return;
  const uint32_t start = self->cellOffsets[idx];
  const uint32_t end = self->cellOffsets[idx + 1];
  for (uint32_t i = start; i < end; ++i) {
    out.push_back(self->cellItems[i]);
  }
}

// Static helper: append unique items from cell (linear check)
void SpatialIndex::addCellItemsUnique(const SpatialIndex* self, int cx, int cy, std::vector<int>& out) {
  if (!self) return;
  if (cx < 0 || cy < 0 || cx >= self->gridWidth || cy >= self->gridHeight) return;
  const int idx = cy * self->gridWidth + cx;
  if (idx < 0 || idx >= static_cast<int>(self->cellOffsetsCount) - 1) return;
  const uint32_t start = self->cellOffsets[idx];
  const uint32_t end = self->cellOffsets[idx + 1];
  for (uint32_t i = start; i < end; ++i) {
    const int item = self->cellItems[i];
    if (std::find(out.begin(), out.end(), item) == out.end()) {
      out.push_back(item);
    }
  }
}

RangeView SpatialIndex::query(Point2 p) const {
  if (cellOffsets == nullptr || cellItems == nullptr) {
    return RangeView();
  }

  const int cellX = static_cast<int>((p.x - minX) / cellSize);
  const int cellY = static_cast<int>((p.y - minY) / cellSize);

  if (cellX < 0 || cellX >= gridWidth || cellY < 0 || cellY >= gridHeight) {
    return RangeView();
  }

  // Compute boundary distances
  const float cellMinX = minX + cellX * cellSize;
  const float cellMaxX = cellMinX + cellSize;
  const float cellMinY = minY + cellY * cellSize;
  const float cellMaxY = cellMinY + cellSize;
  const float threshold = 0.1f;
  const bool nearLeft = (p.x - cellMinX) <= threshold;
  const bool nearRight = (cellMaxX - p.x) <= threshold;
  const bool nearBottom = (p.y - cellMinY) <= threshold;
  const bool nearTop = (cellMaxY - p.y) <= threshold;

  // Fast path: not near any boundary, return a zero-copy view onto the single cell
  if (!nearLeft && !nearRight && !nearBottom && !nearTop) {
    const int idx = cellY * gridWidth + cellX;
    if (idx >= 0 && idx < static_cast<int>(cellOffsetsCount) - 1) {
      const uint32_t start = cellOffsets[idx];
      const uint32_t end = cellOffsets[idx + 1];
      const uint32_t count = end - start;
      return RangeView(const_cast<int32_t*>(&cellItems[start]), count, false);
    }
    return RangeView();
  }

  // Slow path: union with adjacent cells, deduping and owning allocation
  std::vector<int> tmp;
  tmp.reserve(64); // likely small
  addCellItemsNoDedup(this, cellX, cellY, tmp);
  if (nearLeft)  addCellItemsUnique(this, cellX - 1, cellY, tmp);
  if (nearRight) addCellItemsUnique(this, cellX + 1, cellY, tmp);
  if (nearBottom) addCellItemsUnique(this, cellX, cellY - 1, tmp);
  if (nearTop)   addCellItemsUnique(this, cellX, cellY + 1, tmp);

  if (tmp.empty()) return RangeView();
  int32_t* buf = new int32_t[tmp.size()];
  std::memcpy(buf, tmp.data(), tmp.size() * sizeof(int32_t));
  return RangeView(buf, static_cast<uint32_t>(tmp.size()), true);
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