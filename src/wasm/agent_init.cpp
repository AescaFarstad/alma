#include "agent_init.h"
#include "agent_statistic.h"
#include <cmath>
#include <algorithm>

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

  agent_data.alien_polys = reinterpret_cast<int*>(sharedBuffer + offset);
  offset += sizeof(int) * maxAgents;

  agent_data.last_visible_points_for_next_corner = reinterpret_cast<Point2*>(sharedBuffer + offset);
  offset += sizeof(Point2) * maxAgents;

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

  // Combat/AI
  agent_data.proto = reinterpret_cast<int*>(sharedBuffer + offset);
  offset += sizeof(int) * maxAgents;

  agent_data.weapon_proto = reinterpret_cast<int*>(sharedBuffer + offset);
  offset += sizeof(int) * maxAgents;

  agent_data.team = reinterpret_cast<int*>(sharedBuffer + offset);
  offset += sizeof(int) * maxAgents;

  agent_data.hp = reinterpret_cast<int*>(sharedBuffer + offset);
  offset += sizeof(int) * maxAgents;

  agent_data.nearest_enemy = reinterpret_cast<uint32_t*>(sharedBuffer + offset);
  offset += sizeof(uint32_t) * maxAgents;

  agent_data.target = reinterpret_cast<uint32_t*>(sharedBuffer + offset);
  offset += sizeof(uint32_t) * maxAgents;

  agent_data.cooldown = reinterpret_cast<float*>(sharedBuffer + offset);
  offset += sizeof(float) * maxAgents;

  agent_data.morale = reinterpret_cast<float*>(sharedBuffer + offset);
  offset += sizeof(float) * maxAgents;

  agent_data.last_damage_stamp = reinterpret_cast<float*>(sharedBuffer + offset);
  offset += sizeof(float) * maxAgents;

  // At very end
  agent_data.frame_ids = reinterpret_cast<uint16_t*>(sharedBuffer + offset);
  offset += sizeof(uint16_t) * maxAgents;

  agent_data.generation = reinterpret_cast<uint16_t*>(sharedBuffer + offset);
  offset += sizeof(uint16_t) * maxAgents;
}

void initialize_agent_defaults() {
  const int n = agent_data.capacity;

  // Core physics
  std::fill_n(agent_data.positions, n, Point2{0, 0});
  std::fill_n(agent_data.last_coordinates, n, Point2{0, 0});
  std::fill_n(agent_data.velocities, n, Point2{0, 0});
  std::fill_n(agent_data.looks, n, Point2{0, 0});
  std::fill_n(agent_data.states, n, AgentState::Standing); // 0
  std::fill_n(agent_data.is_alive, n, false);

  // Navigation defaults
  std::fill_n(agent_data.current_tris, n, -1);
  std::fill_n(agent_data.next_corners, n, Point2{0, 0});
  std::fill_n(agent_data.next_corner_tris, n, -1);
  std::fill_n(agent_data.next_corners2, n, Point2{0, 0});
  std::fill_n(agent_data.next_corner_tris2, n, -1);
  std::fill_n(agent_data.num_valid_corners, n, static_cast<uint8_t>(0));
  std::fill_n(agent_data.pre_escape_corners, n, Point2{0, 0});
  std::fill_n(agent_data.pre_escape_corner_tris, n, -1);
  std::fill_n(agent_data.end_targets, n, Point2{0, 0});
  std::fill_n(agent_data.end_target_tris, n, -1);
  std::fill_n(agent_data.last_valid_positions, n, Point2{0, 0});
  std::fill_n(agent_data.last_valid_tris, n, -1);
  std::fill_n(agent_data.stuck_ratings, n, 0.0f);
  std::fill_n(agent_data.path_frustrations, n, 0.0f);
  std::fill_n(agent_data.predicament_ratings, n, 0.0f);
  std::fill_n(agent_data.alien_polys, n, -1);
  std::fill_n(agent_data.last_visible_points_for_next_corner, n, Point2{0, 0});

  // Statistics
  std::fill_n(agent_data.last_end_targets, n, Point2{0, 0});
  std::fill_n(agent_data.min_corridor_lengths, n, 0);
  std::fill_n(agent_data.last_distances_to_next_corner, n, 0.0f);
  std::fill_n(agent_data.sight_ratings, n, 0.0f);
  std::fill_n(agent_data.last_next_corner_tris, n, -1);

  // Parameters (overridden from JS on spawn)
  std::fill_n(agent_data.max_speeds, n, 0.0f);
  std::fill_n(agent_data.accels, n, 0.0f);
  std::fill_n(agent_data.resistances, n, 0.0f);
  std::fill_n(agent_data.intelligences, n, 0.0f);
  std::fill_n(agent_data.look_speeds, n, 0.0f);
  std::fill_n(agent_data.max_frustrations, n, 0.0f);
  std::fill_n(agent_data.arrival_desired_speeds, n, 0.0f);
  std::fill_n(agent_data.arrival_threshold_sqs, n, 0.0f);

  // Combat/AI defaults
  std::fill_n(agent_data.proto, n, 0);
  std::fill_n(agent_data.weapon_proto, n, 0);
  std::fill_n(agent_data.team, n, 0);
  std::fill_n(agent_data.hp, n, 0);
  std::fill_n(agent_data.nearest_enemy, n, 0u); // invalid handle
  std::fill_n(agent_data.target, n, 0u);        // invalid handle
  std::fill_n(agent_data.cooldown, n, 0.0f);
  std::fill_n(agent_data.morale, n, 0.0f);
  std::fill_n(agent_data.last_damage_stamp, n, 0.0f);

  // At very end
  std::fill_n(agent_data.frame_ids, n, static_cast<uint16_t>(0));
  std::fill_n(agent_data.generation, n, static_cast<uint16_t>(0));
}
