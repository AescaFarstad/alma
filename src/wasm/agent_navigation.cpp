#include "agent_navigation.h"
#include "math_utils.h"
#include "nav_utils.h"
#include "path_corridor.h"
#include "path_corners.h"
#include "raycasting.h"
#include "data_structures.h"
#include "agent_nav_utils.h"
#include <iostream>
#include <iomanip>
#include <sstream>

extern Navmesh g_navmesh;
extern float g_sim_time;

Point2 tempLineVec = {0, 0};
Point2 tempCurrentVec = {0, 0};
Point2 tempLastVec = {0, 0};

void reset_agent_stuck(int i);

void update_agent_navigation(int agentIndex, float deltaTime, uint64_t* rng_seed) {
    AgentState state = (AgentState)agent_data.states[agentIndex];

    if (state == AgentState::Standing || agent_data.predicament_ratings[agentIndex] > 7) {
        if (agent_data.predicament_ratings[agentIndex] > 7)
            std::cerr << "[WASM] Predicament rating is too high, resetting. (" << std::fixed << std::setprecision(2) << agent_data.positions[agentIndex].x << ", " << agent_data.positions[agentIndex].y << ")" << std::endl;
        if (agent_data.current_tris[agentIndex] == -1) return;

        int endNode = get_random_triangle_in_area({0.0f, 0.0f}, 30, rng_seed);
        *rng_seed = math::advance_seed_cpp(*rng_seed);
        if (endNode == -1) endNode = get_random_triangle(rng_seed);
        
        agent_data.end_targets[agentIndex] = g_navmesh.triangle_centroids[endNode];
        agent_data.end_target_tris[agentIndex] = endNode;
        agent_data.predicament_ratings[agentIndex] = 0;
        agent_data.corridors[agentIndex].clear();
        
        if (findPathToDestination(g_navmesh, agentIndex, agent_data.current_tris[agentIndex], endNode, "from start")) {
             agent_data.states[agentIndex] = AgentState::Traveling;
             agent_data.last_visible_points_for_next_corner[agentIndex] = agent_data.positions[agentIndex];
            std::stringstream ss;
            const auto& corridor = agent_data.corridors[agentIndex];
            for(size_t i = 0; i < corridor.size(); ++i) {
                ss << corridor[i] << (i < corridor.size() - 1 ? "," : "");
            }
        }
    } 
    else if (state == AgentState::Traveling) {

        if (agent_data.current_tris[agentIndex] == -1) {
            agent_data.states[agentIndex] = AgentState::Escaping;
            agent_data.pre_escape_corners[agentIndex] = agent_data.next_corners[agentIndex];
            agent_data.pre_escape_corner_tris[agentIndex] = agent_data.next_corner_tris[agentIndex];
            agent_data.next_corners[agentIndex] = agent_data.last_valid_positions[agentIndex];
            agent_data.next_corner_tris[agentIndex] = agent_data.last_valid_tris[agentIndex];
            return;
        }

        if (agent_data.stuck_ratings[agentIndex] > STUCK_DANGER_1) {
            bool needFullRepath = false;
            if (agent_data.sight_ratings[agentIndex] < 1) {
                agent_data.sight_ratings[agentIndex]++;
                if (raycastAndPatchCorridor(g_navmesh, agentIndex, agent_data.next_corners[agentIndex], agent_data.next_corner_tris[agentIndex])) {
                    agent_data.stuck_ratings[agentIndex] = 0;
                } else {
                    needFullRepath = true;
                }
            }
            else if (agent_data.stuck_ratings[agentIndex] > STUCK_DANGER_2) {
                float velocityMagSq = math::length_sq(agent_data.velocities[agentIndex]);
                float maxSpeedSq = agent_data.max_speeds[agentIndex] * agent_data.max_speeds[agentIndex];
                needFullRepath = agent_data.stuck_ratings[agentIndex] > STUCK_DANGER_3 || velocityMagSq < maxSpeedSq * 0.0025f;
            }

            if (needFullRepath) {
                agent_data.predicament_ratings[agentIndex]++;
                if (findPathToDestination(g_navmesh, agentIndex, agent_data.current_tris[agentIndex], agent_data.end_target_tris[agentIndex], "from stuck")) {
                } else {
                    std::cerr << "[WASM] Pathfinding failed to find a corner after getting stuck." << std::endl;
                }
                reset_agent_stuck(agentIndex);
            }
        }
        
        const int currentPoly = g_navmesh.triangle_to_polygon[agent_data.current_tris[agentIndex]];
        auto& corridor = agent_data.corridors[agentIndex];
        
        if (agent_data.alien_polys[agentIndex] != currentPoly) {
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
                agent_data.path_frustrations[agentIndex]++;
                if (agent_data.path_frustrations[agentIndex] > agent_data.max_frustrations[agentIndex]) {
                    agent_data.path_frustrations[agentIndex] = 0;
                    if (findPathToDestination(g_navmesh, agentIndex, agent_data.current_tris[agentIndex], agent_data.end_target_tris[agentIndex], "after path recovery")){
                    } else {
                        if (raycastAndPatchCorridor(g_navmesh, agentIndex, agent_data.end_targets[agentIndex], agent_data.end_target_tris[agentIndex])) {
                            agent_data.next_corners[agentIndex] = agent_data.end_targets[agentIndex];
                            agent_data.next_corner_tris[agentIndex] = agent_data.end_target_tris[agentIndex];
                            agent_data.num_valid_corners[agentIndex] = 1;
                        } else {
                            std::cerr << "[WASM] Pathfinding failed to recover the path." << std::endl;
                        }
                    }
                } else {
                    agent_data.alien_polys[agentIndex] = currentPoly;
                }
            } else {
                agent_data.alien_polys[agentIndex] = -1;
                if (currentCorridorPolyIndex < (int)corridor.size() - 1) {
                    agent_data.path_frustrations[agentIndex] = 0;
                    corridor.resize(currentCorridorPolyIndex + 1);
                }
            }
        }

        float distanceToCornerSq = math::distance_sq(agent_data.positions[agentIndex], agent_data.next_corners[agentIndex]);
        
        bool crossedDemarkationLine = false;
        if (agent_data.num_valid_corners[agentIndex] > 1) {
            tempLineVec = agent_data.next_corners[agentIndex] - agent_data.next_corners2[agentIndex];
            tempCurrentVec = agent_data.positions[agentIndex] - agent_data.next_corners2[agentIndex];
            tempLastVec = agent_data.last_coordinates[agentIndex] - agent_data.next_corners2[agentIndex];
            
            float currentCross = math::cross(tempLineVec, tempCurrentVec);
            float lastCross = math::cross(tempLineVec, tempLastVec);
            
            crossedDemarkationLine = currentCross * lastCross <= 0;
        }

        if (agent_data.num_valid_corners[agentIndex] == 2 && (distanceToCornerSq < CORNER_OFFSET_SQ || crossedDemarkationLine)) {
            agent_data.last_visible_points_for_next_corner[agentIndex] = agent_data.next_corners[agentIndex];
            
            DualCorner corners = find_next_corner(agent_data.positions[agentIndex], agent_data.corridors[agentIndex], agent_data.end_targets[agentIndex], CORNER_OFFSET);
            if (corners.numValid > 0) {
                agent_data.next_corners[agentIndex] = corners.corner1;
                agent_data.next_corner_tris[agentIndex] = corners.tri1;
                agent_data.next_corners2[agentIndex] = corners.corner2;
                agent_data.next_corner_tris2[agentIndex] = corners.tri2;
                agent_data.num_valid_corners[agentIndex] = corners.numValid;
            }
        }

        if (agent_data.num_valid_corners[agentIndex] == 1 && math::distance_sq(agent_data.positions[agentIndex], agent_data.end_targets[agentIndex]) < agent_data.arrival_threshold_sqs[agentIndex]) {
            agent_data.states[agentIndex] = AgentState::Standing;
            agent_data.corridors[agentIndex].clear();
        } 
    } 
    else if (state == AgentState::Escaping) {
        if (agent_data.current_tris[agentIndex] != -1) {
            agent_data.states[agentIndex] = AgentState::Traveling;
            
            if (agent_data.pre_escape_corner_tris[agentIndex] != -1) {
                if (raycastAndPatchCorridor(g_navmesh, agentIndex, agent_data.pre_escape_corners[agentIndex], agent_data.pre_escape_corner_tris[agentIndex])) {
                    agent_data.next_corners[agentIndex] = agent_data.pre_escape_corners[agentIndex];
                    agent_data.next_corner_tris[agentIndex] = agent_data.pre_escape_corner_tris[agentIndex];
                    agent_data.pre_escape_corners[agentIndex] = {0, 0};
                    agent_data.pre_escape_corner_tris[agentIndex] = -1;
                    return;
                }
            }
            
            if (agent_data.end_target_tris[agentIndex] != -1) {
                if (findPathToDestination(g_navmesh, agentIndex, agent_data.current_tris[agentIndex], agent_data.end_target_tris[agentIndex], "after escaping")) {
                    agent_data.states[agentIndex] = AgentState::Traveling;
                } else {
                    std::cerr << "[WASM] Pathfinding failed to find a corner after escaping." << std::endl;
                }
            } else {
                std::cerr << "[WASM] Original end target is not on navmesh after escaping." << std::endl;
            }
        }
    }
    
    if (state == AgentState::Traveling || state == AgentState::Escaping) {
        if (math::distance_sq(agent_data.next_corners[agentIndex], agent_data.positions[agentIndex]) > 0.01f) {
            Point2 targetDir = agent_data.next_corners[agentIndex] - agent_data.positions[agentIndex];
            math::normalize_inplace(targetDir);
            Point2& curLook = agent_data.looks[agentIndex];
            math::normalize_inplace(curLook);
            const float dotVT = math::dot(curLook, targetDir);
            const float clampedDot = std::max(-1.0f, std::min(1.0f, dotVT));
            const float crossVT = curLook.x * targetDir.y - curLook.y * targetDir.x;
            const float angleToTarget = std::atan2(crossVT, clampedDot);
            const float maxStep = agent_data.look_speeds[agentIndex] * deltaTime;
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
