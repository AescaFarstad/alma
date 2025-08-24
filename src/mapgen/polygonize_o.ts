import { NavmeshData } from './navmesh_struct';
import { Point2, subtract, normalize, cross, dot, scale, add } from '../logic/core/math';
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

// Helper function to rotate a vector 90 degrees counterclockwise
function rotate90CCW(v: Point2): Point2 {
    return { x: -v.y, y: v.x };
}

// Helper function to rotate a vector 90 degrees clockwise
function rotate90CW(v: Point2): Point2 {
    return { x: v.y, y: -v.x };
}

// Helper function to find shared edge between two triangles
function findSharedEdge(tri1_idx: number, tri2_idx: number, navmeshData: NavmeshData): [number, number] | null {
    const tri1_verts = [
        navmeshData.triangles[tri1_idx * 3],
        navmeshData.triangles[tri1_idx * 3 + 1],
        navmeshData.triangles[tri1_idx * 3 + 2],
    ];
    const tri2_verts = [
        navmeshData.triangles[tri2_idx * 3],
        navmeshData.triangles[tri2_idx * 3 + 1],
        navmeshData.triangles[tri2_idx * 3 + 2],
    ];

    const tri2_set = new Set(tri2_verts);
    const shared = tri1_verts.filter(v => tri2_set.has(v));
    
    if (shared.length === 2) {
        return [shared[0], shared[1]];
    }
    return null;
}

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
    // General polygon logic for all polygons (including triangles)
    // Find indices of V[0] and V[3] in the polygon
    let v1Pos = polygon.indexOf(edgeV1Idx);
    let v2Pos = polygon.indexOf(edgeV2Idx);
    
    if (v1Pos === -1 || v2Pos === -1) {
        return false;
    }
    
    // Ensure we have the right order (V[1], V[2] should be consecutive)
    const nextPos = (v1Pos + 1) % polygon.length;
    if (nextPos !== v2Pos) {
        // Try the other direction
        const prevPos = (v1Pos - 1 + polygon.length) % polygon.length;
        if (prevPos !== v2Pos) {
            return false;
        }
        // Swap to ensure correct order and recalculate positions
        [edgeV1Idx, edgeV2Idx] = [edgeV2Idx, edgeV1Idx];
        v1Pos = polygon.indexOf(edgeV1Idx);
        v2Pos = polygon.indexOf(edgeV2Idx);
    }
    
    // Get V[0] (previous vertex) and V[3] (next vertex after insertion)
    const v0Pos = (v1Pos - 1 + polygon.length) % polygon.length;
    const v3Pos = (v2Pos + 1) % polygon.length;
    
    const v0Idx = polygon[v0Pos];
    const v3Idx = polygon[v3Pos];
    
    // Get points
    const pV0 = getPoint(v0Idx, navmeshData);
    const pV1 = getPoint(edgeV1Idx, navmeshData);
    const pV2 = getPoint(edgeV2Idx, navmeshData);
    const pV3 = getPoint(v3Idx, navmeshData);
    const pD = getPoint(newVertIdx, navmeshData);
    
    // Calculate segments M = V[0]->V[1] and N = V[3]->V[2]
    const M = subtract(pV1, pV0);
    const N = subtract(pV2, pV3);
    
    // Rotate M and N by 90 degrees such that M' points towards N and N' points towards M
    // Try clockwise rotation instead of counterclockwise
    const MPrime = rotate90CCW(M);
    const NPrime = rotate90CW(N);
    
    // Calculate vectors from edge vertices to new point
    const V1D = subtract(pD, pV1);
    const V2D = subtract(pD, pV2);
    
    // Test admissibility: dot(M', V[1]D) >= 0 && dot(N', V[2]D) >= 0
    const test1 = dot(MPrime, V1D) >= 0;
    const test2 = dot(NPrime, V2D) >= 0;
    
    const result = test1 && test2;
    
    return result;
}

// Helper class for optimized polygon creation with large groups
class OptimizedGroupProcessor {
    private edgeToTriangles: Map<string, number[]> = new Map();
    private triangleVertices: Map<number, [number, number, number]> = new Map();
    private vertexPositionInPolygon: Map<string, number> = new Map(); // "polygonId:vertexId" -> position
    private polygonVertexCount: number = 0;
    
