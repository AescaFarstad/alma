#include "agent_navigation.h"
#include "math_utils.h"
#include "nav_tri_index.h"
#include "path_corridor.h"
#include "path_corners.h"
#include "raycasting.h"
#include "data_structures.h" // brings in constants_layout.h macros
#include <iostream>
#include <iomanip> // Required for std::fixed and std::setprecision

extern NavmeshData navmesh_data;
extern float g_sim_time;

// Temporary vectors for demarkation line crossing calculations
Point2 tempLineVec = {0, 0};
Point2 tempCurrentVec = {0, 0};
Point2 tempLastVec = {0, 0};




DualCorner find_next_corner_wasm(int agentIndex) {
    // Create a view of the corridor from the current index onwards
    std::vector<int> current_corridor_view;
    if (agent_data.corridor_indices[agentIndex] < agent_data.corridors[agentIndex].size()) {
        current_corridor_view.assign(
            agent_data.corridors[agentIndex].begin() + agent_data.corridor_indices[agentIndex],
            agent_data.corridors[agentIndex].end()
        );
    }
    return find_next_corner(agent_data.positions[agentIndex], current_corridor_view, agent_data.end_targets[agentIndex], CORNER_OFFSET);
}

void find_path_to_destination_wasm(int agentIndex, int startPoly, int endPoly) {
    // Use agent's current position and target to find corridor
    Point2 startPoint = agent_data.positions[agentIndex];
    Point2 endPoint = agent_data.end_targets[agentIndex];
    std::vector<int> path = findCorridor(startPoint, endPoint, startPoly, endPoly);
    if (!path.empty()) {
        agent_data.corridors[agentIndex] = path;
        agent_data.corridor_indices[agentIndex] = 0;
        agent_data.path_frustrations[agentIndex] = 0; // parity with TS
        
        DualCorner corners = find_next_corner_wasm(agentIndex);
        
        agent_data.next_corners[agentIndex] = corners.corner1;
        agent_data.next_corner_polys[agentIndex] = corners.poly1;
        agent_data.next_corners2[agentIndex] = corners.corner2;
        agent_data.next_corner_polys2[agentIndex] = corners.poly2;
        agent_data.num_valid_corners[agentIndex] = corners.numValid;

    } else {
        // Handle pathfinding failure
        std::cerr << "Pathfinding failed for agent " << agentIndex << std::endl;
    }
}

bool raycast_and_patch_corridor_wasm(int agentIndex, Point2 target, int targetPoly) {
    // Use corridor-producing raycast to match TS splice behavior
    RaycastWithCorridorResult result = raycastCorridor(agent_data.positions[agentIndex], target, agent_data.current_polys[agentIndex], targetPoly);
    if (!result.hasHit && !result.corridor.empty()) {
        // Find target poly position in existing corridor
        int targetIdx = -1;
        for (size_t i = 0; i < agent_data.corridors[agentIndex].size(); ++i) {
            if (agent_data.corridors[agentIndex][i] == targetPoly) {
                targetIdx = static_cast<int>(i);
                break;
            }
        }
        if (targetIdx != -1) {
            // Build new corridor: LOS corridor + suffix after target poly
            std::vector<int> newCorridor;
            newCorridor.reserve(result.corridor.size() + (agent_data.corridors[agentIndex].size() - (targetIdx + 1)));
            newCorridor.insert(newCorridor.end(), result.corridor.begin(), result.corridor.end());
            newCorridor.insert(newCorridor.end(), agent_data.corridors[agentIndex].begin() + targetIdx + 1, agent_data.corridors[agentIndex].end());
            agent_data.corridors[agentIndex].swap(newCorridor);
            agent_data.corridor_indices[agentIndex] = 0;
            agent_data.path_frustrations[agentIndex] = 0;
            return true;
        }
    }
    return false;
}

void reset_agent_stuck(int i); // forward (from agent_statistic.h)

