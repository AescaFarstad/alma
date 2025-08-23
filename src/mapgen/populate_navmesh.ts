import { NavmeshData, MyPolygon } from './navmesh_struct';

export function populateTriangulationData(navmeshData: NavmeshData, triangulationResult: any, MEMORY_SETTINGS: { growthFactor: number }): void {
    const vertexCount = triangulationResult.finalPoints.length;
    const triangleCount = triangulationResult.finalTriangles.length / 3;
    
    // Simple allocation for now, assuming enough capacity from initialization
    navmeshData.vertices = new Float32Array(vertexCount * 2);
    navmeshData.triangles = new Int32Array(triangleCount * 3);
    navmeshData.neighbors = new Int32Array(triangleCount * 3);

    for (let i = 0; i < vertexCount; i++) {
        navmeshData.vertices[i * 2] = triangulationResult.finalPoints[i][0];
        navmeshData.vertices[i * 2 + 1] = triangulationResult.finalPoints[i][1];
    }

    navmeshData.triangles.set(triangulationResult.finalTriangles);
    navmeshData.neighbors.set(triangulationResult.finalNeighbors); // Use computed neighbors

    navmeshData.walkable_triangle_count = triangulationResult.walkableTriangles.length;
    navmeshData.stats.vertices = vertexCount;
    navmeshData.stats.triangles = triangleCount;

    console.log(`Populated navmesh with ${vertexCount} vertices and ${triangleCount} triangles`);
}

export function populatePolygonData(
    navmeshData: NavmeshData, 
    walkablePolygons: MyPolygon[], 
    impassablePolygons: MyPolygon[]
): void {
    console.log('Populating polygon data using countless-sentinel structure...');

    const allPolygons = [...walkablePolygons, ...impassablePolygons];
    // Helper to snap coordinates back to 2-decimal precision (Float32Array causes precision loss)
    const snapTo2Decimals = (coord: number): number => Math.round(coord * 100) / 100;
    
    const vertexMap = new Map<string, number>();
    for (let i = 0; i < navmeshData.stats.vertices; i++) {
        // Snap the Float32Array coordinates back to 2 decimals for consistent key generation
        const x = snapTo2Decimals(navmeshData.vertices[i * 2]);
        const y = snapTo2Decimals(navmeshData.vertices[i * 2 + 1]);
        const key = `${x};${y}`;
        vertexMap.set(key, i);
    }

    console.log(`Vertex lookup: ${vertexMap.size} triangulated vertices available`);

    const polyVertsData: number[] = [];
    const polygonsIndexArray: number[] = [];
    let missingVertexCount = 0;
    let walkablePolygonCount = walkablePolygons.length;

    for (let polyIndex = 0; polyIndex < allPolygons.length; polyIndex++) {
        const poly = allPolygons[polyIndex];
        const isWalkable = polyIndex < walkablePolygonCount;
        polygonsIndexArray.push(polyVertsData.length);
        
        for (const p of poly) {
            const key = `${p[0]};${p[1]}`;
            const vertIndex = vertexMap.get(key);
            if (vertIndex !== undefined) {
                polyVertsData.push(vertIndex);
            } else {
                missingVertexCount++;
                if (missingVertexCount <= 3) { // Show first 3 only
                    console.error(`Missing vertex ${key} from ${isWalkable ? 'walkable' : 'impassable'} polygon ${polyIndex}`);
                }
            }
        }
    }
    
    console.log(`Vertex matching: ${missingVertexCount} missing out of ${allPolygons.reduce((sum, poly) => sum + poly.length, 0)} polygon vertices`);
    
    // Add sentinel
    polygonsIndexArray.push(polyVertsData.length);
    polyVertsData.push(-1); 

    navmeshData.polygons = new Int32Array(polygonsIndexArray);
    navmeshData.poly_verts = new Int32Array(polyVertsData);
    navmeshData.walkable_polygon_count = walkablePolygons.length;
    navmeshData.stats.polygons = allPolygons.length;
    navmeshData.stats.walkable_polygons = walkablePolygons.length;
    navmeshData.stats.impassable_polygons = impassablePolygons.length;

    console.log(`Populated ${allPolygons.length} polygons.`);
}

