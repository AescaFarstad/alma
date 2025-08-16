#include "agent_init.h"
#include "agent_statistic.h"
#include <cmath>

extern AgentSoA agent_data;

void initialize_shared_buffer_layout(uint8_t* sharedBuffer, int maxAgents) {
    size_t offset = 0;

    // Core physics
    agent_data.positions = reinterpret_cast<Point2*>(sharedBuffer + offset);
    offset += sizeof(Point2) * maxAgents;

    agent_data.last_coordinates = reinterpret_cast<Point2*>(sharedBuffer + offset);
    offset += sizeof(Point2) * maxAgents;

    agent_data.velocities = reinterpret_cast<Point2*>(sharedBuffer + offset);
    offset += sizeof(Point2) * maxAgents;
    
    agent_data.looks = reinterpret_cast<Point2*>(sharedBuffer + offset);
    offset += sizeof(Point2) * maxAgents;

    agent_data.states = reinterpret_cast<AgentState*>(sharedBuffer + offset);
    offset += sizeof(AgentState) * maxAgents;
    
    agent_data.is_alive = reinterpret_cast<bool*>(sharedBuffer + offset);
    offset += sizeof(bool) * maxAgents;


    // Navigation data
    agent_data.current_tris = reinterpret_cast<int*>(sharedBuffer + offset);
    offset += sizeof(int) * maxAgents;
    
    agent_data.next_corners = reinterpret_cast<Point2*>(sharedBuffer + offset);
    offset += sizeof(Point2) * maxAgents;

    agent_data.next_corner_tris = reinterpret_cast<int*>(sharedBuffer + offset);
    offset += sizeof(int) * maxAgents;

    agent_data.next_corners2 = reinterpret_cast<Point2*>(sharedBuffer + offset);
    offset += sizeof(Point2) * maxAgents;

    agent_data.next_corner_tris2 = reinterpret_cast<int*>(sharedBuffer + offset);
    offset += sizeof(int) * maxAgents;

    agent_data.num_valid_corners = reinterpret_cast<uint8_t*>(sharedBuffer + offset);
    offset += sizeof(uint8_t) * maxAgents;

    agent_data.pre_escape_corners = reinterpret_cast<Point2*>(sharedBuffer + offset);
    offset += sizeof(Point2) * maxAgents;

    agent_data.pre_escape_corner_tris = reinterpret_cast<int*>(sharedBuffer + offset);
    offset += sizeof(int) * maxAgents;

    agent_data.end_targets = reinterpret_cast<Point2*>(sharedBuffer + offset);
    offset += sizeof(Point2) * maxAgents;

    agent_data.end_target_tris = reinterpret_cast<int*>(sharedBuffer + offset);
    offset += sizeof(int) * maxAgents;

    agent_data.last_valid_positions = reinterpret_cast<Point2*>(sharedBuffer + offset);
    offset += sizeof(Point2) * maxAgents;

    agent_data.last_valid_tris = reinterpret_cast<int*>(sharedBuffer + offset);
    offset += sizeof(int) * maxAgents;

    agent_data.stuck_ratings = reinterpret_cast<float*>(sharedBuffer + offset);
    offset += sizeof(float) * maxAgents;
    
    agent_data.path_frustrations = reinterpret_cast<float*>(sharedBuffer + offset);
    offset += sizeof(float) * maxAgents;

    // Statistics
    agent_data.last_end_targets = reinterpret_cast<Point2*>(sharedBuffer + offset);
    offset += sizeof(Point2) * maxAgents;

    agent_data.min_corridor_lengths = reinterpret_cast<int*>(sharedBuffer + offset);
    offset += sizeof(int) * maxAgents;

    agent_data.last_distances_to_next_corner = reinterpret_cast<float*>(sharedBuffer + offset);
    offset += sizeof(float) * maxAgents;

    agent_data.sight_ratings = reinterpret_cast<float*>(sharedBuffer + offset);
    offset += sizeof(float) * maxAgents;

    agent_data.last_next_corner_tris = reinterpret_cast<int*>(sharedBuffer + offset);
    offset += sizeof(int) * maxAgents;

    // Parameters
    agent_data.max_speeds = reinterpret_cast<float*>(sharedBuffer + offset);
    offset += sizeof(float) * maxAgents;

    agent_data.accels = reinterpret_cast<float*>(sharedBuffer + offset);
    offset += sizeof(float) * maxAgents;

    agent_data.resistances = reinterpret_cast<float*>(sharedBuffer + offset);
    offset += sizeof(float) * maxAgents;

    agent_data.intelligences = reinterpret_cast<float*>(sharedBuffer + offset);
    offset += sizeof(float) * maxAgents;

    agent_data.arrival_desired_speeds = reinterpret_cast<float*>(sharedBuffer + offset);
    offset += sizeof(float) * maxAgents;

    agent_data.look_speeds = reinterpret_cast<float*>(sharedBuffer + offset);
    offset += sizeof(float) * maxAgents;

    agent_data.max_frustrations = reinterpret_cast<float*>(sharedBuffer + offset);
    offset += sizeof(float) * maxAgents;

    agent_data.arrival_threshold_sqs = reinterpret_cast<float*>(sharedBuffer + offset);
    offset += sizeof(float) * maxAgents;

    agent_data.predicament_ratings = reinterpret_cast<float*>(sharedBuffer + offset);
    offset += sizeof(float) * maxAgents;

    // Frame ids at very end (per-agent, read/written from JS)
    agent_data.frame_ids = reinterpret_cast<uint16_t*>(sharedBuffer + offset);
    offset += sizeof(uint16_t) * maxAgents;
}

