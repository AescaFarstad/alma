import { NavmeshData } from './navmesh_struct';
import { Point2, subtract, normalize, cross, dot, scale, add, subtract_, set } from '../logic/core/math';
import { drawTriangleGroups } from './navmesh_group_visualization';
import path from 'path';

/*
it splits triangles into groups:
for each unclassified triangle it starts a flood fill that will join them all into a group:
for each neighbour, if it has an admissible edge with this triangle -> it's added to the group
an admissible edge means that it doesn't create obtuse angle if removed.
specifically for atriangles ABC, BDC:
BC is shared. 
calculate AN = (AB - dot(AB, AC) * AC)
AM = (AC - dot(AB, AC) * AB)
return dot(AD, AN) > 0 && dot(AD, AM) > 0
*/

/*
Main algo:
Assume CCW winding order.
among unused triangles find an endpoint: this is a triangle which has no more than 1 neighbor in the group
create a poly from that triangle
for each of it's edges try to consume a neighbor

when consuming over edge V[1], V[2] there is the new point we might get: D
to test admissibility, we need 2 segments:
V[0]->V[1] = M and V[3]->V[2] = N
rotate each M and N by 90 degrees such that M' points towards N and N' points towards M. This can be done reliably without tests thanks to the known CCW order.

use test similar to isAdmissible, except there are 4 points. In case of isAdmissible, the A point was identical for both segments, but now it may differ i.e. instead of dot(AD, AN) >= 0 && dot(AD, AM) >= 0; there will be dot(M', V[1]D) >= 0 && dot(N', V[2]D) >= 0;

if admissible, insert D between V[1] and V[2], mark triangle as used.

since we've been checking V[1], V[2] and now there is a different V[2], we need to i-- and check V[1], V[2] again.

Do that until can't consume any more.
Now we have a polygon formed.
*/

// Helper function to get point from vertex index
function getPoint(vertIdx: number, navmeshData: NavmeshData): Point2 {
  return { x: navmeshData.vertices[vertIdx * 2], y: navmeshData.vertices[vertIdx * 2 + 1] };
}

// In-place variant to avoid allocating Point2
function getPointInto(vertIdx: number, navmeshData: NavmeshData, out: Point2): void {
  out.x = navmeshData.vertices[vertIdx * 2];
  out.y = navmeshData.vertices[vertIdx * 2 + 1];
}

// Global scratch points to avoid per-call allocations in hot paths
const SCR_POLY = {
  pV0: { x: 0, y: 0 } as Point2,
  pV1: { x: 0, y: 0 } as Point2,
  pV2: { x: 0, y: 0 } as Point2,
  pV3: { x: 0, y: 0 } as Point2,
  pD:  { x: 0, y: 0 } as Point2,
  M:   { x: 0, y: 0 } as Point2,
  N:   { x: 0, y: 0 } as Point2,
  MPr: { x: 0, y: 0 } as Point2,
  NPr: { x: 0, y: 0 } as Point2,
  V1D: { x: 0, y: 0 } as Point2,
  V2D: { x: 0, y: 0 } as Point2,
};

const SCR_TRI = {
  newP: { x: 0, y: 0 } as Point2,
  e1P:  { x: 0, y: 0 } as Point2,
  e2P:  { x: 0, y: 0 } as Point2,
  e1:   { x: 0, y: 0 } as Point2,
  e2:   { x: 0, y: 0 } as Point2,
  toN:  { x: 0, y: 0 } as Point2,
};

// Function to find endpoint triangles in a group (triangles with <= 1 neighbor in the group)
function findEndpointTriangles(group: number[], navmeshData: NavmeshData): number[] {
  const groupSet = new Set(group);
  const endpoints: number[] = [];

  for (const triIdx of group) {
    let neighborCount = 0;
    const neighbors: number[] = [];

    for (let j = 0; j < 3; j++) {
      const neighborIdx = navmeshData.neighbors[triIdx * 3 + j];
      if (neighborIdx >= 0 && groupSet.has(neighborIdx)) {
        neighborCount++;
        neighbors.push(neighborIdx);
      }
    }

    if (neighborCount <= 1) {
      endpoints.push(triIdx);
    }
  }

  return endpoints;
}

