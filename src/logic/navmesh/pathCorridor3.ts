import { Navmesh } from "./Navmesh";
import { distance, distance_sq, dot, normalize_, Point2, set, isToRight } from "../core/math";
import { getPolygonFromPoint, testPointInsidePolygon, getTriangleFromPoint, testPointInsideTriangle } from "./NavUtils";
import { GameState } from "../GameState";
import { PriorityQueue } from "./priorityQueue";
import { sceneState, ACRED, ACBLUE } from "../drawing/SceneState";
import { findCorners } from "./pathCorners";
import { findCorridor } from "./pathCorridor";

const sharedpQueue = new PriorityQueue();

const triPoints: [Point2, Point2, Point2] = [{x:0, y:0}, {x:0, y:0}, {x:0, y:0}];

function getTrianglePoints(navmesh: Navmesh, triIdx: number, outPoints: [Point2, Point2, Point2]) {
  const triVertexStartIndex = triIdx * 3;
  const p1Index = navmesh.triangles[triVertexStartIndex];
  const p2Index = navmesh.triangles[triVertexStartIndex + 1];
  const p3Index = navmesh.triangles[triVertexStartIndex + 2];

  outPoints[0].x = navmesh.vertices[p1Index * 2];
  outPoints[0].y = navmesh.vertices[p1Index * 2 + 1];
  outPoints[1].x = navmesh.vertices[p2Index * 2];
  outPoints[1].y = navmesh.vertices[p2Index * 2 + 1];
  outPoints[2].x = navmesh.vertices[p3Index * 2];
  outPoints[2].y = navmesh.vertices[p3Index * 2 + 1];
}

function traceStraightTriangleCorridor(
  navmesh: Navmesh,
  startPoint: Point2,
  endPoint: Point2,
  startTriIdx: number,
  endTriIdx: number,
): number[] | null {
  let currentTriIdx = startTriIdx;

  const corridor: number[] = [currentTriIdx];
  const MAX_ITERATIONS = 5000;
  let previousTriIdx = -1;

  for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
    if (currentTriIdx === endTriIdx || testPointInsideTriangle(navmesh, endPoint.x, endPoint.y, currentTriIdx)) {
      return corridor;
    }

    getTrianglePoints(navmesh, currentTriIdx, triPoints);

    let nextTriIdx = -1;
    let exitEdgeIdx = -1;
    
    if (previousTriIdx === -1) {
      const c0 = isToRight(startPoint, endPoint, triPoints[0]);
      const c1 = isToRight(startPoint, endPoint, triPoints[1]);
      const c2 = isToRight(startPoint, endPoint, triPoints[2]);

      if (c0 !== c1 && c0 !== c2) { 
        exitEdgeIdx = c0 ? 0 : 2;
      } else if (c1 !== c0 && c1 !== c2) {
        exitEdgeIdx = c1 ? 1 : 0;
      } else {
        exitEdgeIdx = c2 ? 2 : 1;
      }
      
      nextTriIdx = navmesh.neighbors[currentTriIdx * 3 + exitEdgeIdx];
    } else {
      let entryEdgeIdx = -1;
      for (let i = 0; i < 3; i++) {
        if (navmesh.neighbors[currentTriIdx * 3 + i] === previousTriIdx) {
          entryEdgeIdx = i;
          break;
        }
      }

      if (entryEdgeIdx !== -1) {
        const p_entry2 = triPoints[(entryEdgeIdx + 1) % 3];
        const p_apex = triPoints[(entryEdgeIdx + 2) % 3];
        
        if (isToRight(startPoint, endPoint, p_apex) !== isToRight(startPoint, endPoint, p_entry2)) {
          exitEdgeIdx = (entryEdgeIdx + 1) % 3;
        } else {
          exitEdgeIdx = (entryEdgeIdx + 2) % 3;
        }
        nextTriIdx = navmesh.neighbors[currentTriIdx * 3 + exitEdgeIdx];
      }
    }
    
    if (nextTriIdx !== -1) {
      previousTriIdx = currentTriIdx;
      currentTriIdx = nextTriIdx;
      corridor.push(currentTriIdx);
    } else {
      return corridor; 
    }
  }

  return corridor;
}


/*
Phase 1:
Cast a ray from start to finish through beighboring triangles
The output is an array of span arrays.
A span is a sequence of polygons that were walkable with no blob between them
But when the ray enters a blob - it ends the span
Phase 2:
Merge the spans together by using findCorridor to find path between them
Start from the beginning, append a span to the path, pathfind the corridor to the new span, merge it in, append teh next span etc
When merging the new corridor, check if it's polygons are already in the path, starting from the end of teh corridor.
If they are - the path is squished - all polygons between them (in the path and in the corridor) are removed.
*/

