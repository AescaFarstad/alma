#include <iostream>
#include <cmath>
#include <emscripten/emscripten.h>
#include "data_structures.h"
#include "agent_init.h"
#include "math_utils.h"
#include "agent_move_phys.h"
#include "agent_navigation.h"
#include "agent_grid.h"
#include "agent_collision.h"
#include "agent_statistic.h"
#include "constants_layout.h"
#include "init_navmesh.h"
#include "navmesh.h"
#include "nav_utils.h"
#include <vector>
#include "sprite_renderer.h"
#include "model.h"
#include "wasm_impulse.h"
#include "benchmarks.h"

// Global state for our agent simulation
AgentSoA agent_data;
Model g_model;
// Transient per-agent flags (not shared with JS)
std::vector<uint8_t> g_wall_contact; // 0 = no contact, 1 = in contact

// Global pointer to TS-provided constants buffer
uint8_t* g_constants_buffer = nullptr;

extern "C" {

// Simple persistent allocators for JS to request linear memory blocks
EMSCRIPTEN_KEEPALIVE uint8_t* wasm_alloc(int size) {
    return (uint8_t*)malloc(size);
}

EMSCRIPTEN_KEEPALIVE void wasm_free(uint8_t* ptr) {
    free(ptr);
}

// Allow JS to set RNG seed deterministically
EMSCRIPTEN_KEEPALIVE void set_rng_seed(uint32_t seed) {
    math::set_rng_seed(static_cast<uint64_t>(seed));
}

// Register constants buffer provided by JS/TS
EMSCRIPTEN_KEEPALIVE void set_constants_buffer(uint8_t* buf) {
    g_constants_buffer = buf;

    printf("--- C++ NavConst Values ---\n");
    printf("STUCK_PASSIVE_X1: %f\n", STUCK_PASSIVE_X1);
    printf("STUCK_DST_X2: %f\n", STUCK_DST_X2);
    printf("STUCK_CORRIDOR_X3: %f\n", STUCK_CORRIDOR_X3);
    printf("STUCK_DECAY: %f\n", STUCK_DECAY);
    printf("STUCK_DANGER_1: %f\n", STUCK_DANGER_1);
    printf("STUCK_DANGER_2: %f\n", STUCK_DANGER_2);
    printf("STUCK_DANGER_3: %f\n", STUCK_DANGER_3);
    printf("STUCK_HIT_WALL: %f\n", STUCK_HIT_WALL);
    printf("PATH_LOG_RATE: %d\n", PATH_LOG_RATE);
    printf("LOOK_ROT_SPEED_RAD_S: %f\n", LOOK_ROT_SPEED_RAD_S);
    printf("CORRIDOR_EXPECTED_JUMP: %f\n", CORRIDOR_EXPECTED_JUMP);
    printf("ARRIVAL_THRESHOLD_SQ_DEFAULT: %f\n", ARRIVAL_THRESHOLD_SQ_DEFAULT);
    printf("ARRIVAL_DESIRED_SPEED_DEFAULT: %f\n", ARRIVAL_DESIRED_SPEED_DEFAULT);
    printf("MAX_SPEED_DEFAULT: %f\n", MAX_SPEED_DEFAULT);
    printf("ACCEL_DEFAULT: %f\n", ACCEL_DEFAULT);
    printf("RESISTANCE_DEFAULT: %f\n", RESISTANCE_DEFAULT);
    printf("MAX_FRUSTRATION_DEFAULT: %f\n", MAX_FRUSTRATION_DEFAULT);
    printf("CORNER_OFFSET: %f\n", CORNER_OFFSET);
    printf("CORNER_OFFSET_SQ: %f\n", CORNER_OFFSET_SQ);
    printf("---------------------------\n");
}

/**
 * @brief Initialize the agent system with shared buffer.
 * @param sharedBuffer A pointer to the SharedArrayBuffer for agent SoA data.
 * @param maxAgents The maximum number of agents the sharedBuffer can hold.
 * @param seed Seed to initialize deterministic RNG.
 */
EMSCRIPTEN_KEEPALIVE void init_agents(uint8_t* sharedBuffer, int maxAgents, uint32_t seed) {
    agent_data.capacity = maxAgents;
    g_model.rng_seed = seed;
    math::set_rng_seed(static_cast<uint64_t>(seed));
    g_model.sim_time = 0.0f;

    // If constants buffer was not set by TS, log and continue (undefined behavior until fixed)
    if (!g_constants_buffer) {
        std::cerr << "[WASM] constants buffer is not set. Call set_constants_buffer() before init_agents." << std::endl;
    }

    // Initialize AgentSoA from the shared buffer
    initialize_shared_buffer_layout(sharedBuffer, maxAgents);
    
    // Allocate dynamic data arrays
    agent_data.corridors = new std::vector<int>[maxAgents];
    agent_data.corridor_indices = new int[maxAgents];
    // Initialize transient flags
    g_wall_contact.assign(maxAgents, 0);

    initialize_agent_grid(maxAgents);
}

/**
 * @brief Complete the initialization after all data is prepared.
 * Must be called after init_agents and init_navmesh_from_bin.
 */
EMSCRIPTEN_KEEPALIVE void finalize_init() {
    // Initialize the navmesh structure
    initialize_navmesh_structure();
    
    std::cout << "[WASM] Finalization complete." << std::endl;
}





/**
 * @brief Simulation-only update for agents (no rendering).
 * @param dt Delta time for this frame.
 */
EMSCRIPTEN_KEEPALIVE void update_simulation(float dt, int active_agents) {
    g_model.update_simulation(dt, active_agents);
}

/**
 * @brief Sets the RNG seed for deterministic behavior.
 * @param seed The seed value to use.
 */
EMSCRIPTEN_KEEPALIVE void set_rng_seed_js(uint32_t seed) {
    g_model.rng_seed = seed;
    math::set_rng_seed(static_cast<uint64_t>(seed));
}

/**
 * @brief Initialize navmesh from binary data at specified WASM memory offset.
 * @param offset The offset in WASM memory where navmesh binary data is located.
 * @param binarySize The size of the navmesh binary data in bytes.
 * @param totalMemorySize Total available memory for navmesh and spatial indices.
 * @param cellSize The spatial index cell size (propagated from TypeScript).
 * @return Size of data consumed, or 0 on failure.
 */
EMSCRIPTEN_KEEPALIVE int init_navmesh_from_bin(uint32_t offset, uint32_t binarySize, uint32_t totalMemorySize, float cellSize) {
    uint8_t* memoryStart = reinterpret_cast<uint8_t*>(offset);
    
    if (memoryStart == nullptr) {
        std::cerr << "[WASM] Invalid memory offset: " << offset << std::endl;
        return 0;
    }
    
    // Initialize navmesh from the buffer - C++ will figure out auxiliary memory layout
    uint32_t usedMemory = init_navmesh_from_buffer(memoryStart, binarySize, totalMemorySize, cellSize);
    
    // Return the total memory used
    return static_cast<int>(usedMemory);
}



/**
 * @brief Get pointer to navmesh data structure for TypeScript access.
 * This creates a temporary structure in memory that TypeScript can read to get
 * pointers and metadata for creating typed array views.
 * @return Pointer to NavmeshData structure, or 0 on failure.
 */
EMSCRIPTEN_KEEPALIVE uint32_t get_g_navmesh_ptr() {
    // Allocate memory for the data structure TypeScript expects to read
    // Layout matches the reading pattern in NavmeshInit.ts:
    // 11 pointers + 6 counts + 2 auxiliary pointers + 1 triangle_centroids pointer = 20 uint32_t values
    static uint32_t* navmeshData = nullptr;
    if (!navmeshData) {
        navmeshData = static_cast<uint32_t*>(malloc(20 * sizeof(uint32_t)));
    }
    
    // Fill in the pointers as WASM heap offsets (pointers converted to uint32_t)
    navmeshData[0] = reinterpret_cast<uintptr_t>(g_navmesh.vertices);
    navmeshData[1] = reinterpret_cast<uintptr_t>(g_navmesh.triangles);
    navmeshData[2] = reinterpret_cast<uintptr_t>(g_navmesh.neighbors);
    navmeshData[3] = reinterpret_cast<uintptr_t>(g_navmesh.polygons);
    navmeshData[4] = reinterpret_cast<uintptr_t>(g_navmesh.poly_centroids);
    navmeshData[5] = reinterpret_cast<uintptr_t>(g_navmesh.poly_verts);
    navmeshData[6] = reinterpret_cast<uintptr_t>(g_navmesh.poly_tris);
    navmeshData[7] = reinterpret_cast<uintptr_t>(g_navmesh.poly_neighbors);
    navmeshData[8] = reinterpret_cast<uintptr_t>(g_navmesh.buildings);
    navmeshData[9] = reinterpret_cast<uintptr_t>(g_navmesh.building_verts);
    navmeshData[10] = reinterpret_cast<uintptr_t>(g_navmesh.blob_buildings);
    
    // Fill in the counts (using signed int32_t values)
    navmeshData[11] = static_cast<uint32_t>(g_navmesh.walkable_triangle_count);
    navmeshData[12] = static_cast<uint32_t>(g_navmesh.walkable_polygon_count);
    navmeshData[13] = static_cast<uint32_t>(g_navmesh.vertices_count / 2); // totalVertices (Point2 count)
    navmeshData[14] = static_cast<uint32_t>(g_navmesh.triangles_count / 3); // totalTriangles 
    navmeshData[15] = static_cast<uint32_t>(g_navmesh.polygons_count > 0 ? g_navmesh.polygons_count - 1 : 0); // totalPolygons (minus sentinel)
    navmeshData[16] = static_cast<uint32_t>(g_navmesh.buildings_count > 0 ? g_navmesh.buildings_count - 1 : 0); // totalBuildings (minus sentinel)
    
    // Fill in auxiliary pointers
    navmeshData[17] = reinterpret_cast<uintptr_t>(g_navmesh.triangle_to_polygon);
    navmeshData[18] = reinterpret_cast<uintptr_t>(g_navmesh.building_to_blob);
    
    // Fill in triangle_centroids pointer
    navmeshData[19] = reinterpret_cast<uintptr_t>(g_navmesh.triangle_centroids);
    
    uint32_t result = reinterpret_cast<uintptr_t>(navmeshData);
    std::cout << "[WASM] get_g_navmesh_ptr returning: " << result << " (offset in uint32: " << (result/4) << ")" << std::endl;
    
    return result;
}

/**
 * @brief Get pointer to navmesh bounding box data.
 * @return Pointer to bbox arrays (8 floats: real minX, minY, maxX, maxY, buffered minX, minY, maxX, maxY), or 0 on failure.
 */
EMSCRIPTEN_KEEPALIVE uint32_t get_navmesh_bbox_ptr() {
    // Allocate memory for both bboxes (8 floats total)
    static float* bboxData = nullptr;
    if (!bboxData) {
        bboxData = static_cast<float*>(malloc(8 * sizeof(float)));
    }
    
    // Copy both bboxes to the allocated memory
    bboxData[0] = g_navmesh.bbox[0];        // Real minX
    bboxData[1] = g_navmesh.bbox[1];        // Real minY
    bboxData[2] = g_navmesh.bbox[2];        // Real maxX
    bboxData[3] = g_navmesh.bbox[3];        // Real maxY
    bboxData[4] = g_navmesh.buffered_bbox[0]; // Buffered minX
    bboxData[5] = g_navmesh.buffered_bbox[1]; // Buffered minY
    bboxData[6] = g_navmesh.buffered_bbox[2]; // Buffered maxX
    bboxData[7] = g_navmesh.buffered_bbox[3]; // Buffered maxY
    
    return reinterpret_cast<uintptr_t>(bboxData);
}

/**
 * @brief Get pointer to spatial index data structure for TypeScript access.
 * This creates a temporary structure in memory that TypeScript can read to get
 * pointers and metadata for all spatial indices.
 * @return Pointer to SpatialIndexData structure, or 0 on failure.
 */
EMSCRIPTEN_KEEPALIVE uint32_t get_spatial_index_data() {
    // Allocate memory for the data structure TypeScript expects to read
    // Layout matches the reading pattern in NavmeshInit.ts initializeSpatialIndices:
    // Triangle index: 2 ptrs + 5 grid params + 2 counts = 9 values
    // Skip auxiliary: 4 values  
    // Polygon index: 2 ptrs + 2 counts = 4 values
    // Blob index: 2 ptrs + 2 counts = 4 values  
    // Building index: 2 ptrs + 2 counts = 4 values
    // Total: 23 uint32_t values
    static uint32_t* spatialIndexData = nullptr;
    if (!spatialIndexData) {
        spatialIndexData = static_cast<uint32_t*>(malloc(23 * sizeof(uint32_t)));
    }
    
    int offset = 0;
    
    // Triangle spatial index
    spatialIndexData[offset++] = reinterpret_cast<uintptr_t>(g_navmesh.triangle_index.cellOffsets);
    spatialIndexData[offset++] = reinterpret_cast<uintptr_t>(g_navmesh.triangle_index.cellItems);
    spatialIndexData[offset++] = static_cast<uint32_t>(g_navmesh.triangle_index.gridWidth);
    spatialIndexData[offset++] = static_cast<uint32_t>(g_navmesh.triangle_index.gridHeight);
    // cellSize as float - need to reinterpret as uint32_t for storage
    spatialIndexData[offset++] = *reinterpret_cast<uint32_t*>(&g_navmesh.triangle_index.cellSize);
    spatialIndexData[offset++] = *reinterpret_cast<uint32_t*>(&g_navmesh.triangle_index.minX);
    spatialIndexData[offset++] = *reinterpret_cast<uint32_t*>(&g_navmesh.triangle_index.minY);
    spatialIndexData[offset++] = *reinterpret_cast<uint32_t*>(&g_navmesh.triangle_index.maxX);
    spatialIndexData[offset++] = *reinterpret_cast<uint32_t*>(&g_navmesh.triangle_index.maxY);
    spatialIndexData[offset++] = g_navmesh.triangle_index.cellOffsetsCount;
    spatialIndexData[offset++] = g_navmesh.triangle_index.cellItemsCount;
    
    // Skip auxiliary lookup maps (TypeScript expects to skip 4 values)
    spatialIndexData[offset++] = reinterpret_cast<uintptr_t>(g_navmesh.triangle_to_polygon);
    spatialIndexData[offset++] = reinterpret_cast<uintptr_t>(g_navmesh.building_to_blob);
    spatialIndexData[offset++] = static_cast<uint32_t>(g_navmesh.triangles_count / 3); // total_triangles
    spatialIndexData[offset++] = static_cast<uint32_t>(g_navmesh.buildings_count > 0 ? g_navmesh.buildings_count - 1 : 0); // total_buildings
    
    // Polygon spatial index
    spatialIndexData[offset++] = reinterpret_cast<uintptr_t>(g_navmesh.polygon_index.cellOffsets);
    spatialIndexData[offset++] = reinterpret_cast<uintptr_t>(g_navmesh.polygon_index.cellItems);
    spatialIndexData[offset++] = g_navmesh.polygon_index.cellOffsetsCount;
    spatialIndexData[offset++] = g_navmesh.polygon_index.cellItemsCount;
    
    // Blob spatial index
    spatialIndexData[offset++] = reinterpret_cast<uintptr_t>(g_navmesh.blob_index.cellOffsets);
    spatialIndexData[offset++] = reinterpret_cast<uintptr_t>(g_navmesh.blob_index.cellItems);
    spatialIndexData[offset++] = g_navmesh.blob_index.cellOffsetsCount;
    spatialIndexData[offset++] = g_navmesh.blob_index.cellItemsCount;
    
    // Building spatial index
    spatialIndexData[offset++] = reinterpret_cast<uintptr_t>(g_navmesh.building_index.cellOffsets);
    spatialIndexData[offset++] = reinterpret_cast<uintptr_t>(g_navmesh.building_index.cellItems);
    spatialIndexData[offset++] = g_navmesh.building_index.cellOffsetsCount;
    spatialIndexData[offset++] = g_navmesh.building_index.cellItemsCount;
    
    return reinterpret_cast<uintptr_t>(spatialIndexData);
}

} 