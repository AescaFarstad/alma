import { Agent, AgentState } from './Agent';
import { GameState } from './GameState';
import { Navmesh } from './navmesh/Navmesh';
import { findCorridor, findNextCorner, DualCorner } from './navmesh/pathfinding';
import { Point2, distance_sq, length_sq, set_, subtract_, normalize_, dot, cross, copy, set } from './core/math';
import { raycast } from './Raycasting';

const CORNER_OFFSET = 2.2;
const CORNER_OFFSET_SQ = CORNER_OFFSET * CORNER_OFFSET;

// Reusable objects to avoid allocations
const reusableDualCorner: DualCorner = {
    corner1: { x: 0, y: 0 },
    poly1: -1,
    corner2: { x: 0, y: 0 },
    poly2: -1,
    numValid: 0
};

// Temporary vectors for demarkation line crossing calculations
const tempLineVec: Point2 = { x: 0, y: 0 };
const tempCurrentVec: Point2 = { x: 0, y: 0 };
const tempLastVec: Point2 = { x: 0, y: 0 };


function getTriangleCenter(navmesh: Navmesh, triIndex: number): Point2 {
    if (triIndex < 0 || triIndex * 2 + 1 >= navmesh.centroids.length) {
        console.error("Invalid triIndex for getTriangleCenter:", triIndex);
        return { x: 0, y: 0 };
    }
    const centroidIndex = triIndex * 2;
    const x = navmesh.centroids[centroidIndex];
    const y = navmesh.centroids[centroidIndex + 1];

    if (isNaN(x) || isNaN(y)) {
        console.error(`Navmesh centroid is NaN for triangle index: ${triIndex}.`, {x, y});
        return { x: 0, y: 0 };
    }

    return { x: x, y: y };
}

export function findPathToDestination(
    navmesh: Navmesh, 
    gs: GameState, 
    agent: Agent, 
    startPoly: number, 
    endPoly: number, 
    errorContext: string
): boolean {
    const corridor = findCorridor(navmesh, agent.coordinate, agent.endTarget, startPoly, endPoly);
    agent.corridor = corridor ?? [];

    if (agent.corridor.length > 0) {
        findNextCorner(navmesh, gs, agent.corridor, agent.coordinate, agent.endTarget, CORNER_OFFSET, reusableDualCorner);
        if (reusableDualCorner.numValid > 0) {
            set_(agent.nextCorner, reusableDualCorner.corner1);
            set_(agent.nextCorner2, reusableDualCorner.corner2);
            agent.nextCornerPoly = reusableDualCorner.poly1;
            agent.nextCorner2Poly = reusableDualCorner.poly2;
            agent.numValidCorners = reusableDualCorner.numValid;
            agent.pathFrustration = 0;
            
            return true;
        } else {
            console.error(`Pathfinding failed to find a corner ${errorContext}.`, { agent });
            return false;
        }
    } else {
        console.error(`Pathfinding failed to find a corridor ${errorContext}.`, { agent });
        return false;
    }
}


