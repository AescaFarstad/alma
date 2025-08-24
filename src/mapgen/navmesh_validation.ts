import { NavmeshData, MyPolygon } from './navmesh_struct';

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