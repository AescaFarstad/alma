import { Navmesh } from "./Navmesh";
import { distance, distance_sq, dot, normalize_, Point2, set } from "../core/math";
import { getPolygonFromPoint, testPointInsidePolygon } from "./NavUtils";
import { GameState } from "../GameState";
import { PriorityQueue } from "./priorityQueue";
import { sceneState, ACRED, ACBLUE } from "../drawing/SceneState";
import { findCorners } from "./pathCorners";

const sharedpQueue = new PriorityQueue();


let v = Point2(0, 0);
let startToEnd = Point2(0, 0);

export function findCorridor(
  navmesh: Navmesh,
  FREE_WIDTH :number,
  STRAY_MULT: number,
  startPoint: Point2, 
  endPoint: Point2, 
  startPolyHint?: number, 
  endPolyHint?: number
): number[] | null {
  const startPoly = startPolyHint !== undefined ? startPolyHint : getPolygonFromPoint(navmesh, startPoint);
  const endPoly = endPolyHint !== undefined ? endPolyHint : getPolygonFromPoint(navmesh, endPoint);

  if (startPoly === -1 || endPoly === -1) {
    console.error(`findCorridor: FAILED - invalid polygons`);
    return null;
  }

  if (startPoly === endPoly) {
    return [startPoly];
  }
  
  set(startToEnd, endPoint.x - startPoint.x, endPoint.y - startPoint.y);
  const lineDistDenomSq = distance_sq(startPoint, endPoint);
  const lineDistDenom = Math.sqrt(lineDistDenomSq) + 1;
  const effectiveCMult = lineDistDenom > FREE_WIDTH * 3 ? STRAY_MULT : 0;
  const end_x = navmesh.poly_centroids[endPoly * 2];
  const end_y = navmesh.poly_centroids[endPoly * 2 + 1];
  
  const pQueue = sharedpQueue;
  pQueue.clear();
  const cameFrom = new Map<number, number>();
  const gScore = new Map<number, number>();
  // const fScore = new Map<number, number>();

  const startScore = distance(startPoint, endPoint);
  pQueue.enqueue(startPoly, startScore);
  gScore.set(startPoly, 0);

  let iterations = 0;
  while (!pQueue.isEmpty()) {
    iterations++;
    if (iterations > 100000) {
      console.error(`findCorridor: FAILED - iteration limit reached`);
      return null;
    }
    const current = pQueue.dequeue();

    // const polygonVertices: Point2[] = [];
    // const polyVertsStart = navmesh.polygons[current];
    // const polyVertsEnd = navmesh.polygons[current + 1];
    // for (let i = polyVertsStart; i < polyVertsEnd; i++) {
    //   const vertIndex = navmesh.poly_verts[i];
    //   polygonVertices.push({
    //     x: navmesh.vertices[vertIndex * 2],
    //     y: navmesh.vertices[vertIndex * 2 + 1],
    //   });
    // }
    // sceneState.addDebugArea(polygonVertices, ACRED);

    if (current === endPoly) {
      const path: number[] = [current];
      let temp = current;
      while (cameFrom.has(temp)) {
        temp = cameFrom.get(temp)!;
        path.push(temp);
      }
      

      // const corridorLength = calculateCorridorLength(navmesh, path, startPoint, endPoint);
      // const corners = findCorners(navmesh, path, startPoint, endPoint);
      // const cornerPoints = corners.map(c => c.point);
      // const pathLength = calculatePathLength(cornerPoints);
      // sceneState.addCorridor(`pathfinding_${Date.now()}`, path, startPoint, endPoint);
      // sceneState.addPath(`path_${Date.now()}`, cornerPoints, startPoint, endPoint);      
      // // Draw corridor as areas
      // for (const polyIdx of path) {
      //   const polyVertStart = navmesh.polygons[polyIdx];
      //   const polyVertEnd = navmesh.polygons[polyIdx + 1];
      //   const polygonVertices: Point2[] = [];
      //   for (let i = polyVertStart; i < polyVertEnd; i++) {
      //     const vertIndex = navmesh.poly_verts[i];
      //     polygonVertices.push({
      //       x: navmesh.vertices[vertIndex * 2],
      //       y: navmesh.vertices[vertIndex * 2 + 1],
      //     });
      //   }
      //   sceneState.addDebugArea(polygonVertices, ACBLUE);
      // }      
      // // Draw actual path
      // for (let i = 0; i < cornerPoints.length - 1; i++) {
      //   sceneState.addDebugLine(cornerPoints[i], cornerPoints[i + 1], ACBLUE);
      // }

      // // Draw fScore
      // for (const [poly, f] of fScore) {
      //   sceneState.addDebugText(Point2(navmesh.poly_centroids[poly * 2], navmesh.poly_centroids[poly * 2 + 1]), `${f?.toFixed(0)}`, ACBLUE);
      // }
      
      return path;
    }
    const polyVertStart = navmesh.polygons[current];
    const polyVertEnd = navmesh.polygons[current + 1];
    const polyVertCount = polyVertEnd - polyVertStart;

    const myScore = gScore.get(current)!;
    for (let i = 0; i < polyVertCount; i++) {
      const neighbor = navmesh.poly_neighbors[polyVertStart + i];
      if (neighbor >= navmesh.walkable_polygon_count) {
        continue;
      }
      const p0_x = navmesh.poly_centroids[neighbor * 2];
      const p0_y = navmesh.poly_centroids[neighbor * 2 + 1];

      const costDx = navmesh.poly_centroids[current * 2] - p0_x;
      const costDy = navmesh.poly_centroids[current * 2 + 1] - p0_y;
      const travelCost = Math.sqrt(costDx * costDx + costDy * costDy);
      const tentativeGScore = travelCost + myScore;

      const neighborScore = gScore.get(neighbor);
      if (neighborScore == undefined || tentativeGScore < neighborScore) {
        cameFrom.set(neighbor, current);
        gScore.set(neighbor, tentativeGScore);

        const heuristicDx = p0_x - end_x;
        const heuristicDy = p0_y - end_y;
        let heuristic = Math.sqrt(heuristicDx * heuristicDx + heuristicDy * heuristicDy);

        if (effectiveCMult > 0) {
          //Penalize straying too far from the straight line
          //Penaloize going back
          //Penalize going sideways immediately
          const lineDistNum = Math.abs(startToEnd.x * (startPoint.y - p0_y) - (startPoint.x - p0_x) * startToEnd.y);
          const distToLine = lineDistNum / lineDistDenom;
          set(v, p0_x - startPoint.x, p0_y - startPoint.y);
          normalize_(v);
          const d = dot(v, startToEnd) / lineDistDenom;
          const CFactor =  Math.max(0, distToLine - FREE_WIDTH) * effectiveCMult * (1 + (1 - d));
          const backtrack = Math.max(0, Math.sqrt((endPoint.x - p0_x) * (endPoint.x - p0_x) + (endPoint.y - p0_y) * (endPoint.y - p0_y)) - lineDistDenom);
          heuristic += CFactor + backtrack;
          // console.log(`CFactor: ${CFactor.toFixed(2)} heuristic: ${heuristic.toFixed(2)} backtrack: ${backtrack.toFixed(2)}`);
        }
        
        const fScoreValue = tentativeGScore + heuristic;
        if (neighborScore !== undefined)
          pQueue.updatePriority(neighbor, fScoreValue);
        else
          pQueue.enqueue(neighbor, fScoreValue);
      }
    }
  }
  return null;
}
