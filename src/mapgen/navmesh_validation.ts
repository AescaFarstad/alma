import { NavmeshData, MyPolygon, MyPoint } from './navmesh_struct';

// Helper function to make validation errors more noticeable
function logValidationError(message: string): void {
  console.error('🚨 NAVMESH VALIDATION FAILURE 🚨');
  console.error(message);
}

const CELL_SIZE = 128;
const MIN_DISTANCE = 1;
const MIN_DISTANCE_SQ = MIN_DISTANCE * MIN_DISTANCE;

type SpatialGrid = Map<string, number[]>;

function getCellKey(x: number, y: number): string {
  const cellX = Math.floor(x / CELL_SIZE);
  const cellY = Math.floor(y / CELL_SIZE);
  return `${cellX},${cellY}`;
}

export function validateVertexDistance(navmeshData: NavmeshData): boolean {
  const vertices = navmeshData.vertices;
  const vertexCount = navmeshData.stats.vertices;
  const grid: SpatialGrid = new Map();

  for (let i = 0; i < vertexCount; i++) {
    const x = vertices[i * 2];
    const y = vertices[i * 2 + 1];
    const key = getCellKey(x, y);
    if (!grid.has(key)) {
      grid.set(key, []);
    }
    grid.get(key)!.push(i);
  }

  let foundIssues = false;

  const neighborOffsets = [
    { dx: 1, dy: 0 },   // Right
    { dx: -1, dy: 1 },  // Bottom-left
    { dx: 0, dy: 1 },   // Bottom
    { dx: 1, dy: 1 },   // Bottom-right
  ];

  for (const [key, cellVertices] of grid.entries()) {
    const [cellX, cellY] = key.split(',').map(Number);

    // 1. Check distances within the current cell
    for (let i = 0; i < cellVertices.length; i++) {
      for (let j = i + 1; j < cellVertices.length; j++) {
        const vIndex1 = cellVertices[i];
        const vIndex2 = cellVertices[j];
        const x1 = vertices[vIndex1 * 2];
        const y1 = vertices[vIndex1 * 2 + 1];
        const x2 = vertices[vIndex2 * 2];
        const y2 = vertices[vIndex2 * 2 + 1];
        const dx = x1 - x2;
        const dy = y1 - y2;
        const distSq = dx * dx + dy * dy;

        if (distSq < MIN_DISTANCE_SQ) {
          console.error(`Validation failed: Vertices ${vIndex1} (${x1.toFixed(2)}, ${y1.toFixed(2)}) and ${vIndex2} (${x2.toFixed(2)}, ${y2.toFixed(2)}) in the same cell are too close: ${Math.sqrt(distSq).toFixed(2)}`);
          foundIssues = true;
        }
      }
    }

    // 2. Check distances against neighboring cells
    for (const offset of neighborOffsets) {
      const neighborKey = `${cellX + offset.dx},${cellY + offset.dy}`;
      if (grid.has(neighborKey)) {
        const neighborCellVertices = grid.get(neighborKey)!;
        for (const vIndex1 of cellVertices) {
          for (const vIndex2 of neighborCellVertices) {
            const x1 = vertices[vIndex1 * 2];
            const y1 = vertices[vIndex1 * 2 + 1];
            const x2 = vertices[vIndex2 * 2];
            const y2 = vertices[vIndex2 * 2 + 1];
            const dx = x1 - x2;
            const dy = y1 - y2;
            const distSq = dx * dx + dy * dy;

            if (distSq < MIN_DISTANCE_SQ) {
              console.error(`Validation failed: Vertices ${vIndex1} (${x1.toFixed(2)}, ${y1.toFixed(2)}) and ${vIndex2} (${x2.toFixed(2)}, ${y2.toFixed(2)}) in neighboring cells are too close: ${Math.sqrt(distSq).toFixed(2)}`);
              foundIssues = true;
            }
          }
        }
      }
    }
  }

  if (!foundIssues) {
    console.log('Vertex distance validation passed successfully.');
  } else {
    logValidationError('Vertex distance validation failed. Found vertices closer than the minimum distance of 1.');
  }

  return !foundIssues;
}