export function populateBuildingData(
    navmeshData: NavmeshData, 
    buildings: any[], 
    blobToBuildings: string[][]
): { reorderedBuildings: any[], buildingIdMap: Map<string, number>, buildingVertexStats: { addedForBuildings: number, totalBuildingVerts: number } } {
    console.log('Populating and reordering building data...');

    // === DEBUG LOGGING: Input validation ===
    console.log(`\n=== POPULATE BUILDING DATA DEBUG ===`);
    console.log(`Input buildings count: ${buildings.length}`);
    console.log(`Input blobToBuildings count: ${blobToBuildings.length}`);

    // 1. Reorder buildings based on blob grouping
    const buildingIdMap = new Map<string, number>(); // <oldId, newId> - now string keys
    const reorderedBuildings: any[] = [];
    let newBuildingId = 0;
    let foundCount = 0;
    let notFoundCount = 0;
    const notFoundIds: string[] = [];

    for (const buildingIdsInBlob of blobToBuildings) {
        for (const oldId of buildingIdsInBlob) {
            const building = buildings.find(b => b.properties.osm_id === oldId); // String comparison now
            if (building) {
                const newBuilding = { ...building, id: newBuildingId };
                buildingIdMap.set(oldId, newBuildingId);
                reorderedBuildings.push(newBuilding);
                newBuildingId++;
                foundCount++;
            } else {
                notFoundCount++;
                notFoundIds.push(oldId);
                if (notFoundCount <= 5) { // Only show first 5 warnings
                    console.warn(`Building with osm_id ${oldId} not found in buildings array`);
                }
            }
        }
    }

    // === DEBUG LOGGING: Matching results ===
    console.log(`\n=== BUILDING MATCHING RESULTS ===`);
    console.log(`Buildings found and reordered: ${foundCount}`);
    console.log(`Buildings not found: ${notFoundCount}`);
    console.log(`Reordered buildings count: ${reorderedBuildings.length}`);
    if (notFoundCount > 0) {
        console.log(`Sample not found IDs: ${notFoundIds.slice(0, 10).join(', ')}`);
        if (notFoundCount > 10) {
            console.log(`... and ${notFoundCount - 10} more`);
        }
    }

    // 2. Collect all unique building vertices and expand navmeshData.vertices
    const newVertices: number[] = [];
    const vertexMap = new Map<string, number>();
    let currentVertexCount = navmeshData.stats.vertices;

    // Helper to snap coordinates back to 2-decimal precision (Float32Array causes precision loss)
    const snapTo2Decimals = (coord: number): number => Math.round(coord * 100) / 100;
    
    // First, populate vertexMap with ALL existing navmesh vertices
    for (let i = 0; i < navmeshData.stats.vertices; i++) {
        // Snap the Float32Array coordinates back to 2 decimals for consistent key generation
        const x = snapTo2Decimals(navmeshData.vertices[i * 2]);
        const y = snapTo2Decimals(navmeshData.vertices[i * 2 + 1]);
        const key = `${x};${y}`;
        vertexMap.set(key, i);
    }

    console.log(`Building vertex lookup: ${vertexMap.size} existing vertices available`);

    // First pass: collect all unique building vertices and assign indices
    let newVerticesAddedCount = 0;
    for (const building of reorderedBuildings) {
        const verts = building.geometry.coordinates[0];
        for (const vert of verts) {
            const key = `${snapTo2Decimals(vert[0])};${snapTo2Decimals(vert[1])}`;
            if (!vertexMap.has(key)) {
                vertexMap.set(key, currentVertexCount++);
                newVertices.push(vert[0], vert[1]); // Add x, y coordinates
                newVerticesAddedCount++;
            }
        }
    }

    console.log(`Building vertices: ${newVerticesAddedCount} new vertices added for buildings`);

    // Expand navmeshData.vertices to include building vertices
    if (newVertices.length > 0) {
        const oldVerticesLength = navmeshData.stats.vertices * 2; // Each vertex is x,y
        const newTotalLength = oldVerticesLength + newVertices.length;
        const expandedVertices = new Float32Array(newTotalLength);
        
        // Copy existing vertices
        expandedVertices.set(navmeshData.vertices.subarray(0, oldVerticesLength));
        
        // Add new building vertices
        for (let i = 0; i < newVertices.length; i++) {
            expandedVertices[oldVerticesLength + i] = newVertices[i];
        }
        
        navmeshData.vertices = expandedVertices;
        navmeshData.stats.vertices = currentVertexCount;
    }

    // 3. Populate building_verts and buildings (index) using the correct vertex indices
    const buildingVertsData: number[] = [];
    const buildingsIndexArray: number[] = [];

    for (const building of reorderedBuildings) {
        buildingsIndexArray.push(buildingVertsData.length);
        const verts = building.geometry.coordinates[0];
        for (const vert of verts) {
            const key = `${snapTo2Decimals(vert[0])};${snapTo2Decimals(vert[1])}`;
            const vertIndex = vertexMap.get(key);
            if (vertIndex !== undefined) {
                buildingVertsData.push(vertIndex);
            } else {
                throw new Error(`Building vertex not found in vertex map: ${key}`);
            }
        }
    }
    
    buildingsIndexArray.push(buildingVertsData.length); // Sentinel
    buildingVertsData.push(-1);

    navmeshData.buildings = new Int32Array(buildingsIndexArray);
    navmeshData.building_verts = new Int32Array(buildingVertsData);

    // 4. Populate blob_buildings (index)
    const blobBuildingsIndexArray: number[] = [];
    let processedBuildings = 0;
    for (const buildingIdsInBlob of blobToBuildings) {
        blobBuildingsIndexArray.push(processedBuildings);
        processedBuildings += buildingIdsInBlob.length;
    }
    blobBuildingsIndexArray.push(processedBuildings); // Sentinel
    navmeshData.blob_buildings = new Int32Array(blobBuildingsIndexArray);

    // 5. Populate building_meta
    navmeshData.building_meta = reorderedBuildings.map(b => JSON.stringify(b.properties));

    // Update statistics
    navmeshData.stats.buildings = reorderedBuildings.length;
    navmeshData.stats.blobs = blobToBuildings.length;

    console.log(`Populated ${reorderedBuildings.length} buildings total.`);

    const buildingVertexStats = {
        addedForBuildings: newVerticesAddedCount,
        totalBuildingVerts: buildingVertsData.length - 1 // Subtract sentinel
    };

    // === DEBUG LOGGING: Final results ===
    console.log(`\n=== POPULATE BUILDING DATA FINAL RESULTS ===`);
    console.log(`Building vertex stats:`, buildingVertexStats);

    return { reorderedBuildings, buildingIdMap, buildingVertexStats };
} 

