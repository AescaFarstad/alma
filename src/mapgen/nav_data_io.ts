import fs from 'fs';
import path from 'path';
import { MyPoint, MyPolygon, NavmeshData, NavmeshStats } from './navmesh_struct';

export type { BlobData } from './navmesh_struct';

export function loadBlobs(filePath: string, bbox: readonly [number, number, number, number] | null): { simplified_vertices: MyPolygon[], blobToBuildings: string[][] } {
  if (!fs.existsSync(filePath)) {
    console.error(`Input file not found: ${filePath}`);
    process.exit(1);
  }

  const fileContent = fs.readFileSync(filePath, 'utf-8');
  const lines = fileContent.split('\n').filter(line => line.trim() !== '');

  let polygons: MyPolygon[] = [];
  const blobToBuildings: string[][] = [];

  // Format: index;[buildingId1,buildingId2];[x1,y1,x2,y2,...]
  for (const line of lines) {
    const parts = line.split(';');
    if (parts.length !== 3) continue;

    try {
      // Parse building IDs from [id1,id2,...]
      const buildingIdsStr = parts[1].slice(1, -1); // Remove [ and ]
      const buildingIds: string[] = buildingIdsStr.split(',').map(id => id.trim());


      // Parse coordinates from [x1,y1,x2,y2,...]
      const coordsStr = parts[2].slice(1, -1); // Remove [ and ]
      const coords: number[] = coordsStr.split(',').map(coord => parseFloat(coord.trim()));

      const polygon: MyPolygon = [];
      for (let i = 0; i < coords.length; i += 2) {
        const p: MyPoint = [coords[i], coords[i + 1]];
        polygon.push(p);
      }

      if (bbox) {
        if (!polygon.every((p: MyPoint) => isPointInBbox(p, bbox as any))) {
          continue;
        }
      }
      
      polygons.push(polygon);
      blobToBuildings.push(buildingIds);
    } catch (e) {
      console.warn(`Error parsing blob line: ${line}`, e);
      continue;
    }
  }
  
  console.log(`Loaded ${polygons.length} blobs from ${filePath}`);
  return { simplified_vertices: polygons, blobToBuildings };
}

export function loadBuildings(buildingsFilePath: string): any[] {
  if (!fs.existsSync(buildingsFilePath)) {
    console.error(`Input file not found: ${buildingsFilePath}`);
    process.exit(1);
  }

  const fileContent = fs.readFileSync(buildingsFilePath, 'utf-8');
  const lines = fileContent.split('\n').filter(line => line.trim() !== '');
  
  const buildings: any[] = [];
  let newId = 0;

  // Format: id;{properties}[x1,y1,x2,y2,...]
  for (const line of lines) {
    try {
      const semicolonIndex = line.indexOf(';');
      if (semicolonIndex === -1) continue;

      const idStr = line.substring(0, semicolonIndex);
      const originalId = idStr; // Keep as string instead of parseInt
      
      const remainder = line.substring(semicolonIndex + 1);

      // Find where coordinates start (the '[' after properties)
      const coordsStartIndex = remainder.lastIndexOf('[');
      if (coordsStartIndex === -1) continue;

      const propertiesStr = remainder.substring(0, coordsStartIndex);
      const coordsStr = remainder.substring(coordsStartIndex + 1, remainder.length - 1); // Remove [ and ]

      const properties = JSON.parse(propertiesStr);
      const coords: number[] = coordsStr.split(',').map(coord => parseFloat(coord.trim()));

      // Convert flat coordinates to polygon format
      const coordinates: number[][] = [];
      for (let i = 0; i < coords.length; i += 2) {
        coordinates.push([coords[i], coords[i + 1]]);
      }

      const feature = {
        id: newId++,
        type: "Feature",
        geometry: {
          type: "Polygon",
          coordinates: [coordinates] // Polygon coordinates are nested arrays
        },
        properties: {
          ...properties,
          osm_id: originalId
        }
      };
      
      buildings.push(feature);
    } catch (e) {
      console.warn(`Error parsing building line: ${line}`, e);
      continue;
    }
  }

  console.log(`Loaded and processed ${buildings.length} building features.`);
  return buildings;
}