export function validateTrianglePolygonMapping(navmeshData: NavmeshData): boolean {
  const totalTriangleCount = navmeshData.stats.triangles;
  const totalPolygonCount = navmeshData.stats.polygons;
  const polyTris = navmeshData.poly_tris;

  if (!polyTris || polyTris.length === 0) {
    logValidationError('poly_tris array is missing or empty. Cannot validate mapping.');
    return false;
  }

  if (polyTris.length !== totalPolygonCount + 1) {
    logValidationError(`poly_tris length is ${polyTris.length}, but expected ${totalPolygonCount + 1} (total polygons + sentinel).`);
    return false;
  }

  const triangleToPolygonMap = new Int32Array(totalTriangleCount).fill(-1);
  let foundIssues = false;

  console.log(`Checking mapping for ${totalTriangleCount} total triangles and ${totalPolygonCount} total polygons...`);

  // 1. Check for overlapping polygons (a triangle assigned to multiple polygons) and out-of-bounds indices
  for (let polyId = 0; polyId < totalPolygonCount; polyId++) {
    const startTriIndex = polyTris[polyId];
    const endTriIndex = polyTris[polyId + 1];

    if (startTriIndex > endTriIndex) {
      console.error(`Validation failed: For polygon ${polyId}, start index ${startTriIndex} is greater than end index ${endTriIndex}.`);
      foundIssues = true;
      continue;
    }

    for (let triIndex = startTriIndex; triIndex < endTriIndex; triIndex++) {
      if (triIndex < 0 || triIndex >= totalTriangleCount) {
        console.error(`Validation failed: Polygon ${polyId} contains triangle index ${triIndex}, which is out of bounds for total triangles (0 to ${totalTriangleCount - 1}).`);
        foundIssues = true;
        continue;
      }

      if (triangleToPolygonMap[triIndex] !== -1) {
        console.error(`Validation failed: Triangle ${triIndex} is part of polygon ${polyId}, but was already assigned to polygon ${triangleToPolygonMap[triIndex]}.`);
        foundIssues = true;
      } else {
        triangleToPolygonMap[triIndex] = polyId;
      }
    }
  }

  // 2. Check for orphaned triangles (triangles not assigned to any polygon)
  for (let i = 0; i < totalTriangleCount; i++) {
    if (triangleToPolygonMap[i] === -1) {
      console.error(`Validation failed: Triangle ${i} does not belong to any polygon.`);
      foundIssues = true;
    }
  }

  if (!foundIssues) {
    console.log('Triangle-polygon mapping validation passed successfully.');
  } else {
    logValidationError('Triangle-polygon mapping validation failed. Found triangles that are either unassigned or assigned to multiple polygons.');
  }

  return !foundIssues;
}

export function validateIntermediateTrianglePolygonMapping(
  triangleToPolygonMap: Map<number, number>,
  walkableTriangleCount: number,
  walkablePolygonCount: number,
  phase: string
): boolean {
  let foundIssues = false;

  if (triangleToPolygonMap.size !== walkableTriangleCount) {
    console.error(`Validation failed (${phase}): Expected ${walkableTriangleCount} mapped triangles, but found ${triangleToPolygonMap.size}.`);
    foundIssues = true;
  }

  const assignedPolygons = new Array(walkablePolygonCount).fill(0);

  for (let i = 0; i < walkableTriangleCount; i++) {
    if (!triangleToPolygonMap.has(i)) {
      console.error(`Validation failed (${phase}): Walkable triangle ${i} does not belong to any polygon.`);
      foundIssues = true;
    }
  }

  for (const [triIndex, polyId] of triangleToPolygonMap.entries()) {
    if (polyId >= walkablePolygonCount) {
      console.error(`Validation failed (${phase}): Triangle ${triIndex} is assigned to polygon ${polyId}, which is out of bounds for walkable polygons (${walkablePolygonCount}).`);
      foundIssues = true;
    } else {
      assignedPolygons[polyId]++;
    }
  }

  if (!foundIssues) {
    console.log(`Triangle-polygon mapping validation (after ${phase}) passed successfully.`);
  } else {
    console.error(`Triangle-polygon mapping validation (after ${phase}) failed.`);
  }

  return !foundIssues;
}

