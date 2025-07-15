#!/usr/bin/env node

/**
 * OSM Data Processing Pipeline for Almaty (Node.js version)
 * This script extracts features from an OSM .pbf file and converts them to GeoJSON.
 * It is intended to be called from an orchestrator script.
 */

const { execSync } = require('child_process');
const fs = require('fs').promises;
const path = require('path');

// Area definitions
const AREA_DEFINITIONS = {
    city_center: {
        bounds: [76.88, 43.22, 76.98, 43.27],
        description: 'Downtown Almaty (~25 km²)'
    },
    city_main: {
        bounds: [76.85, 43.20, 77.00, 43.30],
        description: 'Main urban area (~100 km²)'
    },
    city_full: {
        bounds: [76.80, 43.18, 77.05, 43.35],
        description: 'Full city limits (~320 km²)'
    }
};

class OSMProcessor {
    constructor(config) {
        this.config = config;
        this.outputDir = config.outputDir;
        this.tempDir = config.tempDir;
        this.sourceFile = config.sourceFile;
        this.selectedArea = AREA_DEFINITIONS[config.areaToExtract];
        this.featuresToExtract = config.featuresToExtract;
        this.structureOutputFile = config.structureOutputFile;

        this.outputFilenames = Object.keys(this.featuresToExtract).reduce((acc, key) => {
            acc[key] = `${key}.geojson`;
            return acc;
        }, {});
    }

    async init() {
        console.log('=== Initializing OSM Data Processor ===');
        console.log(`Area: ${this.config.areaToExtract} - ${this.selectedArea.description}`);
        console.log(`Features: ${Object.keys(this.featuresToExtract).join(', ')}`);
        
        await this.ensureDir(this.outputDir);
        await this.ensureDir(this.tempDir);
        
        console.log(`Source file: ${this.sourceFile}`);
        console.log(`Outputting to: ${this.outputDir}`);
    }
    
    async ensureDir(dir) {
        try {
            await fs.mkdir(dir, { recursive: true });
        } catch (err) {
            if (err.code !== 'EEXIST') throw err;
        }
    }
    
    runCommand(cmd, description) {
        console.log(`\n> ${description}...`);
        if (process.env.DEBUG) {
            console.log(`  Running command: ${cmd}`);
        }
        execSync(cmd, { stdio: 'inherit' });
    }
    
    async extractArea() {
        const bounds = this.selectedArea.bounds;
        const bbox = `${bounds[0]},${bounds[1]},${bounds[2]},${bounds[3]}`;
        this.extractedFile = path.join(this.tempDir, 'area_extract.pbf');
        
        const cmd = `osmium extract -b ${bbox} "${this.sourceFile}" -o "${this.extractedFile}" --overwrite`;
        this.runCommand(cmd, 'Extracting area from source file');
        
        const stats = await fs.stat(this.extractedFile);
        console.log(`  Extracted area size: ${(stats.size / 1024 / 1024).toFixed(1)} MB`);
    }
    
    async filterData() {
        this.filteredFile = path.join(this.tempDir, 'features_filtered.pbf');
        
        let cmd = `osmium tags-filter "${this.extractedFile}"`;
        for (const features of Object.values(this.featuresToExtract)) {
            cmd += ` ${features}`;
        }
        cmd += ` -o "${this.filteredFile}" --overwrite`;
        
        this.runCommand(cmd, 'Filtering for specified features');
        
        const originalStats = await fs.stat(this.extractedFile);
        const filteredStats = await fs.stat(this.filteredFile);
        const reduction = (1 - filteredStats.size / originalStats.size) * 100;
        console.log(`  Size reduction after filtering: ${reduction.toFixed(0)}%`);
    }
    
    async convertToGeoJSON() {
        console.log('\n--- Converting to GeoJSON ---');
        
        for (const [featureType, filter] of Object.entries(this.featuresToExtract)) {
            const tempFile = path.join(this.tempDir, `${featureType}_temp.pbf`);
            const outputFilename = this.outputFilenames[featureType];
            const outputFile = path.join(this.outputDir, outputFilename);
            
            console.log(`\nProcessing ${featureType}:`);
            console.log(`  Filter: ${filter} -> Output: ${outputFilename}`);
            
            const extractCmd = `osmium tags-filter "${this.filteredFile}" ${filter} -o "${tempFile}" --overwrite`;
            this.runCommand(extractCmd, `Extracting ${featureType}`);
            
            const convertCmd = `osmium export "${tempFile}" -o "${outputFile}" --overwrite -f geojson --add-unique-id=type_id`;
            
            try {
                this.runCommand(convertCmd, `Converting ${featureType} to GeoJSON`);
                const stats = await fs.stat(outputFile);
                console.log(`  Successfully created ${outputFilename} (${(stats.size / 1024).toFixed(0)} KB)`);
            } catch (err) {
                console.warn(`  Warning: Could not generate GeoJSON for ${featureType}. It's likely no features were found.`);
                const emptyGeoJSON = { type: 'FeatureCollection', features: [] };
                await fs.writeFile(outputFile, JSON.stringify(emptyGeoJSON), 'utf8');
            }
        }
        
        console.log('\nGeoJSON conversion complete!');
    }
    
    generateStructure() {
        console.log('\n--- Generating Structure Definitions ---');
        try {
            const scriptPath = path.resolve(__dirname, 'generate-structure.cjs');
            const cmd = `node "${scriptPath}" --input="${this.outputDir}" --output="${this.structureOutputFile}"`;
            this.runCommand(cmd, 'Generating structure types from GeoJSON');
        } catch (error) {
            console.error(`\nError during structure generation: ${error.message}`);
            // Decide if this should be a fatal error
        }
    }

    async cleanup() {
        console.log('\n--- Cleaning up temporary files ---');
        try {
            await fs.rm(this.tempDir, { recursive: true, force: true });
            console.log('  Removed temporary directory.');
        } catch (err) {
            console.error('  Error during cleanup:', err.message);
        }
    }
    
    async run() {
        try {
            await this.init();
            await this.extractArea();
            await this.filterData();
            await this.convertToGeoJSON();
            this.generateStructure();
            await this.cleanup();
            
            console.log('\n=== OSM PROCESSING STEP COMPLETE ===');
            
        } catch (error) {
            console.error('\nError during OSM processing:', error.message);
            process.exit(1);
        }
    }
}

function processOSM(config) {
    const processor = new OSMProcessor(config);
    // This is not an async function from the caller's perspective,
    // but it kicks off an async process.
    return processor.run();
}

module.exports = { processOSM };