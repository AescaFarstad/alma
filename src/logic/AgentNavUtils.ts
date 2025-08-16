import { Agent, AgentState, STUCK_DANGER_1, STUCK_DANGER_2, STUCK_DANGER_3 } from './Agent';
import { GameState } from './GameState';
import { Navmesh } from './navmesh/Navmesh';
import { findCorridor } from './navmesh/pathCorridor';
import { findCorridorByEdge } from './navmesh/pathCorridorByEdge';
import { findNextCorner, DualCorner, findCorners } from './navmesh/pathCorners';
import { Point2, distance_sq, length_sq, set_, subtract_, normalize_, length, dot, cross, copy, set, distance } from './core/math';
import { raycastCorridor } from './Raycasting';
import { sceneState, ACYELLOW, ACINDIGO, ACRED } from './drawing/SceneState';

export const CORNER_OFFSET = 2.2;
export const CORNER_OFFSET_SQ = CORNER_OFFSET * CORNER_OFFSET;

// Reusable objects to avoid allocations
const reusableDualCorner: DualCorner = {
    corner1: { x: 0, y: 0 },
    tri1: -1,
    corner2: { x: 0, y: 0 },
    tri2: -1,
    numValid: 0
};

export function findPathToDestination(
    navmesh: Navmesh, 
    gs: GameState, 
    agent: Agent, 
    startTri: number, 
    endTri: number, 
    errorContext: string
): boolean {
    const corridorResult = findCorridor(navmesh, agent.coordinate, agent.endTarget, startTri, endTri);
    agent.corridor = corridorResult ?? [];

    if (agent.corridor.length > 0) {
        findNextCorner(navmesh, gs, agent.corridor, agent.coordinate, agent.endTarget, CORNER_OFFSET, reusableDualCorner);
        if (reusableDualCorner.numValid > 0) {
            set_(agent.nextCorner, reusableDualCorner.corner1);
            set_(agent.nextCorner2, reusableDualCorner.corner2);
            agent.nextCornerTri = reusableDualCorner.tri1;
            agent.nextCorner2Tri = reusableDualCorner.tri2;
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

/**
 * Performs raycast and patches the agent's corridor if successful.
 * If raycast succeeds (clear line of sight), replaces corridor segments up to the target triangle
 * with the more direct raycast corridor.
 * 
 * @param navmesh - The navigation mesh
 * @param agent - The agent whose corridor to patch
 * @param targetPoint - The target point to raycast to
 * @param targetTri - The triangle containing the target point
 * @returns true if raycast succeeded and corridor was patched, false otherwise
 */
export function raycastAndPatchCorridor(
    navmesh: Navmesh,
    agent: Agent,
    targetPoint: Point2,
    targetTri: number
): boolean {
    const raycastResult = raycastCorridor(navmesh, agent.coordinate, targetPoint, agent.currentTri, targetTri);
    
    if (!raycastResult.hitP1 && !raycastResult.hitP2 && raycastResult.corridor) {
        // Raycast succeeded - we have a clear line of sight
        // Find where the target triangle appears in the current corridor
        let targetTriIndex = -1;
        for (let i = 0; i < agent.corridor.length; i++) {
            if (agent.corridor[i] === targetTri) {
                targetTriIndex = i;
                break;
            }
        }
        
        if (targetTriIndex !== -1) {
            // Replace corridor up to target triangle with raycast corridor
            // Keep the rest of the corridor after target triangle
            agent.corridor = [
                ...raycastResult.corridor,
                ...agent.corridor.slice(targetTriIndex + 1)
            ];
            return true;
        }
    }
    
    return false;
}



// Helper function to calculate path length from corners
function calculatePathLength(corners: Point2[]): number {
    if (corners.length < 2) return 0;
    
    let totalLength = 0;
    for (let i = 0; i < corners.length - 1; i++) {
        totalLength += distance(corners[i], corners[i + 1]);
    }
    return totalLength;
}

// Helper function to draw a path with a specific color
function drawPath(corners: Point2[], color: string, label: string): void {
    if (corners.length === 0) return;
    
    // Draw first point
    sceneState.addDebugPoint(corners[0], color);
    
    // Draw lines between corners
    for (let i = 1; i < corners.length; i++) {
        sceneState.addDebugLine(corners[i - 1], corners[i], color);
        sceneState.addDebugPoint(corners[i], color);
    }
}

/**
 * Debug function to visualize and analyze a single path corridor
 * @param navmesh - The navigation mesh
 * @param corridor - Array of triangle indices representing the corridor
 * @param startPoint - Starting point of the path
 * @param endPoint - End point of the path
 * @param color - Color to draw the path in
 * @param label - Label for logging
 * @returns Debug information about the path
 */
export function debugPath(
    navmesh: Navmesh,
    corridor: number[],
    startPoint: Point2,
    endPoint: Point2,
    color: string,
    label: string
): { corners: number; length: number; triangles: number } {
    if (corridor.length === 0) {
        console.log(`${label}: Empty corridor`);
        return { corners: 0, length: 0, triangles: 0 };
    }

    try {
        const corners = findCorners(navmesh, corridor, startPoint, endPoint);
        const cornerPoints = corners.map(c => c.point);
        const pathLength = calculatePathLength(cornerPoints);
        
        // Draw the path
        drawPath(cornerPoints, color, label);
        
        // Log debug info
        console.log(`${label}: ${corners.length} corners, ${pathLength.toFixed(2)}m, ${corridor.length} triangles`);
        
        return {
            corners: corners.length,
            length: pathLength,
            triangles: corridor.length
        };
    } catch (error) {
        console.error(`Error debugging path for ${label}:`, error);
        return { corners: 0, length: 0, triangles: corridor.length };
    }
}