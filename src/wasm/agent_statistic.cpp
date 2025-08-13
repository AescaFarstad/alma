#include "agent_statistic.h"
#include "data_structures.h"
#include "math_utils.h"
#include <cmath>
#include <algorithm>
#include <limits>

// Constants already defined in data_structures.h - use them directly

void reset_agent_stuck(int i) {
    agent_data.min_corridor_lengths[i] = agent_data.corridors[i].size();
    agent_data.last_distances_to_next_corner[i] = std::numeric_limits<float>::max();
    agent_data.stuck_ratings[i] = 0.0f;
    agent_data.sight_ratings[i] = 0.0f;
    agent_data.last_next_corner_polys[i] = -1;
    agent_data.last_end_targets[i] = agent_data.end_targets[i];
}

void update_agent_statistic(int i, float dt) {
    if (dt == 0.0f) return;

    if (agent_data.last_end_targets[i].x != agent_data.end_targets[i].x || 
        agent_data.last_end_targets[i].y != agent_data.end_targets[i].y) {
        reset_agent_stuck(i);
    }

    if (agent_data.num_valid_corners[i] > 0) {
        float velocity_magnitude = std::max(1.0f, math::length(agent_data.velocities[i]));
        float velocity_factor = velocity_magnitude / agent_data.max_speeds[i];
        float vf_cubed = velocity_factor * velocity_factor * velocity_factor;
        float velocity_mult = math::lerp(2.0f, 0.4f, vf_cubed);
        agent_data.stuck_ratings[i] += STUCK_PASSIVE_X1 * dt * velocity_mult;

        float dist = math::distance(agent_data.positions[i], agent_data.next_corners[i]);

        if (agent_data.last_next_corner_polys[i] != agent_data.next_corner_polys[i]) {
            agent_data.last_distances_to_next_corner[i] = dist;
            agent_data.last_next_corner_polys[i] = agent_data.next_corner_polys[i];
            agent_data.sight_ratings[i] = 0.0f;
        }

        float distance_decrease = agent_data.last_distances_to_next_corner[i] - dist;
        if (distance_decrease > 0) {
            float mult = (2.0f - agent_data.intelligences[i]) / agent_data.max_speeds[i] * STUCK_DST_X2;
            float decrease_factor = distance_decrease / (velocity_magnitude * dt);
            agent_data.stuck_ratings[i] -= decrease_factor * mult;
            agent_data.last_distances_to_next_corner[i] = dist;
        }
    }

    int corridor_decrease = agent_data.min_corridor_lengths[i] - agent_data.corridors[i].size();
    if (corridor_decrease > 0) {
        agent_data.stuck_ratings[i] -= corridor_decrease * STUCK_CORRIDOR_X3;
        agent_data.min_corridor_lengths[i] = agent_data.corridors[i].size();
    }

    agent_data.stuck_ratings[i] *= pow(STUCK_DECAY, dt);

    if (agent_data.stuck_ratings[i] < 0) {
        agent_data.stuck_ratings[i] = 0;
    }
} 