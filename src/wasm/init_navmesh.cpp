#include "init_navmesh.h"
#include "navmesh.h"
#include "populate_triangle_index.h"
#include "populate_polygon_index.h"
#include "populate_building_index.h"
#include "populate_blob_index.h"
#include <iostream>
#include "wasm_log.h"
#include <cstring>
#include <cmath>
#include <emscripten.h>

#define PRINT_ALLOC(name, size) \
  printf("[WASM MEM] %s: %zu bytes\n", name, size);

// External reference to the global unified navmesh
extern Navmesh g_navmesh;

uint32_t init_navmesh_from_buffer(uint8_t* memoryStart, uint32_t binarySize, uint32_t totalMemorySize, float cellSize, bool enableLogging) {
  if (memoryStart == nullptr) {
    wasm_console_error("[WASM] Memory start is null. Cannot initialize navmesh.");
    return 0;
  }
  
  if (enableLogging) {
    printf("[WASM] Initializing navmesh from buffer. Binary size: %d, Total memory: %d bytes\n", binarySize, totalMemorySize);
  }
  
  // Parse the binary data first to understand its layout
  uint8_t* navmeshBuffer = memoryStart;
  size_t offset = 0;

  // Read BBOX (now includes both real and buffered bboxes - 8 floats total)
  g_navmesh.bbox[0] = reinterpret_cast<float*>(navmeshBuffer + offset)[0]; // Real minX
  g_navmesh.bbox[1] = reinterpret_cast<float*>(navmeshBuffer + offset)[1]; // Real minY
  g_navmesh.bbox[2] = reinterpret_cast<float*>(navmeshBuffer + offset)[2]; // Real maxX
  g_navmesh.bbox[3] = reinterpret_cast<float*>(navmeshBuffer + offset)[3]; // Real maxY
  g_navmesh.buffered_bbox[0] = reinterpret_cast<float*>(navmeshBuffer + offset)[4]; // Buffered minX
  g_navmesh.buffered_bbox[1] = reinterpret_cast<float*>(navmeshBuffer + offset)[5]; // Buffered minY
  g_navmesh.buffered_bbox[2] = reinterpret_cast<float*>(navmeshBuffer + offset)[6]; // Buffered maxX
  g_navmesh.buffered_bbox[3] = reinterpret_cast<float*>(navmeshBuffer + offset)[7]; // Buffered maxY
  offset += 8 * sizeof(float);

  // Read header with array lengths
  const int32_t* header = reinterpret_cast<int32_t*>(navmeshBuffer + offset);
  offset += 13 * sizeof(int32_t);
  
  const int vertices_len = header[0];
  const int triangles_len = header[1];
  const int neighbors_len = header[2];
  const int polygons_len = header[3];
  const int poly_centroids_len = header[4];
  const int poly_verts_len = header[5];
  const int poly_tris_len = header[6];
  const int poly_neighbors_len = header[7];
  const int buildings_len = header[8];
  const int building_verts_len = header[9];
  const int blob_buildings_len = header[10];
  g_navmesh.walkable_triangle_count = header[11];
  g_navmesh.walkable_polygon_count = header[12];

  // Store array counts in navmesh structure
  g_navmesh.vertices_count = vertices_len;
  g_navmesh.triangles_count = triangles_len;
  g_navmesh.neighbors_count = neighbors_len;
  g_navmesh.polygons_count = polygons_len;
  g_navmesh.poly_centroids_count = poly_centroids_len;
  g_navmesh.poly_verts_count = poly_verts_len;
  g_navmesh.poly_tris_count = poly_tris_len;
  g_navmesh.poly_neighbors_count = poly_neighbors_len;
  g_navmesh.buildings_count = buildings_len;
  g_navmesh.building_verts_count = building_verts_len;
  g_navmesh.blob_buildings_count = blob_buildings_len;

  // Set up array pointers to navmesh buffer data
  
  // 1. Core navmesh arrays
  g_navmesh.vertices = reinterpret_cast<Point2*>(navmeshBuffer + offset);
  offset += vertices_len * sizeof(float);

  g_navmesh.triangles = reinterpret_cast<int32_t*>(navmeshBuffer + offset);
  offset += triangles_len * sizeof(int32_t);

  g_navmesh.neighbors = reinterpret_cast<int32_t*>(navmeshBuffer + offset);
  offset += neighbors_len * sizeof(int32_t);

  // 2. Polygon arrays
  g_navmesh.polygons = polygons_len > 0 ? reinterpret_cast<int32_t*>(navmeshBuffer + offset) : nullptr;
  offset += polygons_len * sizeof(int32_t);

  g_navmesh.poly_centroids = poly_centroids_len > 0 ? reinterpret_cast<Point2*>(navmeshBuffer + offset) : nullptr;
  offset += poly_centroids_len * sizeof(float);

  g_navmesh.poly_verts = poly_verts_len > 0 ? reinterpret_cast<int32_t*>(navmeshBuffer + offset) : nullptr;
  offset += poly_verts_len * sizeof(int32_t);

  g_navmesh.poly_tris = poly_tris_len > 0 ? reinterpret_cast<int32_t*>(navmeshBuffer + offset) : nullptr;
  offset += poly_tris_len * sizeof(int32_t);

  g_navmesh.poly_neighbors = poly_neighbors_len > 0 ? reinterpret_cast<int32_t*>(navmeshBuffer + offset) : nullptr;
  offset += poly_neighbors_len * sizeof(int32_t);

  // 3. Building arrays
  g_navmesh.buildings = buildings_len > 0 ? reinterpret_cast<int32_t*>(navmeshBuffer + offset) : nullptr;
  offset += buildings_len * sizeof(int32_t);

  g_navmesh.building_verts = building_verts_len > 0 ? reinterpret_cast<int32_t*>(navmeshBuffer + offset) : nullptr;
  offset += building_verts_len * sizeof(int32_t);

  g_navmesh.blob_buildings = blob_buildings_len > 0 ? reinterpret_cast<int32_t*>(navmeshBuffer + offset) : nullptr;
  offset += blob_buildings_len * sizeof(int32_t);

  // Compute raw/binary section sizes for logging
  const size_t bboxBytes = 8 * sizeof(float); // Now includes both real and buffered bboxes
  const size_t headerBytes = 14 * sizeof(int32_t);
  const size_t rawArraysBytes = (vertices_len * sizeof(float))
    + (triangles_len * sizeof(int32_t))
    + (neighbors_len * sizeof(int32_t))
    + (polygons_len * sizeof(int32_t))
    + (poly_centroids_len * sizeof(float))
    + (poly_verts_len * sizeof(int32_t))
    + (poly_tris_len * sizeof(int32_t))
    + (poly_neighbors_len * sizeof(int32_t))
    + (buildings_len * sizeof(int32_t))
    + (building_verts_len * sizeof(int32_t))
    + (blob_buildings_len * sizeof(int32_t));
  const size_t rawNavmeshBytes = bboxBytes + headerBytes + rawArraysBytes; // should equal current offset

  // Now we know exactly where the binary data ends (aligned start for auxiliary)
  size_t binaryDataEnd = alignTo(offset, SIMD_ALIGNMENT);
  
  // Calculate auxiliary memory area
  uint8_t* auxiliaryMemory = memoryStart + binaryDataEnd;
  size_t auxiliaryMemorySize = totalMemorySize - binaryDataEnd;

  if (enableLogging) {
    printf("[WASM MEM] Raw navmesh (bbox+header+arrays): %ld bytes\n", rawNavmeshBytes);
    printf("[WASM] Binary data consumed: %zu bytes (aligned: %zu), Auxiliary memory: %zu bytes\n", offset, binaryDataEnd, auxiliaryMemorySize);
  }

  // 4. Now allocate and compute auxiliary structures in the remaining memory
  size_t auxOffset = 0;
  const int32_t totalTriangles = triangles_len / 3;

  // Track allocated sizes for summary
  size_t aux_triangle_centroids_bytes = 0;
  size_t aux_triangle_to_polygon_bytes = 0;
  size_t aux_building_to_blob_bytes = 0;
  size_t tri_index_offsets_bytes = 0, tri_index_items_bytes = 0;
  size_t poly_index_offsets_bytes = 0, poly_index_items_bytes = 0;
  size_t bld_index_offsets_bytes = 0, bld_index_items_bytes = 0;
  size_t blob_index_offsets_bytes = 0, blob_index_items_bytes = 0;
  
  // Allocate triangle centroids
  g_navmesh.triangle_centroids_count = totalTriangles;
  if (totalTriangles > 0) {
    size_t centroidsSize = alignTo(totalTriangles * sizeof(Point2), SIMD_ALIGNMENT);
    if (auxOffset + centroidsSize <= auxiliaryMemorySize) {
      g_navmesh.triangle_centroids = reinterpret_cast<Point2*>(auxiliaryMemory + auxOffset);
      auxOffset += centroidsSize;
      aux_triangle_centroids_bytes = centroidsSize;
      
      // Compute triangle centroids
      for (int32_t i = 0; i < totalTriangles; ++i) {
        const int32_t v1_idx = g_navmesh.triangles[i * 3];
        const int32_t v2_idx = g_navmesh.triangles[i * 3 + 1];
        const int32_t v3_idx = g_navmesh.triangles[i * 3 + 2];
        
        const float v1_x = g_navmesh.vertices[v1_idx].x;
        const float v1_y = g_navmesh.vertices[v1_idx].y;
        const float v2_x = g_navmesh.vertices[v2_idx].x;
        const float v2_y = g_navmesh.vertices[v2_idx].y;
        const float v3_x = g_navmesh.vertices[v3_idx].x;
        const float v3_y = g_navmesh.vertices[v3_idx].y;
        
        g_navmesh.triangle_centroids[i].x = (v1_x + v2_x + v3_x) / 3.0f;
        g_navmesh.triangle_centroids[i].y = (v1_y + v2_y + v3_y) / 3.0f;
      }
      if (enableLogging) { PRINT_ALLOC("triangle_centroids", aux_triangle_centroids_bytes); }
    } else {
      wasm_console_error("[WASM] Not enough auxiliary memory for triangle centroids");
      g_navmesh.triangle_centroids = nullptr;
    }
  } else {
    g_navmesh.triangle_centroids = nullptr;
  }
  
  // Allocate triangle_to_polygon mapping
  g_navmesh.triangle_to_polygon_count = totalTriangles;
  if (totalTriangles > 0) {
    size_t mappingSize = alignTo(totalTriangles * sizeof(int32_t), SIMD_ALIGNMENT);
    if (auxOffset + mappingSize <= auxiliaryMemorySize) {
      g_navmesh.triangle_to_polygon = reinterpret_cast<int32_t*>(auxiliaryMemory + auxOffset);
      auxOffset += mappingSize;
      aux_triangle_to_polygon_bytes = mappingSize;
      
      // Compute triangle to polygon mapping
      const int32_t totalPolygons = polygons_len > 0 ? polygons_len - 1 : 0;
      
      // Initialize all triangles to -1 (no polygon)
      for (int32_t i = 0; i < totalTriangles; ++i) {
        g_navmesh.triangle_to_polygon[i] = -1;
      }
      
      // Map triangles to polygons using poly_tris ranges
      if (g_navmesh.poly_tris && totalPolygons > 0) {
        for (int32_t polyId = 0; polyId < totalPolygons; ++polyId) {
          const int32_t triStart = g_navmesh.poly_tris[polyId];
          const int32_t triEnd = g_navmesh.poly_tris[polyId + 1];
          
          for (int32_t triIdx = triStart; triIdx < triEnd; ++triIdx) {
            if (triIdx < totalTriangles) {
              g_navmesh.triangle_to_polygon[triIdx] = polyId;
            }
          }
        }
      }
      if (enableLogging) { PRINT_ALLOC("triangle_to_polygon", aux_triangle_to_polygon_bytes); }
    } else {
      wasm_console_error("[WASM] Not enough auxiliary memory for triangle_to_polygon mapping");
      g_navmesh.triangle_to_polygon = nullptr;
    }
  } else {
    g_navmesh.triangle_to_polygon = nullptr;
  }
  
  // Allocate building_to_blob mapping
  const int32_t totalBuildings = buildings_len > 0 ? buildings_len - 1 : 0;
  g_navmesh.building_to_blob_count = totalBuildings;
  if (totalBuildings > 0) {
    size_t mappingSize = alignTo(totalBuildings * sizeof(int32_t), SIMD_ALIGNMENT);
    if (auxOffset + mappingSize <= auxiliaryMemorySize) {
      g_navmesh.building_to_blob = reinterpret_cast<int32_t*>(auxiliaryMemory + auxOffset);
      auxOffset += mappingSize;
      aux_building_to_blob_bytes = mappingSize;
      
      // Compute building to blob mapping
      const int32_t totalBlobs = blob_buildings_len > 0 ? blob_buildings_len - 1 : 0;
      
      // Initialize all buildings to -1 (no blob)
      for (int32_t i = 0; i < totalBuildings; ++i) {
        g_navmesh.building_to_blob[i] = -1;
      }
      
      // Map buildings to blobs using blob_buildings ranges
      if (g_navmesh.blob_buildings && totalBlobs > 0) {
        for (int32_t blobId = 0; blobId < totalBlobs; ++blobId) {
          const int32_t buildingStart = g_navmesh.blob_buildings[blobId];
          const int32_t buildingEnd = g_navmesh.blob_buildings[blobId + 1];
          
          for (int32_t buildingIdx = buildingStart; buildingIdx < buildingEnd; ++buildingIdx) {
            if (buildingIdx < totalBuildings) {
              g_navmesh.building_to_blob[buildingIdx] = blobId;
            }
          }
        }
      }
      if (enableLogging) { PRINT_ALLOC("building_to_blob", aux_building_to_blob_bytes); }
    } else {
      wasm_console_error("[WASM] Not enough auxiliary memory for building_to_blob mapping");
      g_navmesh.building_to_blob = nullptr;
    }
  } else {
    g_navmesh.building_to_blob = nullptr;
  }

  // 5. Initialize spatial indices (basic empty implementation for now)
  // Set basic grid parameters based on BUFFERED bbox + additional 50 units for spatial indexing
  const float spatialIndexInflation = 50.0f;
  const float spatialMinX = g_navmesh.buffered_bbox[0] - spatialIndexInflation;
  const float spatialMinY = g_navmesh.buffered_bbox[1] - spatialIndexInflation;
  const float spatialMaxX = g_navmesh.buffered_bbox[2] + spatialIndexInflation;
  const float spatialMaxY = g_navmesh.buffered_bbox[3] + spatialIndexInflation;
  
  const float width = spatialMaxX - spatialMinX;
  const float height = spatialMaxY - spatialMinY;
  // cellSize parameter passed from TypeScript
  
  const int gridWidth = static_cast<int>(std::ceil(width / cellSize));
  const int gridHeight = static_cast<int>(std::ceil(height / cellSize));
  const int totalCells = gridWidth * gridHeight;
  
  g_navmesh.triangle_index.gridWidth = gridWidth;
  g_navmesh.triangle_index.gridHeight = gridHeight;
  g_navmesh.triangle_index.cellSize = cellSize;
  g_navmesh.triangle_index.minX = spatialMinX;
  g_navmesh.triangle_index.minY = spatialMinY;
  g_navmesh.triangle_index.maxX = spatialMaxX;
  g_navmesh.triangle_index.maxY = spatialMaxY;
  
  // Allocate spatial index arrays from auxiliary memory
  size_t cellOffsetsSize = alignTo((totalCells + 1) * sizeof(uint32_t), SIMD_ALIGNMENT);
  
  // Triangle spatial index
  if (auxOffset + cellOffsetsSize <= auxiliaryMemorySize) {
    g_navmesh.triangle_index.cellOffsetsCount = totalCells + 1;
    g_navmesh.triangle_index.cellOffsets = reinterpret_cast<uint32_t*>(auxiliaryMemory + auxOffset);
    auxOffset += cellOffsetsSize;
    tri_index_offsets_bytes = cellOffsetsSize;
    
    // Initialize to empty (all zeros)
    std::memset(g_navmesh.triangle_index.cellOffsets, 0, (totalCells + 1) * sizeof(uint32_t));
    g_navmesh.triangle_index.cellItemsCount = 0;
    g_navmesh.triangle_index.cellItems = nullptr;
    
    if (enableLogging) {
      printf("[WASM INIT] Triangle index allocated: cells=%d, offsetsBytes=%zu\n", totalCells, tri_index_offsets_bytes);
    }

    populate_triangle_index(g_navmesh, auxOffset, auxiliaryMemory, auxiliaryMemorySize);
    tri_index_items_bytes = alignTo(static_cast<size_t>(g_navmesh.triangle_index.cellItemsCount) * sizeof(int32_t), SIMD_ALIGNMENT);
    if (enableLogging) { PRINT_ALLOC("triangle_index items", tri_index_items_bytes); }

  } else {
    if (enableLogging) {
      printf("[WASM INIT] ERROR: Not enough auxiliary memory for triangle spatial index\n");
    }
  }
  
  // Copy grid parameters to other indices and allocate their cellOffsets
  g_navmesh.polygon_index = g_navmesh.triangle_index;
  g_navmesh.building_index = g_navmesh.triangle_index;
  g_navmesh.blob_index = g_navmesh.triangle_index;
  
  // Polygon spatial index
  if (auxOffset + cellOffsetsSize <= auxiliaryMemorySize) {
    g_navmesh.polygon_index.cellOffsets = reinterpret_cast<uint32_t*>(auxiliaryMemory + auxOffset);
    auxOffset += cellOffsetsSize;
    poly_index_offsets_bytes = cellOffsetsSize;
    std::memset(g_navmesh.polygon_index.cellOffsets, 0, (totalCells + 1) * sizeof(uint32_t));
    g_navmesh.polygon_index.cellItemsCount = 0;
    g_navmesh.polygon_index.cellItems = nullptr;
    populate_polygon_index(g_navmesh, auxOffset, auxiliaryMemory, auxiliaryMemorySize);
    poly_index_items_bytes = alignTo(static_cast<size_t>(g_navmesh.polygon_index.cellItemsCount) * sizeof(int32_t), SIMD_ALIGNMENT);
    if (enableLogging) { PRINT_ALLOC("polygon_index", poly_index_offsets_bytes); }
  }
  
  // Building spatial index
  if (auxOffset + cellOffsetsSize <= auxiliaryMemorySize) {
    g_navmesh.building_index.cellOffsets = reinterpret_cast<uint32_t*>(auxiliaryMemory + auxOffset);
    auxOffset += cellOffsetsSize;
    bld_index_offsets_bytes = cellOffsetsSize;
    std::memset(g_navmesh.building_index.cellOffsets, 0, (totalCells + 1) * sizeof(uint32_t));
    g_navmesh.building_index.cellItemsCount = 0;
    g_navmesh.building_index.cellItems = nullptr;
    populate_building_index(g_navmesh, auxOffset, auxiliaryMemory, auxiliaryMemorySize);
    bld_index_items_bytes = alignTo(static_cast<size_t>(g_navmesh.building_index.cellItemsCount) * sizeof(int32_t), SIMD_ALIGNMENT);
    if (enableLogging) { PRINT_ALLOC("building_index", bld_index_offsets_bytes); }
  }
  
  // Blob spatial index
  if (auxOffset + cellOffsetsSize <= auxiliaryMemorySize) {
    g_navmesh.blob_index.cellOffsets = reinterpret_cast<uint32_t*>(auxiliaryMemory + auxOffset);
    auxOffset += cellOffsetsSize;
    blob_index_offsets_bytes = cellOffsetsSize;
    std::memset(g_navmesh.blob_index.cellOffsets, 0, (totalCells + 1) * sizeof(uint32_t));
    g_navmesh.blob_index.cellItemsCount = 0;
    g_navmesh.blob_index.cellItems = nullptr;
    populate_blob_index(g_navmesh, auxOffset, auxiliaryMemory, auxiliaryMemorySize);
    blob_index_items_bytes = alignTo(static_cast<size_t>(g_navmesh.blob_index.cellItemsCount) * sizeof(int32_t), SIMD_ALIGNMENT);
    if (enableLogging) { PRINT_ALLOC("blob_index", blob_index_offsets_bytes); }
  }

  uint32_t totalUsed = static_cast<uint32_t>(binaryDataEnd + auxOffset);

  if (enableLogging) {
    printf("[WASM] Navmesh initialization complete. Triangles: %d, Polygons: %d, Used auxiliary memory: %zu/%zu, Total used: %u/%u bytes\n",
         g_navmesh.walkable_triangle_count, g_navmesh.walkable_polygon_count, auxOffset, auxiliaryMemorySize, totalUsed, totalMemorySize);

    // Condensed summary
    printf("[WASM MEM SUMMARY] raw=%zu, aux_total=%zu; centroids=%zu, tri2poly=%zu, bld2blob=%zu; triIdx(off=%zu,items=%zu), polyIdx(off=%zu,items=%zu), bldIdx(off=%zu,items=%zu), blobIdx(off=%zu,items=%zu)\n",
         rawNavmeshBytes, auxOffset,
         aux_triangle_centroids_bytes, aux_triangle_to_polygon_bytes, aux_building_to_blob_bytes,
         tri_index_offsets_bytes, tri_index_items_bytes,
         poly_index_offsets_bytes, poly_index_items_bytes,
         bld_index_offsets_bytes, bld_index_items_bytes,
         blob_index_offsets_bytes, blob_index_items_bytes);
  }

  return totalUsed;
} 
