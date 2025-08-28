#include "agent_move_phys.h"
#include "math_utils.h"
#include "raycasting.h"
#include "nav_utils.h"
#include "data_structures.h" // brings in constants_layout.h macros
#include <cmath>
#include <iostream>
#include <iomanip>
#include <cstdio>
#include <tuple>

extern Navmesh g_navmesh;
extern float g_sim_time;
extern std::vector<uint8_t> g_wall_contact;

void update_agent_phys(int agentIndex, float deltaTime) {
    agent_data.last_coordinates[agentIndex] = agent_data.positions[agentIndex];

    if (math::length_sq(agent_data.velocities[agentIndex]) < 0.001f) {
        agent_data.velocities[agentIndex] = {0.0f, 0.0f};
    }

    const float resistance = agent_data.resistances[agentIndex];
    const float frameRateAdjustedResistance = pow(1.0f - resistance, deltaTime);

    // Desired velocity calculation
    Point2 directionToCorner = agent_data.next_corners[agentIndex] - agent_data.positions[agentIndex];
    float dstToCorner = math::length(directionToCorner);
    if (dstToCorner > 0.01f) {
        directionToCorner /= dstToCorner;
    } else {
        directionToCorner = {0,0};
    }
    
    Point2 desiredVelocity = directionToCorner;
    float desiredMagnitude = 0;

    if (agent_data.states[agentIndex] == AgentState::Traveling || agent_data.states[agentIndex] == AgentState::Escaping) {
        float maxSpeed = agent_data.max_speeds[agentIndex];
        float intelligence = agent_data.intelligences[agentIndex];
        
        float slowDownStrength = 1.0f / 8.0f / resistance / resistance;
        slowDownStrength *= math::lerp(0.5f, 2.0f, intelligence);
        float slowBeforeCornerDst = maxSpeed * 0.25f;
        float slowBeforeCornerSpeed = maxSpeed;

        if (dstToCorner < slowBeforeCornerDst && agent_data.num_valid_corners[agentIndex] >= 2) {
            Point2 corner1ToCorner2 = agent_data.next_corners2[agentIndex] - agent_data.next_corners[agentIndex];
            math::normalize_inplace(corner1ToCorner2);
            
            Point2 normVelocity = agent_data.velocities[agentIndex];
            math::normalize_inplace(normVelocity);
            
            float turnAlignment = math::dot(normVelocity, corner1ToCorner2);
            turnAlignment = (turnAlignment + 1.0f) * 0.5f;
            turnAlignment = turnAlignment * turnAlignment * turnAlignment;
            slowBeforeCornerDst *= math::lerp(1.0f, 0.0f, turnAlignment);
            slowBeforeCornerSpeed *= math::lerp(slowDownStrength, 1.0f, turnAlignment);
        }

        if (dstToCorner > slowBeforeCornerDst) {
            desiredMagnitude = maxSpeed;
        } else {
            const float minSpeed = agent_data.num_valid_corners[agentIndex] == 1 
                ? agent_data.arrival_desired_speeds[agentIndex] * maxSpeed 
                : slowBeforeCornerSpeed;
            desiredMagnitude = math::lerp(minSpeed, maxSpeed, dstToCorner / slowBeforeCornerDst);
        }
    } else {
        desiredMagnitude = 0;
    }

    desiredMagnitude /= frameRateAdjustedResistance;
    const float stuckFactor = agent_data.stuck_ratings[agentIndex] / STUCK_DANGER_2;
    desiredMagnitude *= math::cvt(stuckFactor * stuckFactor, 0.0f, 1.0f, 1.0f, 0.5f);
    
    desiredVelocity = directionToCorner * desiredMagnitude;

    Point2 velocityDiff = desiredVelocity - agent_data.velocities[agentIndex];
    
    float effectiveInt = math::length_sq(desiredVelocity) > 0.1f ? agent_data.intelligences[agentIndex] : 1.0f;

    Point2 finalAccelDirection = directionToCorner;
    float requiredAddition = desiredMagnitude - math::dot(agent_data.velocities[agentIndex], directionToCorner);
    finalAccelDirection *= requiredAddition * (1.0f - effectiveInt);
    velocityDiff *= effectiveInt;
    finalAccelDirection += velocityDiff;

    const float diffLn = math::length(finalAccelDirection);
    const float accelThisFrame = fmin(diffLn, agent_data.accels[agentIndex] * deltaTime);
    if (diffLn > 0.001f) {
        finalAccelDirection *= (accelThisFrame / diffLn);
    } else {
        finalAccelDirection *= 0;
    }

    agent_data.velocities[agentIndex] += finalAccelDirection;

    agent_data.velocities[agentIndex] *= frameRateAdjustedResistance;

    Point2 moveVector = agent_data.velocities[agentIndex] * deltaTime;
    const float moveLnSq = math::length_sq(moveVector);

    if (agent_data.states[agentIndex] == AgentState::Escaping) {
        const float distanceToTargetSq = math::distance_sq(agent_data.next_corners[agentIndex], agent_data.positions[agentIndex]);
        if (moveLnSq >= distanceToTargetSq) {
            agent_data.positions[agentIndex] = agent_data.last_valid_positions[agentIndex];
            agent_data.velocities[agentIndex] = {0.0f, 0.0f};
        } else {
            agent_data.positions[agentIndex] += moveVector;
        }
    } else {
        if (deltaTime > 0.0f && moveLnSq > 0.0001f) {
            Point2 endPoint = agent_data.positions[agentIndex] + moveVector;
            Point2 normVelocity = math::normalize(agent_data.velocities[agentIndex]);
            Point2 endPointForRecast = endPoint + (normVelocity * 0.45f);
            
            auto raycastResult = raycastPoint(agent_data.positions[agentIndex], endPointForRecast, agent_data.current_tris[agentIndex]);

            if (std::get<2>(raycastResult)) {
                if (!g_wall_contact.empty() && g_wall_contact[agentIndex] == 0) {
                    g_wall_contact[agentIndex] = 1;
                }
                agent_data.stuck_ratings[agentIndex] += STUCK_HIT_WALL;
                Point2 wallVector = std::get<1>(raycastResult) - std::get<0>(raycastResult);
                Point2 wallNormal = {-wallVector.y, wallVector.x};
                math::normalize_inplace(wallNormal);

                if (math::dot(wallNormal, normVelocity) > 0) {
                    wallNormal *= -1.0f;
                }

                const float normalVelocityComponent = math::dot(agent_data.velocities[agentIndex], wallNormal);
                agent_data.velocities[agentIndex].x -= normalVelocityComponent * wallNormal.x * 1.45;
                agent_data.velocities[agentIndex].y -= normalVelocityComponent * wallNormal.y * 1.45;
                moveVector = agent_data.velocities[agentIndex] * deltaTime;
                agent_data.positions[agentIndex] += moveVector;
            } else {
                if (!g_wall_contact.empty() && g_wall_contact[agentIndex] == 1) {
                    g_wall_contact[agentIndex] = 0;
                }
                agent_data.positions[agentIndex] = endPoint;
            }
        }
    }
    
    int oldTri = agent_data.current_tris[agentIndex];
    int newTri = is_point_in_navmesh(agent_data.positions[agentIndex], agent_data.current_tris[agentIndex]);
    if (oldTri != newTri && newTri != -1) {
        if (newTri >= g_navmesh.walkable_triangle_count) {
            printf("WA agent %d changed to unwalkable triangle from %d to %d. Walkable limit: %d\n", agentIndex, oldTri, newTri, g_navmesh.walkable_triangle_count);
        }
    }
    if (newTri != -1) {
        agent_data.current_tris[agentIndex] = newTri;
        agent_data.last_valid_positions[agentIndex] = agent_data.positions[agentIndex];
        agent_data.last_valid_tris[agentIndex] = newTri;
    } else {
        agent_data.current_tris[agentIndex] = -1;
    }
}
