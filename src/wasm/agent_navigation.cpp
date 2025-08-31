#include "agent_navigation.h"
#include "math_utils.h"
#include "path_corners.h"
#include "data_structures.h"
#include "agent_nav_utils.h"
#include <iostream>
#include <iomanip>
#include <sstream>
#include "wasm_log.h"

extern Navmesh g_navmesh;
extern float g_sim_time;

Point2 tempLineVec = {0, 0};
Point2 tempCurrentVec = {0, 0};
Point2 tempLastVec = {0, 0};

void reset_agent_stuck(int i);

void update_agent_navigation(int idx, float deltaTime, uint64_t* rng_seed) {
  AgentState state = (AgentState)agent_data.states[idx];

  if (state != AgentState::Traveling && state != AgentState::Escaping) {
    return;
  }

  if (state == AgentState::Traveling) {
    if (agent_data.predicament_ratings[idx] > 37) {
      {
        std::ostringstream _oss; _oss.setf(std::ios::fixed); _oss << std::setprecision(2);
        _oss << "[WASM] Predicament rating is too high, resetting. (" << agent_data.positions[idx].x << ", " << agent_data.positions[idx].y << ")";
        wasm_console_error(_oss.str());
      }
      agent_data.states[idx] = AgentState::Standing;
      agent_data.corridors[idx].clear();
      return;
    }

    if (agent_data.corridors[idx].empty()) {
      findPathToDestination(g_navmesh, idx, agent_data.current_tris[idx], agent_data.end_target_tris[idx], "from start");
    }

    if (agent_data.current_tris[idx] == -1) {
      agent_data.states[idx] = AgentState::Escaping;
      agent_data.pre_escape_corners[idx] = agent_data.next_corners[idx];
      agent_data.pre_escape_corner_tris[idx] = agent_data.next_corner_tris[idx];
      agent_data.next_corners[idx] = agent_data.last_valid_positions[idx];
      agent_data.next_corner_tris[idx] = agent_data.last_valid_tris[idx];
      return;
    }

    if (agent_data.stuck_ratings[idx] > STUCK_DANGER_1) {
      bool needFullRepath = false;
      if (agent_data.sight_ratings[idx] < 1) {
        agent_data.sight_ratings[idx]++;
        if (raycastAndPatchCorridor(g_navmesh, idx, agent_data.next_corners[idx], agent_data.next_corner_tris[idx])) {
          agent_data.stuck_ratings[idx] = 0;
        } else {
          needFullRepath = true;
        }
      }
      else if (agent_data.stuck_ratings[idx] > STUCK_DANGER_2) {
        float velocityMagSq = math::length_sq(agent_data.velocities[idx]);
        float maxSpeedSq = agent_data.max_speeds[idx] * agent_data.max_speeds[idx];
        needFullRepath = agent_data.stuck_ratings[idx] > STUCK_DANGER_3 || velocityMagSq < maxSpeedSq * 0.0025f;
      }

      if (needFullRepath) {
        agent_data.predicament_ratings[idx]++;
        if (findPathToDestination(g_navmesh, idx, agent_data.current_tris[idx], agent_data.end_target_tris[idx], "from stuck")) {
        } else {
          wasm_console_error("[WASM] Pathfinding failed to find a corner after getting stuck.");
        }
        reset_agent_stuck(idx);
      }
    }
    
    const int currentPoly = g_navmesh.triangle_to_polygon[agent_data.current_tris[idx]];
    auto& corridor = agent_data.corridors[idx];
    
    if (agent_data.alien_polys[idx] != currentPoly) {
      const int maxCheck = std::min((int)CORRIDOR_EXPECTED_JUMP, (int)corridor.size());
      int currentCorridorPolyIndex = -1;

      const int corridorSize = corridor.size();
      const int startSearchIdx = corridorSize - 1;
      const int endSearchIdx = corridorSize - maxCheck;

      for (int i = startSearchIdx; i >= endSearchIdx; --i) {
        if (corridor[i] == currentPoly) {
          currentCorridorPolyIndex = i;
          break;
        }
      }

      if (currentCorridorPolyIndex == -1) {
        agent_data.path_frustrations[idx]++;
        if (agent_data.path_frustrations[idx] > agent_data.max_frustrations[idx]) {
          agent_data.path_frustrations[idx] = 0;
          if (findPathToDestination(g_navmesh, idx, agent_data.current_tris[idx], agent_data.end_target_tris[idx], "after path recovery")){
          } else {
            if (raycastAndPatchCorridor(g_navmesh, idx, agent_data.end_targets[idx], agent_data.end_target_tris[idx])) {
              agent_data.next_corners[idx] = agent_data.end_targets[idx];
              agent_data.next_corner_tris[idx] = agent_data.end_target_tris[idx];
              agent_data.num_valid_corners[idx] = 1;
            } else {
              wasm_console_error("[WASM] Pathfinding failed to recover the path.");
            }
          }
        } else {
          agent_data.alien_polys[idx] = currentPoly;
        }
      } else {
        agent_data.alien_polys[idx] = -1;
        if (currentCorridorPolyIndex < (int)corridor.size() - 1) {
          agent_data.path_frustrations[idx] = 0;
          corridor.resize(currentCorridorPolyIndex + 1);
        }
      }
    }

    float distanceToCornerSq = math::distance_sq(agent_data.positions[idx], agent_data.next_corners[idx]);
    
    bool crossedDemarkationLine = false;
    if (agent_data.num_valid_corners[idx] > 1) {
      tempLineVec = agent_data.next_corners[idx] - agent_data.next_corners2[idx];
      tempCurrentVec = agent_data.positions[idx] - agent_data.next_corners2[idx];
      tempLastVec = agent_data.last_coordinates[idx] - agent_data.next_corners2[idx];
      
      float currentCross = math::cross(tempLineVec, tempCurrentVec);
      float lastCross = math::cross(tempLineVec, tempLastVec);
      
      crossedDemarkationLine = currentCross * lastCross <= 0;
    }

    if (agent_data.num_valid_corners[idx] == 2 && (distanceToCornerSq < CORNER_OFFSET_SQ || crossedDemarkationLine)) {
      agent_data.last_visible_points_for_next_corner[idx] = agent_data.next_corners[idx];
      
      DualCorner corners = find_next_corner(agent_data.positions[idx], agent_data.corridors[idx], agent_data.end_targets[idx], CORNER_OFFSET);
      if (corners.numValid > 0) {
        agent_data.next_corners[idx] = corners.corner1;
        agent_data.next_corner_tris[idx] = corners.tri1;
        agent_data.next_corners2[idx] = corners.corner2;
        agent_data.next_corner_tris2[idx] = corners.tri2;
        agent_data.num_valid_corners[idx] = corners.numValid;
      }
    }

    if (agent_data.num_valid_corners[idx] == 1 && math::distance_sq(agent_data.positions[idx], agent_data.end_targets[idx]) < agent_data.arrival_threshold_sqs[idx]) {
      agent_data.states[idx] = AgentState::Standing;
      agent_data.corridors[idx].clear();
    } 
  } 
  else if (state == AgentState::Escaping) {
    if (agent_data.current_tris[idx] != -1) {
      agent_data.states[idx] = AgentState::Traveling;
      
      if (agent_data.pre_escape_corner_tris[idx] != -1) {
        if (raycastAndPatchCorridor(g_navmesh, idx, agent_data.pre_escape_corners[idx], agent_data.pre_escape_corner_tris[idx])) {
          agent_data.next_corners[idx] = agent_data.pre_escape_corners[idx];
          agent_data.next_corner_tris[idx] = agent_data.pre_escape_corner_tris[idx];
          agent_data.pre_escape_corners[idx] = {0, 0};
          agent_data.pre_escape_corner_tris[idx] = -1;
          return;
        }
      }
      
      if (agent_data.end_target_tris[idx] != -1) {
        if (findPathToDestination(g_navmesh, idx, agent_data.current_tris[idx], agent_data.end_target_tris[idx], "after escaping")) {
          agent_data.states[idx] = AgentState::Traveling;
        } else {
          wasm_console_error("[WASM] Pathfinding failed to find a corner after escaping.");
        }
      } else {
        wasm_console_error("[WASM] Original end target is not on navmesh after escaping.");
      }
    }
  }
  
  if (state == AgentState::Traveling || state == AgentState::Escaping) {
    if (math::distance_sq(agent_data.next_corners[idx], agent_data.positions[idx]) > 0.01f) {
      Point2 targetDir = agent_data.next_corners[idx] - agent_data.positions[idx];
      math::normalize_inplace(targetDir);
      Point2& curLook = agent_data.looks[idx];
      math::normalize_inplace(curLook);
      const float dotVT = math::dot(curLook, targetDir);
      const float clampedDot = std::max(-1.0f, std::min(1.0f, dotVT));
      const float crossVT = curLook.x * targetDir.y - curLook.y * targetDir.x;
      const float angleToTarget = std::atan2(crossVT, clampedDot);
      const float maxStep = agent_data.look_speeds[idx] * deltaTime;
      float step = angleToTarget;
      if (step > maxStep) step = maxStep;
      else if (step < -maxStep) step = -maxStep;
      const float s = std::sin(step);
      const float c = std::cos(step);
      const float newX = c * curLook.x - s * curLook.y;
      const float newY = s * curLook.x + c * curLook.y;
      curLook.x = newX;
      curLook.y = newY;
    }
  }
}
