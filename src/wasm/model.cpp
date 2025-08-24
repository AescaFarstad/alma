#include "model.h"
#include "data_structures.h"
#include "agent_navigation.h"
#include "agent_move_phys.h"
#include "agent_statistic.h"
#include "agent_grid.h"
#include "agent_collision.h"
#include <cstdint>

extern AgentSoA agent_data;

void Model::update_simulation(float dt, int active_agents) {
    sim_time += dt;
    
    // 1. Update agents
    for (int i = 0; i < active_agents; ++i) {
        if (agent_data.is_alive[i]) {
            update_agent_navigation(i, dt, &rng_seed);
            update_agent_phys(i, dt);
            update_agent_statistic(i, dt);
        }
    }

    // 2. Re-index the spatial grid
    // clear_and_reindex_grid(active_agents);

    // 3. Update collisions
    // update_agent_collisions(active_agents);
} 