// Polygon-based admissibility test as described in the comment
function isPolygonAdmissible(
  polygon: number[], // Current polygon vertices
  edgeV1Idx: number, edgeV2Idx: number, // Edge being tested
  newVertIdx: number, // New vertex to potentially add
  navmeshData: NavmeshData
): boolean {
  // Find indices of V[0] and V[3] in the polygon
  let v1Pos = polygon.indexOf(edgeV1Idx);
  let v2Pos = polygon.indexOf(edgeV2Idx);
  if (v1Pos === -1 || v2Pos === -1) return false;

  // Ensure (V1,V2) are consecutive in forward direction; else allow reversed
  const nextPos = (v1Pos + 1) % polygon.length;
  if (nextPos !== v2Pos) {
    const prevPos = (v1Pos - 1 + polygon.length) % polygon.length;
    if (prevPos !== v2Pos) return false;
    [edgeV1Idx, edgeV2Idx] = [edgeV2Idx, edgeV1Idx];
    v1Pos = polygon.indexOf(edgeV1Idx);
    v2Pos = polygon.indexOf(edgeV2Idx);
  }

  const v0Pos = (v1Pos - 1 + polygon.length) % polygon.length;
  const v3Pos = (v2Pos + 1) % polygon.length;
  const v0Idx = polygon[v0Pos];
  const v3Idx = polygon[v3Pos];

  // Use global scratch to avoid allocations
  const pV0 = SCR_POLY.pV0, pV1 = SCR_POLY.pV1, pV2 = SCR_POLY.pV2, pV3 = SCR_POLY.pV3;
  const pD = SCR_POLY.pD, M = SCR_POLY.M, N = SCR_POLY.N, MPrime = SCR_POLY.MPr, NPrime = SCR_POLY.NPr;
  const V1D = SCR_POLY.V1D, V2D = SCR_POLY.V2D;

  getPointInto(v0Idx, navmeshData, pV0);
  getPointInto(edgeV1Idx, navmeshData, pV1);
  getPointInto(edgeV2Idx, navmeshData, pV2);
  getPointInto(v3Idx, navmeshData, pV3);
  getPointInto(newVertIdx, navmeshData, pD);

  set(M, pV1.x, pV1.y); subtract_(M, pV0);
  set(N, pV2.x, pV2.y); subtract_(N, pV3);
  set(MPrime, -M.y, M.x);
  set(NPrime, N.y, -N.x);
  set(V1D, pD.x, pD.y); subtract_(V1D, pV1);
  set(V2D, pD.x, pD.y); subtract_(V2D, pV2);

  return dot(MPrime, V1D) >= 0 && dot(NPrime, V2D) >= 0;
}

// Helper class for optimized polygon creation with large groups
class OptimizedGroupProcessor {
  // Nested numeric maps: min(v1,v2) -> max(v1,v2) -> triangle indices
  private edgeToTriangles: Map<number, Map<number, number[]>> = new Map();

  constructor(private group: number[], private navmeshData: NavmeshData) {
    this.precomputeEdgeToTriangles();
  }

  private precomputeEdgeToTriangles(): void {
    for (const triIdx of this.group) {
      const verts = [
        this.navmeshData.triangles[triIdx * 3],
        this.navmeshData.triangles[triIdx * 3 + 1],
        this.navmeshData.triangles[triIdx * 3 + 2],
      ];

      // For each edge of the triangle
      for (let i = 0; i < 3; i++) {
        let v1 = verts[i];
        let v2 = verts[(i + 1) % 3];
        if (v2 < v1) { const tmp = v1; v1 = v2; v2 = tmp; }

        let inner = this.edgeToTriangles.get(v1);
        if (!inner) { inner = new Map<number, number[]>(); this.edgeToTriangles.set(v1, inner); }
        let arr = inner.get(v2);
        if (!arr) { arr = []; inner.set(v2, arr); }
        arr.push(triIdx);
      }
    }
  }

