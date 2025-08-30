import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { AREA_DEFINITION, FILTERED_OSM_FILE, RAW_FILTERING_AREA, RAW_OSM_FILE } from './areas/areaConfig.js';


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// true false
const STEPS_TO_RUN = {
  ensureFilteredPbf: false,
  processOsm: false,
  filterGeojson: false,
  deduplication: false,
  simplify: false,
  buildNavmesh: true,
  generateTiles: false,
  copyData: true,
} as const;

const BASE_DATA_DIR = path.resolve(__dirname, '../../data');
const STEP_1_OUTPUT_DIR = path.resolve(BASE_DATA_DIR, 'step_1_processed_osm');
const STEP_2_OUTPUT_DIR = path.resolve(BASE_DATA_DIR, 'step_2_filtered_geojson');
const STEP_3_OUTPUT_DIR = path.resolve(BASE_DATA_DIR, 'step_3_deduplicated_geojson');
const STEP_4_SIMPLIFY_DIR = path.resolve(BASE_DATA_DIR, 'step_4_simplified_geojson');
const STEP_5_NAVMESH_DIR = path.resolve(BASE_DATA_DIR, 'step_5_navmesh');

const FINAL_DATA_DIR = path.resolve(__dirname, '../../public/data');
const TILES_OUTPUT_DIR = path.resolve(__dirname, '../../public/tiles');

const GEOJSON_COPY_SOURCE_DIR_SIMPLIFIED = STEP_4_SIMPLIFY_DIR;
const GEOJSON_COPY_SOURCE_DIR_DEDUPLICATED = STEP_3_OUTPUT_DIR;


const FEATURES_TO_EXTRACT = {
  // Built environment
  buildings: 'nwr/building',
  roads: 'w/highway',
  // railways: 'w/railway',
  // barriers: 'w/barrier',

  // // Land use and areas
  // landuse: 'w/landuse',
  // leisure: 'nwr/leisure',

  // // Natural features
  // natural: 'nwr/natural',
  // water: 'nwr/water nwr/waterway',

  // // Points of interest
  // amenities: 'nwr/amenity',
  // shops: 'nwr/shop',
  // tourism: 'nwr/tourism',
  // historic: 'nwr/historic',

  // // Infrastructure
  // power: 'nwr/power',
  // telecom: 'nwr/telecom nwr/communication',

  // // Transportation
  // transport: 'nwr/public_transport',
  // parking: 'nwr/parking nwr/amenity=parking',

  // // Administrative
  // boundaries: 'r/boundary',
  // places: 'nwr/place',

  // // Miscellaneous
  // sport: 'nwr/sport',
  // craft: 'nwr/craft',
  // office: 'nwr/office',
  // emergency: 'nwr/emergency',
  // healthcare: 'nwr/healthcare',
} as const;

// ============================================================================
// ORCHESTRATOR LOGIC
// ============================================================================

async function runStep(name: keyof typeof STEPS_TO_RUN, stepFunction: () => Promise<void> | void): Promise<void> {
  if (STEPS_TO_RUN[name]) {
    console.log(`\n==================== RUNNING STEP: ${name} ====================`);
    try {
      await stepFunction();
    } catch (error) {
      console.error(`\n!!!!!! STEP FAILED: ${name} !!!!!!`);
      console.error(error);
      process.exit(1);
    }
  } else {
    console.log(`\n--- SKIPPING STEP: ${name} ---`);
  }
}

// --- Step 0: Ensure Filtered PBF ---
function stepEnsureFilteredPbf(): void {
  if (fs.existsSync(FILTERED_OSM_FILE)) {
    console.log(`Filtered PBF file already exists: ${FILTERED_OSM_FILE}`);
    return;
  }

  console.log(`Filtered PBF file not found. Creating it from ${RAW_OSM_FILE}`);
  if (!fs.existsSync(RAW_OSM_FILE)) {
    console.error(`Raw OSM file not found: ${RAW_OSM_FILE}`);
    console.error('Please download it and place it in data/other/');
    process.exit(1);
  }

  const bbox = RAW_FILTERING_AREA.join(',');
  const cmd = `osmium extract -b ${bbox} "${RAW_OSM_FILE}" -o "${FILTERED_OSM_FILE}" --overwrite`;

  console.log(`Running command: ${cmd}`);
  execSync(cmd, { stdio: 'inherit' });
  console.log('Successfully created filtered PBF file.');
}


// --- Step 1: Process OSM Data ---
function stepProcessOsm(): void {
  const scriptPath = path.resolve(__dirname, 'process_osm_data.ts');
  const config = JSON.stringify({
    areaDefinition: AREA_DEFINITION.city_crop,
    featuresToExtract: FEATURES_TO_EXTRACT,
    outputDir: STEP_1_OUTPUT_DIR,
    structureOutputFile: path.resolve(STEP_1_OUTPUT_DIR, 'structure.ts'),
    sourceFile: FILTERED_OSM_FILE,
    tempDir: path.resolve(__dirname, '../../temp/process_osm'),
  });
  execSync(`npm run ts-node "${scriptPath}" -- --config='${config}'`, { stdio: 'inherit' });
}