void initialize_agent_defaults(int agentIndex, float x, float y) {
    // Basic state
    agent_data.positions[agentIndex] = {x, y};
    agent_data.last_coordinates[agentIndex] = {x, y};
    agent_data.velocities[agentIndex] = {0.0f, 0.0f};
    agent_data.looks[agentIndex] = {1.0f, 0.0f};
    agent_data.states[agentIndex] = AgentState::Standing;
    agent_data.is_alive[agentIndex] = true;

    // Navigation defaults
    agent_data.current_tris[agentIndex] = -1;
    agent_data.next_corners[agentIndex] = {0,0};
    agent_data.next_corner_tris[agentIndex] = -1;
    agent_data.next_corners2[agentIndex] = {0,0};
    agent_data.next_corner_tris2[agentIndex] = -1;
    agent_data.num_valid_corners[agentIndex] = 0;
    agent_data.pre_escape_corners[agentIndex] = {0,0};
    agent_data.pre_escape_corner_tris[agentIndex] = -1;
    agent_data.end_targets[agentIndex] = {0,0};
    agent_data.end_target_tris[agentIndex] = -1;
    agent_data.last_valid_positions[agentIndex] = {x,y};
    agent_data.last_valid_tris[agentIndex] = -1;
    agent_data.stuck_ratings[agentIndex] = 0.0f;
    agent_data.path_frustrations[agentIndex] = 0.0f;
    agent_data.predicament_ratings[agentIndex] = 0.0f;
    
    // Default parameters (can be overridden from JS)
    agent_data.max_speeds[agentIndex] = 3.0f;
    agent_data.accels[agentIndex] = 20.0f;
    agent_data.resistances[agentIndex] = 0.1f;
    agent_data.intelligences[agentIndex] = 0.5f;
    agent_data.look_speeds[agentIndex] = 0.1f;
    agent_data.max_frustrations[agentIndex] = 10.0f;
    agent_data.arrival_desired_speeds[agentIndex] = 1.0f;
    agent_data.arrival_threshold_sqs[agentIndex] = 4.0f;
    
    // Initialize corridor data
    agent_data.corridors[agentIndex].clear();
    agent_data.corridor_indices[agentIndex] = 0;
    
    // Initialize frame id
    agent_data.frame_ids[agentIndex] = 0;

    reset_agent_stuck(agentIndex);
}