#include "populate_building_index.h"
#include "math_utils.h"
#include <iostream>
#include "wasm_log.h"
#include <vector>
#include <algorithm>
#include <limits>

void populate_building_index(Navmesh& navmesh, size_t& auxOffset, uint8_t* auxiliaryMemory, size_t auxiliaryMemorySize) {
  SpatialIndex& index = navmesh.building_index;
  const int totalCells = index.gridWidth * index.gridHeight;
  const int totalBuildings = navmesh.buildings_count > 0 ? navmesh.buildings_count - 1 : 0;

  if (totalBuildings == 0) {
    std::cout << "[WASM] No buildings to index." << std::endl;
    return;
  }

  std::vector<std::vector<int32_t>> tempGrid(totalCells);
  int32_t totalItems = 0;

  for (int32_t i = 0; i < totalBuildings; ++i) {
    const int32_t vertStart = navmesh.buildings[i];
    const int32_t vertEnd = navmesh.buildings[i + 1];
    
    std::vector<Point2> polyPoints;
    polyPoints.reserve(vertEnd - vertStart);

    float polyMinX = std::numeric_limits<float>::max();
    float polyMinY = std::numeric_limits<float>::max();
    float polyMaxX = std::numeric_limits<float>::lowest();
    float polyMaxY = std::numeric_limits<float>::lowest();

    for (int32_t vertIdx = vertStart; vertIdx < vertEnd; ++vertIdx) {
      const int32_t pointIndex = navmesh.building_verts[vertIdx];
      const Point2& p = navmesh.vertices[pointIndex];
      polyPoints.push_back(p);

      if (p.x < polyMinX) polyMinX = p.x;
      if (p.y < polyMinY) polyMinY = p.y;
      if (p.x > polyMaxX) polyMaxX = p.x;
      if (p.y > polyMaxY) polyMaxY = p.y;
    }

    if (polyPoints.empty()) continue;

    int startX = std::max(0, static_cast<int>(std::floor((polyMinX - index.minX) / index.cellSize)));
    int endX = std::min(index.gridWidth - 1, static_cast<int>(std::floor((polyMaxX - index.minX) / index.cellSize)));
    int startY = std::max(0, static_cast<int>(std::floor((polyMinY - index.minY) / index.cellSize)));
    int endY = std::min(index.gridHeight - 1, static_cast<int>(std::floor((polyMaxY - index.minY) / index.cellSize)));

    for (int cx = startX; cx <= endX; ++cx) {
      for (int cy = startY; cy <= endY; ++cy) {
        Point2 cellMin = {index.minX + cx * index.cellSize, index.minY + cy * index.cellSize};
        Point2 cellMax = {index.minX + (cx + 1) * index.cellSize, index.minY + (cy + 1) * index.cellSize};

        if (math::polygonAABBIntersectionWithBounds(polyPoints, {polyMinX, polyMinY}, {polyMaxX, polyMaxY}, cellMin, cellMax)) {
          int cellIndex = cy * index.gridWidth + cx;
          if (cellIndex < totalCells) {
            tempGrid[cellIndex].push_back(i);
            totalItems++;
          }
        }
      }
    }
  }

  size_t itemsSize = alignTo(totalItems * sizeof(int32_t), SIMD_ALIGNMENT);
  if (auxOffset + itemsSize > auxiliaryMemorySize) {
    wasm_console_error("[WASM] Not enough auxiliary memory to populate building index items");
    return;
  }
  
  index.cellItems = reinterpret_cast<int32_t*>(auxiliaryMemory + auxOffset);
  index.cellItemsCount = totalItems;
  auxOffset += itemsSize;

  int32_t currentOffset = 0;
  for (int i = 0; i < totalCells; ++i) {
    index.cellOffsets[i] = currentOffset;
    if (!tempGrid[i].empty()) {
      std::memcpy(index.cellItems + currentOffset, tempGrid[i].data(), tempGrid[i].size() * sizeof(int32_t));
      currentOffset += tempGrid[i].size();
    }
  }
  index.cellOffsets[totalCells] = currentOffset;
}
