import { clipperProvider } from '../../logic/ClipperProvider';
import type { Point2 } from '../../logic/core/math';
import * as clipperLib from 'js-angusj-clipper';

// Internal epsilon for numeric robustness
const EPS = 1e-9;
const SCALE = 1e7; // consistent with other simplification modules
const EQ_EPS = 1e-6; // point equality tolerance (meters)

function eqPoints(a: Point2, b: Point2, eps = EQ_EPS): boolean {
  return Math.abs(a.x - b.x) <= eps && Math.abs(a.y - b.y) <= eps;
}

function ensureOpenPolygon(points: Point2[]): Point2[] {
  if (points.length >= 2) {
    const first = points[0];
    const last = points[points.length - 1];
    // Treat nearly-equal endpoints as identical to avoid duplicate vertex at closure
    if (eqPoints(first, last)) {
      return points.slice(0, -1);
    }
  }
  return points.slice();
}

function polygonAreaAbs(points: Point2[]): number {
  const n = points.length;
  if (n < 3) return 0;
  let area = 0;
  for (let i = 0; i < n; i++) {
    const a = points[i];
    const b = points[(i + 1) % n];
    area += a.x * b.y - b.x * a.y;
  }
  return Math.abs(area / 2);
}

function orientation(a: Point2, b: Point2, c: Point2): number {
  // Standard cross product of AB x AC
  const v = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  if (Math.abs(v) < EPS) return 0;
  return v > 0 ? 1 : -1; // 1: ccw, -1: cw
}

function onSegment(a: Point2, b: Point2, c: Point2): boolean {
  // c lies on segment ab assuming colinear
  return (
    Math.min(a.x, b.x) - EPS <= c.x && c.x <= Math.max(a.x, b.x) + EPS &&
    Math.min(a.y, b.y) - EPS <= c.y && c.y <= Math.max(a.y, b.y) + EPS
  );
}

function segmentsIntersect(p1: Point2, p2: Point2, q1: Point2, q2: Point2): boolean {
  const o1 = orientation(p1, p2, q1);
  const o2 = orientation(p1, p2, q2);
  const o3 = orientation(q1, q2, p1);
  const o4 = orientation(q1, q2, p2);

  if (o1 !== o2 && o3 !== o4) return true; // general case

  // Colinear cases
  if (o1 === 0 && onSegment(p1, p2, q1)) return true;
  if (o2 === 0 && onSegment(p1, p2, q2)) return true;
  if (o3 === 0 && onSegment(q1, q2, p1)) return true;
  if (o4 === 0 && onSegment(q1, q2, p2)) return true;
  return false;
}

function isValidPolygon(pointsIn: Point2[]): boolean {
  const points = ensureOpenPolygon(pointsIn);
  const n = points.length;
  if (n < 3) return false;
  if (polygonAreaAbs(points) < EPS){
    return false;
  }

  // No duplicate vertices anywhere (within tolerance)
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (eqPoints(points[i], points[j])) {
        return false;
      }
    }
  }

  // No self intersections (allow adjacency only)
  for (let i = 0; i < n; i++) {
    const i2 = (i + 1) % n;
    const a1 = points[i];
    const a2 = points[i2];
    for (let j = i + 1; j < n; j++) {
      const j2 = (j + 1) % n;
      // Skip adjacent edges including wrap-around adjacency
      if (i === j) continue;
      if (i2 === j) continue;
      if (j2 === i) continue;
      // Skip identical edge pairs (shouldn't happen)
      if (i2 === j2) continue;

      // If edges share endpoints (coordinates), allow it (treat as a touch, not an intersection)
      const b1 = points[j];
      const b2 = points[j2];
      if (eqPoints(a1, b1) || eqPoints(a1, b2) || eqPoints(a2, b1) || eqPoints(a2, b2)) {
        continue;
      }

      if (segmentsIntersect(a1, a2, b1, b2)){
        return false;
      }
    }
  }
  return true;
}

function toScaledPath(pointsIn: Point2[]): { x: number; y: number }[] {
  const pts = ensureOpenPolygon(pointsIn);
  return pts.map(p => ({ x: Math.round(p.x * SCALE), y: Math.round(p.y * SCALE) }));
}

function toScaledPathsMulti(polys: Point2[][]): { x: number; y: number }[][] {
  return polys.map(p => toScaledPath(p));
}

async function symmetricDifferenceArea(origIn: Point2[] | Point2[][], candIn: Point2[]): Promise<number> {
  const clipper = await clipperProvider.getClipper();
  const b = toScaledPath(candIn);

  const origMulti: Point2[][] = Array.isArray((origIn as any)[0])
    ? (origIn as Point2[][])
    : [origIn as Point2[]];

  const scaledSubjects = toScaledPathsMulti(origMulti);

  // If everything is degenerate return 0
  const anyOrig = scaledSubjects.some(p => p.length >= 3);
  const anyCand = b.length >= 3;
  if (!anyOrig && !anyCand) return 0;

  const result = clipper.clipToPaths({
    clipType: clipperLib.ClipType.Xor,
    subjectFillType: clipperLib.PolyFillType.EvenOdd,
    subjectInputs: [{ data: scaledSubjects as any, closed: true }],
    clipInputs: [{ data: b }],
  });

  let areaAbsSum = 0;
  for (const path of result) {
    areaAbsSum += Math.abs(clipper.area(path));
  }
  return areaAbsSum / (SCALE * SCALE);
}

export async function scoreVertextDeletion(
  originalGeometries: Point2[] | Point2[][],
  currentGeometry: Point2[],
  delete_idx: number
): Promise<number> {
  const current = ensureOpenPolygon(currentGeometry);
  if (delete_idx < 0 || delete_idx >= current.length) return -99999;

  const candidate = current.slice(0, delete_idx).concat(current.slice(delete_idx + 1));
  if (!isValidPolygon(candidate)) return -99999;

  const before = await symmetricDifferenceArea(originalGeometries, current);
  const after = await symmetricDifferenceArea(originalGeometries, candidate);
  return before - after;
}

export async function scoreVertexMove(
  originalGeometries: Point2[] | Point2[][],
  currentGeometry: Point2[],
  vertex_idx: number,
  newLocation: Point2
): Promise<number> {
  const current = ensureOpenPolygon(currentGeometry);
  if (vertex_idx < 0 || vertex_idx >= current.length) return -99999;

  const candidate = current.slice();
  candidate[vertex_idx] = { x: newLocation.x, y: newLocation.y };
  if (!isValidPolygon(candidate)) return -99999;

  const before = await symmetricDifferenceArea(originalGeometries, current);
  const after = await symmetricDifferenceArea(originalGeometries, candidate);
  return before - after;
}

export function isPolygonValid(points: Point2[]): boolean {
  return isValidPolygon(points);
}
