const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const STEPS_TO_RUN = {
    processOsm: false,
    filterGeojson: false,
    generateTiles: true,
    // buildNavmesh: true,  // Placeholder for next step
};

const AREA_TO_EXTRACT = 'city_center'; // 'city_center', 'city_main', or 'city_full'

const BASE_DATA_DIR = path.resolve(__dirname, '../../data');
const STEP_1_OUTPUT_DIR = path.resolve(BASE_DATA_DIR, 'step_1_processed_osm');
const STEP_2_OUTPUT_DIR = path.resolve(BASE_DATA_DIR, 'step_2_filtered_geojson');
const STEP_3_OUTPUT_DIR = path.resolve(__dirname, '../../public/tiles');

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
};

// ============================================================================
// ORCHESTRATOR LOGIC
// ============================================================================

async function runStep(name, stepFunction) {
    if (STEPS_TO_RUN[name]) {
        console.log(`\n\n==================== RUNNING STEP: ${name} ====================`);
        try {
            await stepFunction();
            console.log(`==================== COMPLETED STEP: ${name} ====================\n`);
        } catch (error) {
            console.error(`\n!!!!!! STEP FAILED: ${name} !!!!!!`);
            console.error(error);
            process.exit(1);
        }
    } else {
        console.log(`\n--- SKIPPING STEP: ${name} ---`);
    }
}

// --- Step 1: Process OSM Data ---
function stepProcessOsm() {
    const { processOSM } = require('./process_osm_data.cjs');
    return processOSM({
        areaToExtract: AREA_TO_EXTRACT,
        featuresToExtract: FEATURES_TO_EXTRACT,
        outputDir: STEP_1_OUTPUT_DIR,
        // The structure file will be placed in the step 1 folder
        structureOutputFile: path.resolve(STEP_1_OUTPUT_DIR, 'structure.ts'),
        sourceFile: path.resolve(__dirname, '../../data/almaty_c.pbf'),
        tempDir: path.resolve(__dirname, '../../temp/process_osm'),
    });
}

// --- Step 2: Filter GeoJSON ---
function stepFilterGeojson() {
    const scriptPath = path.resolve(__dirname, 'filter_geojson.cjs');
    const generatedTypesFile = path.resolve(STEP_2_OUTPUT_DIR, 'structure.ts');
    execSync(`node "${scriptPath}" --input="${STEP_1_OUTPUT_DIR}" --output="${STEP_2_OUTPUT_DIR}" --generated-types-file="${generatedTypesFile}"`, { stdio: 'inherit' });
}

// --- Step 3: Generate Tiles ---
function stepGenerateTiles() {
    const scriptPath = path.resolve(__dirname, 'generate_tiles.cjs');
    execSync(`node "${scriptPath}" --input="${STEP_2_OUTPUT_DIR}" --output="${STEP_3_OUTPUT_DIR}"`, { stdio: 'inherit' });
}

// --- Step 4: Build NavMesh (Placeholder) ---
// function stepBuildNavmesh() {
//     const scriptPath = path.resolve(__dirname, 'build_navmesh.cjs');
//     execSync(`node "${scriptPath}" --input="..." --output="..."`, { stdio: 'inherit' });
// }

// --- Main Execution ---
async function main() {
    console.log('Starting data generation pipeline...');

    // Create base directories if they don't exist
    if (!fs.existsSync(BASE_DATA_DIR)) {
        fs.mkdirSync(BASE_DATA_DIR, { recursive: true });
    }

    await runStep('processOsm', stepProcessOsm);
    await runStep('filterGeojson', stepFilterGeojson);
    await runStep('generateTiles', stepGenerateTiles);
    // runStep('buildNavmesh', stepBuildNavmesh);

    console.log('\nData generation pipeline finished!');
}

main(); 