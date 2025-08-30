import { copy, distance_sq, distancePointToSegment, dot, Line, lineLineIntersection, normalize_, Point2, set_, subtract_ } from "../core/math";
import { ACBLACK, ACBLUE, ACEMERALD, ACINDIGO, ACMAGENTA, ACPINK, ACRED, ACYELLOW, sceneState } from "../drawing/SceneState";
import { Navmesh } from "../navmesh/Navmesh";
import { getTriangleFromPoint } from "../navmesh/NavUtils";
import { offsetCorner } from "../navmesh/pathCorners";
import { raycastCorridor, RaycastWithCorridorResult } from "../Raycasting";
import { Agent } from "./Agent";
import { NavConst } from "./NavConst";

const line1Direction: Point2 = { x: 0, y: 0 };
const line1: Line = { point: { x: 0, y: 0 }, direction: { x: 0, y: 0 } };
const line2: Line = { point: { x: 0, y: 0 }, direction: { x: 0, y: 0 } };

/**
 * Calculates the intersection point between two lines
 * LINE1: from lastVisiblePoint to nextCorner
 * LINE2: from agentPosition parallel to blockingEdge
 * 
 * @param lastVisiblePoint - Last point where the next corner was visible
 * @param nextCorner - The target corner we're trying to reach
 * @param agentPosition - Current agent position
 * @param blockingEdgeDir - Direction vector of the blocking edge (normalized)
 * @returns Intersection point or null if lines are parallel/don't intersect properly
 */
export function calculatePathPatchIntersection(
  lastVisiblePoint: Point2,
  nextCorner: Point2,
  agentPosition: Point2,
  blockingEdgeDir: Point2
): Point2 | null {
  set_(line1Direction, nextCorner);
  subtract_(line1Direction, lastVisiblePoint);
  normalize_(line1Direction);
  
  const dotProduct = Math.abs(dot(line1Direction, blockingEdgeDir));
  if (dotProduct > 0.8) {
    return null;
  }

  set_(line1.point, lastVisiblePoint);
  set_(line1.direction, line1Direction);
  
  set_(line2.point, agentPosition);
  set_(line2.direction, blockingEdgeDir);
  
  const intersection = lineLineIntersection(line1, line2);
  
  if (!intersection) {
    return null;
  }
  
  const distanceToOriginalCornerSq = distance_sq(agentPosition, nextCorner);
  const distanceToIntersectionSq = distance_sq(agentPosition, intersection);
  
  if (distanceToIntersectionSq > distanceToOriginalCornerSq * 2.25) {
    return null;
  }
  
  return intersection;
}

const blockingEdgeDirection: Point2 = { x: 0, y: 0 };

/**
 * Merges multiple triangle corridors with an agent's existing corridor.
 * Converts triangle corridors to polygon corridors and handles proper joining.
 * 
 * @param navmesh - The navigation mesh
 * @param triangleCorridors - Array of triangle corridors to merge (in order)
 * @param agentCorridor - The agent's existing corridor
 * @param joinTriangle - The triangle where the new path rejoins the original corridor
 * @returns New merged corridor
 */
// Mirrors the C++ merge_corridors in path_patching.cpp
// triangleCorridors must be ordered so that the first starts at the join polygon
export function mergeCorridors(
  navmesh: Navmesh,
  triangleCorridorFirst: number[],
  triangleCorridorSecond: number[],
  agentCorridor: number[],
  joinTriangle: number
): number[] {
  const polygonCorridor: number[] = [];
  
  // First corridor must begin at the join polygon; convert triangles to polys in reverse order
  for (let i = triangleCorridorFirst.length - 1; i >= 0; i--) {
    const poly = navmesh.triangle_to_polygon[triangleCorridorFirst[i]];
    if (polygonCorridor.length === 0 || polygonCorridor[polygonCorridor.length - 1] !== poly) {
      polygonCorridor.push(poly);
    }
  }
  // Followed by the second corridor continuing back toward the agent
  for (let i = triangleCorridorSecond.length - 1; i >= 0; i--) {
    const poly = navmesh.triangle_to_polygon[triangleCorridorSecond[i]];
    if (polygonCorridor.length === 0 || polygonCorridor[polygonCorridor.length - 1] !== poly) {
      polygonCorridor.push(poly);
    }
  }
  
  let originalCorridorJoinIndex = -1;
  const joinPoly = navmesh.triangle_to_polygon[joinTriangle];
  for (let i = agentCorridor.length - 1; i >= 0; i--) {
    if (agentCorridor[i] === joinPoly) {
      originalCorridorJoinIndex = i;
      break;
    }
  }


  const restOfCorridor = originalCorridorJoinIndex === -1 ? [] : agentCorridor.slice(0, originalCorridorJoinIndex);
  const newCorridor = [...restOfCorridor, ...polygonCorridor];

  return newCorridor;
}

