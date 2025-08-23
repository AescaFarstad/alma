import fs from 'fs';
import path from 'path';
import minimist from 'minimist';
import { loadBlobs, loadBuildings } from './nav_data_io';
import { triangulate } from './triangulate';
import { hertelMehlhorn } from './hertel_mehlhorn';
import { kOptOptimize } from './k_opt';
import { MyPolygon, MyPoint, NavmeshData } from './navmesh_struct';
import { printFinalSummary, finalizeNavmeshData } from './nav_summary';
import { writeNavmeshOutput } from './nav_data_io';
import { populateTriangulationData, populatePolygonData, populateBuildingData, populatePolygonCentroids } from './populate_navmesh';
import { finalizeNavmesh, buildFinalTriangleToPolygonMap } from './finalize_navmesh';
import { drawNavmesh } from './navmesh_visualization';
import { generateBoundary, validateBoundaryTriangulation } from './navmesh_boundary';
import { validateVertexDistance, validateTrianglePolygonMapping, validateIntermediateTrianglePolygonMapping } from './navmesh_validation';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// const DEBUG_BBOX: readonly [number, number, number, number] | null = [-500, -500, 500, 500];
// const DEBUG_BBOX: readonly [number, number, number, number] | null = [-120, -120, 120, 120];
const DEBUG_BBOX: readonly [number, number, number, number] | null = [-2000, -2000, 2000, 2000];
const BOUNDARY_INFLATION = 100;

const POLYGONIZATION_SETTINGS = {
    enableConvexityChecks: true,
    maxMergeAttempts: 1000
} as const;

const OPTIMIZATION_SETTINGS = {
    walkable: {
        maxIterations: 50,
        kMax: 3,
        randomRestarts: 3,
        earlyStopMaxIterations: 20
    }
} as const;

const MEMORY_SETTINGS = {
    initialVertexCapacity: 150000,
    initialTriangleCapacity: 120000,
    initialPolygonCapacity: 20000,
    growthFactor: 1.5
} as const;

const OUTPUT_SETTINGS = {
    generateBinaryFile: true,
    generateInspectableText: true,
    generateVisualization: true
} as const;


