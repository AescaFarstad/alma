#include "event_buffer.h"
#include "data_structures.h"
#include "navmesh.h"
#include "path_corners.h"
#include "constants_layout.h"
#include "wasm_log.h"
#include "event_handler.h"
#include "raycasting.h"
#include "agent_nav_utils.h"
#include "nav_utils.h"

extern EventBuffer g_event_buffer;
extern AgentSoA agent_data;
extern Navmesh g_navmesh;

enum CorridorAction : uint32_t {
  SET_ONLY = 1,
  SET_AND_STRAIGHT_CORNER = 2,
  SET_AND_RECALC_CORNERS = 3,
};

void process_events() {
  if (!g_event_buffer.u32_base) return;
  uint32_t p = 0u;
  while (g_event_buffer.u32_base[p] != 0u) {
    const uint32_t header = g_event_buffer.u32_base[p];
    const uint16_t type = static_cast<uint16_t>(header & 0xffffu);
    const uint16_t size = static_cast<uint16_t>((header >> 16) & 0xffffu);

    switch (type) {
      case CMD_SET_CORRIDOR: {
        const uint32_t agent_idx = g_event_buffer.u32_base[p + 1];
        const uint32_t action = g_event_buffer.u32_base[p + 2];
        const uint32_t count = static_cast<uint32_t>(size - 3);

        auto &corr = agent_data.corridors[agent_idx];
        corr.clear();
        for (uint32_t i = 0; i < count; ++i) {
          corr.push_back(static_cast<int>(g_event_buffer.u32_base[p + 3 + i]));
        }
        
        if (!corr.empty()) {
          if (action == SET_AND_STRAIGHT_CORNER) {
            // Set the next corner to the end target previously provided by TS
            agent_data.next_corners[agent_idx] = agent_data.end_targets[agent_idx];
            agent_data.next_corner_tris[agent_idx] = agent_data.end_target_tris[agent_idx];
            agent_data.num_valid_corners[agent_idx] = 1;
            agent_data.path_frustrations[agent_idx] = 0.0f;
            agent_data.last_visible_points_for_next_corner[agent_idx] = agent_data.positions[agent_idx];
          } else if (action == SET_AND_RECALC_CORNERS) {
            // Recompute corners from current position and TS-provided end target
            DualCorner dc = find_next_corner(agent_data.positions[agent_idx], corr, agent_data.end_targets[agent_idx], CORNER_OFFSET);
            if (dc.numValid > 0) {
              agent_data.next_corners[agent_idx] = dc.corner1;
              agent_data.next_corners2[agent_idx] = dc.corner2;
              agent_data.next_corner_tris[agent_idx] = dc.tri1;
              agent_data.next_corner_tris2[agent_idx] = dc.tri2;
              agent_data.num_valid_corners[agent_idx] = static_cast<uint8_t>(dc.numValid);
              agent_data.path_frustrations[agent_idx] = 0.0f;
              agent_data.last_visible_points_for_next_corner[agent_idx] = agent_data.positions[agent_idx];
            } else {
              agent_data.num_valid_corners[agent_idx] = 0;
            }
          } else {
            // SET_ONLY: do nothing else; TS may set state/corners
          }
        }
        break;
      }
      case CMD_NAVIGATE_TO_NEARBY_TARGET: {
        if (size < 2) {
          wasm_console_error("[WASM] CMD_NAVIGATE_TO_NEARBY_TARGET: invalid size");
          break;
        }
        const uint32_t agent_idx = g_event_buffer.u32_base[p + 1];
        if (agent_idx >= static_cast<uint32_t>(agent_data.capacity)) {
          wasm_console_error("[WASM] CMD_NAVIGATE_TO_NEARBY_TARGET: invalid agent index");
          break;
        }

        const uint32_t handle = agent_data.target[agent_idx];
        if (handle == 0u) { break; }
        const int target_idx = static_cast<int>(handle & INDEX_MASK);
        // const uint16_t handle_gen = static_cast<uint16_t>(handle >> INDEX_BITS);
        // if (target_idx < 0 || target_idx >= agent_data.capacity) { break; }
        // if (!agent_data.generation || agent_data.generation[target_idx] != handle_gen) { break; }
        // // verbose logs trimmed; re-enable if needed

        Point2 target_pos = agent_data.positions[target_idx];
        int target_tri = agent_data.current_tris[target_idx];
        if (target_tri == -1){
          target_tri = agent_data.last_valid_tris[target_idx];
          target_pos = agent_data.last_valid_positions[target_idx];
        }
        const int start_tri = agent_data.current_tris[agent_idx];

        if (start_tri == -1 || target_tri == -1) {
          wasm_console_error("[WASM] navigate aborted: invalid start/target tri");
          break;
        }

        agent_data.end_targets[agent_idx] = target_pos;
        agent_data.end_target_tris[agent_idx] = target_tri;

        // First, try straight visibility corridor
        //wasm_console_log("raycasting corridor");
        RaycastCorridorResult rc = raycastCorridor(agent_data.positions[agent_idx], target_pos, start_tri, target_tri);
        const bool hit = (rc.hitV1_idx != -1);

        if (!hit) {
          // minimal raycast success context; re-enable if needed
          std::vector<int> raycastPolyCorridor;
          raycastPolyCorridor.reserve(rc.corridor.size());
          for (int i = static_cast<int>(rc.corridor.size()) - 1; i >= 0; --i) {
            const int poly = g_navmesh.triangle_to_polygon[rc.corridor[i]];
            if (raycastPolyCorridor.empty() || raycastPolyCorridor.back() != poly) {
              raycastPolyCorridor.push_back(poly);
            }
          }

          agent_data.corridors[agent_idx] = std::move(raycastPolyCorridor);
          agent_data.next_corners[agent_idx] = agent_data.end_targets[agent_idx];
          agent_data.next_corner_tris[agent_idx] = agent_data.end_target_tris[agent_idx];
          agent_data.num_valid_corners[agent_idx] = 1;
          agent_data.path_frustrations[agent_idx] = 0.0f;
          agent_data.last_visible_points_for_next_corner[agent_idx] = agent_data.positions[agent_idx];
          //wasm_console_log("raycast success end");
        } else {
          //wasm_console_log("finding path");
          findPathToDestination(g_navmesh, agent_idx, start_tri, target_tri, "cmdNavigateToNearbyTarget");
        }
        //wasm_console_log("CMD_NAVIGATE_TO_NEARBY_TARGET ends");
        break;
      }
      default:
        wasm_console_error("Unknown event type ", type);
        break;
    }

    p += size;
  }
}