  findTrianglesWithEdge(v1: number, v2: number, used: Set<number>): number[] {
    if (v2 < v1) { const tmp = v1; v1 = v2; v2 = tmp; }
    const inner = this.edgeToTriangles.get(v1);
    if (!inner) return [];
    const triangles = inner.get(v2) || [];
    if (triangles.length === 0) return triangles;
    // Filter out already used triangles
    const out: number[] = [];
    for (let i = 0; i < triangles.length; i++) {
      const t = triangles[i];
      if (!used.has(t)) out.push(t);
    }
    return out;
  }

  getTriangleVertices(triIdx: number): [number, number, number] {
    const base = triIdx * 3;
    return [
      this.navmeshData.triangles[base],
      this.navmeshData.triangles[base + 1],
      this.navmeshData.triangles[base + 2],
    ];
  }

  // Admissibility for current edge using its index in the polygon
  isEdgeAdmissibleAtIndex(
    polygon: number[],
    edgeIndex: number,
    newVertIdx: number
  ): boolean {
    const len = polygon.length;
    const v0Idx = polygon[(edgeIndex - 1 + len) % len];
    const v1Idx = polygon[edgeIndex];
    const v2Idx = polygon[(edgeIndex + 1) % len];
    const v3Idx = polygon[(edgeIndex + 2) % len];

    const pV0 = SCR_POLY.pV0, pV1 = SCR_POLY.pV1, pV2 = SCR_POLY.pV2, pV3 = SCR_POLY.pV3;
    const pD = SCR_POLY.pD, M = SCR_POLY.M, N = SCR_POLY.N, MPrime = SCR_POLY.MPr, NPrime = SCR_POLY.NPr;
    const V1D = SCR_POLY.V1D, V2D = SCR_POLY.V2D;

    getPointInto(v0Idx, this.navmeshData, pV0);
    getPointInto(v1Idx, this.navmeshData, pV1);
    getPointInto(v2Idx, this.navmeshData, pV2);
    getPointInto(v3Idx, this.navmeshData, pV3);
    getPointInto(newVertIdx, this.navmeshData, pD);

    set(M, pV1.x, pV1.y); subtract_(M, pV0);
    set(N, pV2.x, pV2.y); subtract_(N, pV3);
    set(MPrime, -M.y, M.x);
    set(NPrime, N.y, -N.x);
    set(V1D, pD.x, pD.y); subtract_(V1D, pV1);
    set(V2D, pD.x, pD.y); subtract_(V2D, pV2);

    return dot(MPrime, V1D) >= 0 && dot(NPrime, V2D) >= 0;
  }
}

