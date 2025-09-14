import { Point, SweepContext, Triangle } from 'poly2tri';
import { MyPoint, MyPolygon } from './navmesh_struct';
import { BoundaryData } from './navmesh_boundary';

export interface TriangulationResult {
  walkableTriangles: Triangle[];
  impassableTriangles: Triangle[];
  allTriangles: Triangle[];
  finalPoints: MyPoint[];
  finalTriangles: number[];
  finalNeighbors: number[];  // Add neighbors to the result
  walkableTriangleIndices: number[];
  impassableTriangleIndices: number[];
  impassableTriangleToBlobIndex: number[];
}

export function triangulate(outerBoundary: MyPolygon, holePolygons: MyPolygon[], boundaryData?: BoundaryData): TriangulationResult {
  console.log(`Triangulating walkable area with ${holePolygons.length} holes...`);

  // Step 1: Triangulate the walkable area (outer boundary with holes)
  const walkableSweepContext = new SweepContext(outerBoundary.map(p => new Point(p[0], p[1])));

  holePolygons.forEach(poly => {
    const holePoints = poly.map(p => new Point(p[0], p[1]));
    walkableSweepContext.addHole(holePoints);
  });

  walkableSweepContext.triangulate();
  const walkableTriangles = walkableSweepContext.getTriangles();
  console.log(`Generated ${walkableTriangles.length} walkable triangles.`);

  // Step 2: Triangulate impassable blobs (original holes + boundary blobs)
  console.log(`Triangulating impassable blobs (original + boundary)...`);
  const impassableTriangles: Triangle[] = [];
  const impassableTriangleToBlobIndex: number[] = [];

  // First, triangulate the original hole polygons
  for (let i = 0; i < holePolygons.length; i++) {
    const blob = holePolygons[i];
    if (blob.length < 3) continue; // Skip invalid polygons
    try {
      const blobSweepContext = new SweepContext(blob.map(p => new Point(p[0], p[1])));
      blobSweepContext.triangulate();
      const blobTriangles = blobSweepContext.getTriangles();
      impassableTriangles.push(...blobTriangles);
      for (let j = 0; j < blobTriangles.length; j++) impassableTriangleToBlobIndex.push(i);
    } catch (error) {
      console.warn(`Failed to triangulate blob ${i}: ${error}. Skipping this blob.`);
    }
  }

  // Then, triangulate boundary blobs (appended after original blobs)
  const boundaryBlobOffset = holePolygons.length;
  if (boundaryData && boundaryData.boundaryBlobs) {
    for (let i = 0; i < boundaryData.boundaryBlobs.length; i++) {
      const blob = boundaryData.boundaryBlobs[i];
      if (blob.length < 3) continue;
      try {
        const blobSweepContext = new SweepContext(blob.map(p => new Point(p[0], p[1])));
        blobSweepContext.triangulate();
        const blobTriangles = blobSweepContext.getTriangles();
        impassableTriangles.push(...blobTriangles);
        for (let j = 0; j < blobTriangles.length; j++) impassableTriangleToBlobIndex.push(boundaryBlobOffset + i);
      } catch (error) {
        console.warn(`Failed to triangulate boundary blob ${i}: ${error}. Skipping this boundary blob.`);
      }
    }
  }

  console.log(`Generated ${impassableTriangles.length} impassable triangles.`);

  // Step 3: Combine all triangles and create unified vertex/triangle arrays
  const allTriangles = [...walkableTriangles, ...impassableTriangles];
  const pointMap = new Map<string, number>();
  const finalPoints: MyPoint[] = [];

  // Helper function to snap coordinates back to 2-decimal precision
  // (poly2tri introduces floating-point errors during internal processing)
  const snapTo2Decimals = (coord: number): number => Math.round(coord * 100) / 100;

  const getPointIndex = (p: { x: number; y: number }): number => {
    // Snap coordinates back to 2-decimal precision after triangulation
    const snappedX = snapTo2Decimals(p.x);
    const snappedY = snapTo2Decimals(p.y);
    const key = `${snappedX};${snappedY}`;

    let idx = pointMap.get(key);
    if (idx === undefined) {
      idx = finalPoints.length;
      finalPoints.push([snappedX, snappedY]); // Store snapped coordinates
      pointMap.set(key, idx);
    }
    return idx;
  };

  // Step 4: Create indexed triangle arrays
  const finalTriangles: number[] = [];
  const walkableTriangleIndices: number[] = [];
  const impassableTriangleIndices: number[] = [];

  // Process walkable triangles first
  for (let i = 0; i < walkableTriangles.length; i++) {
    const t = walkableTriangles[i];
    const p1_idx = getPointIndex(t.getPoint(0));
    const p2_idx = getPointIndex(t.getPoint(1));
    const p3_idx = getPointIndex(t.getPoint(2));

    const triangleStartIndex = finalTriangles.length / 3;
    finalTriangles.push(p1_idx, p2_idx, p3_idx);
    walkableTriangleIndices.push(triangleStartIndex);
  }

  // Then process impassable triangles (includes boundary triangles if provided)
  for (let i = 0; i < impassableTriangles.length; i++) {
    const t = impassableTriangles[i];
    const p1_idx = getPointIndex(t.getPoint(0));
    const p2_idx = getPointIndex(t.getPoint(1));
    const p3_idx = getPointIndex(t.getPoint(2));

    const triangleStartIndex = finalTriangles.length / 3;
    finalTriangles.push(p1_idx, p2_idx, p3_idx);
    impassableTriangleIndices.push(triangleStartIndex);
  }

  // Step 5: Compute triangle neighbors
  console.log('Computing triangle neighbors...');
  const finalNeighbors = computeTriangleNeighbors(finalTriangles);

  console.log(`Final vertex count: ${finalPoints.length}`);
  console.log(`Total triangles: ${allTriangles.length} (${walkableTriangles.length} walkable + ${impassableTriangles.length} impassable)`);

  return {
    walkableTriangles,
    impassableTriangles,
    allTriangles,
    finalPoints,
    finalTriangles,
    finalNeighbors,
    walkableTriangleIndices,
    impassableTriangleIndices,
    impassableTriangleToBlobIndex
  };
}