// --- Step 2: Filter GeoJSON ---
function stepFilterGeojson(): void {
  const scriptPath = path.resolve(__dirname, 'filter_geojson.ts');
  const generatedTypesFile = path.resolve(STEP_2_OUTPUT_DIR, 'structure.ts');
  execSync(`npm run ts-node -- "${scriptPath}" --input="${STEP_1_OUTPUT_DIR}" --output="${STEP_2_OUTPUT_DIR}" --generated-types-file="${generatedTypesFile}"`, { stdio: 'inherit' });
}

// --- Step 3: Deduplicate GeoJSON ---
function stepDeduplicateGeojson(): void {
  const scriptPath = path.resolve(__dirname, 'deduplicate_geojson.ts');
  execSync(`npm run ts-node "${scriptPath}" -- --input="${STEP_2_OUTPUT_DIR}" --output="${STEP_3_OUTPUT_DIR}"`, { stdio: 'inherit' });
}

// --- Step 4: Simplify GeoJSON ---
function stepSimplify(): void {
  const scriptPath = path.resolve(__dirname, 'simplify.ts');
  const areaDef = AREA_DEFINITION.city_crop;
  const splitLinesArg = areaDef.splitLines ? `--split-lines='${JSON.stringify(areaDef.splitLines)}'` : '';
  execSync(`npm run ts-node "${scriptPath}" -- --input="${STEP_3_OUTPUT_DIR}" --output="${STEP_4_SIMPLIFY_DIR}" ${splitLinesArg}`, { stdio: 'inherit' });
}

// --- Step 5: Build NavMesh ---
function stepBuildNavmesh(): void {
  const scriptPath = path.resolve(__dirname, 'build_navmesh.ts');
  execSync(`npm run ts-node "${scriptPath}" -- --input="${STEP_4_SIMPLIFY_DIR}" --output="${STEP_5_NAVMESH_DIR}"`, { stdio: 'inherit' });
}


// --- Step 6: Copy Data to Public Folder ---
function stepCopyData(): void {
  if (!fs.existsSync(FINAL_DATA_DIR)) {
    fs.mkdirSync(FINAL_DATA_DIR, { recursive: true });
  }

  console.log(`Copying files from ${GEOJSON_COPY_SOURCE_DIR_SIMPLIFIED} and ${GEOJSON_COPY_SOURCE_DIR_DEDUPLICATED} to ${FINAL_DATA_DIR}...`);
  const filesToCopy = [
    // { from: GEOJSON_COPY_SOURCE_DIR_SIMPLIFIED, file: 'buildings_simplified.geojson' },
    // { from: GEOJSON_COPY_SOURCE_DIR_SIMPLIFIED, file: 'buildings_s7.txt' },
    // { from: GEOJSON_COPY_SOURCE_DIR_SIMPLIFIED, file: 'blobs.txt' },
    // { from: GEOJSON_COPY_SOURCE_DIR_DEDUPLICATED, file: 'buildings.geojson' },
    { from: GEOJSON_COPY_SOURCE_DIR_DEDUPLICATED, file: 'roads.geojson', rename: 'map_render_roads.geojson' },
    { from: STEP_5_NAVMESH_DIR, file: 'navmesh.txt' },
    { from: STEP_5_NAVMESH_DIR, file: 'navmesh.bin' },
    { from: STEP_5_NAVMESH_DIR, file: 'building_properties.json' },
    { from: STEP_5_NAVMESH_DIR, file: 'map_render_buildings.geojson' },
  ];

  for (const { from, file, rename } of filesToCopy) {
    const sourcePath = path.join(from, file);
    const targetFileName = rename || file;
    if (fs.existsSync(sourcePath)) {
      fs.copyFileSync(sourcePath, path.join(FINAL_DATA_DIR, targetFileName));
      console.log(`  - Copied ${file} -> ${targetFileName}`);
    } else {
      console.warn(`  - WARNING: File not found, skipped copying: ${file}`);
    }
  }
}

// --- Step 7: Generate Tiles ---
function stepGenerateTiles(): void {
  const scriptPath = path.resolve(__dirname, 'generate_tiles.ts');
  execSync(`npm run ts-node "${scriptPath}" -- --input="${STEP_4_SIMPLIFY_DIR}" --output="${TILES_OUTPUT_DIR}"`, { stdio: 'inherit' });
}

// --- Main Execution ---
async function main(): Promise<void> {
  console.log('Starting data generation pipeline...');
  
  // Create base directories if they don't exist
  if (!fs.existsSync(BASE_DATA_DIR)) {
    fs.mkdirSync(BASE_DATA_DIR, { recursive: true });
  }

  await runStep('ensureFilteredPbf', stepEnsureFilteredPbf);
  await runStep('processOsm', stepProcessOsm);
  await runStep('filterGeojson', stepFilterGeojson);
  await runStep('deduplication', stepDeduplicateGeojson);
  await runStep('simplify', stepSimplify);
  await runStep('buildNavmesh', stepBuildNavmesh);
  await runStep('generateTiles', stepGenerateTiles);
  await runStep('copyData', stepCopyData);
  // runStep('buildNavmesh', stepBuildNavmesh);

  console.log('nData generation pipeline finished!');
}

main(); 