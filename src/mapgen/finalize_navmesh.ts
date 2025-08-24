import { NavmeshData, MyPolygon, MyPoint } from './navmesh_struct';

export function finalizeNavmesh(
    navmeshData: NavmeshData,
    impassableT2P: Map<number, number>
): Map<number, number> {
    const triangleToPolygonMap = buildFinalTriangleToPolygonMap(navmeshData, impassableT2P);
    console.log('Finalizing navmesh: triangles already sorted during polygonization...');

    const { triangles, neighbors, stats } = navmeshData;
    const numPolygons = stats.polygons;
    const numTriangles = stats.triangles;

    // Skip triangle sorting since it's already done during polygonization
    // Just use the existing arrays
    const sortedTriangles = triangles;
    const remappedNeighbors = neighbors;
    const polyTris = navmeshData.poly_tris;

    // Build final triangle-to-polygon map using existing correct data
    const newTriangleToPolygonMap = new Map<number, number>();
    for (let polyId = 0; polyId < navmeshData.walkable_polygon_count; polyId++) {
        const triStart = polyTris[polyId];
        const triEnd = polyTris[polyId + 1];
        for (let triIdx = triStart; triIdx < triEnd; triIdx++) {
            newTriangleToPolygonMap.set(triIdx, polyId);
        }
    }
    
    // Add impassable triangles
    for (const [triIndex, polygonIndex] of impassableT2P) {
        newTriangleToPolygonMap.set(triIndex, polygonIndex);
    }

    // Build proper poly_tris entries for impassable polygons
    // Group impassable triangles by their polygon index
    const impassablePolygonTriangles = new Map<number, number[]>();
    for (const [triIndex, polygonIndex] of impassableT2P) {
        if (!impassablePolygonTriangles.has(polygonIndex)) {
            impassablePolygonTriangles.set(polygonIndex, []);
        }
        impassablePolygonTriangles.get(polygonIndex)!.push(triIndex);
    }

    // Create a new poly_tris array with correct impassable polygon ranges
    const newPolyTris = new Int32Array(polyTris.length);
    newPolyTris.set(polyTris.subarray(0, navmeshData.walkable_polygon_count + 1));

    // Sort triangles within each impassable polygon and build ranges
    let currentTriangleIndex = navmeshData.walkable_triangle_count;
    for (let polyId = navmeshData.walkable_polygon_count; polyId < numPolygons; polyId++) {
        newPolyTris[polyId] = currentTriangleIndex;
        
        if (impassablePolygonTriangles.has(polyId)) {
            const triangles = impassablePolygonTriangles.get(polyId)!;
            triangles.sort((a, b) => a - b); // Ensure triangles are in order
            currentTriangleIndex += triangles.length;
        }
    }
    newPolyTris[numPolygons] = currentTriangleIndex; // Final sentinel

    navmeshData.triangles = sortedTriangles;
    navmeshData.neighbors = remappedNeighbors;
    navmeshData.poly_tris = newPolyTris;

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
    
    console.log(`Finalized navmesh: ${numTriangles} triangles sorted, ${polyNeighborsData.length - 1} polygon neighbor relationships computed`);
    
    return triangleToPolygonMap;
}

export function buildFinalTriangleToPolygonMap(
    navmeshData: NavmeshData,
    impassableT2P: Map<number, number>
): Map<number, number> {
    console.log('Building final triangle-to-polygon mapping for optimized polygons...');
    
    const finalMap = new Map<number, number>();

    for (let polyId = 0; polyId < navmeshData.walkable_polygon_count; polyId++) {
        const triStart = navmeshData.poly_tris[polyId];
        const triEnd = navmeshData.poly_tris[polyId + 1];
        for (let triIndex = triStart; triIndex < triEnd; triIndex++) {
            finalMap.set(triIndex, polyId);
        }
    }
    for (const [triIndex, polygonIndex] of impassableT2P) {
        // Note: polygonIndex is already the final polygon index (walkablePolygonCount + blobIndex)
        // so we don't need to add walkablePolygonCount again
        finalMap.set(triIndex, polygonIndex);
    }
    
    console.log(`Final mapping built: ${finalMap.size} triangles mapped to ${navmeshData.walkable_polygon_count} walkable + ${impassableT2P.size} impassable polygons`);
    return finalMap;
}


