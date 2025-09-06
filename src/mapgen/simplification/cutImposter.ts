import type { Point2 } from '../../logic/core/math';
import { scoreVertextDeletion, isPolygonValid } from './errorScore';

// Greedy vertex removal: starting from currentGeometry, try removing any vertex
// if it reduces the area mismatch with originalGeometry.
export async function cutImposter(originalGeometries: Point2[] | Point2[][], currentGeometry: Point2[]): Promise<Point2[]> {
  // Normalize current; originalGeometries handled by scorer
  let current = normalizeRing(currentGeometry);

  if (!isPolygonValid(current)) return normalizeRing(currentGeometry);

  let changed = true;
  while (changed) {
    changed = false;
    if (current.length <= 3) break;
    for (let i = 0; i < current.length; i++) {
      if (current.length <= 3) break;
      const score = await scoreVertextDeletion(originalGeometries, current, i);
      if (score > 0) {
        current = current.slice(0, i).concat(current.slice(i + 1));
        changed = true;
        i = Math.max(-1, i - 2);
      }
    }
  }

  return current;
}

function normalizeRing(points: Point2[]): Point2[] {
  if (!points || points.length === 0) return [];
  const res = points.slice();
  const n = res.length;
  if (n >= 2) {
    const a = res[0];
    const b = res[n - 1];
    if (Math.abs(a.x - b.x) < 1e-9 && Math.abs(a.y - b.y) < 1e-9) {
      res.pop();
    }
  }
  return res;
}