/**
 * Internal function to attempt geometric path patching using a failed raycast result.
 * This function implements the geometric path correction logic:
 * 1. Use the blocking edge from the failed raycast
 * 2. Calculate intersection R of line from last visible point to corner and line through agent parallel to blocking edge
 * 3. Validate R is reachable and on navmesh
 * 4. Update agent's corners if successful
 * 
 * @param navmesh - The navigation mesh
 * @param agent - The agent whose path to patch
 * @param raycastResult - The failed raycast result containing the blocking edge
 * @returns true if path was successfully patched, false if full repath is needed
 */
export function attemptPathPatchInternal(
  navmesh: Navmesh,
  agent: Agent,
  raycastResult: RaycastWithCorridorResult
): boolean {  
  if (raycastResult.hitV1_idx === -1) {
    return false;
  }

  const hitV1_idx = raycastResult.hitV1_idx;
  const hitV2_idx = raycastResult.hitV2_idx;
  const hitP1 = { x: navmesh.vertices[hitV1_idx * 2], y: navmesh.vertices[hitV1_idx * 2 + 1] };
  const hitP2 = { x: navmesh.vertices[hitV2_idx * 2], y: navmesh.vertices[hitV2_idx * 2 + 1] };
  
  // sceneState.addDebugCircle(copy(hitP1), ACINDIGO);
  // sceneState.addDebugCircle(copy(hitP2), ACINDIGO);

  if (raycastResult.hitTri_idx !== -1) {
    const blobIdx = navmesh.triangle_to_polygon[raycastResult.hitTri_idx];
    
    if (blobIdx >= navmesh.walkable_polygon_count) {
      
      const dist1Sq = distancePointToSegment(hitP1, agent.lastVisiblePointForNextCorner, agent.nextCorner);
      const dist2Sq = distancePointToSegment(hitP2, agent.lastVisiblePointForNextCorner, agent.nextCorner);

      const cornerPoint = dist1Sq < dist2Sq ? hitP1 : hitP2;
      const cornerVIdx = dist1Sq < dist2Sq ? hitV1_idx : hitV2_idx;

      const offsetPoint = offsetCorner(navmesh, cornerPoint, cornerVIdx, blobIdx, NavConst.CORNER_OFFSET);

      if (offsetPoint) {
        // sceneState.addDebugX(copy(offsetPoint), ACPINK);
        // sceneState.addDebugLine(copy(cornerPoint), copy(offsetPoint), ACPINK);
        
        const offsetTri = getTriangleFromPoint(navmesh, offsetPoint);
        
        if (offsetTri !== -1) {
          // sceneState.addDebugLine(copy(agent.coordinate), copy(offsetPoint), ACEMERALD);
          const raycastToOffset = raycastCorridor(navmesh, agent.coordinate, offsetPoint, agent.currentTri, offsetTri);
          
          if (raycastToOffset.hitV1_idx === -1 && raycastToOffset.corridor) {
            
            if (agent.numValidCorners === 2) {
              // sceneState.addDebugLine(copy(offsetPoint), copy(agent.nextCorner2), ACYELLOW);
              const raycastToNextCorner2 = raycastCorridor(navmesh, offsetPoint, agent.nextCorner2, offsetTri, agent.nextCorner2Tri);
              
              if (raycastToNextCorner2.hitV1_idx === -1 && raycastToNextCorner2.corridor) {
                // Great: we can go offset -> nextCorner2; set nextCorner to offset and keep nextCorner2
                set_(agent.nextCorner, offsetPoint);
                agent.nextCornerTri = offsetTri;
                // numValidCorners remains 2
                
                agent.corridor = mergeCorridors(
                  navmesh,
                  raycastToNextCorner2.corridor,
                  raycastToOffset.corridor,
                  agent.corridor,
                  agent.nextCorner2Tri
                );
                
                return true;
              } else {
                // fallback to trying nextCorner first
                // sceneState.addDebugLine(copy(offsetPoint), copy(agent.nextCorner), ACEMERALD);
                const raycastToNextCorner = raycastCorridor(navmesh, offsetPoint, agent.nextCorner, offsetTri, agent.nextCornerTri);
                if (raycastToNextCorner.hitV1_idx === -1 && raycastToNextCorner.corridor) {
                  // Update corners: insert offset as nextCorner, keep nextCorner2 as is
                  set_(agent.nextCorner, offsetPoint);
                  agent.nextCornerTri = offsetTri;
                  // numValidCorners remains 2

                  agent.corridor = mergeCorridors(
                    navmesh,
                    raycastToNextCorner.corridor,
                    raycastToOffset.corridor,
                    agent.corridor,
                    agent.nextCorner2Tri 
                  );
                  return true;
                }
                // give up miter approach
              }
            } else {
              // Only one corner known: must be able to go offset -> nextCorner
              // sceneState.addDebugLine(copy(offsetPoint), copy(agent.nextCorner), ACEMERALD);
              const raycastToNextCorner = raycastCorridor(navmesh, offsetPoint, agent.nextCorner, offsetTri, agent.nextCornerTri);
              
              if (raycastToNextCorner.hitV1_idx === -1 && raycastToNextCorner.corridor) {
                
                set_(agent.nextCorner2, agent.nextCorner);
                agent.nextCorner2Tri = agent.nextCornerTri;
                
                set_(agent.nextCorner, offsetPoint);
                agent.nextCornerTri = offsetTri;
                
                agent.numValidCorners = 2;
                
                agent.corridor = mergeCorridors(
                  navmesh,
                  raycastToNextCorner.corridor,
                  raycastToOffset.corridor,
                  agent.corridor,
                  agent.nextCorner2Tri
                );
                
                return true;
              }
            }
          }
        }
      }
    }
  }

  // sceneState.addDebugLine(copy(agent.lastVisiblePointForNextCorner), copy(agent.nextCorner), ACBLUE);
  
  set_(blockingEdgeDirection, hitP2);
  subtract_(blockingEdgeDirection, hitP1);
  normalize_(blockingEdgeDirection);
  
  const intersectionR = calculatePathPatchIntersection(
    agent.lastVisiblePointForNextCorner,
    agent.nextCorner,
    agent.coordinate,
    blockingEdgeDirection
  );
  
  if (!intersectionR) {
    return false;
  }

  // sceneState.addDebugX(copy(intersectionR), ACMAGENTA);
  // sceneState.addDebugLine(copy(agent.coordinate), intersectionR, ACBLACK);

  const rTriangle = getTriangleFromPoint(navmesh, intersectionR);
  
  if (rTriangle === -1) {
    return false;
  }

  const raycastToR = raycastCorridor(navmesh, agent.coordinate, intersectionR, agent.currentTri, rTriangle);
  
  if (raycastToR.hitV1_idx !== -1) {
    return false;
  }
  
  const raycastToNextCorner = raycastCorridor(navmesh, intersectionR, agent.nextCorner, rTriangle, agent.nextCornerTri);

  if (raycastToNextCorner.hitV1_idx !== -1) {
    return false;
  }
  
  set_(agent.nextCorner2, agent.nextCorner);
  agent.nextCorner2Tri = agent.nextCornerTri;
  
  set_(agent.nextCorner, intersectionR);
  agent.nextCornerTri = rTriangle;

  agent.numValidCorners = 2;
  
  if (raycastToR.corridor && raycastToNextCorner.corridor) {
    // Order matters: start with the segment that begins at the join poly (old nextCorner)
    agent.corridor = mergeCorridors(
      navmesh,
      raycastToNextCorner.corridor,
      raycastToR.corridor,
      agent.corridor,
      agent.nextCorner2Tri
    );
  }
  
  return true;
}