// Optimized version of createPolygonFromTriangle for large groups
function createPolygonFromTriangleOptimized(
  startTriIdx: number, 
  processor: OptimizedGroupProcessor,
  used: Set<number>, 
  navmeshData: NavmeshData
): { polygon: number[], triangles: number[] } {
  used.add(startTriIdx);
  const triangles = [startTriIdx];

  // Get vertices of starting triangle
  const startTriVerts = processor.getTriangleVertices(startTriIdx);

  // Initialize polygon with starting triangle vertices (assume CCW order)
  const polygon = [...startTriVerts];

  let changed = true;
  let iteration = 0;

  while (changed) {
    iteration++;
    changed = false;

    // Try to consume neighbors for each edge
    for (let i = 0; i < polygon.length; i++) {
      const v1Idx = polygon[i];
      const v2Idx = polygon[(i + 1) % polygon.length];

      // Use optimized edge lookup instead of linear search
      const candidateTriangles = processor.findTrianglesWithEdge(v1Idx, v2Idx, used);

      let candidateTriIdx = -1;
      let candidateNewVertIdx = -1;

      for (const triIdx of candidateTriangles) {
        const triVerts = processor.getTriangleVertices(triIdx);

        // Find the unique vertex in this triangle
        const newVertIdx = triVerts.find(v => v !== v1Idx && v !== v2Idx)!;

        // Test admissibility using optimized version
        if (processor.isEdgeAdmissibleAtIndex(polygon, i, newVertIdx)) {
          candidateTriIdx = triIdx;
          candidateNewVertIdx = newVertIdx;
          break;
        }
      }

      // If we found an admissible triangle, consume it
      if (candidateTriIdx !== -1) {
        // Insert the new vertex between v1 and v2
        polygon.splice(i + 1, 0, candidateNewVertIdx);
        used.add(candidateTriIdx);
        triangles.push(candidateTriIdx);
        changed = true;

        // Since we modified the polygon, we need to restart the edge checking
        i--; // This will be incremented by the loop, effectively staying at the same position
        break;
      }
    }
  }

  return { polygon, triangles };
}

// Create a single polygon from a starting triangle, consuming neighbors until no more can be consumed
function createPolygonFromTriangle(
  startTriIdx: number, 
  group: number[], 
  used: Set<number>, 
  navmeshData: NavmeshData
): { polygon: number[], triangles: number[] } {
  used.add(startTriIdx);
  const triangles = [startTriIdx];

  // Get vertices of starting triangle
  const startTriVerts = [
    navmeshData.triangles[startTriIdx * 3],
    navmeshData.triangles[startTriIdx * 3 + 1],
    navmeshData.triangles[startTriIdx * 3 + 2],
  ];

  // Initialize polygon with starting triangle vertices (assume CCW order)
  const polygon = [...startTriVerts];

  let changed = true;
  let iteration = 0;
  while (changed) {
    iteration++;
    changed = false;

    // Try to consume neighbors for each edge
    for (let i = 0; i < polygon.length; i++) {
      const v1Idx = polygon[i];
      const v2Idx = polygon[(i + 1) % polygon.length];

      // Find triangles that share this edge
      let candidateTriIdx = -1;
      let candidateNewVertIdx = -1;
      let testedTriangles = 0;
      let sharingEdgeCount = 0;

      for (const triIdx of group) {
        if (used.has(triIdx)) continue;

        testedTriangles++;
        const triVerts = [
          navmeshData.triangles[triIdx * 3],
          navmeshData.triangles[triIdx * 3 + 1],
          navmeshData.triangles[triIdx * 3 + 2],
        ];

        // Check if this triangle shares the edge v1-v2
        const hasV1 = triVerts.includes(v1Idx);
        const hasV2 = triVerts.includes(v2Idx);

        if (hasV1 && hasV2) {
          sharingEdgeCount++;
          // Found a triangle sharing this edge
          const newVertIdx = triVerts.find(v => v !== v1Idx && v !== v2Idx)!;

          // Test admissibility
          if (isPolygonAdmissible(polygon, v1Idx, v2Idx, newVertIdx, navmeshData)) {
            candidateTriIdx = triIdx;
            candidateNewVertIdx = newVertIdx;
            break;
          }
        }
      }

      // If we found an admissible triangle, consume it
      if (candidateTriIdx !== -1) {
        // Insert the new vertex between v1 and v2
        polygon.splice(i + 1, 0, candidateNewVertIdx);
        used.add(candidateTriIdx);
        triangles.push(candidateTriIdx);
        changed = true;

        // Since we modified the polygon, we need to restart the edge checking
        // The comment mentions "i-- and check V[1], V[2] again"
        i--; // This will be incremented by the loop, effectively staying at the same position
        break;
      }
    }
  }

  return { polygon, triangles };
}

