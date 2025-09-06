import type { Point2 } from '../../logic/core/math';
import { distance, subtract, normalize as normalizeVec, scale, add } from '../../logic/core/math';
import { scoreVertexMove, isPolygonValid } from './errorScore';

const EPS = 1e-9;

function normalizeRing(points: Point2[]): Point2[] {
  if (!points || points.length === 0) return [];
  const res = points.slice();
  const n = res.length;
  if (n >= 2) {
    const a = res[0];
    const b = res[n - 1];
    if (Math.abs(a.x - b.x) < EPS && Math.abs(a.y - b.y) < EPS) {
      res.pop();
    }
  }
  return res;
}

function flattenOriginals(originals: Point2[] | Point2[][]): Point2[] {
  if (Array.isArray((originals as any)[0])) {
    return (originals as Point2[][]).flat();
  }
  return originals as Point2[];
}

function hasNearby(point: Point2, set: Point2[], radius: number): boolean {
  const r2 = radius * radius;
  for (let i = 0; i < set.length; i++) {
    const dx = point.x - set[i].x;
    const dy = point.y - set[i].y;
    if (dx * dx + dy * dy <= r2) return true;
  }
  return false;
}

function nearestIndex(point: Point2, set: Point2[]): number {
  let best = -1;
  let bestD2 = Infinity;
  for (let i = 0; i < set.length; i++) {
    const dx = point.x - set[i].x;
    const dy = point.y - set[i].y;
    const d2 = dx * dx + dy * dy;
    if (d2 < bestD2) {
      bestD2 = d2;
      best = i;
    }
  }
  return best;
}

export async function slideToNeighbor(
  originalGeometries: Point2[] | Point2[][],
  currentGeometry: Point2[],
  maxStep: number = 1
): Promise<Point2[]> {
  let current = normalizeRing(currentGeometry);
  if (!isPolygonValid(current)){
    return current;
  }

  const originalsFlat = normalizeRingPoints(flattenOriginals(originalGeometries));

  const A: Point2[] = originalsFlat.filter(p => !hasNearby(p, current, maxStep));
  if (A.length === 0){
    return current;
  }

  const BIdx: number[] = [];
  for (let i = 0; i < current.length; i++) {
    if (!hasNearby(current[i], originalsFlat, maxStep)) BIdx.push(i);
  }
  if (BIdx.length === 0){
    return current;
  }

  for (const bi of BIdx) {
    if (A.length === 0) break;
    const p = current[bi];
    const ai = nearestIndex(p, A);
    if (ai < 0) {
      continue;
    }
    const target = A[ai];
    const d = distance(p, target);
    if (d < EPS) {
      continue;
    }
    const step = Math.min(maxStep, d);
    const dir = normalizeVec(subtract(target, p));
    const newLoc = add(p, scale(dir, step));

    const score = await scoreVertexMove(originalGeometries, current, bi, newLoc);
    if (score > 0) {
      current[bi] = newLoc;
    } else if (score === -99999) {
    } else {
    }
  }

  return current;
}

function normalizeRingPoints(points: Point2[]): Point2[] {
  if (points.length < 2) return points.slice();
  const first = points[0];
  const last = points[points.length - 1];
  if (Math.abs(first.x - last.x) < EPS && Math.abs(first.y - last.y) < EPS) {
    return points.slice(0, -1);
  }
  return points.slice();
}
