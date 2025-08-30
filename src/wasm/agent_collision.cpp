#include "agent_collision.h"
#include "data_structures.h"
#include "agent_grid.h"
#include "math_utils.h"

const float AGENT_RADIUS = 2.5f;
const float PUSH_FORCE = 10.0f;
const float ESCAPING_WEIGHT_MULTIPLIER = 20.0f;

extern AgentSoA agent_data;
extern AgentGridData agent_grid;

void update_agent_collisions(int num_agents) {
  const float min_distance_sq = (AGENT_RADIUS * 2.0f) * (AGENT_RADIUS * 2.0f);

  for (int cell_index = 0; cell_index < agent_grid.cell_counts.size(); ++cell_index) {
    int count = agent_grid.cell_counts[cell_index];
    if (count < 2) continue;

    int offset = agent_grid.cell_offsets[cell_index];

    for (int i = 0; i < count; ++i) {
      int agent_index1 = agent_grid.cell_data[offset + i];

      for (int j = i + 1; j < count; ++j) {
        int agent_index2 = agent_grid.cell_data[offset + j];

        Point2& pos1 = agent_data.positions[agent_index1];
        Point2& pos2 = agent_data.positions[agent_index2];

        float dist_sq = math::distance_sq(pos1, pos2);

        if (dist_sq < min_distance_sq && dist_sq > 0.001f) {
          float dist = sqrt(dist_sq);
          Point2 delta = pos1 - pos2;
          Point2 push_vec = delta / dist;

          float overlap = (AGENT_RADIUS * 2.0f) - dist;
          float force = overlap * PUSH_FORCE;
          
          float weight1 = (agent_data.states[agent_index1] == AgentState::Escaping) ? ESCAPING_WEIGHT_MULTIPLIER : 1.0f;
          float weight2 = (agent_data.states[agent_index2] == AgentState::Escaping) ? ESCAPING_WEIGHT_MULTIPLIER : 1.0f;

          float total_weight = weight1 + weight2;

          Point2 push_force1 = push_vec * (force * (weight2 / total_weight));
          Point2 push_force2 = push_vec * (-force * (weight1 / total_weight));

          agent_data.velocities[agent_index1] += push_force1;
          agent_data.velocities[agent_index2] += push_force2;
        }
      }
    }
  }
} 