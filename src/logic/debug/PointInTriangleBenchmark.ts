import type { GameState } from "../GameState";
import { isPointInTriangle, isPointInTriangle2 } from "../core/math";
import { seededRandom } from "../core/mathUtils";

export function runPointInTriangleBenchmark(gameState: GameState): void {
    const navmesh = gameState.navmesh;
    if (!navmesh || !navmesh.triIndex) {
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
        const gi = navmesh.triIndex.getGridInfo();
        minX = gi.minX;
        minY = gi.minY;
        maxX = gi.minX + gi.gridWidth * gi.cellSize;
        maxY = gi.minY + gi.gridHeight * gi.cellSize;
    }

    // Pre-generate 10,000 seeded-random points within bounds into typed arrays
    const NUM_POINTS = 1000000;
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
        const candidates = navmesh.triIndex.query(pxs[i], pys[i]);
        const len = candidates.length;
        counts[i] = len;
        totalCandidates += len;
    }

    // Offsets and flat buffers
    const offsets = new Uint32Array(NUM_POINTS + 1);
    for (let i = 0, acc = 0; i < NUM_POINTS; i++) {
        offsets[i] = acc;
        acc += counts[i];
        if (i === NUM_POINTS - 1) offsets[i + 1] = acc;
    }

    const flatAx = new Float32Array(totalCandidates);
    const flatAy = new Float32Array(totalCandidates);
    const flatBx = new Float32Array(totalCandidates);
    const flatBy = new Float32Array(totalCandidates);
    const flatCx = new Float32Array(totalCandidates);
    const flatCy = new Float32Array(totalCandidates);

    // Pass 2: fill coordinates
    const triIndices = navmesh.triangles;
    const points = navmesh.points;
    for (let i = 0; i < NUM_POINTS; i++) {
        const candidates = navmesh.triIndex.query(pxs[i], pys[i]);
        const start = offsets[i];
        for (let k = 0; k < candidates.length; k++) {
            const idx = start + k;
            const triIdx = candidates[k] as number;
            const base = triIdx * 3;
            const i1 = triIndices[base] as number;
            const i2 = triIndices[base + 1] as number;
            const i3 = triIndices[base + 2] as number;
            flatAx[idx] = points[i1 * 2];
            flatAy[idx] = points[i1 * 2 + 1];
            flatBx[idx] = points[i2 * 2];
            flatBy[idx] = points[i2 * 2 + 1];
            flatCx[idx] = points[i3 * 2];
            flatCy[idx] = points[i3 * 2 + 1];
        }
    }

    // Warm-up to reduce JIT/first-call effects (not timed)
    const warmN = Math.min(NUM_POINTS, 256);
    for (let i = 0; i < warmN; i++) {
        const px = pxs[i];
        const py = pys[i];
        const start = offsets[i];
        const end = offsets[i + 1];
        for (let idx = start; idx < end; idx++) {
            const rA = isPointInTriangle(px, py, flatAx[idx], flatAy[idx], flatBx[idx], flatBy[idx], flatCx[idx], flatCy[idx]);
            const rB = isPointInTriangle2(px, py, flatAx[idx], flatAy[idx], flatBx[idx], flatBy[idx], flatCx[idx], flatCy[idx]);
            if (rA !== rB) {
                // no-op
            }
        }
    }

    // Timed runs (no allocations inside)
    function runOriginal() {
        let zeroMatches = 0;
        let multiMatches = 0;
        const t0 = performance.now();
        for (let i = 0; i < NUM_POINTS; i++) {
            const px = pxs[i];
            const py = pys[i];
            let matches = 0;
            const start = offsets[i];
            const end = offsets[i + 1];
            for (let idx = start; idx < end; idx++) {
                if (isPointInTriangle(px, py, flatAx[idx], flatAy[idx], flatBx[idx], flatBy[idx], flatCx[idx], flatCy[idx])) {
                    matches++;
                }
            }
            if (matches === 0) zeroMatches++;
            if (matches > 1) multiMatches++;
        }
        const t1 = performance.now();
        return { durMs: t1 - t0, zeroMatches, multiMatches };
    }

    function runAlt() {
        let zeroMatches = 0;
        let multiMatches = 0;
        const t0 = performance.now();
        for (let i = 0; i < NUM_POINTS; i++) {
            const px = pxs[i];
            const py = pys[i];
            let matches = 0;
            const start = offsets[i];
            const end = offsets[i + 1];
            for (let idx = start; idx < end; idx++) {
                if (isPointInTriangle2(px, py, flatAx[idx], flatAy[idx], flatBx[idx], flatBy[idx], flatCx[idx], flatCy[idx])) {
                    matches++;
                }
            }
            if (matches === 0) zeroMatches++;
            if (matches > 1) multiMatches++;
        }
        const t1 = performance.now();
        return { durMs: t1 - t0, zeroMatches, multiMatches };
    }

    const r1 = runOriginal();
    const r2 = runAlt();

    // Build a single summary string
    let summary = "";
    summary += `Point-in-triangle benchmark over ${NUM_POINTS} points (precomputed candidates & coords)\n`;
    summary += `- isPointInTriangle: durationMs=${r1.durMs.toFixed()} zeroMatches=${r1.zeroMatches} multiMatches=${r1.multiMatches}\n`;
    summary += `- isPointInTriangle2: durationMs=${r2.durMs.toFixed()} zeroMatches=${r2.zeroMatches} multiMatches=${r2.multiMatches}`;

    // Diagnostics: collect first 10 zero-match failures for each method (untimed)
    function collectFirstFailures(maxCount: number, useAlt: boolean): string[] {
        const lines: string[] = [];
        for (let i = 0; i < NUM_POINTS && lines.length < maxCount; i++) {
            const px = pxs[i];
            const py = pys[i];
            let matches = 0;
            const start = offsets[i];
            const end = offsets[i + 1];
            for (let idx = start; idx < end; idx++) {
                const hit = useAlt
                    ? isPointInTriangle2(px, py, flatAx[idx], flatAy[idx], flatBx[idx], flatBy[idx], flatCx[idx], flatCy[idx])
                    : isPointInTriangle(px, py, flatAx[idx], flatAy[idx], flatBx[idx], flatBy[idx], flatCx[idx], flatCy[idx]);
                if (hit) matches++;
            }
            if (matches === 0) {
                const numCandidates = end - start;
                lines.push(`i=${i} p=(${px.toFixed(2)},${py.toFixed(2)}) candidates=${numCandidates}`);
            }
        }
        return lines;
    }

    const first10Orig = collectFirstFailures(10, false);
    const first10Alt = collectFirstFailures(10, true);

    if (first10Orig.length > 0 || first10Alt.length > 0) {
        summary += "\nFailures (first 10 each):";
        if (first10Orig.length > 0) {
            summary += `\n- isPointInTriangle zero-matches:\n  ${first10Orig.join("\n  ")}`;
        }
        if (first10Alt.length > 0) {
            summary += `\n- isPointInTriangle2 zero-matches:\n  ${first10Alt.join("\n  ")}`;
        }
    }

    console.log(summary);
} 