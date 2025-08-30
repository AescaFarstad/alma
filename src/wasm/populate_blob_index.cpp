#include "populate_blob_index.h"
#include "math_utils.h"
#include <iostream>
#include "wasm_log.h"
#include <vector>
#include <algorithm>
#include <limits>

void populate_blob_index(Navmesh& navmesh, size_t& auxOffset, uint8_t* auxiliaryMemory, size_t auxiliaryMemorySize) {
    SpatialIndex& index = navmesh.blob_index;
    const int totalCells = index.gridWidth * index.gridHeight;
    const int totalPolygons = navmesh.polygons_count > 0 ? navmesh.polygons_count - 1 : 0;
    const int walkablePolygons = navmesh.walkable_polygon_count;

    if (walkablePolygons >= totalPolygons) {
        std::cout << "[WASM] No blobs to index (all polygons are walkable)." << std::endl;
        return;
    }

    std::vector<std::vector<int32_t>> tempGrid(totalCells);
    int32_t totalItems = 0;

    // Iterate through non-walkable polygons, which are the blobs
    for (int32_t i = walkablePolygons; i < totalPolygons; ++i) {
        const int32_t vertStart = navmesh.polygons[i];
        const int32_t vertEnd = navmesh.polygons[i + 1];
        
        std::vector<Point2> polyPoints;
        polyPoints.reserve(vertEnd - vertStart);

        float polyMinX = std::numeric_limits<float>::max();
        float polyMinY = std::numeric_limits<float>::max();
        float polyMaxX = std::numeric_limits<float>::lowest();
        float polyMaxY = std::numeric_limits<float>::lowest();

        for (int32_t vertIdx = vertStart; vertIdx < vertEnd; ++vertIdx) {
            const int32_t pointIndex = navmesh.poly_verts[vertIdx];
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
        wasm_console_error("[WASM] Not enough auxiliary memory to populate blob index items");
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
