import type { GameState } from "../GameState";
import { isPointInTriangle, isPointInTriangle2 } from "../core/math";
import { seededRandom } from "../core/mathUtils";
import { testPointInsideTriangle } from "../navmesh/NavUtils";

export function runPointInTriangleBenchmark(gameState: GameState): void {
  const navmesh = gameState.navmesh;
  if (!navmesh || !navmesh.triangleIndex) {
    console.warn("Navmesh or triIndex not available");
    return;
  }

  // Resolve bounds from bbox; fallback to gridInfo if needed
  let minX: number, minY: number, maxX: number, maxY: number;
  if (navmesh.bbox && navmesh.bbox.length >= 4) {
    minX = navmesh.bbox[0];
    minY = navmesh.bbox[1];
    maxX = navmesh.bbox[2];
    maxY = navmesh.bbox[3];
  } else {
    const gi = navmesh.triangleIndex;
    minX = gi.minX;
    minY = gi.minY;
    maxX = gi.minX + gi.gridWidth * gi.cellSize;
    maxY = gi.minY + gi.gridHeight * gi.cellSize;
  }

  // Pre-generate points within bounds into typed arrays
  const NUM_POINTS = 500000;
  const pxs = new Float32Array(NUM_POINTS);
  const pys = new Float32Array(NUM_POINTS);
  let seed = 12345;
  for (let i = 0; i < NUM_POINTS; i++) {
    const r1 = seededRandom(seed); seed = r1.newSeed; const rx = r1.value;
    const r2 = seededRandom(seed); seed = r2.newSeed; const ry = r2.value;
    pxs[i] = minX + rx * (maxX - minX);
    pys[i] = minY + ry * (maxY - minY);
  }

  // Precompute candidate triangle indices per point and their coordinates into flat buffers
  // Pass 1: count total candidates
  const counts = new Uint32Array(NUM_POINTS);
  let totalCandidates = 0;
  for (let i = 0; i < NUM_POINTS; i++) {
    const candidates = navmesh.triangleIndex.query(pxs[i], pys[i]);
    const len = candidates.length;
    counts[i] = len;
    totalCandidates += len;
  }

  // Store candidate arrays for navmesh methods
  const candidateArrays: Int32Array[] = new Array(NUM_POINTS);
  for (let i = 0; i < NUM_POINTS; i++) {
    candidateArrays[i] = navmesh.triangleIndex.query(pxs[i], pys[i]);
  }

  // Warm-up to reduce JIT/first-call effects (not timed)
  const warmN = Math.min(NUM_POINTS, 256);
  for (let i = 0; i < warmN; i++) {
    const px = pxs[i];
    const py = pys[i];
    const candidates = candidateArrays[i];
    
    // Warm up all methods using navmesh structures
    for (const triIdx of candidates) {
      testPointInsideTriangle(navmesh, px, py, triIdx);
      // testPointInsideTriangleEarlyExit(px, py, triIdx);
      // testPointInsideTriangleLoop(px, py, triIdx);
      
      // Extract coordinates for coordinate methods
      const base = triIdx * 3;
      const i1 = navmesh.triangles[base];
      const i2 = navmesh.triangles[base + 1];
      const i3 = navmesh.triangles[base + 2];
      const ax = navmesh.vertices[i1 * 2];
      const ay = navmesh.vertices[i1 * 2 + 1];
      const bx = navmesh.vertices[i2 * 2];
      const by = navmesh.vertices[i2 * 2 + 1];
      const cx = navmesh.vertices[i3 * 2];
      const cy = navmesh.vertices[i3 * 2 + 1];
      
      isPointInTriangle(px, py, ax, ay, bx, by, cx, cy);
      isPointInTriangle2(px, py, ax, ay, bx, by, cx, cy);
    }
  }

  // Timed runs (no allocations inside)
  function runNavmeshMethod(name: string, method: (x: number, y: number, tri_idx: number) => boolean) {
    let zeroMatches = 0;
    let multiMatches = 0;
    const t0 = performance.now();
    for (let i = 0; i < NUM_POINTS; i++) {
      const px = pxs[i];
      const py = pys[i];
      let matches = 0;
      const candidates = candidateArrays[i];
      for (const triIdx of candidates) {
        if (method(px, py, triIdx)) {
          matches++;
        }
      }
      if (matches === 0) zeroMatches++;
      if (matches > 1) multiMatches++;
    }
    const t1 = performance.now();
    return { name, durMs: t1 - t0, zeroMatches, multiMatches };
  }

  function runCoordinateMethod(name: string, method: (px: number, py: number, ax: number, ay: number, bx: number, by: number, cx: number, cy: number) => boolean) {
    let zeroMatches = 0;
    let multiMatches = 0;
    const t0 = performance.now();
    for (let i = 0; i < NUM_POINTS; i++) {
      const px = pxs[i];
      const py = pys[i];
      let matches = 0;
      const candidates = candidateArrays[i];
      for (const triIdx of candidates) {
        // Extract coordinates from navmesh structures
        const base = triIdx * 3;
        const i1 = navmesh.triangles[base];
        const i2 = navmesh.triangles[base + 1];
        const i3 = navmesh.triangles[base + 2];
        const ax = navmesh.vertices[i1 * 2];
        const ay = navmesh.vertices[i1 * 2 + 1];
        const bx = navmesh.vertices[i2 * 2];
        const by = navmesh.vertices[i2 * 2 + 1];
        const cx = navmesh.vertices[i3 * 2];
        const cy = navmesh.vertices[i3 * 2 + 1];
        
        if (method(px, py, ax, ay, bx, by, cx, cy)) {
          matches++;
        }
      }
      if (matches === 0) zeroMatches++;
      if (matches > 1) multiMatches++;
    }
    const t1 = performance.now();
    return { name, durMs: t1 - t0, zeroMatches, multiMatches };
  }

  // Run all benchmarks
  const results = [
    runCoordinateMethod("isPointInTriangle", isPointInTriangle),
    // runNavmeshMethod("testPointInsideTriangleLoop", (x, y, tri_idx) => navmesh.testPointInsideTriangleLoop(x, y, tri_idx)),
    runCoordinateMethod("isPointInTriangle2", isPointInTriangle2),
    // runNavmeshMethod("testPointInsideTriangleEarlyExit", (x, y, tri_idx) => navmesh.testPointInsideTriangleEarlyExit(x, y, tri_idx)),
    runNavmeshMethod("testPointInsideTriangle", (x, y, tri_idx) => testPointInsideTriangle(navmesh, x, y, tri_idx)),
  ];

  // Build summary
  let summary = "";
  summary += `Point-in-triangle benchmark over ${NUM_POINTS} points (precomputed candidates & coords)\n`;
  
  for (const result of results) {
    summary += `- ${result.name}:\tt=${result.durMs.toFixed()}\t\tzero=${result.zeroMatches}\tmulti=${result.multiMatches}\n`;
  }

  // Find fastest and slowest
  const fastest = results.reduce((min, r) => r.durMs < min.durMs ? r : min);
  const slowest = results.reduce((max, r) => r.durMs > max.durMs ? r : max);
  
  summary += `\nFastest: ${fastest.name} (${fastest.durMs.toFixed()}ms)\n`;
  summary += `Slowest: ${slowest.name} (${slowest.durMs.toFixed()}ms)\n`;
  summary += `Speed difference: ${(slowest.durMs / fastest.durMs).toFixed(2)}x`;

  console.log(summary);
} 