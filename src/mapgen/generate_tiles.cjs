const fs = require('fs-extra');
const path = require('path');
const { fromGeojsonVt } = require('vt-pbf');
const rbush = require('rbush');
const lineclip = require('lineclip');
const polygonClipping = require('polygon-clipping');

const MAX_ZOOM = 15;
const MIN_ZOOM = 9;
const TILE_EXTENT = 4096;

// Fixed world bounds that match OpenLayers projection
const WORLD_MIN_X = -10000;
const WORLD_MAX_X = 10000;
const WORLD_MIN_Y = -10000;
const WORLD_MAX_Y = 10000;
const WORLD_SPAN_X = WORLD_MAX_X - WORLD_MIN_X;
const WORLD_SPAN_Y = WORLD_MAX_Y - WORLD_MIN_Y;

// Custom tile grid configuration to match OpenLayers
// Each zoom level has a specific number of tiles
const ZOOM_TILE_COUNTS = {
  9: 1,   // 1x1 = 1 tile total (20km x 20km per tile)
  10: 2,  // 2x2 = 4 tiles total (10km x 10km per tile)
  11: 4,  // 4x4 = 16 tiles total (5km x 5km per tile)
  12: 8,  // 8x8 = 64 tiles total (2.5km x 2.5km per tile)
  13: 16, // 16x16 = 256 tiles total (1.25km x 1.25km per tile)
  14: 32, // 32x32 = 1024 tiles total (625m x 625m per tile)
  15: 64  // 64x64 = 4096 tiles total (312.5m x 312.5m per tile)
};

function getFeatureBbox(feature) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  if (!feature.geometry || !feature.geometry.coordinates) return null;

  const processCoords = (coords) => {
    if (typeof coords[0] !== 'number') {
      coords.forEach(processCoords);
      return;
    }
    const [x, y] = coords;
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  };
  processCoords(feature.geometry.coordinates);
  
  if (!isFinite(minX)) return null;

  return { minX, minY, maxX, maxY };
}

function getOverallBbox(geojsonData) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  if (!geojsonData || !geojsonData.features) return null;

  for (const feature of geojsonData.features) {
    if (!feature.geometry || !feature.geometry.coordinates) continue;

    const processCoords = (coords) => {
      if (typeof coords[0] !== 'number') {
        coords.forEach(processCoords);
        return;
      }
      const [x, y] = coords;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    };
    processCoords(feature.geometry.coordinates);
  }
  
  if (!isFinite(minX)) return null;

  return { minX, minY, maxX, maxY };
}

function createSpatialIndex(geojsonData) {
  const tree = new rbush();
  const features = geojsonData.features.map((f, i) => {
    const bbox = getFeatureBbox(f);
    if (!bbox) return null;
    return { ...bbox, id: i, original: f };
  }).filter(f => f !== null);

  tree.load(features);
  return tree;
}

function tileToWorldBounds(z, x, y) {
  const tilesPerAxis = ZOOM_TILE_COUNTS[z];
  const tileWidth = WORLD_SPAN_X / tilesPerAxis;
  const tileHeight = WORLD_SPAN_Y / tilesPerAxis;

  const minX = WORLD_MIN_X + x * tileWidth;
  const minY = WORLD_MIN_Y + y * tileHeight;
  const maxX = minX + tileWidth;
  const maxY = minY + tileHeight;

  return { minX, minY, maxX, maxY };
}

function worldToTileCoord(worldX, worldY, zoom) {
  const tilesPerAxis = ZOOM_TILE_COUNTS[zoom];
  const x = Math.floor(tilesPerAxis * (worldX - WORLD_MIN_X) / WORLD_SPAN_X);
  const y = Math.floor(tilesPerAxis * (worldY - WORLD_MIN_Y) / WORLD_SPAN_Y);
  
  return {
    x: Math.max(0, Math.min(tilesPerAxis - 1, x)),
    y: Math.max(0, Math.min(tilesPerAxis - 1, y))
  };
}

function generateTileFeatures(spatialIndex, z, x, y) {
  const bounds = tileToWorldBounds(z, x, y);
  const { minX, minY, maxX, maxY } = bounds;
  
  const tileBbox = [minX, minY, maxX, maxY];
  const results = spatialIndex.search({ minX, minY, maxX, maxY });

  if (results.length === 0) return null;

  const tileWidth = maxX - minX;
  const tileHeight = maxY - minY;

  const transform = (coord) => {
    const [cx, cy] = coord;
    return [
      Math.round(TILE_EXTENT * (cx - minX) / tileWidth),
      Math.round(TILE_EXTENT * (cy - minY) / tileHeight)
    ];
  };
  
  const transformRing = (ring) => ring.map(transform);
  const transformMulti = (multi) => multi.map(transformRing);

  const tileFeatures = [];
  
  for (const result of results) {
    const feature = result.original;
    const newFeature = JSON.parse(JSON.stringify(feature));
    let featureType;
    let clippedGeometry;

    switch (newFeature.geometry.type) {
      case 'Point':
        const [px, py] = newFeature.geometry.coordinates;
        if (px >= minX && px <= maxX && py >= minY && py <= maxY) {
          clippedGeometry = transform([px, py]);
          featureType = 1;
        }
        break;
        
      case 'LineString':
        clippedGeometry = lineclip(newFeature.geometry.coordinates, tileBbox).map(transformRing);
        if (clippedGeometry.length > 0) featureType = 2;
        break;
        
      case 'Polygon':
        const tilePolygon = [[[minX, minY], [maxX, minY], [maxX, maxY], [minX, maxY], [minX, minY]]];
        clippedGeometry = polygonClipping.intersection(newFeature.geometry.coordinates, tilePolygon).map(transformMulti);
        if (clippedGeometry.length > 0) featureType = 3;
        break;
        
      case 'MultiLineString':
        clippedGeometry = newFeature.geometry.coordinates.flatMap(line => lineclip(line, tileBbox)).map(transformRing);
        if (clippedGeometry.length > 0) featureType = 2;
        break;
        
      case 'MultiPolygon':
        const multiTilePolygon = [[[minX, minY], [maxX, minY], [maxX, maxY], [minX, maxY], [minX, minY]]];
        clippedGeometry = newFeature.geometry.coordinates.flatMap(poly => polygonClipping.intersection(poly, multiTilePolygon)).map(transformMulti);
        if (clippedGeometry.length > 0) featureType = 3;
        break;
        
      default:
        continue;
    }

    if (featureType && clippedGeometry) {
      tileFeatures.push({
        geometry: clippedGeometry,
        type: featureType,
        tags: newFeature.properties,
      });
    }
  }
  
  return tileFeatures.length > 0 ? { features: tileFeatures } : null;
}

