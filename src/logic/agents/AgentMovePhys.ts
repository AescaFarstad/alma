import { Agent, AgentState, STUCK_DANGER_2 } from "./Agent";
import { GameState } from "../GameState";
import { add, dot, length, length_sq, add_, set, scale_, set_, distance_sq, subtract_, normalize_, lerp, cvt } from "../core/math";
import { raycastPoint } from "../Raycasting";
import { findTriangle, isPointInNavmesh } from "../navmesh/NavUtils";
import { NavConst } from "./NavConst";


let desiredVelocity = { x: 0, y: 0 };
let moveVector = { x: 0, y: 0 };
let velocityDiff = { x: 0, y: 0 };
let directionToCorner = { x: 0, y: 0 };
let endPoint = { x: 0, y: 0 };
let normVelocity = { x: 0, y: 0 };
let endPointForRecast = { x: 0, y: 0 };
let wallVector = { x: 0, y: 0 };
let wallNormal = { x: 0, y: 0 };
let impulse = { x: 0, y: 0 };
let tempScaled = { x: 0, y: 0 };
let finalAccelDirection = { x: 0, y: 0 };
let corner1ToCorner2 = { x: 0, y: 0 };
let normCorner1ToCorner2 = { x: 0, y: 0 };
const MAX_SPEED = 999999;