function main() {
    const args = minimist(process.argv.slice(2));
    const inputDir = args.input;
    const outputDir = args.output;

    if (!inputDir || !outputDir) {
        console.error('Usage: ts-node build_navmesh.ts --input <input_dir> --output <output_dir>');
        process.exit(1);
    }

    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }

    console.log(`Running navmesh build step`);
    console.log(`Input directory: ${inputDir}`);
    console.log(`Output directory: ${outputDir}`);

    // Step 1: Load and process input data
    const blobsFilePath = path.join(inputDir, 'blobs.txt');
    const { simplified_vertices: rawHolePolygons, blobToBuildings } = loadBlobs(blobsFilePath, DEBUG_BBOX);
    const buildingsFilePath = path.join(inputDir, 'buildings_s7.txt');
    const buildings = loadBuildings(buildingsFilePath);
    
    // === DEBUG LOGGING: Initial building data ===
    console.log(`\n=== BUILDING DATA TRACKING ===`);
    console.log(`Initial buildings loaded: ${buildings.length}`);
    console.log(`Sample building IDs: ${buildings.slice(0, 5).map(b => b.properties.osm_id).join(', ')}`);
    console.log(`Blob-to-building mappings: ${blobToBuildings.length}`);
    console.log(`Sample blob mappings:`, blobToBuildings.slice(0, 3));
    
    // Count total building references in blobs
    const totalBuildingRefs = blobToBuildings.flat().length;
    const uniqueBuildingRefs = new Set(blobToBuildings.flat()).size;
    console.log(`Total building references in blobs: ${totalBuildingRefs}`);
    console.log(`Unique building references in blobs: ${uniqueBuildingRefs}`);
    
    // Step 1.1: Snap all coordinates to 2 decimal precision for consistency
    const snapTo2Decimals = (coord: number): number => Math.round(coord * 100) / 100;
    const snapPolygon = (poly: MyPolygon): MyPolygon => poly.map(([x, y]) => [snapTo2Decimals(x), snapTo2Decimals(y)]);
    const holePolygons = rawHolePolygons.map(snapPolygon);
    console.log(`Loaded and processed ${holePolygons.length} hole polygons`);
    
    const processingBbox = calculateProcessingBounds(holePolygons);
    
    // Calculate the inflated bbox used for triangulation
    const inflatedBbox: readonly [number, number, number, number] = [
        processingBbox[0] - BOUNDARY_INFLATION,  // minX - 100
        processingBbox[1] - BOUNDARY_INFLATION,  // minY - 100
        processingBbox[2] + BOUNDARY_INFLATION,  // maxX + 100
        processingBbox[3] + BOUNDARY_INFLATION   // maxY + 100
    ];
    
    console.log(`Real bbox: [${processingBbox.join(', ')}]`);
    console.log(`Inflated bbox for triangulation: [${inflatedBbox.join(', ')}]`);
    
    // Step 1.5: Generate boundary data and snap coordinates
    console.log('\n=== BOUNDARY GENERATION ===');
    const rawBoundaryData = generateBoundary(processingBbox, BOUNDARY_INFLATION);
    
    // Snap boundary coordinates to 2-decimal precision
    const boundaryData = {
        ...rawBoundaryData,
        outerBoundary: snapPolygon(rawBoundaryData.outerBoundary),
        boundaryBlobs: rawBoundaryData.boundaryBlobs.map(snapPolygon),
        boundaryTriangles: rawBoundaryData.boundaryTriangles.map(tri => tri.map(([x, y]): MyPoint => [snapTo2Decimals(x), snapTo2Decimals(y)]))
    };

    const isValidBoundary = validateBoundaryTriangulation(boundaryData);
    if (!isValidBoundary) {
        console.error('Boundary triangulation validation failed. Aborting navmesh generation.');
        process.exit(1);
    }

    // Step 2: Initialize the final navmesh data structure
    console.log('\n=== INITIALIZING NAVMESH DATA STRUCTURE ===');
    const navmeshData = initializeNavmeshData();

    // Step 3: Triangulation phase
    console.log('\n=== TRIANGULATION PHASE ===');
    const triangulationResult = triangulate(boundaryData.outerBoundary, holePolygons, boundaryData);
    populateTriangulationData(navmeshData, triangulationResult, MEMORY_SETTINGS);

    // Step 4: Polygonization phase  
    console.log('\n=== WALKABLE POLYGONIZATION PHASE ===');
    const { polygons: rawWalkablePolygons, triangleToPolygonMap: walkableT2P } = hertelMehlhorn({
        navmeshData,
        settings: POLYGONIZATION_SETTINGS,
    });
    
    validateIntermediateTrianglePolygonMapping(walkableT2P, navmeshData.walkable_triangle_count, rawWalkablePolygons.length, "Polygonization");

    // Step 4.1: Snap walkable polygon coordinates to 2-decimal precision
    // (hertel-mehlhorn reads from navmeshData.vertices which has Float32Array precision loss)
    const walkablePolygons = rawWalkablePolygons.map(snapPolygon);
    const impassablePolygons = [...holePolygons, ...boundaryData.boundaryBlobs];
    
    // Create a mapping from the global triangle index to the new global polygon index.
    const impassableT2P = new Map<number, number>();
    const walkableTriangleCount = navmeshData.walkable_triangle_count;
    const walkablePolygonCount = walkablePolygons.length;
    
    // Map all impassable triangles to their blobs (includes boundary triangles now)
    triangulationResult.impassableTriangleToBlobIndex.forEach((blobIndex, triangleIndexInBlob) => {
        const globalTriangleIndex = walkableTriangleCount + triangleIndexInBlob;
        const globalPolygonIndex = walkablePolygonCount + blobIndex;
        impassableT2P.set(globalTriangleIndex, globalPolygonIndex);
    });

    const bestSeedPath = path.join(outputDir, 'best_seed.txt');
    let initialSeed: number | undefined;
    if (fs.existsSync(bestSeedPath)) {
        try {
            initialSeed = parseInt(fs.readFileSync(bestSeedPath, 'utf-8'), 10);
            console.log(`Found best seed from previous run: ${initialSeed}`);
        } catch (e) {
            console.warn('Could not read best_seed.txt');
        }
    }

    // Step 5: Optimization phase
    console.log('\n=== OPTIMIZATION PHASE ===');
    console.log('Optimizing walkable polygons...');
    const optimizedWalkable = kOptOptimize(walkablePolygons, { ...OPTIMIZATION_SETTINGS.walkable, initialSeed });

    console.log('Skipping optimization for impassable polygons...');
    const optimizedImpassable = {
        polygons: impassablePolygons,
        originalCount: impassablePolygons.length,
        optimizedCount: impassablePolygons.length,
        improvementPercent: 0,
        iterations: 0,
    };

    const optimizedT2P = buildFinalTriangleToPolygonMap(navmeshData, navmeshData.walkable_triangle_count, optimizedWalkable.polygons, walkableT2P, new Map());
    validateIntermediateTrianglePolygonMapping(optimizedT2P, navmeshData.walkable_triangle_count, optimizedWalkable.polygons.length, "Optimization");

    try {
        fs.writeFileSync(bestSeedPath, optimizedWalkable.bestSeed.toString(), 'utf-8');
        console.log(`Wrote new best seed to ${bestSeedPath}: ${optimizedWalkable.bestSeed}`);
    } catch (e) {
        console.error('Could not write best_seed.txt');
    }

    // Step 6: Populate and finalize navmesh data structure
    console.log('\n=== POPULATING AND FINALIZING NAVMESH DATA ===');
    
    // DEBUG: Log polygon sources
    console.log(`Walkable polygons: ${optimizedWalkable.polygons.length} (from hertelMehlhorn + k-opt)`);
    console.log(`Impassable polygons: ${optimizedImpassable.polygons.length} (original holes + boundary blobs)`);
    console.log(`  - Original hole polygons: ${holePolygons.length}`);
    console.log(`  - Boundary blobs: ${boundaryData.boundaryBlobs.length}`);
    
    populatePolygonData(navmeshData, optimizedWalkable.polygons, optimizedImpassable.polygons);
    const allBuildings = [...buildings, ...boundaryData.fakeBuildingsData];

    const extendedBlobToBuildings = [...blobToBuildings];
    // Map boundary blobs to their fake buildings (add entries for the two boundary blobs)
    extendedBlobToBuildings.push([boundaryData.fakeBuildingsData[0].properties.osm_id]); // First boundary blob
    extendedBlobToBuildings.push([boundaryData.fakeBuildingsData[1].properties.osm_id]); // Second boundary blob
    
    // === DEBUG LOGGING: Before populateBuildingData ===
    console.log(`\n=== BEFORE POPULATE BUILDING DATA ===`);
    console.log(`Total buildings (including fake): ${allBuildings.length}`);
    console.log(`Original buildings: ${buildings.length}`);
    console.log(`Fake buildings: ${boundaryData.fakeBuildingsData.length}`);
    console.log(`Extended blob-to-building mappings: ${extendedBlobToBuildings.length}`);
    console.log(`Sample fake building IDs: ${boundaryData.fakeBuildingsData.map(b => b.properties.osm_id).join(', ')}`);
    console.log(`Last two blob mappings (should be fake buildings):`, extendedBlobToBuildings.slice(-2));
    
    const { reorderedBuildings, buildingVertexStats } = populateBuildingData(navmeshData, allBuildings, extendedBlobToBuildings);
    
    // === DEBUG LOGGING: After populateBuildingData ===
    console.log(`\n=== AFTER POPULATE BUILDING DATA ===`);
    console.log(`Returned reorderedBuildings count: ${reorderedBuildings.length}`);
    console.log(`Sample returned building IDs: ${reorderedBuildings.slice(0, 5).map(b => `${b.id}(osm:${b.properties.osm_id})`).join(', ')}`);
    
    const triangleToPolygonMap = finalizeNavmesh(
        navmeshData,
        triangulationResult.walkableTriangles.length,
        optimizedWalkable.polygons,
        walkableT2P,
        impassableT2P
    );
    
    // Calculate polygon centroids (must be after finalization for poly_tris to be available)
    populatePolygonCentroids(navmeshData);

    finalizeNavmeshData(navmeshData, {
        walkablePolygons: optimizedWalkable.polygons,
        impassablePolygons: optimizedImpassable.polygons,
        triangulationResult,
        optimizationStats: {
            walkable: optimizedWalkable,
            impassable: optimizedImpassable
        },
        processingBbox,
        inflatedBbox
    });

    // Step 7: Write output
    console.log('\n=== WRITING OUTPUT ===');
    
    // === DEBUG LOGGING: Before writeNavmeshOutput ===
    console.log(`\n=== BEFORE WRITE OUTPUT ===`);
    console.log(`Buildings being passed to writeNavmeshOutput: ${reorderedBuildings.length}`);
    console.log(`Sample building IDs being written: ${reorderedBuildings.slice(0, 5).map(b => `${b.id}(osm:${b.properties.osm_id})`).join(', ')}`);
    
    const { createdFiles } = writeNavmeshOutput(outputDir, navmeshData, reorderedBuildings, OUTPUT_SETTINGS);
    
    if (OUTPUT_SETTINGS.generateVisualization) {
        const visualizationPath = path.join(outputDir, 'navmesh_visualization.png');
        const visualizationFile = drawNavmesh(navmeshData, visualizationPath);
        createdFiles.push(visualizationFile);
    }

    // Report file sizes
    console.log('\nCreated files:');
    let totalSize = 0;
    for (const file of createdFiles) {
        const sizeKB = (file.sizeBytes / 1024).toFixed(2);
        const sizeMB = (file.sizeBytes / 1024 / 1024).toFixed(2);
        const fileName = path.basename(file.path);
        
        if (file.sizeBytes >= 1024 * 1024) {
            console.log(`  ${fileName}: ${sizeMB} MB`);
        } else {
            console.log(`  ${fileName}: ${sizeKB} KB`);
        }
        totalSize += file.sizeBytes;
    }
    
    const totalSizeKB = (totalSize / 1024).toFixed(2);
    const totalSizeMB = (totalSize / 1024 / 1024).toFixed(2);
    if (totalSize >= 1024 * 1024) {
        console.log(`Total size: ${totalSizeMB} MB`);
    } else {
        console.log(`Total size: ${totalSizeKB} KB`);
    }

    // Step 8: Validate navmesh data
    validateVertexDistance(navmeshData);
    // validateTrianglePolygonMapping(navmeshData);

    printFinalSummary(navmeshData, optimizedWalkable, optimizedImpassable, triangleToPolygonMap, buildingVertexStats);
    
    // Step 9: Generate structure files
    console.log('\n=== GENERATING STRUCTURE FILES ===');
    try {
        const generateScriptPath = path.resolve(__dirname, 'generate-structure.cjs');
        const generatedTypesFile = path.join(outputDir, 'map_render_buildings_structure.ts');
        console.log(`Running generate-structure script on ${outputDir}...`);
        execSync(`node "${generateScriptPath}" --input=${outputDir} --output=${generatedTypesFile}`, { stdio: 'inherit' });
    } catch (error) {
        console.error(`Failed to run generate-structure.cjs: ${(error as Error).message}`);
        // Do not exit, as this is a post-processing step
    }

    try {
        const generatePropsScriptPath = path.resolve(__dirname, 'generate-building-props-structure.cjs');
        const buildingPropertiesPath = path.join(outputDir, 'building_properties.json');
        const generatedPropsFile = path.join(outputDir, 'building_properties_structure.ts');
        console.log(`Running generate-building-props-structure script on ${buildingPropertiesPath}...`);
        execSync(`node "${generatePropsScriptPath}" --input=${buildingPropertiesPath} --output=${generatedPropsFile}`, { stdio: 'inherit' });
    } catch (error) {
        console.error(`Failed to run generate-building-props-structure.cjs: ${(error as Error).message}`);
        // Do not exit, as this is a post-processing step
    }
}