export function writeNavmeshOutput(outputDir: string, navmeshData: NavmeshData, buildings: any[], settings: any): { createdFiles: Array<{path: string, sizeBytes: number}> } {
  const createdFiles: Array<{path: string, sizeBytes: number}> = [];

  if (settings.generateBinaryFile) {
    const binaryPath = path.join(outputDir, 'navmesh.bin');
    writeNavmeshBinary(binaryPath, navmeshData);
    const stats = fs.statSync(binaryPath);
    createdFiles.push({ path: binaryPath, sizeBytes: stats.size });
    console.log(`Binary output: ${binaryPath}`);
  }

  if (settings.generateInspectableText) {
    const textPath = path.join(outputDir, 'navmesh.txt');
    writeNavmeshText(textPath, navmeshData);
    const stats = fs.statSync(textPath);
    createdFiles.push({ path: textPath, sizeBytes: stats.size });
    console.log(`Text output: ${textPath}`);
  }
  
  // Write building_meta to separate JSON file
  const buildingPropertiesPath = path.join(outputDir, 'building_properties.json');
  writeBuildingProperties(buildingPropertiesPath, navmeshData.building_meta);
  const buildingPropertiesStats = fs.statSync(buildingPropertiesPath);
  createdFiles.push({ path: buildingPropertiesPath, sizeBytes: buildingPropertiesStats.size });
  console.log(`Building properties output: ${buildingPropertiesPath}`);
  
  const geojsonPath = path.join(outputDir, 'map_render_buildings.geojson');
  writeBuildingsGeoJSON(geojsonPath, buildings);
  const geojsonStats = fs.statSync(geojsonPath);
  createdFiles.push({ path: geojsonPath, sizeBytes: geojsonStats.size });
  console.log(`Buildings GeoJSON output: ${geojsonPath}`);

  return { createdFiles };
}

function writeBuildingsGeoJSON(outputPath: string, buildings: any[]): void {

  const features = buildings.map(b => ({
    type: "Feature",
    id: b.id,
    geometry: b.geometry,
    properties: {} // Empty properties as per new spec
  }));
  // Build valid GeoJSON FeatureCollection with line breaks after each feature
  const formattedFeatures = features.map(feature => JSON.stringify(feature)).join(',\n');
  const geojsonContent = `{
"type": "FeatureCollection",
"features": [
${formattedFeatures}
]
}`;

  fs.writeFileSync(outputPath, geojsonContent);
  console.log(`Successfully wrote ${features.length} features to ${outputPath}`);
}


function writeNavmeshText(outputPath: string, navmeshData: NavmeshData): void {
  let content = '';
  content += `REAL_BBOX: [${navmeshData.bbox.join(', ')}]\n`;
  content += `BUFFERED_BBOX: [${navmeshData.buffered_bbox.join(', ')}]\n`;
  content += `WALKABLE_TRIANGLE_COUNT: ${navmeshData.walkable_triangle_count}\n`;
  content += `WALKABLE_POLYGON_COUNT: ${navmeshData.walkable_polygon_count}\n\n`;

  const writeArray = (name: string, arr: { join: (arg0: string) => string; }) => {
    content += `${name}: [${arr.join(', ')}]\n\n`;
  };

  writeArray('VERTICES', Array.from(navmeshData.vertices));
  writeArray('TRIANGLES', Array.from(navmeshData.triangles));
  writeArray('NEIGHBORS', Array.from(navmeshData.neighbors));
  writeArray('POLYGONS', Array.from(navmeshData.polygons));
  writeArray('POLY_CENTROIDS', Array.from(navmeshData.poly_centroids));
  writeArray('POLY_VERTICES', Array.from(navmeshData.poly_verts));
  writeArray('POLY_TRIS', Array.from(navmeshData.poly_tris));
  writeArray('POLY_NEIGHBORS', Array.from(navmeshData.poly_neighbors));
  writeArray('BUILDINGS', Array.from(navmeshData.buildings));
  writeArray('BUILDING_VERTS', Array.from(navmeshData.building_verts));
  writeArray('BLOB_BUILDINGS', Array.from(navmeshData.blob_buildings));

  navmeshData.building_meta.forEach((buildingJson, index) => {
    content += `${buildingJson}\n`;
  });

  fs.writeFileSync(outputPath, content);
}

