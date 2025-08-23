import { MyPolygon, NavmeshData } from './navmesh_struct';

interface Edge {
    v1: number;
    v2: number;
}

interface TriangleInfo {
    vertices: [number, number, number];
    neighbors: (number | null)[]; // Direct index to neighbor triangle
    merged: boolean;
}

interface PolygonizationContext {
    navmeshData: NavmeshData;
    settings: {
        enableConvexityChecks: boolean;
        maxMergeAttempts: number;
    };
}

export function hertelMehlhorn(context: PolygonizationContext): { polygons: MyPolygon[], triangleToPolygonMap: Map<number, number> } {
    console.log('Running Hertel-Mehlhorn polygonization...');

    if (context.navmeshData.walkable_triangle_count === 0) {
        return { polygons: [], triangleToPolygonMap: new Map() };
    }
    
    return hertelMehlhornOptimized(context);
}

function hertelMehlhornOptimized(context: PolygonizationContext): { polygons: MyPolygon[], triangleToPolygonMap: Map<number, number> } {
    const settings = context.settings;
    const navmeshData = context.navmeshData;
    const walkableTriangleCount = navmeshData.walkable_triangle_count;

    const triangleInfos: TriangleInfo[] = [];
    for (let i = 0; i < walkableTriangleCount; i++) {
        const triBase = i * 3;
        const neighborBase = i * 3;
        triangleInfos.push({
            vertices: [
                navmeshData.triangles[triBase],
                navmeshData.triangles[triBase + 1],
                navmeshData.triangles[triBase + 2]
            ],
            neighbors: [
                navmeshData.neighbors[neighborBase],
                navmeshData.neighbors[neighborBase + 1],
                navmeshData.neighbors[neighborBase + 2]
            ],
            merged: false
        });
    }

    const { polygons, triangleToPolygonMap } = performGreedyMerging(triangleInfos, navmeshData, settings);
    
    console.log(`Hertel-Mehlhorn (optimized): Merged ${walkableTriangleCount} triangles into ${polygons.length} convex polygons`);
    return { polygons, triangleToPolygonMap };
}

function performGreedyMerging(
    triangleInfos: TriangleInfo[],
    navmeshData: NavmeshData,
    settings: any
): { polygons: MyPolygon[], triangleToPolygonMap: Map<number, number> } {
    const polygons: MyPolygon[] = [];
    const triangleToPolygonMap = new Map<number, number>();
    const visited = new Set<number>();
    const enableConvexityChecks = settings?.enableConvexityChecks !== false;

    for (let startTriIndex = 0; startTriIndex < triangleInfos.length; startTriIndex++) {
        if (visited.has(startTriIndex) || triangleInfos[startTriIndex].merged) {
            continue;
        }

        const { polygon: currentPolygon, mergedIndices } = mergeFromTriangle(
            startTriIndex, 
            triangleInfos, 
            navmeshData,
            visited,
            enableConvexityChecks
        );
        
        if (currentPolygon.length >= 3) {
            const polygonId = polygons.length;
            polygons.push(currentPolygon);
            for (const triIndex of mergedIndices) {
                triangleToPolygonMap.set(triIndex, polygonId);
            }
        }
    }

    return { polygons, triangleToPolygonMap };
}

function mergeFromTriangle(
    startIndex: number, 
    triangleInfos: TriangleInfo[], 
    navmeshData: NavmeshData,
    visited: Set<number>,
    enableConvexityChecks: boolean
): { polygon: MyPolygon, mergedIndices: Set<number> } {
    const merged = new Set<number>();
    const toProcess = [startIndex];
    
    while (toProcess.length > 0) {
        const currentIndex = toProcess.pop()!;
        
        if (merged.has(currentIndex) || visited.has(currentIndex)) {
            continue;
        }
        
        merged.add(currentIndex);
        visited.add(currentIndex);
        
        for (const neighborIndex of triangleInfos[currentIndex].neighbors) {
            if (neighborIndex === null || neighborIndex < 0 || neighborIndex >= triangleInfos.length || merged.has(neighborIndex) || visited.has(neighborIndex)) {
                continue;
            }
            
            if (enableConvexityChecks) {
                const testPolygon = createPolygonFromTriangles(
                    [...merged, neighborIndex], 
                    triangleInfos, 
                    navmeshData
                );
                
                if (testPolygon && isConvex(testPolygon)) {
                    toProcess.push(neighborIndex);
                }
            } else {
                toProcess.push(neighborIndex);
            }
        }
    }
    
    const finalPolygon = createPolygonFromTriangles([...merged], triangleInfos, navmeshData);
    return { polygon: finalPolygon || [], mergedIndices: merged };
}

function createPolygonFromTriangles(
    triangleIndices: number[], 
    triangleInfos: TriangleInfo[], 
    navmeshData: NavmeshData
): MyPolygon | null {
    if (triangleIndices.length === 0) return null;
    
    const edges: Edge[] = [];
    
    for (const triIndex of triangleIndices) {
        const tri = triangleInfos[triIndex];
        const triEdges = [
            { v1: tri.vertices[0], v2: tri.vertices[1] },
            { v1: tri.vertices[1], v2: tri.vertices[2] },
            { v1: tri.vertices[2], v2: tri.vertices[0] }
        ];
        
        for (const edge of triEdges) {
            const existing = edges.findIndex(e => 
                (e.v1 === edge.v1 && e.v2 === edge.v2) || 
                (e.v1 === edge.v2 && e.v2 === edge.v1)
            );
            
            if (existing >= 0) {
                edges.splice(existing, 1);
            } else {
                edges.push(edge);
            }
        }
    }
    
    if (edges.length === 0) return null;
    
    const polygon: MyPolygon = [];
    const usedEdges = new Set<number>();
    let currentVertex = edges[0].v1;
    
    const getVertexCoords = (vertexIndex: number): [number, number] => {
        return [navmeshData.vertices[vertexIndex * 2], navmeshData.vertices[vertexIndex * 2 + 1]];
    };
    
    polygon.push(getVertexCoords(currentVertex));
    
    while (true) {
        let nextEdgeIndex = -1;
        let nextVertex = -1;
        
        for (let i = 0; i < edges.length; i++) {
            if (usedEdges.has(i)) continue;
            
            if (edges[i].v1 === currentVertex) {
                nextEdgeIndex = i;
                nextVertex = edges[i].v2;
                break;
            } else if (edges[i].v2 === currentVertex) {
                nextEdgeIndex = i;
                nextVertex = edges[i].v1;
                break;
            }
        }
        
        if (nextEdgeIndex === -1 || nextVertex === edges[0].v1) {
            break;
        }
        
        usedEdges.add(nextEdgeIndex);
        polygon.push(getVertexCoords(nextVertex));
        currentVertex = nextVertex;
    }
    
    return polygon.length >= 3 ? polygon : null;
}

function isConvex(polygon: MyPolygon): boolean {
    if (polygon.length < 3) return false;
    
    let sign = 0;
    const n = polygon.length;
    
    for (let i = 0; i < n; i++) {
        const p1 = polygon[i];
        const p2 = polygon[(i + 1) % n];
        const p3 = polygon[(i + 2) % n];
        
        const cross = (p2[0] - p1[0]) * (p3[1] - p2[1]) - (p2[1] - p1[1]) * (p3[0] - p2[0]);
        
        if (Math.abs(cross) < 1e-10) continue;
        
        if (sign === 0) {
            sign = cross > 0 ? 1 : -1;
        } else if ((cross > 0) !== (sign > 0)) {
            return false;
        }
    }
    
    return true;
} 