// ================================
// HELPER FUNCTIONS
// ================================


function calculateProcessingBounds(holePolygons: MyPolygon[]): readonly [number, number, number, number] {
    if (DEBUG_BBOX) {
        return DEBUG_BBOX;
    }

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const poly of holePolygons) {
        for (const p of poly) {
            if (p[0] < minX) minX = p[0];
            if (p[1] < minY) minY = p[1];
            if (p[0] > maxX) maxX = p[0];
            if (p[1] > maxY) maxY = p[1];
        }
    }
    return [minX, minY, maxX, maxY];
}



function initializeNavmeshData(): NavmeshData {
    console.log(`Pre-allocating data structures with capacities:`);
    console.log(`  Vertices: ${MEMORY_SETTINGS.initialVertexCapacity}`);
    console.log(`  Triangles: ${MEMORY_SETTINGS.initialTriangleCapacity}`);
    console.log(`  Polygons: ${MEMORY_SETTINGS.initialPolygonCapacity}`);

    return {
        vertices: new Float32Array(MEMORY_SETTINGS.initialVertexCapacity * 2),
        triangles: new Int32Array(MEMORY_SETTINGS.initialTriangleCapacity * 3),
        neighbors: new Int32Array(MEMORY_SETTINGS.initialTriangleCapacity * 3),
        polygons: new Int32Array(MEMORY_SETTINGS.initialPolygonCapacity),
        poly_centroids: new Float32Array(MEMORY_SETTINGS.initialPolygonCapacity * 2),
        poly_verts: new Int32Array(MEMORY_SETTINGS.initialPolygonCapacity * 10),
        poly_tris: new Int32Array(MEMORY_SETTINGS.initialPolygonCapacity),
        poly_neighbors: new Int32Array(MEMORY_SETTINGS.initialPolygonCapacity * 10),
        buildings: new Int32Array(0),
        building_verts: new Int32Array(0),
        blob_buildings: new Int32Array(0),
        building_meta: [],
        walkable_triangle_count: 0,
        walkable_polygon_count: 0,
        bbox: [0, 0, 0, 0],
        buffered_bbox: [0, 0, 0, 0],
        stats: {
            vertices: 0,
            triangles: 0,
            walkable_triangles: 0,
            impassable_triangles: 0,
            polygons: 0,
            walkable_polygons: 0,
            impassable_polygons: 0,
            buildings: 0,
            blobs: 0,
            bbox: [0, 0, 0, 0],
            avg_triangle_area: 0,
            avg_polygon_area: 0
        }
    };
}

main(); 