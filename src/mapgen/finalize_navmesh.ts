import { NavmeshData, MyPolygon, MyPoint } from './navmesh_struct';

export function finalizeNavmesh(
    navmeshData: NavmeshData,
    walkableTriangleCount: number,
    optimizedWalkablePolygons: MyPolygon[],
    originalWalkableT2P: Map<number, number>,
    impassableT2P: Map<number, number>
): Map<number, number> {
    const triangleToPolygonMap = buildFinalTriangleToPolygonMap(
        navmeshData,
        walkableTriangleCount,
        optimizedWalkablePolygons,
        originalWalkableT2P,
        impassableT2P
    );
    console.log('Finalizing navmesh: sorting triangles and remapping neighbors...');

    const { triangles, neighbors, stats } = navmeshData;
    const numPolygons = stats.polygons;
    const numTriangles = stats.triangles;

    const polygonToTriangles = new Array(numPolygons).fill(0).map(() => [] as number[]);
    for (let i = 0; i < numTriangles; i++) {
        const polyId = triangleToPolygonMap.get(i);
        if (polyId !== undefined) {
            polygonToTriangles[polyId].push(i);
        }
    }
    
    const sortedTriangles = new Int32Array(numTriangles * 3);
    const polyTris = new Int32Array(numPolygons + 1);
    const oldToNewTriangleIndex = new Int32Array(numTriangles);
    
    let newTriIndex = 0;
    for (let polyId = 0; polyId < numPolygons; polyId++) {
        polyTris[polyId] = newTriIndex;
        const tris = polygonToTriangles[polyId];
        for (const oldTriIndex of tris) {
            oldToNewTriangleIndex[oldTriIndex] = newTriIndex;
            sortedTriangles[newTriIndex * 3] = triangles[oldTriIndex * 3];
            sortedTriangles[newTriIndex * 3 + 1] = triangles[oldTriIndex * 3 + 1];
            sortedTriangles[newTriIndex * 3 + 2] = triangles[oldTriIndex * 3 + 2];
            newTriIndex++;
        }
    }
    polyTris[numPolygons] = newTriIndex;

    const remappedNeighbors = new Int32Array(numTriangles * 3);
    for (let oldTriIndex = 0; oldTriIndex < numTriangles; oldTriIndex++) {
        const newIndex = oldToNewTriangleIndex[oldTriIndex];
        
        const oldNeighbor1 = neighbors[oldTriIndex * 3];
        const oldNeighbor2 = neighbors[oldTriIndex * 3 + 1];
        const oldNeighbor3 = neighbors[oldTriIndex * 3 + 2];
        
        remappedNeighbors[newIndex * 3] = oldNeighbor1 !== -1 ? oldToNewTriangleIndex[oldNeighbor1] : -1;
        remappedNeighbors[newIndex * 3 + 1] = oldNeighbor2 !== -1 ? oldToNewTriangleIndex[oldNeighbor2] : -1;
        remappedNeighbors[newIndex * 3 + 2] = oldNeighbor3 !== -1 ? oldToNewTriangleIndex[oldNeighbor3] : -1;
    }

    const newTriangleToPolygonMap = new Map<number, number>();
    for (let oldTriIndex = 0; oldTriIndex < numTriangles; oldTriIndex++) {
        const polyId = triangleToPolygonMap.get(oldTriIndex);
        if (polyId !== undefined) {
            const newTriIndex = oldToNewTriangleIndex[oldTriIndex];
            newTriangleToPolygonMap.set(newTriIndex, polyId);
        }
    }

    navmeshData.triangles = sortedTriangles;
    navmeshData.neighbors = remappedNeighbors;
    navmeshData.poly_tris = polyTris;

    const polyNeighborsData: number[] = [];
    
    for (let polyId = 0; polyId < numPolygons; polyId++) {
        const vertStart = navmeshData.polygons[polyId];
        const vertEnd = navmeshData.polygons[polyId + 1];
        
        for (let i = vertStart; i < vertEnd; i++) {
            const vertIndex1 = navmeshData.poly_verts[i];
            const vertIndex2 = navmeshData.poly_verts[i + 1 === vertEnd ? vertStart : i + 1];

            let foundNeighbor = -1;
            const triStart = navmeshData.poly_tris[polyId];
            const triEnd = navmeshData.poly_tris[polyId + 1];

            for (let triIdx = triStart; triIdx < triEnd; triIdx++) {
                const v1 = navmeshData.triangles[triIdx * 3];
                const v2 = navmeshData.triangles[triIdx * 3 + 1];
                const v3 = navmeshData.triangles[triIdx * 3 + 2];

                const triEdges = [
                    [v1, v2, 0], [v2, v3, 1], [v3, v1, 2]
                ];

                for (const [e_v1, e_v2, edgeIndex] of triEdges) {
                    if ((e_v1 === vertIndex1 && e_v2 === vertIndex2) || (e_v1 === vertIndex2 && e_v2 === vertIndex1)) {
                        const neighborTriIndex = navmeshData.neighbors[triIdx * 3 + edgeIndex];
                        if (neighborTriIndex !== -1) {
                            const neighborPolyId = newTriangleToPolygonMap.get(neighborTriIndex);
                            if (neighborPolyId !== undefined && neighborPolyId !== polyId) {
                                foundNeighbor = neighborPolyId;
                                break;
                            }
                        }
                    }
                }
                if (foundNeighbor !== -1) break;
            }
            polyNeighborsData.push(foundNeighbor);
        }
    }
    
    polyNeighborsData.push(-1);
    
    // Ensure we have the exact size needed for poly_neighbors
    if (navmeshData.poly_neighbors.length !== polyNeighborsData.length) {
        navmeshData.poly_neighbors = new Int32Array(polyNeighborsData.length);
    }
    
    navmeshData.poly_neighbors.set(polyNeighborsData);
    
    console.log(`Finalized navmesh: ${numTriangles} triangles sorted, ${polyNeighborsData.length -1} polygon neighbor relationships computed`);
    
    return triangleToPolygonMap;
}