export function updateAgentPhys(agent: Agent, deltaTime: number, gs: GameState): void {
    const navmesh = gs.navmesh;
    set_(agent.lastCoordinate, agent.coordinate);

    if (length_sq(agent.velocity) < 0.001) {
        agent.velocity.x = 0;
        agent.velocity.y = 0;
    }

    const resistanceFactor = 1 - agent.resistance;
    const frameRateAdjustedResistance = Math.pow(resistanceFactor, deltaTime);

    // Desired velocity
    let desiredMagnitude = 1;
    set_(directionToCorner, agent.nextCorner);
    subtract_(directionToCorner, agent.coordinate);
    let dstToCorner = length(directionToCorner);
    scale_(directionToCorner, dstToCorner > 0.01 ? 1 / dstToCorner : 0);
    set_(desiredVelocity, directionToCorner);
    if (agent.state === AgentState.Traveling || agent.state === AgentState.Escaping) {
        let slowDownStrength = 1 / 8 / agent.resistance / agent.resistance;
        slowDownStrength *= lerp(0.5, 2, agent.intelligence);
        let slowBeforeCornerDst = agent.maxSpeed * 0.25;
        let slowBeforeCornerSpeed = agent.maxSpeed;
        
        if (dstToCorner < slowBeforeCornerDst && agent.numValidCorners >= 2) {
            set_(corner1ToCorner2, agent.nextCorner2);
            subtract_(corner1ToCorner2, agent.nextCorner);
            normalize_(corner1ToCorner2);                
            set_(normVelocity, agent.velocity);
            normalize_(normVelocity);
            let turnAlignment = dot(normVelocity, corner1ToCorner2);
            turnAlignment = (turnAlignment + 1) * 0.5
            turnAlignment = turnAlignment * turnAlignment * turnAlignment;
            slowBeforeCornerDst *= lerp(1, 0, turnAlignment);
            slowBeforeCornerSpeed *= lerp(slowDownStrength, 1, turnAlignment);
        }
        
        if (dstToCorner > slowBeforeCornerDst)
            desiredMagnitude = agent.maxSpeed;
        else {
            const minSpeed = agent.numValidCorners == 1 ? agent.arrivalDesiredSpeed * agent.maxSpeed : slowBeforeCornerSpeed
            desiredMagnitude = lerp(minSpeed, agent.maxSpeed, dstToCorner / slowBeforeCornerDst);
            
        }
    }
    else {
        desiredMagnitude = 0;
    }
    desiredMagnitude /= frameRateAdjustedResistance;
    const stuckFactor = agent.stuckRating / STUCK_DANGER_2;
    desiredMagnitude *= cvt(stuckFactor * stuckFactor, 0, 1, 1, 0.5);
    scale_(desiredVelocity, desiredMagnitude);

    set_(agent.debug_desiredVelocity, desiredVelocity);
    
    // Dumb agents: accelerate toward desired velocity (A)
    // Smart agents: accelerate toward velocity difference (A - B)
    set_(velocityDiff, desiredVelocity);
    subtract_(velocityDiff, agent.velocity);
    set_(agent.debug_velocityDiff, velocityDiff);
    let effectiveInt = length_sq(desiredVelocity) > 0.1 ? agent.intelligence : 1;
    
    // Blend: (1-intelligence) * A + intelligence * (A-B)
    set_(finalAccelDirection, directionToCorner);
    let requiredAddition = desiredMagnitude - dot(agent.velocity, directionToCorner);
    scale_(finalAccelDirection, requiredAddition * (1 - effectiveInt));
    scale_(velocityDiff, effectiveInt);
    add_(finalAccelDirection, velocityDiff);
    
    const diffLn = length(finalAccelDirection);
    const accelThisFrame = Math.min(diffLn, agent.accel * deltaTime);
    scale_(finalAccelDirection, accelThisFrame / (diffLn > 0.001 ? diffLn : 1));
    
    if (deltaTime > 0.0001) {
        set_(agent.lastAppliedAccel, finalAccelDirection);
        scale_(agent.lastAppliedAccel, 1 / deltaTime);
    } else {
        set(agent.lastAppliedAccel, 0, 0);
    }

    add_(agent.velocity, finalAccelDirection);

    // Apply resistance
    agent.velocity.x *= frameRateAdjustedResistance;
    agent.velocity.y *= frameRateAdjustedResistance;

    set_(moveVector, agent.velocity);
    scale_(moveVector, deltaTime);
    const moveLnSq = length_sq(moveVector);

    // --- Escaping Movement: Beeline to last valid spot, no collision. ---
    if (agent.state === AgentState.Escaping) {
        const distanceToTargetSq = distance_sq(agent.nextCorner, agent.coordinate);
        
        // If the next move would overshoot the target, just snap to it.
        if (moveLnSq >= distanceToTargetSq) {
            set_(agent.coordinate, agent.lastValidPosition);
            set(agent.velocity, 0, 0);
            // agent.currentTri = agent.lastValidTri;
        } else {
            add_(agent.coordinate, moveVector);
        }
    } 
    // --- Standard Movement with Collision ---
    else {
        if (deltaTime > 0 && moveLnSq > 0.0001) {
            // Use temporary variables to avoid allocations
            set_(endPoint, agent.coordinate);
            add_(endPoint, moveVector);
            
            set_(normVelocity, agent.velocity);
            normalize_(normVelocity);
            
            set_(tempScaled, normVelocity);
            scale_(tempScaled, 0.45);
            set_(endPointForRecast, endPoint);
            add_(endPointForRecast, tempScaled);
            
            const raycastResult = raycastPoint(navmesh, agent.coordinate, endPointForRecast, agent.currentTri, undefined);

            if (raycastResult.hitP1 && raycastResult.hitP2) {
                if (!agent.wallContact) {
                    agent.wallContact = true;
                }
                agent.stuckRating += NavConst.STUCK_HIT_WALL;
                set_(wallVector, raycastResult.hitP2);
                subtract_(wallVector, raycastResult.hitP1);
                
                set(wallNormal, -wallVector.y, wallVector.x);
                normalize_(wallNormal);
                
                if (dot(wallNormal, normVelocity) > 0) {
                    scale_(wallNormal, -1);
                }

                const normalVelocityComponent = dot(agent.velocity, wallNormal);
                agent.velocity.x -= normalVelocityComponent * wallNormal.x * 1.45;
                agent.velocity.y -= normalVelocityComponent * wallNormal.y * 1.45;
                set_(moveVector, agent.velocity);
                scale_(moveVector, deltaTime);                
                add_(agent.coordinate, moveVector);
            } else {
                if (agent.wallContact) {
                    agent.wallContact = false;
                }
                set_(agent.coordinate, endPoint);
            }
        }
    }
    
    const oldTri = agent.currentTri;
    const newTriRaw = findTriangle(agent.coordinate, gs.navmesh, agent.currentTri);
    if (oldTri !== newTriRaw && newTriRaw !== -1) {
        if (newTriRaw >= gs.navmesh.walkable_triangle_count) {
            console.log(`TS agent ${agent.id} changed to unwalkable triangle from ${oldTri} to ${newTriRaw}. Walkable limit: ${gs.navmesh.walkable_triangle_count}`);
        }
    }
    const newTri = isPointInNavmesh(agent.coordinate, gs.navmesh, agent.currentTri);
    if (newTri !== -1) {
        agent.currentTri = newTri;
        set_(agent.lastValidPosition, agent.coordinate);
        agent.lastValidTri = newTri;
    } else {
        agent.currentTri = -1;
        
    }

    // // Occasional random impulse for testing path correction
    // if (agent.state !== AgentState.Escaping && Math.random() < 0.05) {
    //     set(impulse, (Math.random() - 0.5) * 130, (Math.random() - 0.5) * 130);
    //     add_(agent.velocity, impulse);
    // }
} 