/**
 * Compute triangle neighbors using edge-based adjacency
 * @param triangles - Array of triangle vertex indices [v1, v2, v3, ...]
 * @returns Array of neighbor triangle indices [t1, t2, t3, ...] where -1 means no neighbor
 */
function computeTriangleNeighbors(triangles: number[]): number[] {
  const numTriangles = triangles.length / 3;
  const neighbors = new Int32Array(numTriangles * 3).fill(-1);

  // Build edge-to-triangle mapping
  const edgeToTriangles = new Map<string, { triangle: number, edge: number }[]>();

  for (let triIndex = 0; triIndex < numTriangles; triIndex++) {
    const baseIdx = triIndex * 3;
    const v1 = triangles[baseIdx];
    const v2 = triangles[baseIdx + 1];
    const v3 = triangles[baseIdx + 2];

    // Define the three edges of this triangle
    const edges = [
      [v1, v2], // edge 0: v1 -> v2
      [v2, v3], // edge 1: v2 -> v3  
      [v3, v1]  // edge 2: v3 -> v1
    ];

    for (let edgeIdx = 0; edgeIdx < 3; edgeIdx++) {
      const edge = edges[edgeIdx];
      // Create a consistent edge key regardless of direction
      const edgeKey = `${Math.min(edge[0], edge[1])}-${Math.max(edge[0], edge[1])}`;

      if (!edgeToTriangles.has(edgeKey)) {
        edgeToTriangles.set(edgeKey, []);
      }
      edgeToTriangles.get(edgeKey)!.push({ triangle: triIndex, edge: edgeIdx });
    }
  }

  // Set up neighbor relationships
  for (const triangleEdges of edgeToTriangles.values()) {
    if (triangleEdges.length === 2) {
      // Two triangles share this edge
      const tri1 = triangleEdges[0];
      const tri2 = triangleEdges[1];

      // Set up bidirectional neighbor relationship
      neighbors[tri1.triangle * 3 + tri1.edge] = tri2.triangle;
      neighbors[tri2.triangle * 3 + tri2.edge] = tri1.triangle;
    }
    // If triangleEdges.length > 2, we have non-manifold geometry (should not happen in proper CDT)
    // If triangleEdges.length == 1, this is a boundary edge (neighbor remains -1)
  }

  console.log(`Computed neighbors for ${numTriangles} triangles`);
  return Array.from(neighbors);
} 
