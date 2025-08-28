import { Agent, AgentState, STUCK_DANGER_1, STUCK_DANGER_2, STUCK_DANGER_3 } from './Agent';
import { GameState } from '../GameState';
import { Navmesh } from '../navmesh/Navmesh';
import { DualCorner, findNextCorner } from '../navmesh/pathCorners';
import { Point2, distance_sq, length_sq, set_, subtract_, normalize_, length, dot, cross, copy, set } from '../core/math';
import { resetAgentStuck } from './AgentStatistic';
import { NavConst } from './NavConst';
import { findPathToDestination, raycastAndPatchCorridor } from './AgentNavUtils';
import { advanceSeed } from '../core/mathUtils';
import { getRandomTriangleInArea } from '../navmesh/NavUtils';
import { ACBLACK, sceneState } from '../drawing/SceneState';



// Reusable objects to avoid allocations
const reusableDualCorner: DualCorner = {
    corner1: { x: 0, y: 0 },
    tri1: -1,
    vIdx1: -1,
    corner2: { x: 0, y: 0 },
    tri2: -1,
    vIdx2: -1,
    numValid: 0
};

// Temporary vectors for demarkation line crossing calculations
const tempLineVec: Point2 = { x: 0, y: 0 };
const tempCurrentVec: Point2 = { x: 0, y: 0 };
const tempLastVec: Point2 = { x: 0, y: 0 };