export function populatePolygonCentroids(navmeshData: NavmeshData): void {
    console.log('Calculating polygon centroids...');
    
    const numPolygons = navmeshData.stats.polygons;
    const walkablePolygonCount = navmeshData.walkable_polygon_count;
    
    // Ensure we have the exact size needed for centroids
    if (navmeshData.poly_centroids.length !== numPolygons * 2) {
        navmeshData.poly_centroids = new Float32Array(numPolygons * 2);
    }
    
    for (let polyId = 0; polyId < numPolygons; polyId++) {
        let centroidX: number, centroidY: number;
        
        if (polyId < walkablePolygonCount) {
            // Walkable polygon: calculate centroid from vertices
            const vertStartIdx = navmeshData.polygons[polyId];
            const vertEndIdx = navmeshData.polygons[polyId + 1];
            
            let sumX = 0, sumY = 0;
            let vertexCount = 0;
            
            for (let vertIdx = vertStartIdx; vertIdx < vertEndIdx; vertIdx++) {
                const vertexIndex = navmeshData.poly_verts[vertIdx];
                if (vertexIndex === -1) break; // Hit sentinel
                
                sumX += navmeshData.vertices[vertexIndex * 2];
                sumY += navmeshData.vertices[vertexIndex * 2 + 1];
                vertexCount++;
            }
            
            centroidX = vertexCount > 0 ? sumX / vertexCount : 0;
            centroidY = vertexCount > 0 ? sumY / vertexCount : 0;
        } else {
            // Blob polygon: calculate from triangle centroids, then use nearest triangle centroid
            const triStartIdx = navmeshData.poly_tris[polyId];
            const triEndIdx = navmeshData.poly_tris[polyId + 1];
            
            const triangleCentroids: { x: number, y: number }[] = [];
            let overallSumX = 0, overallSumY = 0;
            let triangleCount = 0;
            
            // Calculate each triangle's centroid
            for (let triIdx = triStartIdx; triIdx < triEndIdx; triIdx++) {
                const v1Idx = navmeshData.triangles[triIdx * 3];
                const v2Idx = navmeshData.triangles[triIdx * 3 + 1];
                const v3Idx = navmeshData.triangles[triIdx * 3 + 2];
                
                const triCentroidX = (
                    navmeshData.vertices[v1Idx * 2] + 
                    navmeshData.vertices[v2Idx * 2] + 
                    navmeshData.vertices[v3Idx * 2]
                ) / 3;
                const triCentroidY = (
                    navmeshData.vertices[v1Idx * 2 + 1] + 
                    navmeshData.vertices[v2Idx * 2 + 1] + 
                    navmeshData.vertices[v3Idx * 2 + 1]
                ) / 3;
                
                triangleCentroids.push({ x: triCentroidX, y: triCentroidY });
                overallSumX += triCentroidX;
                overallSumY += triCentroidY;
                triangleCount++;
            }
            
            if (triangleCount === 0) {
                centroidX = 0;
                centroidY = 0;
            } else {
                // Calculate overall centroid
                const overallCentroidX = overallSumX / triangleCount;
                const overallCentroidY = overallSumY / triangleCount;
                
                // Find nearest triangle centroid to overall centroid
                let nearestTriCentroid = triangleCentroids[0];
                let minDistanceSquared = Number.MAX_VALUE;
                
                for (const triCentroid of triangleCentroids) {
                    const dx = triCentroid.x - overallCentroidX;
                    const dy = triCentroid.y - overallCentroidY;
                    const distanceSquared = dx * dx + dy * dy;
                    
                    if (distanceSquared < minDistanceSquared) {
                        minDistanceSquared = distanceSquared;
                        nearestTriCentroid = triCentroid;
                    }
                }
                
                centroidX = nearestTriCentroid.x;
                centroidY = nearestTriCentroid.y;
            }
        }
        
        // Store the centroid
        navmeshData.poly_centroids[polyId * 2] = centroidX;
        navmeshData.poly_centroids[polyId * 2 + 1] = centroidY;
    }
    
    console.log(`Calculated centroids for ${numPolygons} polygons (${walkablePolygonCount} walkable, ${numPolygons - walkablePolygonCount} blobs).`);
} 