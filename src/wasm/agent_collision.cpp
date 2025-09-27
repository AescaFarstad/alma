#include "agent_collision.h"
#include "data_structures.h"
#include "agent_grid.h"
#include "math_utils.h"
#include <limits>

const float AGENT_DIAMETER = 4.0f;
const float PUSH_FORCE = 1000.0f;
const float WEIGHT_MULTIPLIER[3] = {1.0f, 3.0f, 40.0f};

extern AgentSoA agent_data;
extern AgentGridData agent_grid;

static std::vector<float> distancesSq;

void update_agent_collisions(int num_agents, float dt) {
  const float min_distance_sq = AGENT_DIAMETER * AGENT_DIAMETER;

  for (int cell_index = 0; cell_index < agent_grid.cell_counts.size(); ++cell_index) {
    int count = agent_grid.cell_counts[cell_index];
    if (count < 2) continue;

    int offset = agent_grid.cell_offsets[cell_index];
    distancesSq.clear();

    for (int i = 0; i < count; ++i) {
      int agent_index = agent_grid.cell_data[offset + i];
      uint32_t cur_handle = agent_data.nearest_enemy[agent_index];
      if (cur_handle != 0u) {
        int cur_idx = static_cast<int>(cur_handle & INDEX_MASK);
        uint16_t cur_gen = static_cast<uint16_t>(cur_handle >> INDEX_BITS);
        if (agent_data.generation[cur_idx] == cur_gen) {
          distancesSq.push_back(math::distance_sq(agent_data.positions[agent_index], agent_data.positions[cur_idx]));
        } else {
          distancesSq.push_back(std::numeric_limits<float>::max());
          agent_data.nearest_enemy[agent_index] = 0u;
        }
      } else {
        distancesSq.push_back(std::numeric_limits<float>::max());
      }
    }

    for (int i = 0; i < count; ++i) {
      int agent_index1 = agent_grid.cell_data[offset + i];

      for (int j = i + 1; j < count; ++j) {
        int agent_index2 = agent_grid.cell_data[offset + j];

        Point2& pos1 = agent_data.positions[agent_index1];
        Point2& pos2 = agent_data.positions[agent_index2];

        float dist_sq = math::distance_sq(pos1, pos2);

        if (agent_data.team[agent_index1] != agent_data.team[agent_index2]) {
          if (dist_sq < distancesSq[i]) {
            uint32_t handle = (static_cast<uint32_t>(agent_data.generation[agent_index2]) << INDEX_BITS) | static_cast<uint32_t>(agent_index2);
            agent_data.nearest_enemy[agent_index1] = handle;
            distancesSq[i] = dist_sq;
          }
          if (dist_sq < distancesSq[j]) {
            uint32_t handle = (static_cast<uint32_t>(agent_data.generation[agent_index1]) << INDEX_BITS) | static_cast<uint32_t>(agent_index1);
            agent_data.nearest_enemy[agent_index2] = handle;
            distancesSq[j] = dist_sq;
          }
        }

        if (dist_sq < min_distance_sq && dist_sq > 0.001f) {
          float dist = sqrt(dist_sq);
          Point2 delta = pos1 - pos2;
          Point2 push_vec = delta / dist;

          float overlap = AGENT_DIAMETER - dist;
          float force = overlap * PUSH_FORCE;

          float weight1 = WEIGHT_MULTIPLIER[agent_data.states[agent_index1]];
          float weight2 = WEIGHT_MULTIPLIER[agent_data.states[agent_index2]];

          float total_weight = weight1 + weight2;

          Point2 push_force1 = push_vec * (force * (weight2 / total_weight) * dt);
          Point2 push_force2 = push_vec * (-force * (weight1 / total_weight) * dt);

          agent_data.velocities[agent_index1] += push_force1;
          agent_data.velocities[agent_index2] += push_force2;
        }
      }
    }
  }
}