export function updateAgentNavigation(agent: Agent, gs: GameState, deltaTime: number): void {
    const navmesh = gs.navmesh;
    
    // State: Standing - Pick a new destination and find a path.
    if (agent.state === AgentState.Standing || agent.predicamentRating > 7) {
        if (agent.predicamentRating > 7)
            console.error("Predicament rating is too high, resetting. ", copy(agent.coordinate), "corner:", copy(agent.nextCorner));
        if (agent.currentTri === -1)
            return;

        
        const endNode = getRandomTriangleInArea(navmesh, 0, 0, 30, gs.rngSeed);
        gs.rngSeed = advanceSeed(gs.rngSeed);
        
        agent.endTarget = { x: navmesh.triangle_centroids[endNode * 2], y: navmesh.triangle_centroids[endNode * 2 + 1] }
        agent.endTargetTri = endNode;
        agent.predicamentRating = 0;
        agent.corridor.length = 0;
        
        if (findPathToDestination(navmesh, agent, agent.currentTri, endNode, "from start")) {
            agent.state = AgentState.Traveling;
        }
    }

    // State: Traveling - Follow the path, check for deviations.
    else if (agent.state === AgentState.Traveling) {

        // Check 1: Have we fallen off the navmesh?
        if (agent.currentTri === -1) {
            agent.state = AgentState.Escaping;
            

            set_(agent.preEscapeCorner, agent.nextCorner);
            agent.preEscapeCornerTri = agent.nextCornerTri;
            
            set_(agent.nextCorner, agent.lastValidPosition);
            agent.nextCornerTri = agent.lastValidTri;
            
            return;
        }

        if (agent.stuckRating > STUCK_DANGER_1) {
            let needFullRepath = false;
            if (agent.sightRating < 1) {
                agent.sightRating++;
                
                if (raycastAndPatchCorridor(navmesh, agent, agent.nextCorner, agent.nextCornerTri)) {
                    agent.stuckRating = 0;
                }
                else {
                    needFullRepath = true;
                }
            }
            else if (agent.stuckRating > STUCK_DANGER_2)
                needFullRepath = agent.stuckRating > STUCK_DANGER_3 || length_sq(agent.velocity) < agent.maxSpeed * agent.maxSpeed * 0.0025;

            if (needFullRepath) {

                agent.predicamentRating++;

                if (!findPathToDestination(navmesh, agent, agent.currentTri, agent.endTargetTri, "from stuck")) {
                    console.error("Pathfinding failed to find a corner after getting stuck.", agent);
                }
                resetAgentStuck(agent);
            }
        }

        // Check 2: Are we still on the planned path?
        const currentPoly = navmesh.triangle_to_polygon[agent.currentTri];
        if (agent.alienPoly != currentPoly){
            let currentCorridorPolyIndex = -1;
            const maxCheck = Math.min(NavConst.CORRIDOR_EXPECTED_JUMP, agent.corridor.length);
            for (let i = 0; i < maxCheck; i++) {
                if (agent.corridor[i] === currentPoly) {
                    currentCorridorPolyIndex = i;
                    break;
                }
            }
            if (currentCorridorPolyIndex === -1) {
                agent.pathFrustration++;
                if (agent.pathFrustration > agent.maxFrustration) {
                    // Path is too messed up, re-path to the original destination
                    agent.pathFrustration = 0;
                    if (findPathToDestination(navmesh, agent, agent.currentTri, agent.endTargetTri, "after path recovery")) {
                    } else {
                        // This can happen if the destination is very close.
                        // Verify with raycast that we have a clear line of sight to the destination
                        if (raycastAndPatchCorridor(navmesh, agent, agent.endTarget, agent.endTargetTri)) {
                            set_(agent.nextCorner, agent.endTarget);
                            agent.nextCornerTri = agent.endTargetTri;
                            agent.numValidCorners = 1;
                        } else {
                            console.error("Pathfinding failed to recover the path.", { agent });
                        }
                    }
                }
                else {
                    agent.alienPoly = currentPoly;
                }
            } else {
                agent.alienPoly = -1;
                if (currentCorridorPolyIndex > 0) {
                    agent.pathFrustration = 0;
                    agent.corridor = agent.corridor.slice(currentCorridorPolyIndex);
                }
            }
        }
        
        // Check 3: Have we reached the next corner?
        const distanceToCornerSq = distance_sq(agent.coordinate, agent.nextCorner);
        
        // Check if we've crossed the demarkation line nextCorner2->nextCorner
        let crossedDemarkationLine = false;
        let currentCross = 0;
        let lastCross = 0;
        if (agent.numValidCorners > 1) {
            // Line vector from nextCorner2 to nextCorner
            set_(tempLineVec, agent.nextCorner);
            subtract_(tempLineVec, agent.nextCorner2);
            
            // Vector from nextCorner2 to current position
            set_(tempCurrentVec, agent.coordinate);
            subtract_(tempCurrentVec, agent.nextCorner2);
            
            // Vector from nextCorner2 to last position
            set_(tempLastVec, agent.lastCoordinate);
            subtract_(tempLastVec, agent.nextCorner2);
            

            currentCross = cross(tempLineVec, tempCurrentVec);
            lastCross = cross(tempLineVec, tempLastVec);
            
            // If signs are different, we've crossed the line
            crossedDemarkationLine = currentCross * lastCross <= 0;
        }

        // --- Update corner logic ---
        if (agent.numValidCorners == 2 && (distanceToCornerSq < NavConst.CORNER_OFFSET_SQ || crossedDemarkationLine)) {
            set_(agent.lastVisiblePointForNextCorner, agent.nextCorner);
            findNextCorner(navmesh, agent.corridor, agent.coordinate, agent.endTarget, NavConst.CORNER_OFFSET, reusableDualCorner);
            if (reusableDualCorner.numValid > 0) {
                set_(agent.nextCorner, reusableDualCorner.corner1);
                set_(agent.nextCorner2, reusableDualCorner.corner2);
                agent.nextCornerTri = reusableDualCorner.tri1;
                agent.nextCorner2Tri = reusableDualCorner.tri2;
                agent.numValidCorners = reusableDualCorner.numValid;

                
            }
        }
        
        if (agent.numValidCorners == 1 && distance_sq(agent.coordinate, agent.endTarget) < agent.arrivalThresholdSq) {
            agent.state = AgentState.Standing;
            agent.corridor = [];
        }
        else if (agent.numValidCorners == 0)
            console.error("Pathfinding failed to find a corner after the current one.", { agent });
    }

    // State: Escaping - Trying to get back to the navmesh.
    else if (agent.state === AgentState.Escaping) {
        if (agent.currentTri !== -1) {
            // We're back on the navmesh! Re-path to our original destination.
            agent.state = AgentState.Traveling;
            

            if (agent.preEscapeCornerTri !== -1) {
                if (raycastAndPatchCorridor(navmesh, agent, agent.preEscapeCorner, agent.preEscapeCornerTri)) {
                    set_(agent.nextCorner, agent.preEscapeCorner);
                    agent.nextCornerTri = agent.preEscapeCornerTri;
                    set(agent.preEscapeCorner, 0, 0); // Clear preEscapeCorner by value
                    agent.preEscapeCornerTri = -1;
                    
                    return;
                }
            }
            
            if (agent.endTargetTri !== -1) {
                if (findPathToDestination(navmesh, agent, agent.currentTri, agent.endTargetTri, "after escaping")) {
                    agent.state = AgentState.Traveling;
                } else {
                    console.error("Pathfinding failed to find a corner after escaping.", { agent });
                }
            } else {
                console.error("Original end target is not on navmesh after escaping.", { agent });
            }
        }
    }
    
    if (agent.state === AgentState.Traveling || agent.state === AgentState.Escaping) {
        if (distance_sq(agent.nextCorner, agent.coordinate) > 0.01) {
            // Rotate look toward the desired direction with angular speed limit
            const targetDir = { x: agent.nextCorner.x - agent.coordinate.x, y: agent.nextCorner.y - agent.coordinate.y };
            normalize_(targetDir);
            normalize_(agent.look);
            const dotVT = dot(agent.look, targetDir);
            const clampedDot = Math.max(-1, Math.min(1, dotVT));
            const crossVT = agent.look.x * targetDir.y - agent.look.y * targetDir.x;
            const angleToTarget = Math.atan2(crossVT, clampedDot);
            const maxStep = agent.lookSpeed * deltaTime;
            const step = angleToTarget > maxStep ? maxStep : (angleToTarget < -maxStep ? -maxStep : angleToTarget);
            const s = Math.sin(step);
            const c = Math.cos(step);
            const newX = c * agent.look.x - s * agent.look.y;
            const newY = s * agent.look.x + c * agent.look.y;
            set(agent.look, newX, newY);
        }
    }
} 