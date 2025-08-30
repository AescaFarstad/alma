import { NavmeshData, MyPolygon } from './navmesh_struct';

export function printFinalSummary(navmeshData: NavmeshData, walkableOpt: any, impassableOpt: any, triangleToPolygonMap?: Map<number, number>, buildingVertexStats?: { addedForBuildings: number, totalBuildingVerts: number }): void {
  console.log('\n=== NAVMESH GENERATION SUMMARY ===');


  console.log(`BUILDINGS count: ${navmeshData.stats.buildings}`);
  
  // Building vertex statistics
  if (buildingVertexStats) {
    console.log(`Building vertices added specifically for buildings: ${buildingVertexStats.addedForBuildings}`);
    console.log(`Total building vertices: ${buildingVertexStats.totalBuildingVerts}`);
  }

  // Building-to-blob statistics
  const buildingBlobStats = calculateBuildingBlobStats(navmeshData);
  console.log(`Average buildings per blob: ${buildingBlobStats.avgBuildingsPerBlob.toFixed(1)}`);
  console.log(`Single building blobs: ${buildingBlobStats.singleBuildingBlobs}`);
  console.log(`Total blobs: ${buildingBlobStats.totalBlobs}`);

  console.log(``);
  console.log(`Total vertices: ${navmeshData.stats.vertices}`);
  console.log(`Total triangles: ${navmeshData.stats.triangles}`);
  console.log(`  - Walkable triangles: ${navmeshData.stats.walkable_triangles}`);
  console.log(`  - Impassable triangles: ${navmeshData.stats.impassable_triangles}`);
  console.log(`Total polygons: ${navmeshData.stats.polygons}`);
  console.log(`  - Walkable polygons: ${navmeshData.stats.walkable_polygons} (${walkableOpt.improvementPercent.toFixed(1)}% reduction)`);
  
  // Calculate walkable polygon triangle statistics
  if (triangleToPolygonMap && navmeshData.stats.walkable_polygons > 0) {
    const walkablePolygonTriangleCounts = calculateWalkablePolygonTriangleStats(navmeshData, triangleToPolygonMap);
    console.log(`  • Largest polygon: ${walkablePolygonTriangleCounts.maxTriangles} triangles`);
    console.log(`  • Average triangles per polygon: ${walkablePolygonTriangleCounts.avgTriangles.toFixed(1)}`);
    console.log(`  • Single triangle polygons: ${walkablePolygonTriangleCounts.singleTriangleCount}`);
  }
  
  console.log(`  - Impassable polygons: ${navmeshData.stats.impassable_polygons} (${impassableOpt.improvementPercent.toFixed(1)}% reduction)`);

  // Add new statistics for polygon vertices and triangles
  console.log(`Polygon vertices count: ${navmeshData.poly_verts.length - 1}`); // -1 for sentinel
  console.log(`Polygon triangles count: ${getTotalPolygonTriangles(navmeshData)}`);

  console.log(`Average triangle area: ${navmeshData.stats.avg_triangle_area.toFixed(2)}`);
  console.log(`Average polygon area: ${navmeshData.stats.avg_polygon_area.toFixed(2)}`);
}

export function finalizeNavmeshData(navmeshData: NavmeshData, data: any): void {
  // Calculate real bounding box from processing bbox
  navmeshData.bbox = data.processingBbox;

  // Use the inflated bbox (processingBbox + inflation) as the buffered bbox
  navmeshData.buffered_bbox = data.inflatedBbox;

  // Preserve existing building count that was populated earlier
  const existingBuildingCount = navmeshData.stats.buildings;
  const impassablePolygonCount = navmeshData.stats.impassable_polygons;

  // Update statistics
  navmeshData.stats = {
    vertices: data.triangulationResult.finalPoints.length,
    triangles: data.triangulationResult.allTriangles.length,
    walkable_triangles: navmeshData.walkable_triangle_count,
    impassable_triangles: data.triangulationResult.allTriangles.length - navmeshData.walkable_triangle_count,
    polygons: navmeshData.walkable_polygon_count + impassablePolygonCount,
    walkable_polygons: navmeshData.walkable_polygon_count,
    impassable_polygons: impassablePolygonCount,
    buildings: existingBuildingCount, // Preserve the count from populateBuildingData
    blobs: impassablePolygonCount,
    bbox: navmeshData.bbox,
    avg_triangle_area: calculateAverageTriangleArea(data.triangulationResult.allTriangles),
    avg_polygon_area: 0
  };

  console.log('Navmesh data structure finalized');
}

