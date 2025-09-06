import type { Point2 } from '../../logic/core/math';
import { sceneState, ACINDIGO } from '../../logic/drawing/SceneState';
import {
  pointLineSignedDistance,
  triangleArea,
  add,
  distance,
  scale,
  subtract,
  distancePointToSegment
} from "../../logic/core/math";

function movePoint(
  pointToMove: Point2,
  anchorPoint: Point2,
  problematicEdgeP1: Point2,
  problematicEdgeP2: Point2,
  minOffset: number
): Point2 | null {
  const lineDir = subtract(problematicEdgeP2, problematicEdgeP1);
  const signedDistToMove = pointLineSignedDistance(pointToMove, problematicEdgeP1, lineDir);
  if (Math.abs(signedDistToMove) >= minOffset) {
    return null;
  }
  const signedDistAnchor = pointLineSignedDistance(anchorPoint, problematicEdgeP1, lineDir);

  const targetSignedDist = Math.sign(signedDistToMove) * minOffset;

  const denominator = signedDistAnchor - signedDistToMove;
  if (Math.abs(denominator) < 1e-6) {
    return null;
  }

  let t = (targetSignedDist - signedDistToMove) / denominator;

  if (t >= 0 && t <= 1) {
    const moveVector = subtract(anchorPoint, pointToMove);
    const newPoint = add(pointToMove, scale(moveVector, t));

    const dist = distance(pointToMove, newPoint);
    const anchorDist = distance(pointToMove, anchorPoint);
    if (dist > anchorDist) {
      return anchorPoint;
    }

    return newPoint;
  }

  return null;
}

export function pullAway(polygon: Point2[], minOffset: number, maxError: number): Point2[] {
  let newPolygon = polygon.map(p => ({ ...p }));

  for (let i = 0; i < newPolygon.length; i++) {
    const B_idx = i;
    const A_idx = (i - 1 + newPolygon.length) % newPolygon.length;
    const C_idx = (i + 1) % newPolygon.length;

    const A = newPolygon[A_idx];
    const B = newPolygon[B_idx];
    const C = newPolygon[C_idx];

    let bestFix = null;
    let minAreaDiff = Infinity;

    for (let j = 0; j < newPolygon.length; j++) {
      const P1_idx = j;
      const P2_idx = (j + 1) % newPolygon.length;

      // Skip if this edge contains point B or is adjacent to B
      if (B_idx === P1_idx || B_idx === P2_idx || 
        A_idx === P1_idx || A_idx === P2_idx ||
        C_idx === P1_idx || C_idx === P2_idx) {
        continue;
      }

      const P1 = newPolygon[P1_idx];
      const P2 = newPolygon[P2_idx];

      // Use distance to line segment, not infinite line
      const segmentDist = distancePointToSegment(B, P1, P2);
      
      if (segmentDist < minOffset && segmentDist > 1e-6) {
        const candidateA = movePoint(B, A, P1, P2, minOffset);
        let areaDiffA: number | null = null;
        if (candidateA) {
          areaDiffA = Math.abs(triangleArea(A, C, candidateA) - triangleArea(A, C, B));
          if (areaDiffA < minAreaDiff) {
            minAreaDiff = areaDiffA;
            bestFix = candidateA;
          }
        }

        const candidateC = movePoint(B, C, P1, P2, minOffset);
        let areaDiffC: number | null = null;
        if (candidateC) {
          areaDiffC = Math.abs(triangleArea(A, C, candidateC) - triangleArea(A, C, B));
          if (areaDiffC < minAreaDiff) {
            minAreaDiff = areaDiffC;
            bestFix = candidateC;
          }
        }

        // console.log(
        //   `B=(${Math.round(B.x)},${Math.round(B.y)}) ` +
        //   `segmentDist=${segmentDist.toFixed(2)} ` +
        //   `diffA=${areaDiffA !== null ? areaDiffA.toFixed(2) : 'null'} ` +
        //   `diffC=${areaDiffC !== null ? areaDiffC.toFixed(2) : 'null'}`
        // );
      }
    }

    if (bestFix && minAreaDiff <= maxError) {
      newPolygon[B_idx] = bestFix;
      // Draw a small ACINDIGO debug point at the new location
      sceneState.addDebugPoint(bestFix, ACINDIGO);
    }
  }

  return newPolygon;
} 
