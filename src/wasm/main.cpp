#include <iostream>
#include <cmath>
#include <emscripten/emscripten.h>
#include "data_structures.h"
#include "agent_init.h"
#include "math_utils.h"
#include "nav_tri_index.h"
#include "agent_move_phys.h"
#include "agent_navigation.h"
#include "agent_grid.h"
#include "agent_collision.h"
#include "agent_statistic.h"
#include "blob_spatial_index.h"
#include "constants_layout.h"
#include <vector>
#include "sprite_renderer.h"

// Global state for our agent simulation
AgentSoA agent_data;
NavmeshData navmesh_data;
NavmeshBBox navmesh_bbox;
int active_agents = 0;
uint64_t g_rng_seed = 12345;
// Global sim time for logging
float g_sim_time = 0.0f;
// Transient per-agent flags (not shared with JS)
std::vector<uint8_t> g_wall_contact; // 0 = no contact, 1 = in contact

// Global pointer to TS-provided constants buffer
uint8_t* g_constants_buffer = nullptr;

extern "C" {

// Simple persistent allocators for JS to request linear memory blocks
EMSCRIPTEN_KEEPALIVE uint8_t* wasm_alloc(int size) {
    if (size <= 0) return nullptr;
    return new (std::nothrow) uint8_t[size];
}

EMSCRIPTEN_KEEPALIVE void wasm_free(uint8_t* ptr) {
    delete[] ptr;
}

// Allow JS to set RNG seed deterministically
EMSCRIPTEN_KEEPALIVE void set_rng_seed(uint32_t seed) {
    math::set_rng_seed(static_cast<uint64_t>(seed));
}

// Register constants buffer provided by JS/TS
EMSCRIPTEN_KEEPALIVE void set_constants_buffer(uint8_t* buf) {
    g_constants_buffer = buf;
}

/**
 * @brief Initializes the WASM module with shared memory buffers.
 * 
 * @param sharedBuffer A pointer to the SharedArrayBuffer for agent SoA data.
 * @param navmeshBuffer A pointer to the ArrayBuffer with navmesh data.
 * @param maxAgents The maximum number of agents the sharedBuffer can hold.
 * @param seed Seed to initialize deterministic RNG.
 */
EMSCRIPTEN_KEEPALIVE void init(uint8_t* sharedBuffer, uint8_t* navmeshBuffer, int maxAgents, uint32_t seed) {
    agent_data.capacity = maxAgents;
    active_agents = 0;
    g_rng_seed = seed;
    math::set_rng_seed(static_cast<uint64_t>(seed));
    g_sim_time = 0.0f;

        // If constants buffer was not set by TS, log and continue (undefined behavior until fixed)
    if (!g_constants_buffer) {
        std::cerr << "[WASM] constants buffer is not set. Call set_constants_buffer() before init." << std::endl;
    }

    // 1. Initialize AgentSoA from the shared buffer
    initialize_shared_buffer_layout(sharedBuffer, maxAgents);
    
    // Allocate dynamic data arrays
    agent_data.corridors = new std::vector<int>[maxAgents];
    agent_data.corridor_indices = new int[maxAgents];
    // Initialize transient flags
    g_wall_contact.assign(maxAgents, 0);
 
    // 2. Initialize NavmeshData from the navmesh buffer
    // The layout of navmeshBuffer must be:
    // [bbox(4*float32), numPoints(int32), numTriangles(int32), points_data, triangles_data, neighbors_data, centroids_data]
    if (navmeshBuffer == nullptr) {
        return;
    }

    float* bbox_ptr = reinterpret_cast<float*>(navmeshBuffer);
    navmesh_bbox.minX = bbox_ptr[0];
    navmesh_bbox.minY = bbox_ptr[1];
    navmesh_bbox.maxX = bbox_ptr[2];
    navmesh_bbox.maxY = bbox_ptr[3];

    int32_t* header = reinterpret_cast<int32_t*>(navmeshBuffer + 4 * sizeof(float));
    navmesh_data.numPoints = header[0];
    navmesh_data.numTriangles = header[1];
    
    size_t nav_offset = 4 * sizeof(float) + 2 * sizeof(int32_t);

    navmesh_data.points = reinterpret_cast<Point2*>(navmeshBuffer + nav_offset);
    nav_offset += sizeof(Point2) * navmesh_data.numPoints;

    navmesh_data.triangles = reinterpret_cast<int32_t*>(navmeshBuffer + nav_offset);
    nav_offset += sizeof(int32_t) * navmesh_data.numTriangles * 3;

    navmesh_data.neighbors = reinterpret_cast<int32_t*>(navmeshBuffer + nav_offset);
    nav_offset += sizeof(int32_t) * navmesh_data.numTriangles * 3;

    navmesh_data.centroids = reinterpret_cast<Point2*>(navmeshBuffer + nav_offset);

    build_nav_tri_index();

    initialize_agent_grid(maxAgents);

    blob_spatial_index.initialize();
}

/**
 * @brief Simulation-only update for agents (no rendering).
 * @param dt Delta time for this frame.
 */
EMSCRIPTEN_KEEPALIVE void update_simulation(float dt) {
    g_sim_time += dt;
    // Basic log with throttling to avoid spamming
    static int frameCount = 0;
    
    // 1. Update agents
    for (int i = 0; i < active_agents; ++i) {
        if (agent_data.is_alive[i]) {
            update_agent_navigation(i, dt, &g_rng_seed);
            update_agent_phys(i, dt);
            update_agent_statistic(i, dt);
        }
    }

    // 2. Re-index the spatial grid
    clear_and_reindex_grid(active_agents);

    // 3. Update collisions
    update_agent_collisions(active_agents);
}

/**
 * @brief Main update loop for the agent simulation + rendering.
 * All real-time data for rendering is passed here to keep a single WASM call per frame.
 * @param dt Delta time for this frame.
 * @param m3x3 Row-major 3x3 world->NDC matrix
 * @param widthPx Viewport width in device pixels
 * @param heightPx Viewport height in device pixels
 * @param dpr Device pixel ratio
 */
EMSCRIPTEN_KEEPALIVE void update(float dt, const float* m3x3, int widthPx, int heightPx, float dpr) {
    // Do simulation
    update_simulation(dt);
    
    // Then render
    update_rt(dt, m3x3, widthPx, heightPx, dpr);
}

EMSCRIPTEN_KEEPALIVE void update_navigation(float dt) {
    for (int i = 0; i < active_agents; ++i) {
        if (agent_data.is_alive[i]) {
            update_agent_navigation(i, dt, &g_rng_seed);
        }
    }
}

EMSCRIPTEN_KEEPALIVE void update_movement(float dt) {
    for (int i = 0; i < active_agents; ++i) {
        if (agent_data.is_alive[i]) {
            update_agent_phys(i, dt);
        }
    }
}

EMSCRIPTEN_KEEPALIVE void update_statistics(float dt) {
    for (int i = 0; i < active_agents; ++i) {
        if (agent_data.is_alive[i]) {
            update_agent_statistic(i, dt);
        }
    }
}

EMSCRIPTEN_KEEPALIVE void update_collisions() {
    clear_and_reindex_grid(active_agents);
    update_agent_collisions(active_agents);
}

EMSCRIPTEN_KEEPALIVE void update_agent_navigation_by_id(int agent_id, float dt) {
    update_agent_navigation(agent_id, dt, &g_rng_seed);
}

EMSCRIPTEN_KEEPALIVE void update_agent_movement(int agent_id, float dt) {
    update_agent_phys(agent_id, dt);
}

EMSCRIPTEN_KEEPALIVE void update_agent_statistic_by_id(int agent_id, float dt) {
    update_agent_statistic(agent_id, dt);
}

/**
 * @brief Adds a new agent to the simulation.
 * 
 * @param x The initial x-coordinate.
 * @param y The initial y-coordinate.
 * @return The index of the new agent, or -1 if capacity is full.
 */
EMSCRIPTEN_KEEPALIVE int add_agent(float x, float y) {
    if (active_agents >= agent_data.capacity) {
        return -1; // No more space for new agents
    }

    int agentIndex = active_agents;
    initialize_agent_defaults(agentIndex, x, y);
    if (agentIndex >= 0 && agentIndex < (int)g_wall_contact.size()) g_wall_contact[agentIndex] = 0;
    
    active_agents++;
    return agentIndex;
}

/**
 * @brief Loads blob geometry data into the spatial index.
 * 
 * @param blobBuffer A pointer to the blob data buffer.
 * @param bufferSize The size of the buffer in bytes.
 * 
 * Buffer format:
 * [numBlobs(int32)] + [blob1_data] + [blob2_data] + ...
 * 
 * Each blob_data:
 * [blobId(int32)] + [numPoints(int32)] + [point1_x(float32)] + [point1_y(float32)] + ...
 */
EMSCRIPTEN_KEEPALIVE void load_blob_data(uint8_t* blobBuffer, int bufferSize) {
    if (!blobBuffer || bufferSize < sizeof(int32_t)) {
        return;
    }
    
    size_t offset = 0;
    int32_t numBlobs = *reinterpret_cast<int32_t*>(blobBuffer + offset);
    offset += sizeof(int32_t);
    
    for (int i = 0; i < numBlobs; ++i) {
        if (offset + 2 * sizeof(int32_t) > bufferSize) {
            return;
        }
        
        int32_t blobId = *reinterpret_cast<int32_t*>(blobBuffer + offset);
        offset += sizeof(int32_t);
        
        int32_t numPoints = *reinterpret_cast<int32_t*>(blobBuffer + offset);
        offset += sizeof(int32_t);
        
        if (offset + numPoints * 2 * sizeof(float) > bufferSize) {
            return;
        }
        
        BlobGeometry blob;
        blob.id = blobId;
        blob.points.reserve(numPoints);
        
        for (int j = 0; j < numPoints; ++j) {
            float x = *reinterpret_cast<float*>(blobBuffer + offset);
            offset += sizeof(float);
            float y = *reinterpret_cast<float*>(blobBuffer + offset);
            offset += sizeof(float);
            
            blob.points.push_back({x, y});
        }
        
        blob_spatial_index.add_blob(blob);
    }
}

/**
 * @brief Clears all blob data from the spatial index.
 */
EMSCRIPTEN_KEEPALIVE void clear_blob_data() {
    blob_spatial_index.initialize(); // Re-initialize clears all data
}

/**
 * @brief Gets the number of blobs currently loaded.
 * @return The number of loaded blobs.
 */
EMSCRIPTEN_KEEPALIVE int get_blob_count() {
    return static_cast<int>(blob_spatial_index.blobs.size());
}

/**
 * @brief Gets the number of active agents.
 * @return The number of active agents.
 */
EMSCRIPTEN_KEEPALIVE int get_active_agent_count() {
    return active_agents;
}

/**
 * @brief Sets the RNG seed for deterministic behavior.
 * @param seed The seed value to use.
 */
EMSCRIPTEN_KEEPALIVE void set_rng_seed_js(uint32_t seed) {
    g_rng_seed = seed;
    math::set_rng_seed(static_cast<uint64_t>(seed));
}

} 