// ================================
// ORIENTATION (CCW) VALIDATION
// ================================

function triangleSignedArea(x1: number, y1: number, x2: number, y2: number, x3: number, y3: number): number {
  // 2x area (positive for CCW)
  return (x2 - x1) * (y3 - y1) - (y2 - y1) * (x3 - x1);
}

function polygonSignedAreaByIndices(polyIndices: number[], vertices: Float32Array): number {
  let area2 = 0; // 2x area
  const n = polyIndices.length;
  for (let i = 0; i < n; i++) {
    const i1 = polyIndices[i];
    const i2 = polyIndices[(i + 1) % n];
    const x1 = vertices[i1 * 2];
    const y1 = vertices[i1 * 2 + 1];
    const x2 = vertices[i2 * 2];
    const y2 = vertices[i2 * 2 + 1];
    area2 += x1 * y2 - y1 * x2;
  }
  return area2; // positive => CCW
}

export function validateAllTrianglesCCW(navmeshData: NavmeshData, phase: string = 'Triangulation'): void {
  const t = navmeshData.triangles;
  const v = navmeshData.vertices;
  const triangleCount = t.length / 3;

  let invalidCount = 0;
  let firstInvalidIndex = -1;
  for (let i = 0; i < triangleCount; i++) {
    const i0 = t[i * 3];
    const i1 = t[i * 3 + 1];
    const i2 = t[i * 3 + 2];
    const x1 = v[i0 * 2];
    const y1 = v[i0 * 2 + 1];
    const x2 = v[i1 * 2];
    const y2 = v[i1 * 2 + 1];
    const x3 = v[i2 * 2];
    const y3 = v[i2 * 2 + 1];

    const a2 = triangleSignedArea(x1, y1, x2, y2, x3, y3);
    if (!(a2 > 0)) { // reject CW or degenerate
      invalidCount++;
      if (firstInvalidIndex === -1) firstInvalidIndex = i;
    }
  }

  if (invalidCount > 0) {
    const i = firstInvalidIndex;
    const i0 = t[i * 3];
    const i1 = t[i * 3 + 1];
    const i2 = t[i * 3 + 2];
    const msg = `Found ${invalidCount} non-CCW triangle(s) after ${phase}. Example tri #${i} -> [${i0}, ${i1}, ${i2}]`;
    logValidationError(msg);
    throw new Error(msg);
  }
  console.log(`All ${triangleCount} triangles are CCW (after ${phase}).`);
}

export function validateWalkablePolygonsCCW(navmeshData: NavmeshData, phase: string = 'Polygonization'): void {
  const v = navmeshData.vertices;
  const polyStarts = navmeshData.polygons;
  const polyVerts = navmeshData.poly_verts;
  const walkableCount = navmeshData.walkable_polygon_count;

  let invalid = 0;
  let firstInvalid = -1;

  for (let p = 0; p < walkableCount; p++) {
    const start = polyStarts[p];
    const end = polyStarts[p + 1];
    const indices: number[] = [];
    for (let i = start; i < end; i++) indices.push(polyVerts[i]);
    if (indices.length < 3) continue; // ignore degenerate
    const area2 = polygonSignedAreaByIndices(indices, v);
    if (!(area2 > 0)) {
      invalid++;
      if (firstInvalid === -1) firstInvalid = p;
    }
  }

  if (invalid > 0) {
    const msg = `Found ${invalid} non-CCW walkable polygon(s) after ${phase}. Example polygon index: ${firstInvalid}`;
    logValidationError(msg);
    throw new Error(msg);
  }
  console.log(`All ${walkableCount} walkable polygons are CCW (after ${phase}).`);
}

