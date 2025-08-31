#include "model.h"
#include "data_structures.h"
#include "agent_navigation.h"
#include "agent_move_phys.h"
#include "agent_statistic.h"
#include "agent_grid.h"
#include "agent_collision.h"
#include <cstdint>
#include "event_handler.h"
#include "event_buffer.h"
#include "navmesh.h"
#include "event_handler.h"

extern AgentSoA agent_data;
extern Navmesh g_navmesh;
extern EventBuffer g_event_buffer;
extern int g_selected_wagent_idx; // declared in main.cpp

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

  // Emit selected agent's corridor event at end of simulation
  if (g_selected_wagent_idx >= 0 && g_selected_wagent_idx < active_agents) {
    const auto &corr = agent_data.corridors[g_selected_wagent_idx];
    const uint16_t type = EVT_SELECTED_CORRIDOR;
    const uint16_t size_words = static_cast<uint16_t>(2 + corr.size());
    const uint32_t start = g_event_buffer.cursor;
    g_event_buffer.write_header(type, size_words);
    g_event_buffer.u32_base[start + 1] = static_cast<uint32_t>(g_selected_wagent_idx);
    for (size_t i = 0; i < corr.size(); ++i) {
      g_event_buffer.u32_base[start + 2 + i] = static_cast<uint32_t>(corr[i]);
    }
  }

  g_event_buffer.commit_frame();
} 