void update_agent_navigation(int agentIndex, float deltaTime, uint64_t* rng_seed) {
    AgentState state = (AgentState)agent_data.states[agentIndex];

    // State: Standing - Pick a new destination and find a path.
    if (state == AgentState::Standing || agent_data.predicament_ratings[agentIndex] > 7) {
        if (agent_data.predicament_ratings[agentIndex] > 7) {
            std::cerr << "Predicament rating is too high, resetting. Agent " << agentIndex << std::endl;
        }
        if (agent_data.current_polys[agentIndex] == -1) return;

        // Log RNG before using seed (parity with TS)
        

        // Area-limited random selection to match TS
        int endNode = get_random_triangle_in_area(0.0f, 0.0f, 15, *rng_seed);

        // Advance seed once, same as TS
        *rng_seed = math::advance_seed_cpp(*rng_seed);
        if (endNode == -1) endNode = get_random_triangle();
        
        agent_data.end_targets[agentIndex] = navmesh_data.centroids[endNode];
        agent_data.end_target_polys[agentIndex] = endNode;
        agent_data.predicament_ratings[agentIndex] = 0;
        agent_data.corridors[agentIndex].clear();
        agent_data.corridor_indices[agentIndex] = 0;

        
        
        
        find_path_to_destination_wasm(agentIndex, agent_data.current_polys[agentIndex], endNode);
        if(agent_data.num_valid_corners[agentIndex] > 0){
             agent_data.states[agentIndex] = AgentState::Traveling;
        }
    } 
    // State: Traveling - Follow the path, check for deviations.
    else if (state == AgentState::Traveling) {

        // Check 1: Have we fallen off the navmesh?
        if (agent_data.current_polys[agentIndex] == -1) {
            agent_data.states[agentIndex] = AgentState::Escaping;
            
            
            // Store pre-escape corner
            agent_data.pre_escape_corners[agentIndex] = agent_data.next_corners[agentIndex];
            agent_data.pre_escape_corner_polys[agentIndex] = agent_data.next_corner_polys[agentIndex];
            
            agent_data.next_corners[agentIndex] = agent_data.last_valid_positions[agentIndex];
            agent_data.next_corner_polys[agentIndex] = agent_data.last_valid_polys[agentIndex];
            return;
        }

        // Check for stuck agents
        if (agent_data.stuck_ratings[agentIndex] > STUCK_DANGER_1) {
            bool needFullRepath = false;
            if (agent_data.sight_ratings[agentIndex] < 1) {
                agent_data.sight_ratings[agentIndex]++;
                if (raycast_and_patch_corridor_wasm(agentIndex, agent_data.end_targets[agentIndex], agent_data.end_target_polys[agentIndex])) {
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
                find_path_to_destination_wasm(agentIndex, agent_data.current_polys[agentIndex], agent_data.end_target_polys[agentIndex]);
                if (agent_data.num_valid_corners[agentIndex] > 0) {
                    
                }
                // Full stuck reset to match TS resetAgentStuck
                reset_agent_stuck(agentIndex);
            }
        }
        
        // Check 2: Are we still on the planned path?
        bool on_path = false;
        int corridor_idx = -1;
        // Check if the current polygon is anywhere in the corridor within the next 5 entries from current index (TS parity)
        size_t start_idx = static_cast<size_t>(agent_data.corridor_indices[agentIndex]);
        if (start_idx < agent_data.corridors[agentIndex].size()) {
            size_t end_idx = std::min(agent_data.corridors[agentIndex].size(), start_idx + static_cast<size_t>(5));
            for (size_t i = start_idx; i < end_idx; ++i) {
                if (agent_data.corridors[agentIndex][i] == agent_data.current_polys[agentIndex]) {
                    on_path = true;
                    corridor_idx = static_cast<int>(i);
                    break;
                }
            }
        }

        if (!on_path) {
            agent_data.path_frustrations[agentIndex]++;
            if(agent_data.path_frustrations[agentIndex] > agent_data.max_frustrations[agentIndex]) {
                // Path is too messed up, re-path to the original destination
                agent_data.path_frustrations[agentIndex] = 0;
                find_path_to_destination_wasm(agentIndex, agent_data.current_polys[agentIndex], agent_data.end_target_polys[agentIndex]);
                if (agent_data.num_valid_corners[agentIndex] == 0) {
                    // This can happen if the destination is very close.
                    // Verify with raycast that we have a clear line of sight to the destination
                    if (raycast_and_patch_corridor_wasm(agentIndex, agent_data.end_targets[agentIndex], agent_data.end_target_polys[agentIndex])) {
                        agent_data.next_corners[agentIndex] = agent_data.end_targets[agentIndex];
                        agent_data.next_corner_polys[agentIndex] = agent_data.end_target_polys[agentIndex];
                    } else {
                        std::cerr << "Pathfinding failed to recover the path for agent " << agentIndex << std::endl;
                    }
                }
            }
        } else {
            agent_data.path_frustrations[agentIndex] = 0;
            // If we've advanced, trim the corridor prefix and reset index (TS parity)
            if(corridor_idx > agent_data.corridor_indices[agentIndex]){
                auto &corr = agent_data.corridors[agentIndex];
                if (corridor_idx > 0 && corridor_idx <= static_cast<int>(corr.size())) {
                    int oldLen = static_cast<int>(corr.size());
                    corr.erase(corr.begin(), corr.begin() + corridor_idx);
                    
                }
                agent_data.corridor_indices[agentIndex] = 0;
                // Do not recompute next corners immediately after trim.
                // TS defers corner advancement until the distance/crossing check triggers.
            }
        }

        // Check 3: Have we reached the next corner?
        float distanceToCornerSq = math::distance_sq(agent_data.positions[agentIndex], agent_data.next_corners[agentIndex]); // compare against CORNER_OFFSET_SQ from TS
        
        // Check if we've crossed the demarkation line nextCorner2->nextCorner
        bool crossedDemarkationLine = false;
        float currentCross = 0.0f;
        float lastCross = 0.0f;
        if (agent_data.num_valid_corners[agentIndex] > 1) {
            // Line vector from nextCorner2 to nextCorner
            tempLineVec = agent_data.next_corners[agentIndex] - agent_data.next_corners2[agentIndex];
            
            // Vector from nextCorner2 to current position
            tempCurrentVec = agent_data.positions[agentIndex] - agent_data.next_corners2[agentIndex];
            
            // Vector from nextCorner2 to last position
            tempLastVec = agent_data.last_coordinates[agentIndex] - agent_data.next_corners2[agentIndex];
            
            // Cross products
            currentCross = math::cross(tempLineVec, tempCurrentVec);
            lastCross = math::cross(tempLineVec, tempLastVec);
            
            // If signs are different, we've crossed the line
            crossedDemarkationLine = currentCross * lastCross <= 0;
        }

        // --- Corner Advancement ---
        if (agent_data.num_valid_corners[agentIndex] == 2 && (distanceToCornerSq < CORNER_OFFSET_SQ || crossedDemarkationLine)) {
             DualCorner corners = find_next_corner_wasm(agentIndex);
            if (corners.numValid > 0) {
                 agent_data.next_corners[agentIndex] = corners.corner1;
                agent_data.next_corner_polys[agentIndex] = corners.poly1;
                agent_data.next_corners2[agentIndex] = corners.corner2;
                agent_data.next_corner_polys2[agentIndex] = corners.poly2;
                agent_data.num_valid_corners[agentIndex] = corners.numValid;

                int remaining = static_cast<int>(agent_data.corridors[agentIndex].size()) - agent_data.corridor_indices[agentIndex];
                if (remaining < 0) remaining = 0;
                
            }
        }

        if (agent_data.num_valid_corners[agentIndex] == 1 && math::distance_sq(agent_data.positions[agentIndex], agent_data.end_targets[agentIndex]) < agent_data.arrival_threshold_sqs[agentIndex]) {
            agent_data.states[agentIndex] = AgentState::Standing;
            agent_data.corridors[agentIndex].clear();
            agent_data.corridor_indices[agentIndex] = 0;
            
        } else if (agent_data.num_valid_corners[agentIndex] == 0) {
             std::cerr << "Pathfinding failed to find a corner after the current one for agent " << agentIndex << std::endl;
        }

    } 
    // State: Escaping - Trying to get back to the navmesh.
    else if (state == AgentState::Escaping) {
        if (agent_data.current_polys[agentIndex] != -1) {
            // We're back on the navmesh! Re-path to our original destination.
            agent_data.states[agentIndex] = AgentState::Traveling;
            

            if (agent_data.pre_escape_corner_polys[agentIndex] != -1) {
                if (raycast_and_patch_corridor_wasm(agentIndex, agent_data.pre_escape_corners[agentIndex], agent_data.pre_escape_corner_polys[agentIndex])) {
                    agent_data.next_corners[agentIndex] = agent_data.pre_escape_corners[agentIndex];
                    agent_data.next_corner_polys[agentIndex] = agent_data.pre_escape_corner_polys[agentIndex];
                    // Clear preEscapeCorner
                    agent_data.pre_escape_corners[agentIndex] = {0, 0};
                    agent_data.pre_escape_corner_polys[agentIndex] = -1;
                    return;
                }
            }
            
            if (agent_data.end_target_polys[agentIndex] != -1) {
                find_path_to_destination_wasm(agentIndex, agent_data.current_polys[agentIndex], agent_data.end_target_polys[agentIndex]);
                if (agent_data.num_valid_corners[agentIndex] > 0) {
                    agent_data.states[agentIndex] = AgentState::Traveling;
                } else {
                    std::cerr << "Pathfinding failed to find a corner after escaping for agent " << agentIndex << std::endl;
                }
            } else {
                std::cerr << "Original end target is not on navmesh after escaping for agent " << agentIndex << std::endl;
            }
        }
    }
    
    if (state == AgentState::Traveling || state == AgentState::Escaping) {
        if (math::distance_sq(agent_data.next_corners[agentIndex], agent_data.positions[agentIndex]) > 0.01) {
            agent_data.looks[agentIndex] = agent_data.next_corners[agentIndex] - agent_data.positions[agentIndex];
            math::normalize_inplace(agent_data.looks[agentIndex]);
        }
    }
}