function isPolygonConvex(polygon: number[], navmeshData: NavmeshData): boolean {
  // Polygons with 3 or fewer vertices are considered convex.
  if (polygon.length < 4) {
    return true;
  }

  const getVertex = (index: number): [number, number] => {
    const vertexIndex = polygon[index];
    return [navmeshData.vertices[vertexIndex * 2], navmeshData.vertices[vertexIndex * 2 + 1]];
  };

  let gotNegative = false;
  let gotPositive = false;
  const numVertices = polygon.length;

  for (let i = 0; i < numVertices; i++) {
    const p1 = getVertex(i);
    const p2 = getVertex((i + 1) % numVertices);
    const p3 = getVertex((i + 2) % numVertices);

    // Using cross-product to determine turn direction.
    const crossProduct = (p2[0] - p1[0]) * (p3[1] - p2[1]) - (p2[1] - p1[1]) * (p3[0] - p2[0]);

    // A small tolerance is used to account for floating-point inaccuracies,
    // especially for points that are nearly collinear.
    if (Math.abs(crossProduct) < 1e-7) continue;

    if (crossProduct < 0) {
      gotNegative = true;
    } else if (crossProduct > 0) {
      gotPositive = true;
    }

    // If the turns change direction (e.g., from left to right), the polygon is concave.
    if (gotNegative && gotPositive) {
      return false;
    }
  }

  return true;
}

export function validateAllPolygonsConvex(navmeshData: NavmeshData, phase: string): boolean {
  console.log(`\n=== VALIDATING POLYGON CONVEXITY (AFTER ${phase.toUpperCase()}) ===`);
  let foundIssues = false;
  let concaveCount = 0;

  const polygons: number[][] = [];
  for (let i = 0; i < navmeshData.walkable_polygon_count; i++) {
    const start = navmeshData.polygons[i];
    const end = navmeshData.polygons[i + 1];
    const poly = [];
    for (let j = start; j < end; j++) {
      poly.push(navmeshData.poly_verts[j]);
    }
    polygons.push(poly);
  }

  for (let i = 0; i < polygons.length; i++) {
    if (!isPolygonConvex(polygons[i], navmeshData)) {
      if (!foundIssues) {
        logValidationError(`Found non-convex polygons in phase: ${phase}`);
      }
      foundIssues = true;
      concaveCount++;
    }
  }

  if (!foundIssues) {
    console.log(`Polygon convexity validation (after ${phase}) passed successfully. All ${polygons.length} polygons are convex.`);
  } else {
    console.error(`Polygon convexity validation (after ${phase}) failed. Found ${concaveCount} non-convex polygon(s) out of ${polygons.length}.`);
  }

  return !foundIssues;
}

// ================================
// PRE-TRIANGULATION DUPLICATE-POINT LOGGING
// ================================

function pointKey(p: MyPoint): string {
  // Use exact value string; upstream snapping already controls precision for snapped polys
  return `${p[0]};${p[1]}`;
}

function buildIndexMap(poly: MyPolygon): Map<string, number[]> {
  const map = new Map<string, number[]>();
  for (let i = 0; i < poly.length; i++) {
    const k = pointKey(poly[i]);
    const arr = map.get(k);
    if (arr) arr.push(i); else map.set(k, [i]);
  }
  return map;
}

function findAllDuplicateBuckets(poly: MyPolygon): Array<{ key: string; coord: MyPoint; indices: number[] }>{
  const buckets = buildIndexMap(poly);
  const result: Array<{ key: string; coord: MyPoint; indices: number[] }> = [];
  for (const [k, idxs] of buckets.entries()) {
    if (idxs.length > 1) {
      const [x, y] = k.split(';').map(Number) as [number, number];
      result.push({ key: k, coord: [x, y], indices: idxs.slice() });
    }
  }
  return result;
}

