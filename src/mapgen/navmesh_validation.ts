import { NavmeshData } from './navmesh_struct';

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
    console.log('\n=== VALIDATING VERTEX DISTANCES ===');
    const vertices = navmeshData.vertices;
    const vertexCount = navmeshData.stats.vertices;
    const grid: SpatialGrid = new Map();

    console.log(`Building spatial grid for ${vertexCount} vertices...`);
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

    console.log(`Checking distances...`);

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
        console.error('Vertex distance validation failed. Found vertices closer than the minimum distance of 1.');
    }

    return !foundIssues;
}

export function validateTrianglePolygonMapping(navmeshData: NavmeshData): boolean {
    console.log('\n=== VALIDATING TRIANGLE-POLYGON MAPPING ===');

    const walkableTriangleCount = navmeshData.walkable_triangle_count;
    const walkablePolygonCount = navmeshData.walkable_polygon_count;
    const polyTris = navmeshData.poly_tris;

    const triangleToPolygonMap = new Int32Array(walkableTriangleCount).fill(-1);
    let foundIssues = false;

    console.log(`Checking mapping for ${walkableTriangleCount} walkable triangles and ${walkablePolygonCount} walkable polygons...`);

    // 1. Check for overlapping polygons (a triangle assigned to multiple polygons)
    for (let polyId = 0; polyId < walkablePolygonCount; polyId++) {
        const startTriIndex = polyTris[polyId];
        const endTriIndex = polyTris[polyId + 1];

        for (let triIndex = startTriIndex; triIndex < endTriIndex; triIndex++) {
            if (triIndex >= walkableTriangleCount) {
                console.error(`Validation failed: Polygon ${polyId} contains triangle index ${triIndex}, which is out of bounds for walkable triangles (${walkableTriangleCount}).`);
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

    // 2. Check for orphaned triangles (walkable triangles not assigned to any polygon)
    for (let i = 0; i < walkableTriangleCount; i++) {
        if (triangleToPolygonMap[i] === -1) {
            console.error(`Validation failed: Walkable triangle ${i} does not belong to any polygon.`);
            foundIssues = true;
        }
    }

    if (!foundIssues) {
        console.log('Triangle-polygon mapping validation passed successfully.');
    } else {
        console.error('Triangle-polygon mapping validation failed. Found triangles that are either unassigned or assigned to multiple polygons.');
    }

    return !foundIssues;
}

export function validateIntermediateTrianglePolygonMapping(
    triangleToPolygonMap: Map<number, number>,
    walkableTriangleCount: number,
    walkablePolygonCount: number,
    phase: string
): boolean {
    console.log(`\n=== VALIDATING TRIANGLE-POLYGON MAPPING (AFTER ${phase.toUpperCase()}) ===`);
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