export function updateAgentNavigation(agent: Agent, gs: GameState, deltaTime: number): void {
    const navmesh = gs.navmesh;

    // State: Standing - Pick a new destination and find a path.
    if (agent.state === AgentState.Standing) {
        if (agent.currentPoly === -1) return;

        const endNode = navmesh.triIndex.getRandomTriangle(navmesh);
        
        if (endNode !== -1) {
            agent.endTarget = getTriangleCenter(navmesh, endNode);
            agent.endTargetPoly = endNode;
            if (findPathToDestination(navmesh, gs, agent, agent.currentPoly, endNode, "from start")) {
                agent.state = AgentState.Traveling;
            }
        }
    }

    // State: Traveling - Follow the path, check for deviations.
    else if (agent.state === AgentState.Traveling) {

        // Check 1: Have we fallen off the navmesh?
        if (agent.currentPoly === -1) {
            agent.state = AgentState.Escaping;
            

            set_(agent.preEscapeCorner, agent.nextCorner);
            agent.preEscapeCornerPoly = agent.nextCornerPoly;
            
            set_(agent.nextCorner, agent.lastValidPosition);
            agent.nextCornerPoly = agent.lastValidPoly;
            
            return;
        }

        // Check 2: Are we still on the planned path?
        let currentCorridorPolyIndex = -1;
        const maxCheck = Math.min(5, agent.corridor.length);
        for (let i = 0; i < maxCheck; i++) {
            if (agent.corridor[i] === agent.currentPoly) {
                currentCorridorPolyIndex = i;
                break;
            }
        }
        if (currentCorridorPolyIndex === -1) {
             agent.pathFrustration++;
             if (agent.pathFrustration > agent.maxFrustration) {
                // Path is too messed up, re-path to the original destination
                agent.pathFrustration = 0;
                if (findPathToDestination(navmesh, gs, agent, agent.currentPoly, agent.endTargetPoly, "after path recovery")) {
                    // Path recovery successful
                } else {
                    // This can happen if the destination is very close.
                    // Verify with raycast that we have a clear line of sight to the destination
                    const raycastResult = raycast(navmesh, agent.coordinate, agent.endTarget, agent.currentPoly);
                    if (!raycastResult.hit) {
                        set_(agent.nextCorner, agent.endTarget);
                        agent.nextCornerPoly = agent.endTargetPoly;
                    } else {
                        console.error("Pathfinding failed to recover the path.", { agent });
                    }
                }
             }
        } else {
            agent.pathFrustration = 0;
            if (currentCorridorPolyIndex > 0) {
                agent.corridor = agent.corridor.slice(currentCorridorPolyIndex);
            }
        }
        
        // Check 3: Have we reached the next corner?
        const distanceToCornerSq = distance_sq(agent.coordinate, agent.nextCorner);
        
        // Check if we've crossed the demarkation line nextCorner2->nextCorner
        let crossedDemarkationLine = false;
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
            
            // Cross products
            const currentCross = cross(tempLineVec, tempCurrentVec);
            const lastCross = cross(tempLineVec, tempLastVec);
            
            // If signs are different, we've crossed the line
            crossedDemarkationLine = currentCross * lastCross <= 0;
        }
        
        if (agent.numValidCorners == 2 && (distanceToCornerSq < CORNER_OFFSET_SQ || crossedDemarkationLine)) {
             findNextCorner(navmesh, gs, agent.corridor, agent.coordinate, agent.endTarget, CORNER_OFFSET, reusableDualCorner);
            if (reusableDualCorner.numValid > 0) {
                set_(agent.nextCorner, reusableDualCorner.corner1);
                set_(agent.nextCorner2, reusableDualCorner.corner2);
                agent.nextCornerPoly = reusableDualCorner.poly1;
                agent.nextCorner2Poly = reusableDualCorner.poly2;
                agent.numValidCorners = reusableDualCorner.numValid;
                
            }
        }
        if (agent.numValidCorners == 1 && distance_sq(agent.coordinate, agent.nextCorner) < 0.01 && length_sq(agent.velocity) < 0.01) {
            console.error("STUCK AGENT DETECTED!", {
                position: copy(agent.coordinate),
                nextCorner: copy(agent.nextCorner),
                endTarget: copy(agent.endTarget),
                corridor: agent.corridor,
            });
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
        if (agent.currentPoly !== -1) {
            // We're back on the navmesh! Re-path to our original destination.
            agent.state = AgentState.Traveling;

            if (agent.preEscapeCornerPoly !== -1) {

                
                const raycastResult = raycast(navmesh, agent.coordinate, agent.preEscapeCorner, agent.currentPoly);
                if (!raycastResult.hit) {

                    
                    set_(agent.nextCorner, agent.preEscapeCorner);
                    agent.nextCornerPoly = agent.preEscapeCornerPoly;
                    set(agent.preEscapeCorner, 0, 0); // Clear preEscapeCorner by value
                    agent.preEscapeCornerPoly = -1;
                    
                    return;
                } else {
                }
            }
            
            if (agent.endTargetPoly !== -1) {
                if (findPathToDestination(navmesh, gs, agent, agent.currentPoly, agent.endTargetPoly, "after escaping")) {
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
            set_(agent.look, agent.nextCorner);
            subtract_(agent.look, agent.coordinate);
            normalize_(agent.look);
        }
    }
} 