function writeNavmeshBinary(outputPath: string, navmeshData: NavmeshData): void {
  const buffers: Buffer[] = [];

  // Write BBOX metadata first - now includes both real and buffered bboxes
  const bboxBuffer = Buffer.alloc(8 * 4); // 8 floats * 4 bytes (real bbox + buffered bbox)
  // Real bbox (original processing bounds)
  bboxBuffer.writeFloatLE(navmeshData.bbox[0], 0);
  bboxBuffer.writeFloatLE(navmeshData.bbox[1], 4);
  bboxBuffer.writeFloatLE(navmeshData.bbox[2], 8);
  bboxBuffer.writeFloatLE(navmeshData.bbox[3], 12);
  // Buffered bbox (actual triangulated geometry bounds)
  bboxBuffer.writeFloatLE(navmeshData.buffered_bbox[0], 16);
  bboxBuffer.writeFloatLE(navmeshData.buffered_bbox[1], 20);
  bboxBuffer.writeFloatLE(navmeshData.buffered_bbox[2], 24);
  bboxBuffer.writeFloatLE(navmeshData.buffered_bbox[3], 28);
  buffers.push(bboxBuffer);

  // Write array sizes first (header) - reduced to 13 fields since building_meta is now separate
  const header = Buffer.alloc(13 * 4); // 13 fields * 4 bytes per int32
  let headerOffset = 0;
  
  header.writeInt32LE(navmeshData.vertices.length, headerOffset); headerOffset += 4;
  header.writeInt32LE(navmeshData.triangles.length, headerOffset); headerOffset += 4;
  header.writeInt32LE(navmeshData.neighbors.length, headerOffset); headerOffset += 4;
  header.writeInt32LE(navmeshData.polygons.length, headerOffset); headerOffset += 4;
  header.writeInt32LE(navmeshData.poly_centroids.length, headerOffset); headerOffset += 4;
  header.writeInt32LE(navmeshData.poly_verts.length, headerOffset); headerOffset += 4;
  header.writeInt32LE(navmeshData.poly_tris.length, headerOffset); headerOffset += 4;
  header.writeInt32LE(navmeshData.poly_neighbors.length, headerOffset); headerOffset += 4;
  header.writeInt32LE(navmeshData.buildings.length, headerOffset); headerOffset += 4;
  header.writeInt32LE(navmeshData.building_verts.length, headerOffset); headerOffset += 4;
  header.writeInt32LE(navmeshData.blob_buildings.length, headerOffset); headerOffset += 4;
  header.writeInt32LE(navmeshData.walkable_triangle_count, headerOffset); headerOffset += 4;
  header.writeInt32LE(navmeshData.walkable_polygon_count, headerOffset); headerOffset += 4;

  buffers.push(header);

  // Write each array (building_meta excluded since it's now in separate JSON file)
  buffers.push(Buffer.from(navmeshData.vertices.buffer));
  buffers.push(Buffer.from(navmeshData.triangles.buffer));
  buffers.push(Buffer.from(navmeshData.neighbors.buffer));
  buffers.push(Buffer.from(navmeshData.polygons.buffer));
  buffers.push(Buffer.from(navmeshData.poly_centroids.buffer));
  buffers.push(Buffer.from(navmeshData.poly_verts.buffer));
  buffers.push(Buffer.from(navmeshData.poly_tris.buffer));
  buffers.push(Buffer.from(navmeshData.poly_neighbors.buffer));
  buffers.push(Buffer.from(navmeshData.buildings.buffer));
  buffers.push(Buffer.from(navmeshData.building_verts.buffer));
  buffers.push(Buffer.from(navmeshData.blob_buildings.buffer));

  const finalBuffer = Buffer.concat(buffers);
  fs.writeFileSync(outputPath, finalBuffer);
}

function writeBuildingProperties(outputPath: string, buildingMeta: string[]): void {
  
  const content = `[${buildingMeta.join(',\n')}]`;
  fs.writeFileSync(outputPath, content);
  console.log(`Successfully wrote ${buildingMeta.length} building properties to ${outputPath}`);
}

function isPointInBbox(point: MyPoint, bbox: number[]): boolean {
  return point[0] >= bbox[0] && point[0] <= bbox[2] && point[1] >= bbox[1] && point[1] <= bbox[3];
} 