// Process a triangle group completely, creating multiple polygons until all triangles are used
function processGroup(group: number[], navmeshData: NavmeshData): { polygons: number[][], polygonTriangles: number[][] } {
  if (group.length === 0) return { polygons: [], polygonTriangles: [] };

  const used = new Set<number>();
  const polygons: number[][] = [];
  const polygonTriangles: number[][] = [];

  const useOptimized = group.length > 10;
  const processor = useOptimized ? new OptimizedGroupProcessor(group, navmeshData) : null;

  let polygonCount = 0;
  // Precompute endpoints once and keep a cursor over them
  const endpoints = findEndpointTriangles(group, navmeshData);
  let endpointCursor = 0;
  // Monotonic cursor for first-unused fallback
  let startCursor = 0;
  // Continue until all triangles in the group are used
  while (used.size < group.length) {
    polygonCount++;

    // Pick the first unused endpoint; if none left, pick first unused in group
    let startTriIdx: number = -1;
    while (endpointCursor < endpoints.length && used.has(endpoints[endpointCursor])) endpointCursor++;
    if (endpointCursor < endpoints.length) {
      startTriIdx = endpoints[endpointCursor++];
    } else {
      // Advance startCursor to the first unused triangle
      while (startCursor < group.length && used.has(group[startCursor])) startCursor++;
      if (startCursor < group.length) {
        startTriIdx = group[startCursor++];
      } else {
        // Safety fallback: linear scan
        for (let k = 0; k < group.length; k++) {
          const t = group[k];
          if (!used.has(t)) { startTriIdx = t; break; }
        }
      }
    }
    if (startTriIdx === -1) break;

    // Create a polygon starting from this triangle
    const { polygon, triangles } = useOptimized && processor
      ? createPolygonFromTriangleOptimized(startTriIdx, processor, used, navmeshData)
      : createPolygonFromTriangle(startTriIdx, group, used, navmeshData);
    polygons.push(polygon);
    polygonTriangles.push(triangles);

    // No need to update endpoints; we skip used entries via cursors
  }

  return { polygons, polygonTriangles };
}

// Optimized group gathering with pre-computed data structures
class OptimizedGroupGatherer {
  private trianglePoints: Map<number, [Point2, Point2, Point2]> = new Map();

  constructor(private navmeshData: NavmeshData, private walkableTriangleCount: number) {
    this.precomputeTriangleData();
  }

  private precomputeTriangleData(): void {
    for (let triIdx = 0; triIdx < this.walkableTriangleCount; triIdx++) {
      const vbase = triIdx * 3;
      const v0 = this.navmeshData.triangles[vbase];
      const v1 = this.navmeshData.triangles[vbase + 1];
      const v2 = this.navmeshData.triangles[vbase + 2];

      const points: [Point2, Point2, Point2] = [
        getPoint(v0, this.navmeshData),
        getPoint(v1, this.navmeshData),
        getPoint(v2, this.navmeshData),
      ];
      this.trianglePoints.set(triIdx, points);
    }
  }

  // No adjacency precompute: compute shared edge on the fly

  private computeSharedEdge(tri1_idx: number, tri2_idx: number): [number, number] | null {
    const t1b = tri1_idx * 3;
    const t2b = tri2_idx * 3;
    const t1_0 = this.navmeshData.triangles[t1b];
    const t1_1 = this.navmeshData.triangles[t1b + 1];
    const t1_2 = this.navmeshData.triangles[t1b + 2];
    const t2_0 = this.navmeshData.triangles[t2b];
    const t2_1 = this.navmeshData.triangles[t2b + 1];
    const t2_2 = this.navmeshData.triangles[t2b + 2];

    // Find common vertices without allocating Sets/Arrays; preserve t1 order
    let s0 = -1; let s1 = -1; let count = 0;
    const check = (v: number) => {
      if (v === t2_0 || v === t2_1 || v === t2_2) {
        if (count === 0) s0 = v; else s1 = v;
        count++;
      }
    };
    check(t1_0);
    if (count < 2) check(t1_1);
    if (count < 2) check(t1_2);
    return count === 2 ? [s0, s1] as [number, number] : null;
  }