function pointsEqual(a: MyPoint, b: MyPoint): boolean {
  return a[0] === b[0] && a[1] === b[1];
}

function findConsecutiveDuplicateEdges(poly: MyPolygon): Array<{ idxA: number; idxB: number; point: MyPoint; type: 'adjacent' | 'closing' }>{
  const issues: Array<{ idxA: number; idxB: number; point: MyPoint; type: 'adjacent' | 'closing' }> = [];
  if (poly.length === 0) return issues;
  for (let i = 0; i < poly.length - 1; i++) {
    if (pointsEqual(poly[i], poly[i + 1])) {
      issues.push({ idxA: i, idxB: i + 1, point: poly[i], type: 'adjacent' });
    }
  }
  if (poly.length >= 2 && pointsEqual(poly[poly.length - 1], poly[0])) {
    issues.push({ idxA: poly.length - 1, idxB: 0, point: poly[0], type: 'closing' });
  }
  return issues;
}

/**
 * Logs duplicate vertices for each blob (snapped polygons), with raw vs snapped origin info.
 * - Checks all points, not just consecutive.
 * - Uses hash maps to aggregate duplicates in O(n) per polygon.
 * - Emits logs only when duplicates are present.
 */
export function logDuplicatePointsInBlobs(
  rawHolePolygons: MyPolygon[],
  snappedHolePolygons: MyPolygon[],
  blobToBuildings: string[][]
): void {
  for (let i = 0; i < snappedHolePolygons.length; i++) {
    const snapped = snappedHolePolygons[i] ?? [];
    const raw = rawHolePolygons[i] ?? [];

    // Detect duplicates in snapped (authoritative for triangulation input)
    const allDupBuckets = findAllDuplicateBuckets(snapped);
    if (allDupBuckets.length === 0) continue; // no logs on positive outcomes

    // Also detect if duplicates existed in raw input
    const rawDupBuckets = findAllDuplicateBuckets(raw);
    const introducedBySnapping = rawDupBuckets.length === 0 && allDupBuckets.length > 0;

    const consecutiveDupEdges = findConsecutiveDuplicateEdges(snapped);
    const buildingIds = blobToBuildings[i] ?? [];

    console.error('--- PRE-TRIANGULATION ERROR: Duplicate vertices found in hole polygon (blob) ---');
    console.error(`Blob index: ${i}`);
    console.error(`Building IDs: [${buildingIds.join(', ')}]`);

    // Report all duplicate coordinates with index lists
    for (const bucket of allDupBuckets) {
      const [x, y] = bucket.coord;
      console.error(`Repeated coordinate (${x};${y}) at indices [${bucket.indices.join(', ')}]`);
    }

    // If any of the above duplicates are also consecutive edges, highlight them explicitly
    for (const issue of consecutiveDupEdges) {
      const [x, y] = issue.point;
      if (issue.type === 'adjacent') {
        console.error(`Duplicate adjacent edge at indices ${issue.idxA} -> ${issue.idxB}: (${x};${y})`);
      } else {
        console.error(`Duplicate closing edge at indices ${issue.idxA} -> ${issue.idxB}: (${x};${y})`);
      }
    }

    // Origin message
    if (introducedBySnapping) {
      console.error('Origin: Introduced by snapping to 2-decimal precision');
    } else if (rawDupBuckets.length > 0) {
      console.error('Origin: Present in raw input geometry (pre-snapping)');
    } else {
      console.error('Origin: Unknown');
    }

    // Full geometry dump for diagnostics
    console.error(`Snapped geometry (${snapped.length} points): ${JSON.stringify(snapped)}`);
    if (raw.length !== snapped.length || introducedBySnapping) {
      console.error(`Raw geometry (${raw.length} points): ${JSON.stringify(raw)}`);
    }

    console.error('--- END OF BLOB ERROR ---');
  }
}