function calculateWalkablePolygonTriangleStats(navmeshData: NavmeshData, triangleToPolygonMap: Map<number, number>) {
  const walkablePolygonCount = navmeshData.stats.walkable_polygons;
  const triangleCounts = new Array(walkablePolygonCount).fill(0);
  
  // Count triangles for each walkable polygon
  for (const [triangleIndex, polygonIndex] of triangleToPolygonMap.entries()) {
    if (polygonIndex < walkablePolygonCount) { // Only walkable polygons
      triangleCounts[polygonIndex]++;
    }
  }
  
  const maxTriangles = Math.max(...triangleCounts);
  const totalTriangles = triangleCounts.reduce((sum, count) => sum + count, 0);
  const avgTriangles = totalTriangles / walkablePolygonCount;
  const singleTriangleCount = triangleCounts.filter(count => count === 1).length;
  
  return {
    maxTriangles,
    avgTriangles,
    singleTriangleCount
  };
}



function calculateAverageTriangleArea(triangles: any[]): number {
  if (triangles.length === 0) return 0;
  let total = 0;
  for (const t of triangles) {
    const p0 = t.getPoint(0), p1 = t.getPoint(1), p2 = t.getPoint(2);
    total += Math.abs(p0.x * (p1.y - p2.y) + p1.x * (p2.y - p0.y) + p2.x * (p0.y - p1.y)) / 2;
  }
  return total / triangles.length;
}

function calculateAveragePolygonArea(polygons: MyPolygon[]): number {
  if (polygons.length === 0) return 0;
  let total = 0;
  for (const poly of polygons) {
    let area = 0;
    for (let i = 0; i < poly.length; i++) {
      const j = (i + 1) % poly.length;
      area += poly[i][0] * poly[j][1] - poly[j][0] * poly[i][1];
    }
    total += Math.abs(area) / 2;
  }
  return total / polygons.length;
}

function getTotalPolygonTriangles(navmeshData: NavmeshData): number {
  // Calculate total triangles used by all polygons
  // This is essentially the same as total triangles since each triangle belongs to exactly one polygon
  return navmeshData.stats.triangles;
}

function calculateBuildingBlobStats(navmeshData: NavmeshData) {
  const totalBlobs = navmeshData.stats.impassable_polygons;
  const totalBuildings = navmeshData.stats.buildings;
  
  if (totalBlobs === 0) {
    return {
      avgBuildingsPerBlob: 0,
      singleBuildingBlobs: 0,
      totalBlobs: 0
    };
  }

  // Calculate buildings per blob using blob_buildings array
  const buildingsPerBlob = new Array(totalBlobs).fill(0);
  
  // blob_buildings maps blobs to their constituent buildings
  // It has num_blobs + 1 entries (including sentinel)
  for (let blobIndex = 0; blobIndex < totalBlobs; blobIndex++) {
    const startIndex = navmeshData.blob_buildings[blobIndex];
    const endIndex = navmeshData.blob_buildings[blobIndex + 1];
    buildingsPerBlob[blobIndex] = endIndex - startIndex;
  }
  
  const avgBuildingsPerBlob = totalBuildings / totalBlobs;
  const singleBuildingBlobs = buildingsPerBlob.filter(count => count === 1).length;
  
  return {
    avgBuildingsPerBlob,
    singleBuildingBlobs,
    totalBlobs
  };
} 