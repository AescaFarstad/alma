#include "data_structures.h"
#include <cmath>
#include <algorithm>

// Static constants for BlobSpatialIndex
const float BlobSpatialIndex::CELL_SIZE = 256.0f;
const float BlobSpatialIndex::WORLD_MIN_X = -10000.0f;
const float BlobSpatialIndex::WORLD_MIN_Y = -10000.0f;
const float BlobSpatialIndex::WORLD_MAX_X = 10000.0f;
const float BlobSpatialIndex::WORLD_MAX_Y = 10000.0f;
const int BlobSpatialIndex::GRID_WIDTH = static_cast<int>(ceil((WORLD_MAX_X - WORLD_MIN_X) / CELL_SIZE));
const int BlobSpatialIndex::GRID_HEIGHT = static_cast<int>(ceil((WORLD_MAX_Y - WORLD_MIN_Y) / CELL_SIZE));
const int BlobSpatialIndex::TOTAL_CELLS = GRID_WIDTH * GRID_HEIGHT;

// Global instance
BlobSpatialIndex blob_spatial_index;

void BlobSpatialIndex::initialize() {
    cells.clear();
    cells.resize(TOTAL_CELLS);
    blobs.clear();
}

void BlobSpatialIndex::add_blob(const BlobGeometry& blob) {
    int blob_index = blobs.size();
    blobs.push_back(blob);
    
    // Calculate bounding box of blob geometry
    if (blob.points.empty()) return;
    
    float minX = blob.points[0].x;
    float minY = blob.points[0].y;
    float maxX = blob.points[0].x;
    float maxY = blob.points[0].y;
    
    for (const auto& point : blob.points) {
        minX = std::min(minX, point.x);
        minY = std::min(minY, point.y);
        maxX = std::max(maxX, point.x);
        maxY = std::max(maxY, point.y);
    }
    
    // Add a small buffer around the blob
    const float BUFFER = 0.1f;
    minX -= BUFFER;
    minY -= BUFFER;
    maxX += BUFFER;
    maxY += BUFFER;
    
    // Find all grid cells that this blob overlaps
    int minCellX = std::max(0, static_cast<int>(floor((minX - WORLD_MIN_X) / CELL_SIZE)));
    int minCellY = std::max(0, static_cast<int>(floor((minY - WORLD_MIN_Y) / CELL_SIZE)));
    int maxCellX = std::min(GRID_WIDTH - 1, static_cast<int>(floor((maxX - WORLD_MIN_X) / CELL_SIZE)));
    int maxCellY = std::min(GRID_HEIGHT - 1, static_cast<int>(floor((maxY - WORLD_MIN_Y) / CELL_SIZE)));
    
    // Add blob to all overlapping cells
    for (int y = minCellY; y <= maxCellY; ++y) {
        for (int x = minCellX; x <= maxCellX; ++x) {
            int cell_index = y * GRID_WIDTH + x;
            cells[cell_index].blob_indices.push_back(blob_index);
        }
    }
}

std::vector<int> BlobSpatialIndex::search(const BoundingBox& box) const {
    std::vector<int> result;
    
    // Find all grid cells that the search box overlaps
    int minCellX = std::max(0, static_cast<int>(floor((box.minX - WORLD_MIN_X) / CELL_SIZE)));
    int minCellY = std::max(0, static_cast<int>(floor((box.minY - WORLD_MIN_Y) / CELL_SIZE)));
    int maxCellX = std::min(GRID_WIDTH - 1, static_cast<int>(floor((box.maxX - WORLD_MIN_X) / CELL_SIZE)));
    int maxCellY = std::min(GRID_HEIGHT - 1, static_cast<int>(floor((box.maxY - WORLD_MIN_Y) / CELL_SIZE)));
    
    // Collect all blob indices from overlapping cells (with deduplication)
    std::vector<bool> seen(blobs.size(), false);
    
    for (int y = minCellY; y <= maxCellY; ++y) {
        for (int x = minCellX; x <= maxCellX; ++x) {
            int cell_index = y * GRID_WIDTH + x;
            if (cell_index < 0 || cell_index >= TOTAL_CELLS) continue;
            
            for (int blob_index : cells[cell_index].blob_indices) {
                if (!seen[blob_index]) {
                    seen[blob_index] = true;
                    result.push_back(blob_index);
                }
            }
        }
    }
    
    return result;
}

int BlobSpatialIndex::get_cell_index(float x, float y) const {
    int grid_x = static_cast<int>(floor((x - WORLD_MIN_X) / CELL_SIZE));
    int grid_y = static_cast<int>(floor((y - WORLD_MIN_Y) / CELL_SIZE));
    
    if (grid_x < 0 || grid_x >= GRID_WIDTH || grid_y < 0 || grid_y >= GRID_HEIGHT) {
        return -1;
    }
    
    return grid_y * GRID_WIDTH + grid_x;
}