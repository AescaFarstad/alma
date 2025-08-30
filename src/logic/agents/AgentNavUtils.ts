import { Agent } from './Agent';
import { GameState } from '../GameState';
import { Navmesh } from '../navmesh/Navmesh';
import { findCorridor } from '../navmesh/pathCorridor';
import { findNextCorner, DualCorner, findCorners } from '../navmesh/pathCorners';
import { Point2, set_,  distance } from '../core/math';
import { raycastCorridor, RaycastWithCorridorResult } from '../Raycasting';
import { getTriangleFromPoint } from '../navmesh/NavUtils';
import { sceneState } from '../drawing/SceneState';
import { NavConst } from './NavConst';
import { attemptPathPatchInternal } from './PathPatching';


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

export function findPathToDestination(
  navmesh: Navmesh,
  agent: Agent, 
  startTri: number, 
  endTri: number, 
  errorContext: string
): boolean {
  const startPoly = navmesh.triangle_to_polygon[startTri];
  const endPoly = navmesh.triangle_to_polygon[endTri];
  const corridorResult = findCorridor(navmesh, NavConst.PATH_FREE_WIDTH, NavConst.PATH_WIDTH_PENALTY_MULT, agent.coordinate, agent.endTarget, startPoly, endPoly);
  agent.corridor = corridorResult ?? [];

  if (agent.corridor.length > 0) {
    findNextCorner(navmesh, agent.corridor, agent.coordinate, agent.endTarget, NavConst.CORNER_OFFSET, reusableDualCorner);
    if (reusableDualCorner.numValid > 0) {
      set_(agent.nextCorner, reusableDualCorner.corner1);
      set_(agent.nextCorner2, reusableDualCorner.corner2);
      agent.nextCornerTri = reusableDualCorner.tri1;
      agent.nextCorner2Tri = reusableDualCorner.tri2;
      agent.numValidCorners = reusableDualCorner.numValid;
      agent.pathFrustration = 0;
      
      agent.lastVisiblePointForNextCorner.x = agent.coordinate.x;
      agent.lastVisiblePointForNextCorner.y = agent.coordinate.y;
      
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
 * with the more direct raycast corridor and updates the last visible point.
 * If raycast fails, attempts geometric path patching before giving up.
 * 
 * @param navmesh - The navigation mesh
 * @param agent - The agent whose corridor to patch
 * @param targetPoint - The target point to raycast to
 * @param targetTri - The triangle containing the target point
 * @returns true if raycast succeeded, corridor was patched, or path was geometrically patched; false otherwise
 */
export function raycastAndPatchCorridor(
  navmesh: Navmesh,
  agent: Agent,
  targetPoint: Point2,
  targetTri: number
): boolean {
  const raycastResult = raycastCorridor(navmesh, agent.coordinate, targetPoint, agent.currentTri, targetTri);
  
  if (raycastResult.hitV1_idx === -1 && raycastResult.corridor) {
    agent.lastVisiblePointForNextCorner.x = agent.coordinate.x;
    agent.lastVisiblePointForNextCorner.y = agent.coordinate.y;
    
    // Convert triangle corridor from raycast to a polygon corridor
    const raycastPolyCorridor: number[] = [];
    if (raycastResult.corridor.length > 0) {
      for (let i = raycastResult.corridor.length - 1; i >= 0; i--) {
        const poly = navmesh.triangle_to_polygon[raycastResult.corridor[i]];
        if (raycastPolyCorridor.length === 0 || raycastPolyCorridor[raycastPolyCorridor.length - 1] !== poly) {
          raycastPolyCorridor.push(poly);
        }
      }
    }
    
    // Find where the target polygon appears in the current corridor
    const targetPoly = navmesh.triangle_to_polygon[targetTri];
    let targetPolyIndex = -1;
    for (let i = agent.corridor.length - 1; i >= 0; i--) {
      if (agent.corridor[i] === targetPoly) {
        targetPolyIndex = i;
        break;
      }
    }
    
    if (targetPolyIndex !== -1) {
      agent.corridor = [
        ...agent.corridor.slice(0, targetPolyIndex),
        ...raycastPolyCorridor
      ];
      return true;
    } else if (raycastPolyCorridor.length > 0) {
      // If the target isn't in our current path but we can see it, take the direct route.
      agent.corridor = raycastPolyCorridor;
      return true;
    }
  } else {
    return attemptPathPatchInternal(navmesh, agent, raycastResult);
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
): { corners: number; length: number; polygons: number } {
  if (corridor.length === 0) {
    return { corners: 0, length: 0, polygons: 0 };
  }

  try {
    const corners = findCorners(navmesh, corridor, startPoint, endPoint);
    const cornerPoints = corners.map(c => c.point);
    const pathLength = calculatePathLength(cornerPoints);
    
    // Draw the path
    drawPath(cornerPoints, color, label);
    
    return {
      corners: corners.length,
      length: pathLength,
      polygons: corridor.length
    };
  } catch (error) {
    console.error(`Error debugging path for ${label}:`, error);
    return { corners: 0, length: 0, polygons: corridor.length };
  }
}
