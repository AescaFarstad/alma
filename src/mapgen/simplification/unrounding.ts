import type { Point2, Line } from '../../logic/core/math';
import { distance, subtract, cross, lineLineIntersection, distancePointToSegment } from '../../logic/core/math';

interface SimplificationResult {
  M: Point2 | null;
  h: number;
}

/**
 * "Unrounding" simplifies building outlines by replacing a small segment (B-C) with a single point (M).
 * This function analyzes a sequence of four points (A-B-C-D) to find an optimal new point M.
 * 
 * The method aims to find an M that minimizes the Hausdorff distance introduced by the simplification.
 * It works as follows:
 * 1. Find the intersection point 'Y' of the extended lines AB and DC.
 * 2. Find a point 'R' on the segment BC that balances the distances from B to the line AR and C to the line DR.
 * 3. Perform a ternary search along the line segment YR to find the point 'M' that minimizes the maximum error.
 * The error is the maximum of:
 *  - Distance from M to the original segment BC.
 *  - Distance from B to the new segment AM.
 *  - Distance from C to the new segment DM.
 *
 * If lines AB and DC are parallel, or if the intersection Y is on the "wrong" side (inside the polygon), 
 * it falls back to using the midpoint of BC.
 */
function findOptimalSimplificationPoint(A: Point2, B: Point2, C: Point2, D: Point2): SimplificationResult {
  const distAB = distance(A, B);
  const distCD = distance(C, D);

  if (distAB < 1e-9 || distCD < 1e-9) {
  return { M: null, h: Infinity };
  }

  const turnAtB = cross(subtract(B, A), subtract(C, B));
  const turnAtC = cross(subtract(C, B), subtract(D, C));

  if (turnAtB * turnAtC < 0) {
  // S-bend case: find the best point R on BC and return it.
  let t_left = 0, t_right = 1;
  for (let i = 0; i < 20; i++) {
    const t_mid = (t_left + t_right) / 2;
    const R_mid = { x: B.x + t_mid * (C.x - B.x), y: B.y + t_mid * (C.y - B.y) };
    const dist_B_AR = distancePointToSegment(B, A, R_mid);
    const dist_C_DR = distancePointToSegment(C, D, R_mid);
    if (dist_B_AR < dist_C_DR) {
      t_left = t_mid;
    } else {
      t_right = t_mid;
    }
  }
  const R_t = (t_left + t_right) / 2;
  const R = { x: B.x + R_t * (C.x - B.x), y: B.y + R_t * (C.y - B.y) };
  const h = Math.max(distancePointToSegment(B, A, R), distancePointToSegment(C, D, R));
  return { M: R, h: h };
  }

  const line_AB_ext: Line = { point: A, direction: subtract(B, A) };
  const line_DC_ext: Line = { point: D, direction: subtract(C, D) };
  const Y = lineLineIntersection(line_AB_ext, line_DC_ext);

  if (!Y) {
  const M_center: Point2 = { x: (B.x + C.x) / 2, y: (B.y + C.y) / 2 };
  const h_B_at_center = distancePointToSegment(B, A, M_center);
  const h_C_at_center = distancePointToSegment(C, D, M_center);
  const h_at_center = Math.max(h_B_at_center, h_C_at_center);
  return { M: M_center, h: h_at_center };
  }

  // Find R on BC using binary search to balance distances.
  let t_left = 0, t_right = 1;
  for (let i = 0; i < 20; i++) {
    const t_mid = (t_left + t_right) / 2;
    const R_mid = { x: B.x + t_mid * (C.x - B.x), y: B.y + t_mid * (C.y - B.y) };
    const dist_B_AR = distancePointToSegment(B, A, R_mid);
    const dist_C_DR = distancePointToSegment(C, D, R_mid);
    if (dist_B_AR < dist_C_DR) {
      t_left = t_mid;
    } else {
      t_right = t_mid;
    }
  }
  const R_t = (t_left + t_right) / 2;
  const R = { x: B.x + R_t * (C.x - B.x), y: B.y + R_t * (C.y - B.y) };
  
  // Ternary search for M on YR to minimize the Hausdorff error.
  let s_left = 0, s_right = 1;
  let bestM: Point2 = Y;
  let min_error = Math.max(distancePointToSegment(Y, B, C), distancePointToSegment(B, A, Y), distancePointToSegment(C, D, Y));

  for (let i = 0; i < 30; i++) {
    const s1 = s_left + (s_right - s_left) / 3;
    const s2 = s_right - (s_right - s_left) / 3;
    
    const M1 = { x: (1 - s1) * Y.x + s1 * R.x, y: (1 - s1) * Y.y + s1 * R.y };
    const error1 = Math.max(distancePointToSegment(M1, B, C), distancePointToSegment(B, A, M1), distancePointToSegment(C, D, M1));
    
    const M2 = { x: (1 - s2) * Y.x + s2 * R.x, y: (1 - s2) * Y.y + s2 * R.y };
    const error2 = Math.max(distancePointToSegment(M2, B, C), distancePointToSegment(B, A, M2), distancePointToSegment(C, D, M2));
    
    if (error1 < error2) {
      s_right = s2;
      if (error1 < min_error) {
        min_error = error1;
        bestM = M1;
      }
    } else {
      s_left = s1;
      if (error2 < min_error) {
        min_error = error2;
        bestM = M2;
      }
    }
  }
  
  return {
  M: bestM,
  h: min_error,
  };
}

export function unround(points: Point2[], distance_threshold: number, error_threshold: number): Point2[] {
  let currentPoints = [...points];
  if (currentPoints.length > 0 && distance(currentPoints[0], currentPoints[currentPoints.length-1]) < 1e-9) {
    currentPoints.pop();
  }

  if (currentPoints.length < 4) {
    return currentPoints;
  }

  let i = 0;
  while (i < currentPoints.length) {
    if (currentPoints.length < 4) {
      break;
    }

    const len = currentPoints.length;
    const A = currentPoints[(i - 1 + len) % len];
    const B = currentPoints[i % len];
    const C = currentPoints[(i + 1) % len];
    const D = currentPoints[(i + 2) % len];
    
    if (!A || !B || !C || !D) {
      i++;
      continue;
    }

    if (distance(B, C) < distance_threshold) {
      const result = findOptimalSimplificationPoint(A, B, C, D);

      if (result.M && result.h < error_threshold) {
        // CONVERGENCE CHECK: Ensure the new point is a meaningful change to prevent infinite loops.
        if (distance(result.M, B) < 1e-5 && distance(result.M, C) < 1e-5) {
          i++;
          continue;
        }
        
        const b_idx = i % len;
        const c_idx = (i + 1) % len;

        if (c_idx > b_idx) {
          currentPoints.splice(b_idx, 2, result.M);
        } else {
          currentPoints.pop();
          currentPoints.splice(0, 1, result.M);
        }
        
        i++;
        continue;
      }
    }
    i++;
  }

  return currentPoints;
} 