  getTriangleVertices(triIdx: number): [number, number, number] {
    const base = triIdx * 3;
    return [
      this.navmeshData.triangles[base],
      this.navmeshData.triangles[base + 1],
      this.navmeshData.triangles[base + 2],
    ];
  }

  getTrianglePoints(triIdx: number): [Point2, Point2, Point2] {
    return this.trianglePoints.get(triIdx)!;
  }

  getSharedEdge(tri1_idx: number, tri2_idx: number): [number, number] | null {
    return this.computeSharedEdge(tri1_idx, tri2_idx);
  }

  // Fast admissibility test using pre-computed points
  isTriangleAdmissibleFast(
    currentTriIdx: number,
    neighborTriIdx: number,
    edgeV1: number,
    edgeV2: number,
    newVertIdx: number
  ): boolean {
    const currentVerts = this.getTriangleVertices(currentTriIdx);
    const currentPoints = this.getTrianglePoints(currentTriIdx);

    // Find the third vertex in current triangle (not part of shared edge)
    const currentThirdVert = currentVerts.find(v => v !== edgeV1 && v !== edgeV2)!;
    const currentThirdPoint = currentPoints[currentVerts.indexOf(currentThirdVert)];

    // Use global triangle scratch points
    const newPoint = SCR_TRI.newP, edgeV1Point = SCR_TRI.e1P, edgeV2Point = SCR_TRI.e2P;
    const e1 = SCR_TRI.e1, e2 = SCR_TRI.e2, toNew = SCR_TRI.toN;

    getPointInto(newVertIdx, this.navmeshData, newPoint);
    getPointInto(edgeV1, this.navmeshData, edgeV1Point);
    getPointInto(edgeV2, this.navmeshData, edgeV2Point);

    // e1 = edgeV1 - A; e2 = edgeV2 - A (in-place)
    set(e1, edgeV1Point.x, edgeV1Point.y); subtract_(e1, currentThirdPoint);
    set(e2, edgeV2Point.x, edgeV2Point.y); subtract_(e2, currentThirdPoint);

    let order = cross(e1, e2);
    if (order < 0) {
      // Swap so that rotating e1 CCW sweeps to e2 through the interior wedge
      const tmpX = e1.x, tmpY = e1.y; e1.x = e2.x; e1.y = e2.y; e2.x = tmpX; e2.y = tmpY;
    }

    // toNew = D - A
    set(toNew, newPoint.x, newPoint.y); subtract_(toNew, currentThirdPoint);

    // Wedge test
    const cross1 = cross(e1, toNew);
    const cross2 = cross(toNew, e2);
    const EPS = 0;
    return cross1 >= EPS && cross2 >= EPS;
  }
}

// Optimized group gathering function
function gatherGroupsOptimized(navmeshData: NavmeshData): { groups: number[][], totalAdmissibleEdges: number } {
  const walkableTriangleCount = navmeshData.walkable_triangle_count;
  const visited = new Array(walkableTriangleCount).fill(false);
  const groups: number[][] = [];
  const gatherer = new OptimizedGroupGatherer(navmeshData, walkableTriangleCount);

  let totalAdmissibleEdges = 0;

  for (let i = 0; i < walkableTriangleCount; i++) {
    if (!visited[i]) {
      const group: number[] = [];
      const queue: number[] = [i];
      visited[i] = true;
      let head = 0;

      while(head < queue.length) {
        const triIdx = queue[head++];
        group.push(triIdx);

        // Process each neighbor more efficiently
        for (let j = 0; j < 3; j++) {
          const neighborIdx = navmeshData.neighbors[triIdx * 3 + j];

          if (neighborIdx >= 0 && neighborIdx < walkableTriangleCount && !visited[neighborIdx]) {
            // Use pre-computed shared edge
            const sharedEdge = gatherer.getSharedEdge(triIdx, neighborIdx);
            if (sharedEdge) {
              const [edgeV1, edgeV2] = sharedEdge;

              // Find the unique vertex in the neighbor triangle using pre-computed data
              const neighborTriVerts = gatherer.getTriangleVertices(neighborIdx);
              const newVertIdx = neighborTriVerts.find(v => v !== edgeV1 && v !== edgeV2)!;

              // Use fast admissibility test
              if (gatherer.isTriangleAdmissibleFast(triIdx, neighborIdx, edgeV1, edgeV2, newVertIdx)) {
                visited[neighborIdx] = true;
                queue.push(neighborIdx);
                totalAdmissibleEdges++;
              }
            }
          }
        }
      }
      groups.push(group);
    }
  }

  return { groups, totalAdmissibleEdges };
}