let v = Point2(0, 0);
let startToEnd = Point2(0, 0);

export function findCorridor3(
  navmesh: Navmesh,
  FREE_WIDTH :number,
  STRAY_MULT: number,
  startPoint: Point2, 
  endPoint: Point2, 
  startPolyHint?: number, 
  endPolyHint?: number
): number[] | null {
  const startTri = getTriangleFromPoint(navmesh, startPoint);
  const endTri = getTriangleFromPoint(navmesh, endPoint);

  if (startTri === -1 || endTri === -1) {
    console.error(`findCorridor3: FAILED - invalid start or end triangle`);
    return null;
  }

  const startPoly = navmesh.triangle_to_polygon[startTri];
  const endPoly = navmesh.triangle_to_polygon[endTri];

  if (startPoly === -1 || endPoly === -1) {
    console.error(`findCorridor3: FAILED - invalid polygons`);
    return null;
  }
  
  if (startPoly === endPoly) {
    if (startPoly >= navmesh.walkable_polygon_count) return null;
    return [startPoly];
  }

  const triangleCorridor = traceStraightTriangleCorridor(navmesh, startPoint, endPoint, startTri, endTri);
  if (!triangleCorridor) {
    return null;
  }

  const polygonCorridor: number[] = [];
  let lastPoly = -1;
  for (const tri of triangleCorridor) {
    const poly = navmesh.triangle_to_polygon[tri];
    if (poly !== lastPoly) {
      polygonCorridor.push(poly);
      lastPoly = poly;
    }
  }

  const spans: number[][] = [];
  let currentSpan: number[] = [];
  for (const poly of polygonCorridor) {
    if (poly < navmesh.walkable_polygon_count) {
      currentSpan.push(poly);
    } else {
      if (currentSpan.length > 0) {
        spans.push(currentSpan);
        currentSpan = [];
      }
    }
  }
  if (currentSpan.length > 0) {
    spans.push(currentSpan);
  }

  if (spans.length === 0) {
    return null;
  }

  if (spans.length === 1) {
    return spans[0];
  }
  
  let finalPath = spans[0];

  for (let i = 1; i < spans.length; i++) {
    const nextSpan = spans[i];
    
    const lastPolyInPath = finalPath[finalPath.length - 1];
    const firstPolyInNextSpan = nextSpan[0];
    
    const lastPointInPath = { x: navmesh.poly_centroids[lastPolyInPath * 2], y: navmesh.poly_centroids[lastPolyInPath * 2 + 1] };
    const firstPointInNextSpan = { x: navmesh.poly_centroids[firstPolyInNextSpan * 2], y: navmesh.poly_centroids[firstPolyInNextSpan * 2 + 1] };

    const bridgeCorridor = findCorridor(
      navmesh,
      FREE_WIDTH,
      STRAY_MULT,
      lastPointInPath,
      firstPointInNextSpan,
      lastPolyInPath,
      firstPolyInNextSpan
    );

    if (!bridgeCorridor) {
      console.error('Failed to find path between spans');
      return null;
    }

    for (let j = 0; j < bridgeCorridor.length; j++) {
      const bridgePoly = bridgeCorridor[j];
      const existingIndex = finalPath.lastIndexOf(bridgePoly);
      if (existingIndex !== -1) {
        finalPath.splice(existingIndex + 1);
        for (let k = j + 1; k < bridgeCorridor.length; k++) {
          finalPath.push(bridgeCorridor[k]);
        }
        break;
      } else {
        finalPath.push(bridgePoly);
      }
    }
    
    for (const poly of nextSpan) {
      if (finalPath[finalPath.length - 1] !== poly) {
        finalPath.push(poly);
      }
    }
  }

  let i = 0;
  while (i <= finalPath.length - 3) {
    const poly = finalPath[i];
    const polyVertStart = navmesh.polygons[poly];
    const polyVertEnd = navmesh.polygons[poly + 1];
    
    if (i + 3 < finalPath.length) {
      const nextPoly3 = finalPath[i + 3];
      let isNeighbor = false;
      for (let j = polyVertStart; j < polyVertEnd; j++) {
        if (navmesh.poly_neighbors[j] === nextPoly3) {
          isNeighbor = true;
          break;
        }
      }
      if (isNeighbor) {
        finalPath.splice(i + 1, 2);
        continue;
      }
    }

    const nextPoly2 = finalPath[i + 2];
    let isNeighbor = false;
    for (let j = polyVertStart; j < polyVertEnd; j++) {
      if (navmesh.poly_neighbors[j] === nextPoly2) {
        isNeighbor = true;
        break;
      }
    }
    if (isNeighbor) {
      finalPath.splice(i + 1, 1);
      continue;
    }

    i++;
  }
  
  return finalPath;
}
