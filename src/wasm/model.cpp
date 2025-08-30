#include "model.h"
#include "data_structures.h"
#include "agent_navigation.h"
#include "agent_move_phys.h"
#include "agent_statistic.h"
#include "agent_grid.h"
#include "agent_collision.h"
#include <cstdint>
#include <iostream>
#include "event_handler.h"
#include "event_buffer.h"
#include "navmesh.h"

extern AgentSoA agent_data;
extern Navmesh g_navmesh;
extern EventBuffer g_event_buffer;

void Model::update_simulation(float dt, int active_agents) {
    process_events();
    g_event_buffer.begin_frame();

    sim_time += dt;

    for (int i = 0; i < active_agents; ++i) {
        if (agent_data.is_alive[i]) {
            update_agent_navigation(i, dt, &rng_seed);
            update_agent_phys(i, dt);
            update_agent_statistic(i, dt);
        }
    }
    clear_and_reindex_grid(active_agents);
    update_agent_collisions(active_agents);

    g_event_buffer.commit_frame();
} 