export function buildFinalTriangleToPolygonMap(
    navmeshData: NavmeshData,
    walkableTriangleCount: number,
    optimizedWalkablePolygons: MyPolygon[],
    originalWalkableT2P: Map<number, number>,
    impassableT2P: Map<number, number>
): Map<number, number> {
    console.log('Building final triangle-to-polygon mapping for optimized polygons...');
    
    const finalMap = new Map<number, number>();

    const vertexToPolygonMap = new Map<string, number[]>();
    for (let polyIndex = 0; polyIndex < optimizedWalkablePolygons.length; polyIndex++) {
        const polygon = optimizedWalkablePolygons[polyIndex];
        for (const vertex of polygon) {
            const key = `${vertex[0].toFixed(10)},${vertex[1].toFixed(10)}`;
            if (!vertexToPolygonMap.has(key)) {
                vertexToPolygonMap.set(key, []);
            }
            vertexToPolygonMap.get(key)!.push(polyIndex);
        }
    }
    
    for (let triIndex = 0; triIndex < walkableTriangleCount; triIndex++) {
        const v1Idx = navmeshData.triangles[triIndex * 3];
        const v2Idx = navmeshData.triangles[triIndex * 3 + 1];
        const v3Idx = navmeshData.triangles[triIndex * 3 + 2];

        const p1_key = `${navmeshData.vertices[v1Idx * 2].toFixed(10)},${navmeshData.vertices[v1Idx * 2 + 1].toFixed(10)}`;
        const p2_key = `${navmeshData.vertices[v2Idx * 2].toFixed(10)},${navmeshData.vertices[v2Idx * 2 + 1].toFixed(10)}`;
        const p3_key = `${navmeshData.vertices[v3Idx * 2].toFixed(10)},${navmeshData.vertices[v3Idx * 2 + 1].toFixed(10)}`;

        const polys1 = vertexToPolygonMap.get(p1_key) || [];
        const polys2 = vertexToPolygonMap.get(p2_key) || [];
        const polys3 = vertexToPolygonMap.get(p3_key) || [];

        let assignedPolygon = -1;
        
        // Find intersection of the three polygon lists
        const polys2Set = new Set(polys2);
        const polys3Set = new Set(polys3);
        for (const poly1 of polys1) {
            if (polys2Set.has(poly1) && polys3Set.has(poly1)) {
                assignedPolygon = poly1;
                break;
            }
        }
        
        if (assignedPolygon !== -1) {
            finalMap.set(triIndex, assignedPolygon);
        } else {
            const originalPolygon = originalWalkableT2P.get(triIndex);
            if (originalPolygon !== undefined) {
                finalMap.set(triIndex, Math.min(originalPolygon, optimizedWalkablePolygons.length - 1));
            }
        }
    }
    
    const walkablePolygonCount = optimizedWalkablePolygons.length;
    for (const [triIndex, polygonIndex] of impassableT2P) {
        // Note: polygonIndex is already the final polygon index (walkablePolygonCount + blobIndex)
        // so we don't need to add walkablePolygonCount again
        finalMap.set(triIndex, polygonIndex);
    }
    
    console.log(`Final mapping built: ${finalMap.size} triangles mapped to ${optimizedWalkablePolygons.length} walkable + ${impassableT2P.size} impassable polygons`);
    return finalMap;
}


