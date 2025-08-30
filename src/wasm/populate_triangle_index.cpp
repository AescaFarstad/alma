#include "populate_triangle_index.h"
#include "math_utils.h"
#include <iostream>
#include "wasm_log.h"
#include <vector>

void populate_triangle_index(Navmesh& navmesh, size_t& auxOffset, uint8_t* auxiliaryMemory, size_t auxiliaryMemorySize) {
  SpatialIndex& index = navmesh.triangle_index;
  const int totalCells = index.gridWidth * index.gridHeight;
  const int totalTriangles = navmesh.triangles_count / 3;

  std::vector<std::vector<int32_t>> tempGrid(totalCells);
  int32_t totalItems = 0;

  // Only iterate through walkable triangles
  const int32_t walkableTriangles = navmesh.walkable_triangle_count;
  for (int32_t i = 0; i < walkableTriangles; ++i) {
    const int32_t v1_idx = navmesh.triangles[i * 3];
    const int32_t v2_idx = navmesh.triangles[i * 3 + 1];
    const int32_t v3_idx = navmesh.triangles[i * 3 + 2];
    
    std::vector<Point2> triPoints = {
      navmesh.vertices[v1_idx],
      navmesh.vertices[v2_idx],
      navmesh.vertices[v3_idx]
    };

    float triMinX = triPoints[0].x, triMinY = triPoints[0].y;
    float triMaxX = triPoints[0].x, triMaxY = triPoints[0].y;
    for (size_t j = 1; j < 3; ++j) {
      if (triPoints[j].x < triMinX) triMinX = triPoints[j].x;
      if (triPoints[j].y < triMinY) triMinY = triPoints[j].y;
      if (triPoints[j].x > triMaxX) triMaxX = triPoints[j].x;
      if (triPoints[j].y > triMaxY) triMaxY = triPoints[j].y;
    }

    int startX = std::max(0, static_cast<int>(std::floor((triMinX - index.minX) / index.cellSize)));
    int endX = std::min(index.gridWidth - 1, static_cast<int>(std::floor((triMaxX - index.minX) / index.cellSize)));
    int startY = std::max(0, static_cast<int>(std::floor((triMinY - index.minY) / index.cellSize)));
    int endY = std::min(index.gridHeight - 1, static_cast<int>(std::floor((triMaxY - index.minY) / index.cellSize)));

    for (int cx = startX; cx <= endX; ++cx) {
      for (int cy = startY; cy <= endY; ++cy) {
        Point2 cellMin = {index.minX + cx * index.cellSize, index.minY + cy * index.cellSize};
        Point2 cellMax = {index.minX + (cx + 1) * index.cellSize, index.minY + (cy + 1) * index.cellSize};
        
        if (math::triangleAABBIntersectionWithBounds(triPoints, {triMinX, triMinY}, {triMaxX, triMaxY}, cellMin, cellMax)) {
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
    wasm_console_error("[WASM] Not enough auxiliary memory to populate triangle index items");
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