    constructor(private group: number[], private navmeshData: NavmeshData) {
        this.precomputeEdgeToTriangles();
        this.precomputeTriangleVertices();
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
                const v1 = verts[i];
                const v2 = verts[(i + 1) % 3];
                const edgeKey = this.getEdgeKey(v1, v2);
                
                if (!this.edgeToTriangles.has(edgeKey)) {
                    this.edgeToTriangles.set(edgeKey, []);
                }
                this.edgeToTriangles.get(edgeKey)!.push(triIdx);
            }
        }
    }
    
    private precomputeTriangleVertices(): void {
        for (const triIdx of this.group) {
            const verts: [number, number, number] = [
                this.navmeshData.triangles[triIdx * 3],
                this.navmeshData.triangles[triIdx * 3 + 1],
                this.navmeshData.triangles[triIdx * 3 + 2],
            ];
            this.triangleVertices.set(triIdx, verts);
        }
    }
    
    private getEdgeKey(v1: number, v2: number): string {
        // Ensure consistent edge key regardless of vertex order
        return v1 < v2 ? `${v1},${v2}` : `${v2},${v1}`;
    }
    
    updateVertexPositionCache(polygon: number[], polygonId: number): void {
        this.vertexPositionInPolygon.clear();
        for (let i = 0; i < polygon.length; i++) {
            this.vertexPositionInPolygon.set(`${polygonId}:${polygon[i]}`, i);
        }
        this.polygonVertexCount = polygon.length;
    }
    
    private getVertexPosition(vertexId: number, polygonId: number): number {
        const pos = this.vertexPositionInPolygon.get(`${polygonId}:${vertexId}`);
        return pos !== undefined ? pos : -1;
    }
    
    findTrianglesWithEdge(v1: number, v2: number, used: Set<number>): number[] {
        const edgeKey = this.getEdgeKey(v1, v2);
        const triangles = this.edgeToTriangles.get(edgeKey) || [];
        return triangles.filter(triIdx => !used.has(triIdx));
    }
    
    getTriangleVertices(triIdx: number): [number, number, number] {
        return this.triangleVertices.get(triIdx)!;
    }
    
    isPolygonAdmissibleOptimized(
        polygon: number[],
        polygonId: number,
        edgeV1Idx: number, 
        edgeV2Idx: number,
        newVertIdx: number
    ): boolean {
        // Use cached vertex positions instead of indexOf
        let v1Pos = this.getVertexPosition(edgeV1Idx, polygonId);
        let v2Pos = this.getVertexPosition(edgeV2Idx, polygonId);
        
        if (v1Pos === -1 || v2Pos === -1) {
            return false;
        }
        
        // Ensure we have the right order (V[1], V[2] should be consecutive)
        const nextPos = (v1Pos + 1) % this.polygonVertexCount;
        if (nextPos !== v2Pos) {
            // Try the other direction
            const prevPos = (v1Pos - 1 + this.polygonVertexCount) % this.polygonVertexCount;
            if (prevPos !== v2Pos) {
                return false;
            }
            // Swap to ensure correct order and recalculate positions
            [edgeV1Idx, edgeV2Idx] = [edgeV2Idx, edgeV1Idx];
            v1Pos = this.getVertexPosition(edgeV1Idx, polygonId);
            v2Pos = this.getVertexPosition(edgeV2Idx, polygonId);
        }
        
        // Get V[0] (previous vertex) and V[3] (next vertex after insertion)
        const v0Pos = (v1Pos - 1 + this.polygonVertexCount) % this.polygonVertexCount;
        const v3Pos = (v2Pos + 1) % this.polygonVertexCount;
        
        const v0Idx = polygon[v0Pos];
        const v3Idx = polygon[v3Pos];
        
        // Get points
        const pV0 = getPoint(v0Idx, this.navmeshData);
        const pV1 = getPoint(edgeV1Idx, this.navmeshData);
        const pV2 = getPoint(edgeV2Idx, this.navmeshData);
        const pV3 = getPoint(v3Idx, this.navmeshData);
        const pD = getPoint(newVertIdx, this.navmeshData);
        
        // Calculate segments M = V[0]->V[1] and N = V[3]->V[2]
        const M = subtract(pV1, pV0);
        const N = subtract(pV2, pV3);
        
        // Rotate M and N by 90 degrees such that M' points towards N and N' points towards M
        const MPrime = rotate90CCW(M);
        const NPrime = rotate90CW(N);
        
        // Calculate vectors from edge vertices to new point
        const V1D = subtract(pD, pV1);
        const V2D = subtract(pD, pV2);
        
        // Test admissibility: dot(M', V[1]D) >= 0 && dot(N', V[2]D) >= 0
        const test1 = dot(MPrime, V1D) >= 0;
        const test2 = dot(NPrime, V2D) >= 0;
        
        return test1 && test2;
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
    const polygonId = Math.random(); // Unique ID for this polygon's cache
    
    while (changed) {
        iteration++;
        changed = false;
        
        // Update the vertex position cache for this polygon
        processor.updateVertexPositionCache(polygon, polygonId);
        
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
                if (processor.isPolygonAdmissibleOptimized(polygon, polygonId, v1Idx, v2Idx, newVertIdx)) {
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
    
    // Use optimized processor for large groups (threshold of 50 triangles)
    const useOptimized = group.length > 50;
    const processor = useOptimized ? new OptimizedGroupProcessor(group, navmeshData) : null;
    
    let polygonCount = 0;
    // Continue until all triangles in the group are used
    while (used.size < group.length) {
        polygonCount++;
        
        // Find an unused endpoint triangle
        const unusedTriangles = group.filter(triIdx => !used.has(triIdx));
        
        const endpoints = findEndpointTriangles(unusedTriangles, navmeshData);
        
        let startTriIdx: number;
        if (endpoints.length > 0) {
            // Use an endpoint triangle
            startTriIdx = endpoints[0];
        } else {
            // Fallback to any unused triangle
            startTriIdx = unusedTriangles[0];
        }
        
        // Create a polygon starting from this triangle
        const { polygon, triangles } = useOptimized && processor
            ? createPolygonFromTriangleOptimized(startTriIdx, processor, used, navmeshData)
            : createPolygonFromTriangle(startTriIdx, group, used, navmeshData);
        polygons.push(polygon);
        polygonTriangles.push(triangles);
    }
    
    return { polygons, polygonTriangles };
}

// Optimized group gathering with pre-computed data structures
class OptimizedGroupGatherer {
    private triangleVertices: Map<number, [number, number, number]> = new Map();
    private trianglePoints: Map<number, [Point2, Point2, Point2]> = new Map();
    private adjacencyMap: Map<string, [number, number]> = new Map(); // "tri1,tri2" -> [sharedV1, sharedV2]
    
    constructor(private navmeshData: NavmeshData, private walkableTriangleCount: number) {
        this.precomputeTriangleData();
        this.precomputeAdjacency();
    }
    
    private precomputeTriangleData(): void {
        for (let triIdx = 0; triIdx < this.walkableTriangleCount; triIdx++) {
            const verts: [number, number, number] = [
                this.navmeshData.triangles[triIdx * 3],
                this.navmeshData.triangles[triIdx * 3 + 1],
                this.navmeshData.triangles[triIdx * 3 + 2],
            ];
            this.triangleVertices.set(triIdx, verts);
            
            const points: [Point2, Point2, Point2] = [
                getPoint(verts[0], this.navmeshData),
                getPoint(verts[1], this.navmeshData),
                getPoint(verts[2], this.navmeshData),
            ];
            this.trianglePoints.set(triIdx, points);
        }
    }
    
    private precomputeAdjacency(): void {
        for (let triIdx = 0; triIdx < this.walkableTriangleCount; triIdx++) {
            for (let edge = 0; edge < 3; edge++) {
                const neighborIdx = this.navmeshData.neighbors[triIdx * 3 + edge];
                if (neighborIdx >= 0 && neighborIdx < this.walkableTriangleCount) {
                    const key1 = `${triIdx},${neighborIdx}`;
                    const key2 = `${neighborIdx},${triIdx}`;
                    
                    if (!this.adjacencyMap.has(key1) && !this.adjacencyMap.has(key2)) {
                        const sharedEdge = this.computeSharedEdge(triIdx, neighborIdx);
                        if (sharedEdge) {
                            this.adjacencyMap.set(key1, sharedEdge);
                        }
                    }
                }
            }
        }
    }
    
    private computeSharedEdge(tri1_idx: number, tri2_idx: number): [number, number] | null {
        const tri1_verts = this.triangleVertices.get(tri1_idx)!;
        const tri2_verts = this.triangleVertices.get(tri2_idx)!;
        
        const tri2_set = new Set(tri2_verts);
        const shared = tri1_verts.filter(v => tri2_set.has(v));
        
        if (shared.length === 2) {
            return [shared[0], shared[1]];
        }
        return null;
    }
    
    getTriangleVertices(triIdx: number): [number, number, number] {
        return this.triangleVertices.get(triIdx)!;
    }
    
    getTrianglePoints(triIdx: number): [Point2, Point2, Point2] {
        return this.trianglePoints.get(triIdx)!;
    }
    
    getSharedEdge(tri1_idx: number, tri2_idx: number): [number, number] | null {
        const key1 = `${tri1_idx},${tri2_idx}`;
        const key2 = `${tri2_idx},${tri1_idx}`;
        return this.adjacencyMap.get(key1) || this.adjacencyMap.get(key2) || null;
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
        
        // Get the point for the third vertex in current triangle
        const currentThirdPoint = currentPoints[currentVerts.indexOf(currentThirdVert)];
        const newPoint = getPoint(newVertIdx, this.navmeshData);
        const edgeV1Point = getPoint(edgeV1, this.navmeshData);
        const edgeV2Point = getPoint(edgeV2, this.navmeshData);
        
        // Simplified admissibility test for triangles (faster than full polygon test)
        // Check if the new vertex would create an acceptable angle
        const edge1 = subtract(edgeV1Point, currentThirdPoint);
        const edge2 = subtract(edgeV2Point, currentThirdPoint);
        const toNew = subtract(newPoint, currentThirdPoint);
        
        // Cross products to determine orientation
        const cross1 = cross(edge1, toNew);
        const cross2 = cross(toNew, edge2);
        
        // Both should have the same sign (both positive for CCW)
        return cross1 >= 0 && cross2 >= 0;
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

    // Use optimized group gathering for better performance
    const { groups, totalAdmissibleEdges } = gatherGroupsOptimized(navmeshData);

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

    // Update the log message with polygon count
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
}