async function generateTilesForFeature(inputDir, outputDir, featureName) {
  const inputFile = path.join(inputDir, `${featureName}.geojson`);
  const featureOutputDir = path.join(outputDir, featureName);

  if (!fs.existsSync(inputFile)) {
    console.warn(`Warning: Input file not found for ${featureName} at ${inputFile}. Skipping.`);
    return;
  }

  console.log(`Processing ${featureName}...`);
  fs.ensureDirSync(featureOutputDir);
  fs.emptyDirSync(featureOutputDir);

  const geojsonData = JSON.parse(fs.readFileSync(inputFile, 'utf-8'));
  
  const overallBbox = getOverallBbox(geojsonData);
  if (!overallBbox) {
    console.log(`  No features with coordinates found in ${featureName}.`);
    return;
  }

  console.log(`  Feature bounds: ${overallBbox.minX.toFixed(0)}, ${overallBbox.minY.toFixed(0)} to ${overallBbox.maxX.toFixed(0)}, ${overallBbox.maxY.toFixed(0)}`);
  console.log(`  Total features: ${geojsonData.features.length}`);

  const spatialIndex = createSpatialIndex(geojsonData);

  let generatedCount = 0;
  
  for (let z = MIN_ZOOM; z <= MAX_ZOOM; z++) {
    const tilesPerAxis = ZOOM_TILE_COUNTS[z];
    const totalTiles = tilesPerAxis * tilesPerAxis;
    const tileSize = WORLD_SPAN_X / tilesPerAxis;
    
    console.log(`  Processing zoom level ${z}... (${tilesPerAxis}x${tilesPerAxis} = ${totalTiles} tiles, ${tileSize.toFixed(0)}m per tile)`);
    
    // Calculate the range of tiles that might contain features
    const minTileCoord = worldToTileCoord(overallBbox.minX, overallBbox.minY, z);
    const maxTileCoord = worldToTileCoord(overallBbox.maxX, overallBbox.maxY, z);
    
    // Add a small buffer to ensure we don't miss edge cases, but clamp to valid range
    const minTileX = Math.max(0, minTileCoord.x);
    const maxTileX = Math.min(tilesPerAxis - 1, maxTileCoord.x);
    const minTileY = Math.max(0, minTileCoord.y);
    const maxTileY = Math.min(tilesPerAxis - 1, maxTileCoord.y);

    console.log(`  Checking tiles ${minTileX}-${maxTileX}, ${minTileY}-${maxTileY} (${(maxTileX-minTileX+1) * (maxTileY-minTileY+1)} tiles)`);

    let zoomGeneratedCount = 0;
    for (let x = minTileX; x <= maxTileX; x++) {
      for (let y = minTileY; y <= maxTileY; y++) {
        const tile = generateTileFeatures(spatialIndex, z, x, y);

        if (tile && tile.features.length > 0) {
          const tileDir = path.join(featureOutputDir, z.toString(), x.toString());
          fs.ensureDirSync(tileDir);
          
          const pbfData = fromGeojsonVt({ [featureName]: tile });
          const buffer = Buffer.from(pbfData);
          
          const tilePath = path.join(tileDir, `${y}.pbf`);
          fs.writeFileSync(tilePath, buffer);
          
          zoomGeneratedCount++;
          generatedCount++;
        }
      }
    }
    
    console.log(`  Generated ${zoomGeneratedCount} tiles for zoom ${z}`);
  }

  console.log(`Finished processing ${featureName}. Generated ${generatedCount} tiles total.`);
}

async function main() {
  const args = require('minimist')(process.argv.slice(2));
  const inputDir = args.input;
  const outputDir = args.output;

  if (!inputDir || !outputDir) {
    console.error('Usage: node generate_tiles.cjs --input <input_dir> --output <output_dir>');
    process.exit(1);
  }

  const featuresToProcess = ['buildings', 'roads'];
  console.log(`Starting tile generation from ${inputDir} to ${outputDir}`);
  console.log(`World bounds: ${WORLD_MIN_X} to ${WORLD_MAX_X}, ${WORLD_MIN_Y} to ${WORLD_MAX_Y}`);
  console.log(`Zoom levels: ${MIN_ZOOM} to ${MAX_ZOOM}`);
  console.log(`Custom tile counts per zoom level:`, ZOOM_TILE_COUNTS);

  for (const featureName of featuresToProcess) {
    await generateTilesForFeature(inputDir, outputDir, featureName);
  }

  console.log('All tiles generated successfully.');
}

main().catch(error => {
  console.error('An error occurred during tile generation:', error);
  process.exit(1);
});

module.exports = { generateTiles: generateTilesForFeature }; 