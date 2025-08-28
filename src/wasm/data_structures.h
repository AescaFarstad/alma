#ifndef DATA_STRUCTURES_H
#define DATA_STRUCTURES_H

#include <cstdint>
#include <vector>
#include <cmath>

#include "constants_layout.h"
#include "spatial_index.h"
#include "point2.h"

// Enum for agent state, mirroring AgentState in Agent.ts
enum AgentState : uint8_t {
    Standing,
    Traveling,
    Escaping,
};

// Note: Navmesh data structures are now defined in navmesh.h

// Defines the Structure of Arrays (SoA) layout for all agents.
// All arrays are views into a single SharedArrayBuffer managed by JavaScript.
struct AgentSoA {
    // Core physics
    Point2* positions;
    Point2* last_coordinates;
    Point2* velocities;
    Point2* looks;
    AgentState* states;
    bool* is_alive;

    // Navigation
    int* current_tris;
    Point2* next_corners;
    int* next_corner_tris;
    Point2* next_corners2;
    int* next_corner_tris2;
    uint8_t* num_valid_corners;  // 0, 1, or 2
    Point2* pre_escape_corners;
    int* pre_escape_corner_tris;
    Point2* end_targets;
    int* end_target_tris;
    Point2* last_valid_positions;
    int* last_valid_tris;
    int* alien_polys;
    Point2* last_visible_points_for_next_corner;

    // Statistics
    Point2* last_end_targets;
    int* min_corridor_lengths;
    float* last_distances_to_next_corner;
    float* sight_ratings;
    int* last_next_corner_tris;
    float* stuck_ratings;
    float* path_frustrations;

    // Agent parameters (read-only from JS)
    float* max_speeds;
    float* accels;
    float* resistances;
    float* intelligences;
    float* look_speeds;
    float* max_frustrations;
    float* arrival_desired_speeds;
    float* arrival_threshold_sqs;
    float* predicament_ratings;
    
    // Per-agent dynamic data (managed in C++)
    std::vector<int>* corridors;
    int* corridor_indices;

    // Placed at the very end of the shared layout
    uint16_t* frame_ids;

    int capacity;
};

struct AgentGridData {
    std::vector<uint16_t> cell_data;
    std::vector<uint32_t> cell_offsets;
    std::vector<uint16_t> cell_counts;
};

struct BoundingBox {
    float minX, minY, maxX, maxY;
};

extern AgentSoA agent_data;

#endif // DATA_STRUCTURES_H 