export function newPolygonization(navmeshData: NavmeshData): void {
  const walkableTriangleCount = navmeshData.walkable_triangle_count;
  if (walkableTriangleCount === 0) {
    return;
  }
  const __tm0 = Date.now();

  // Use optimized group gathering for better performance
  const { groups, totalAdmissibleEdges } = gatherGroupsOptimized(navmeshData);
  const __tm1 = Date.now();

  if (groups.length === 0) {
    return;
  }

  // Calculate statistics for logging
  const earlyGroupSizes = groups.map(g => g.length).sort((a, b) => b - a); // Sort descending
  const top5GroupSizes = earlyGroupSizes.slice(0, 5);

  // Process triangle groups to create polygons using the main algorithm
  const allPolygons: number[][] = [];
  const allPolygonTriangles: number[][] = [];

  for (let i = 0; i < groups.length; i++) {
    const group = groups[i];
    const { polygons: groupPolygons, polygonTriangles: groupPolygonTriangles } = processGroup(group, navmeshData);
    allPolygons.push(...groupPolygons);
    allPolygonTriangles.push(...groupPolygonTriangles);
  }
  const __tm2 = Date.now();

  console.log(`${groups.length} groups, ${totalAdmissibleEdges} admissible edges, ${allPolygons.length} polygons, top 5 group sizes: [${top5GroupSizes.join(', ')}]`);

  if (navmeshData.debug_output_dir) {
    const outputPath = path.join(navmeshData.debug_output_dir, 'navmesh_groups_visualization.png');
    drawTriangleGroups(navmeshData, groups, outputPath);
  }

  // Statistics
  const groupSizes = groups.map((g: number[]) => g.length);
  groupSizes.sort((a: number, b: number) => a - b);

  const polygonSizes = allPolygons.map((p: number[]) => p.length);
  polygonSizes.sort((a: number, b: number) => a - b);

  const largestGroup = groupSizes[groupSizes.length - 1];
  const medianGroup = groupSizes.length % 2 === 1 
    ? groupSizes[Math.floor(groupSizes.length / 2)]
    : (groupSizes[groupSizes.length / 2 - 1] + groupSizes[groupSizes.length / 2]) / 2;

  const largestPolygon = polygonSizes.length > 0 ? polygonSizes[polygonSizes.length - 1] : 0;
  const medianPolygon = polygonSizes.length > 0 ? (
    polygonSizes.length % 2 === 1 
      ? polygonSizes[Math.floor(polygonSizes.length / 2)]
      : (polygonSizes[polygonSizes.length / 2 - 1] + polygonSizes[polygonSizes.length / 2]) / 2
  ) : 0;

  const averagePolygonsPerGroup = groups.length > 0 ? allPolygons.length / groups.length : 0;

  // Populate navmeshData with the generated polygons
  let polyVertsIndex = 0;
  navmeshData.polygons[0] = 0;

  // Create the final sorted triangles array (sorted by polygon ID)
  const sortedTriangles = new Int32Array(navmeshData.triangles.length);
  const sortedNeighbors = new Int32Array(navmeshData.neighbors.length);
  const oldToNewTriangleIndex = new Map<number, number>();

  let newTriangleIndex = 0;

  for (let i = 0; i < allPolygons.length; i++) {
    const poly = allPolygons[i];
    for (let j = 0; j < poly.length; j++) {
      navmeshData.poly_verts[polyVertsIndex++] = poly[j];
    }
    navmeshData.polygons[i + 1] = polyVertsIndex;

    const triangles = allPolygonTriangles[i];
    navmeshData.poly_tris[i] = newTriangleIndex;

    // Copy triangles in the new sorted order
    for (const oldTriIdx of triangles) {
      // Copy triangle vertices
      sortedTriangles[newTriangleIndex * 3] = navmeshData.triangles[oldTriIdx * 3];
      sortedTriangles[newTriangleIndex * 3 + 1] = navmeshData.triangles[oldTriIdx * 3 + 1];
      sortedTriangles[newTriangleIndex * 3 + 2] = navmeshData.triangles[oldTriIdx * 3 + 2];

      // Track the remapping
      oldToNewTriangleIndex.set(oldTriIdx, newTriangleIndex);

      newTriangleIndex++;
    }
  }

  // Set the sentinel for poly_tris
  navmeshData.poly_tris[allPolygons.length] = newTriangleIndex;

  // Now remap the triangle neighbors
  for (let oldTriIdx = 0; oldTriIdx < navmeshData.walkable_triangle_count; oldTriIdx++) {
    const newTriIdx = oldToNewTriangleIndex.get(oldTriIdx);
    if (newTriIdx !== undefined) {
      for (let edge = 0; edge < 3; edge++) {
        const oldNeighbor = navmeshData.neighbors[oldTriIdx * 3 + edge];
        if (oldNeighbor !== -1) {
          const newNeighbor = oldToNewTriangleIndex.get(oldNeighbor);
          sortedNeighbors[newTriIdx * 3 + edge] = newNeighbor !== undefined ? newNeighbor : oldNeighbor;
        } else {
          sortedNeighbors[newTriIdx * 3 + edge] = -1;
        }
      }
    }
  }

  // Copy impassable triangles and neighbors (they come after walkable ones)
  for (let oldTriIdx = navmeshData.walkable_triangle_count; oldTriIdx < navmeshData.triangles.length / 3; oldTriIdx++) {
    const newTriIdx = newTriangleIndex++;

    // Copy triangle vertices
    sortedTriangles[newTriIdx * 3] = navmeshData.triangles[oldTriIdx * 3];
    sortedTriangles[newTriIdx * 3 + 1] = navmeshData.triangles[oldTriIdx * 3 + 1];
    sortedTriangles[newTriIdx * 3 + 2] = navmeshData.triangles[oldTriIdx * 3 + 2];

    // Copy neighbors (remap if they point to walkable triangles)
    for (let edge = 0; edge < 3; edge++) {
      const oldNeighbor = navmeshData.neighbors[oldTriIdx * 3 + edge];
      if (oldNeighbor !== -1 && oldNeighbor < navmeshData.walkable_triangle_count) {
        const newNeighbor = oldToNewTriangleIndex.get(oldNeighbor);
        sortedNeighbors[newTriIdx * 3 + edge] = newNeighbor !== undefined ? newNeighbor : oldNeighbor;
      } else {
        sortedNeighbors[newTriIdx * 3 + edge] = oldNeighbor;
      }
    }
  }

  // Replace the arrays with sorted versions
  navmeshData.triangles = sortedTriangles;
  navmeshData.neighbors = sortedNeighbors;

  navmeshData.walkable_polygon_count = allPolygons.length;
  const __tm3 = Date.now();
  console.log(`[polygonization timing] group=${__tm1 - __tm0}ms, polygonize=${__tm2 - __tm1}ms, remap=${__tm3 - __tm2}ms, total=${__tm3 - __tm0}ms`);
}
