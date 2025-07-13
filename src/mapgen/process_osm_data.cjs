#!/usr/bin/env node

/**
 * OSM Data Processing Pipeline for Almaty (Node.js version)
 * Configurable processing with fixed output names
 */

const { exec, execSync } = require('child_process');
const fs = require('fs').promises;
const path = require('path');
const { promisify } = require('util');
const execAsync = promisify(exec);

// ============================================================================
// CONFIGURATION - Modify these settings to control processing
// ============================================================================

// Which area to extract (choose one: 'city_center', 'city_main', or 'city_full')
const AREA_TO_EXTRACT = 'city_center';

// Processing options
const SIMPLIFY_GEOMETRY = true;           // Simplify geometries for smaller file size
const COORDINATE_PRECISION = 6;           // Decimal places for coordinates (5 = ~1m precision)
const MIN_BUILDING_AREA = 10;            // Minimum building area in m² (filters out tiny buildings)
const MERGE_YES_BUILDINGS = false;        // Merge all "yes" buildings into residential category
const REMOVE_YES_BUILDINGS = false;      // Remove all generic "yes" buildings entirely

// Features to extract (comment out lines to exclude features)
const FEATURES_TO_EXTRACT = {
    // Built environment
    buildings: 'w/building',
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

    // // Everything else not captured above
    // other: 'nwr/*'  // This will catch anything missed
};

// Output format
const PRETTY_PRINT_JSON = true;          // Create a human-readable, pretty-printed .geojson file in addition to the minified one.

// Fixed output filenames (in public/data/)
// This should match the keys in FEATURES_TO_EXTRACT
const OUTPUT_FILENAMES = {
    buildings: 'buildings.geojson',
    roads: 'roads.geojson',
    parks: 'parks.geojson',
    railways: 'railways.geojson',
    barriers: 'barriers.geojson',
    landuse: 'landuse.geojson',
    leisure: 'leisure.geojson',
    natural: 'natural.geojson',
    water: 'water.geojson',
    amenities: 'amenities.geojson',
    shops: 'shops.geojson',
    tourism: 'tourism.geojson',
    historic: 'historic.geojson',
    power: 'power.geojson',
    telecom: 'telecom.geojson',
    transport: 'transport.geojson',
    parking: 'parking.geojson',
    boundaries: 'boundaries.geojson',
    places: 'places.geojson',
    sport: 'sport.geojson',
    craft: 'craft.geojson',
    office: 'office.geojson',
    emergency: 'emergency.geojson',
    healthcare: 'healthcare.geojson',
    other: 'other.geojson',
    metadata: 'metadata.json'
};

// ============================================================================
// END CONFIGURATION
// ============================================================================

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

// Tags to always remove
const REMOVE_TAGS = [
    'addr:*', 'name:*', 'contact:*', 'phone', 'website', 'email',
    'opening_hours', 'operator', 'brand', 'source*', 'fixme', 'note',
    'description', 'wikidata', 'wikipedia', 'ref:*', 'old_name'
];

// Internal configuration
const CONFIG = {
    sourceDir: './data',
    outputDir: './public/data',
    tempDir: './temp',
    selectedArea: AREA_DEFINITIONS[AREA_TO_EXTRACT]
};

class OSMProcessor {
    async init() {
        console.log('=== OSM DATA PROCESSOR ===');
        console.log(`Area: ${AREA_TO_EXTRACT} - ${CONFIG.selectedArea.description}`);
        console.log(`Features: ${Object.keys(FEATURES_TO_EXTRACT).join(', ')}`);
        console.log(`Simplify: ${SIMPLIFY_GEOMETRY}, Precision: ${COORDINATE_PRECISION} decimals`);
        console.log('========================\n');
        
        // Create directories
        await this.ensureDir(CONFIG.outputDir);
        await this.ensureDir(CONFIG.tempDir);
        
        // Find source file
        this.sourceFile = await this.findSourceFile();
        console.log(`Source file: ${this.sourceFile}`);
    }
    
    async ensureDir(dir) {
        try {
            await fs.mkdir(dir, { recursive: true });
        } catch (err) {
            // Directory already exists
        }
    }
    
    async findSourceFile() {
        const files = await fs.readdir(CONFIG.sourceDir);
        const pbfFile = files.find(f => f.endsWith('.pbf'));
        if (!pbfFile) {
            throw new Error('No .pbf file found in data directory');
        }
        return path.join(CONFIG.sourceDir, pbfFile);
    }
    
    async runCommand(cmd, description) {
        console.log(`\n${description}...`);
        if (process.env.DEBUG) {
            console.log(`Command: ${cmd}`);
        }
        
        try {
            const { stdout, stderr } = await execAsync(cmd);
            if (stderr && !stderr.includes('Warning')) {
                console.error(`Warning: ${stderr}`);
            }
            return stdout;
        } catch (error) {
            throw new Error(`Command failed: ${error.message}`);
        }
    }
    
    async extractArea() {
        console.log('\n=== EXTRACTING AREA ===');
        
        const bounds = CONFIG.selectedArea.bounds;
        const bbox = `${bounds[0]},${bounds[1]},${bounds[2]},${bounds[3]}`;
        this.extractedFile = path.join(CONFIG.tempDir, 'area_extract.pbf');
        
        const cmd = `osmium extract -b ${bbox} "${this.sourceFile}" -o "${this.extractedFile}" --overwrite`;
        await this.runCommand(cmd, 'Extracting area');
        
        const stats = await fs.stat(this.extractedFile);
        console.log(`  Extracted size: ${(stats.size / 1024 / 1024).toFixed(1)} MB`);
    }
    
    async filterData() {
        console.log('\n=== FILTERING DATA ===');
        
        // Step 1: Filter features we want to keep
        const featuresFile = path.join(CONFIG.tempDir, 'features_filtered.pbf');
        
        let cmd = `osmium tags-filter "${this.extractedFile}"`;
        
        // Add features to keep
        for (const features of Object.values(FEATURES_TO_EXTRACT)) {
            cmd += ` ${features}`;
        }
        
        cmd += ` -o "${featuresFile}" --overwrite`;
        
        await this.runCommand(cmd, 'Filtering features to keep');
        
        // Step 2: Create a separate config file for tag filtering
        // Since osmium doesn't support removing tags directly in tags-filter,
        // we'll handle this in the GeoJSON conversion step
        this.filteredFile = featuresFile;
        
        const originalStats = await fs.stat(this.extractedFile);
        const filteredStats = await fs.stat(this.filteredFile);
        const reduction = (1 - filteredStats.size / originalStats.size) * 100;
        console.log(`  Size reduced by ${reduction.toFixed(0)}%`);
    }
    
    async convertToGeoJSON() {
        console.log('\n=== CONVERTING TO GEOJSON ===');
        
        // First validate that all feature types have corresponding output filenames
        for (const featureType of Object.keys(FEATURES_TO_EXTRACT)) {
            if (!OUTPUT_FILENAMES[featureType]) {
                throw new Error(`Missing output filename for feature type '${featureType}' in OUTPUT_FILENAMES`);
            }
        }
        
        for (const [featureType, filter] of Object.entries(FEATURES_TO_EXTRACT)) {
            const tempFile = path.join(CONFIG.tempDir, `${featureType}_temp.pbf`);
            const outputFilename = OUTPUT_FILENAMES[featureType];
            const outputFile = path.join(CONFIG.outputDir, outputFilename);
            
            console.log(`\nProcessing ${featureType}:`);
            console.log(`  Filter: ${filter}`);
            console.log(`  Output: ${outputFilename}`);
            
            // Extract just this feature type
            const extractCmd = `osmium tags-filter "${this.filteredFile}" ${filter} -o "${tempFile}" --overwrite`;
            await this.runCommand(extractCmd, `Extracting ${featureType}`);
            
            // Convert to GeoJSON
            const convertCmd = `osmium export "${tempFile}" -o "${outputFile}" --overwrite -f geojson`;
            
            try {
                await this.runCommand(convertCmd, `Converting ${featureType} to GeoJSON`);
                
                const stats = await fs.stat(outputFile);
                console.log(`  ${featureType}: ${(stats.size / 1024).toFixed(0)} KB`);
            } catch (err) {
                console.log(`  ${featureType}: No features found`);
                // Create empty GeoJSON
                const emptyGeoJSON = {
                    type: 'FeatureCollection',
                    features: []
                };
                await fs.writeFile(outputFile, JSON.stringify(emptyGeoJSON), 'utf8');
            }
        }
    }
    
    async optimizeGeoJSON() {
        if (!SIMPLIFY_GEOMETRY && !REMOVE_YES_BUILDINGS && !MERGE_YES_BUILDINGS && MIN_BUILDING_AREA === 0) {
            console.log('\n=== SKIPPING OPTIMIZATION (all options disabled) ===');
            return;
        }
        
        console.log('\n=== OPTIMIZING GEOJSON ===');
        
        for (const [featureType, filename] of Object.entries(OUTPUT_FILENAMES)) {
            if (featureType === 'metadata') continue;
            
            const filePath = path.join(CONFIG.outputDir, filename);
            console.log(`\nOptimizing ${filename}...`);
            
            try {
                if (PRETTY_PRINT_JSON) {
                    const unfilteredPath = filePath.replace('.geojson', '_unfiltered.geojson');
                    await fs.copyFile(filePath, unfilteredPath);
                    console.log(`  Saved unfiltered file: ${path.basename(unfilteredPath)}`);
                }

                const content = await fs.readFile(filePath, 'utf8');
                const geojson = JSON.parse(content);
                
                if (!geojson.features || geojson.features.length === 0) {
                    console.log('  No features to optimize');
                    continue;
                }
                
                let featuresRemoved = 0;
                let originalFeatureCount = geojson.features.length;
                
                // Process features
                geojson.features = geojson.features
                    .map(feature => {
                        // Handle building-specific options
                        if (featureType === 'buildings' && feature.properties) {
                            if (REMOVE_YES_BUILDINGS && feature.properties.building === 'yes') {
                                featuresRemoved++;
                                return null;
                            }
                            if (MERGE_YES_BUILDINGS && feature.properties.building === 'yes') {
                                feature.properties.building = 'residential';
                            }
                        }
                        
                        // Reduce coordinate precision
                        if (feature.geometry && feature.geometry.coordinates) {
                            feature.geometry.coordinates = this.reducePrecision(
                                feature.geometry.coordinates, 
                                COORDINATE_PRECISION
                            );
                        }
                        
                        // Remove unwanted tags from properties
                        const props = feature.properties || {};
                        const cleanedProps = {};
                        
                        // First, copy all properties that don't match remove patterns
                        for (const [key, value] of Object.entries(props)) {
                            let shouldRemove = false;
                            
                            // Check against remove patterns
                            for (const removePattern of REMOVE_TAGS) {
                                if (removePattern.endsWith('*')) {
                                    // Wildcard pattern
                                    const prefix = removePattern.slice(0, -1);
                                    if (key.startsWith(prefix)) {
                                        shouldRemove = true;
                                        break;
                                    }
                                } else if (removePattern.includes(':*')) {
                                    // Namespace pattern like 'addr:*'
                                    const prefix = removePattern.slice(0, -1);
                                    if (key.startsWith(prefix)) {
                                        shouldRemove = true;
                                        break;
                                    }
                                } else {
                                    // Exact match
                                    if (key === removePattern) {
                                        shouldRemove = true;
                                        break;
                                    }
                                }
                            }
                            
                            if (!shouldRemove && value !== null && value !== undefined) {
                                cleanedProps[key] = value;
                            }
                        }
                        
                        // Now keep only essential properties based on feature type
                        const essentialProps = {};
                        
                        // Properties to keep based on feature type
                        const keepProps = {
                            buildings: ['building', 'height', 'building:levels'],
                            roads: ['highway', 'name', 'lanes'],
                            parks: ['leisure', 'name', 'access', 'sport'],
                            railways: ['railway', 'name', 'electrified'],
                            barriers: ['barrier'],
                            landuse: ['landuse', 'name'],
                            leisure: ['leisure', 'name', 'sport'],
                            natural: ['natural', 'name'],
                            water: ['water', 'waterway', 'natural', 'name'],
                            amenities: ['amenity', 'name'],
                            shops: ['shop', 'name'],
                            tourism: ['tourism', 'name'],
                            historic: ['historic', 'name'],
                            power: ['power'],
                            telecom: ['telecom', 'communication', 'tower:type'],
                            transport: ['public_transport', 'name', 'network'],
                            parking: ['parking', 'amenity', 'capacity'],
                            boundaries: ['boundary', 'admin_level', 'name'],
                            places: ['place', 'name', 'population'],
                            sport: ['sport', 'name'],
                            craft: ['craft', 'name'],
                            office: ['office', 'name'],
                            emergency: ['emergency', 'name'],
                            healthcare: ['healthcare', 'name'],
                            other: ['name'] // For 'other', just keep the name
                        };
                        
                        // For 'other' category, keep the primary tag
                        if (featureType === 'other') {
                            // Find the primary tag (first non-generic one)
                            for (const [key, value] of Object.entries(cleanedProps)) {
                                if (!['created_by', 'source', 'name'].includes(key)) {
                                    essentialProps[key] = value;
                                    break; // Keep just the primary tag
                                }
                            }
                            if (cleanedProps.name) {
                                essentialProps.name = cleanedProps.name;
                            }
                        } else {
                            // For specific feature types, use the keep list
                            const propsToKeep = keepProps[featureType] || ['name'];
                            
                            for (const prop of propsToKeep) {
                                if (cleanedProps[prop] !== undefined) {
                                    essentialProps[prop] = cleanedProps[prop];
                                }
                            }
                        }
                        
                        feature.properties = essentialProps;
                        
                        // Remove features that have no properties after filtering
                        if (Object.keys(essentialProps).length === 0) {
                            featuresRemoved++;
                            return null;
                        }
                        
                        return feature;
                    })
                    .filter(f => f !== null); // Remove filtered features
                
                // Always create the minified file
                const minifiedOutputPath = filePath.replace('.geojson', '.min.geojson');
                const minifiedJsonString = JSON.stringify(geojson);
                await fs.writeFile(minifiedOutputPath, minifiedJsonString, 'utf8');

                const originalSize = (await fs.stat(filePath)).size;
                const minifiedSize = (await fs.stat(minifiedOutputPath)).size;
                const reduction = (1 - minifiedSize / originalSize) * 100;
                
                console.log(`  Features: ${geojson.features.length} (removed ${featuresRemoved})`);
                console.log(`  Minified Size: ${(minifiedSize / 1024).toFixed(0)} KB (${reduction.toFixed(0)}% reduction)`);

                if (PRETTY_PRINT_JSON) {
                    // Create a pretty-printed version
                    const prettyJsonString = JSON.stringify(geojson, null, 2);
                    await fs.writeFile(filePath, prettyJsonString, 'utf8');
                    console.log(`  Created pretty-printed optimized file: ${filename}`);
                } else {
                    // Delete the original (non-minified) file
                    await fs.unlink(filePath);
                }
                
                if (PRETTY_PRINT_JSON) {
                    analysis.filenames.push(baseFilename);
                    analysis.filenames.push(baseFilename.replace('.geojson', '_unfiltered.geojson'));
                }
                
                // Sample size for analysis (max 100 features)
                const sampleSize = Math.min(100, geojson.features.length);
                const sampledFeatures = geojson.features.slice(0, sampleSize);
                
                sampledFeatures.forEach(feature => {
                    // Geometry types
                    if (feature.geometry) {
                        analysis.geometry_types.add(feature.geometry.type);
                    }
                    
                    // Properties
                    if (feature.properties) {
                        for (const [key, value] of Object.entries(feature.properties)) {
                            if (!analysis.properties_found[key]) {
                                analysis.properties_found[key] = {
                                    count: 0,
                                    types: new Set(),
                                    values: new Set()
                                };
                            }
                            
                            analysis.properties_found[key].count++;
                            analysis.properties_found[key].types.add(typeof value);
                            
                            // Collect unique values (limit to 20)
                            if (analysis.properties_found[key].values.size < 20) {
                                analysis.properties_found[key].values.add(value);
                            }
                            
                            // Store first example
                            if (!analysis.property_examples[key] && value !== null) {
                                analysis.property_examples[key] = value;
                            }
                        }
                    }
                });
                
                // Convert sets to arrays and create summary
                analysis.geometry_types = Array.from(analysis.geometry_types);
                
                const propertySummary = {};
                for (const [key, data] of Object.entries(analysis.properties_found)) {
                    const values = Array.from(data.values);
                    propertySummary[key] = {
                        frequency: `${Math.round(data.count / sampleSize * 100)}%`,
                        types: Array.from(data.types),
                        example: analysis.property_examples[key],
                        unique_values: values.length,
                        sample_values: values.slice(0, 5)
                    };
                }
                
                documentation.feature_types[featureType] = {
                    files: analysis.filenames.sort(),
                    total_features: geojson.features.length,
                    geometry_types: analysis.geometry_types,
                    properties: propertySummary
                };
                
                if (PRETTY_PRINT_JSON) {
                     metadata.files[baseFilename] = {
                        size_kb: Math.round((await fs.stat(path.join(CONFIG.outputDir, baseFilename))).size / 1024),
                        features: geojson.features ? geojson.features.length : 0,
                        feature_type: featureType
                    };

                    const unfilteredFilename = baseFilename.replace('.geojson', '_unfiltered.geojson');
                    const unfilteredFilepath = path.join(CONFIG.outputDir, unfilteredFilename);
                    const unfilteredStats = await fs.stat(unfilteredFilepath);
                    const unfilteredContent = await fs.readFile(unfilteredFilepath, 'utf8');
                    const unfilteredGeojson = JSON.parse(unfilteredContent);

                    metadata.files[unfilteredFilename] = {
                        size_kb: Math.round(unfilteredStats.size / 1024),
                        features: unfilteredGeojson.features ? unfilteredGeojson.features.length : 0,
                        feature_type: featureType,
                        unfiltered: true
                    };
                }
            } catch (err) {
                console.error(`  Error: ${err.message}`);
            }
        }
    }
    
    reducePrecision(coords, decimals) {
        if (typeof coords[0] === 'number') {
            return coords.map(c => parseFloat(c.toFixed(decimals)));
        } else {
            return coords.map(c => this.reducePrecision(c, decimals));
        }
    }
    
    async createDataDocumentation() {
        console.log('\n=== CREATING DATA DOCUMENTATION ===');
        
        const documentation = {
            generated: new Date().toISOString(),
            area: AREA_TO_EXTRACT,
            description: CONFIG.selectedArea.description,
            bounds: CONFIG.selectedArea.bounds,
            feature_types: {}
        };
        
        // Analyze each generated file
        for (const [featureType, baseFilename] of Object.entries(OUTPUT_FILENAMES)) {
            if (featureType === 'metadata') continue;
            
            // Minified version is always created, so we'll analyze that one.
            const minifiedFilename = baseFilename.replace('.geojson', '.min.geojson');
            const filePath = path.join(CONFIG.outputDir, minifiedFilename);
            
            try {
                const content = await fs.readFile(filePath, 'utf8');
                const geojson = JSON.parse(content);
                
                if (!geojson.features || geojson.features.length === 0) {
                    continue;
                }
                
                // Analyze the data structure
                const analysis = {
                    filenames: [minifiedFilename],
                    feature_count: geojson.features.length,
                    geometry_types: new Set(),
                    properties_found: {},
                    property_examples: {},
                    common_values: {}
                };

                if (PRETTY_PRINT_JSON) {
                    analysis.filenames.push(baseFilename);
                }
                
                // Sample size for analysis (max 100 features)
                const sampleSize = Math.min(100, geojson.features.length);
                const sampledFeatures = geojson.features.slice(0, sampleSize);
                
                sampledFeatures.forEach(feature => {
                    // Geometry types
                    if (feature.geometry) {
                        analysis.geometry_types.add(feature.geometry.type);
                    }
                    
                    // Properties
                    if (feature.properties) {
                        for (const [key, value] of Object.entries(feature.properties)) {
                            if (!analysis.properties_found[key]) {
                                analysis.properties_found[key] = {
                                    count: 0,
                                    types: new Set(),
                                    values: new Set()
                                };
                            }
                            
                            analysis.properties_found[key].count++;
                            analysis.properties_found[key].types.add(typeof value);
                            
                            // Collect unique values (limit to 20)
                            if (analysis.properties_found[key].values.size < 20) {
                                analysis.properties_found[key].values.add(value);
                            }
                            
                            // Store first example
                            if (!analysis.property_examples[key] && value !== null) {
                                analysis.property_examples[key] = value;
                            }
                        }
                    }
                });
                
                // Convert sets to arrays and create summary
                analysis.geometry_types = Array.from(analysis.geometry_types);
                
                const propertySummary = {};
                for (const [key, data] of Object.entries(analysis.properties_found)) {
                    const values = Array.from(data.values);
                    propertySummary[key] = {
                        frequency: `${Math.round(data.count / sampleSize * 100)}%`,
                        types: Array.from(data.types),
                        example: analysis.property_examples[key],
                        unique_values: values.length,
                        sample_values: values.slice(0, 5)
                    };
                }
                
                documentation.feature_types[featureType] = {
                    files: analysis.filenames.sort(),
                    total_features: geojson.features.length,
                    geometry_types: analysis.geometry_types,
                    properties: propertySummary
                };
                
            } catch (err) {
                // File doesn't exist or error reading
                console.log(`  Skipping ${featureType}: ${err.message}`);
            }
        }
        
        // Write documentation files
        
        // 1. JSON format (machine readable)
        await fs.writeFile(
            path.join(CONFIG.outputDir, 'data_structure.json'),
            JSON.stringify(documentation, null, 2),
            'utf8'
        );
        
        // 2. Human-readable markdown format
        let markdown = `# Almaty OSM Data Structure Documentation\n\n`;
        markdown += `Generated: ${documentation.generated}\n`;
        markdown += `Area: ${documentation.area} - ${documentation.description}\n`;
        markdown += `Bounds: [${documentation.bounds.join(', ')}]\n\n`;
        
        for (const [featureType, data] of Object.entries(documentation.feature_types)) {
            markdown += `## ${featureType.charAt(0).toUpperCase() + featureType.slice(1)}\n\n`;
            markdown += `- **Files**: ${data.files.join(', ')}\n`;
            markdown += `- **Features**: ${data.total_features.toLocaleString()}\n`;
            markdown += `- **Geometry**: ${data.geometry_types.join(', ')}\n\n`;
            markdown += `### Properties\n\n`;
            
            for (const [prop, info] of Object.entries(data.properties)) {
                markdown += `#### \`${prop}\`\n`;
                markdown += `- **Frequency**: ${info.frequency}\n`;
                markdown += `- **Type**: ${info.types.join(', ')}\n`;
                markdown += `- **Example**: \`${JSON.stringify(info.example)}\`\n`;
                markdown += `- **Unique values**: ${info.unique_values}\n`;
                if (info.sample_values.length > 0) {
                    markdown += `- **Samples**: ${info.sample_values.map(v => `\`${v}\``).join(', ')}\n`;
                }
                markdown += `\n`;
            }
            markdown += `---\n\n`;
        }
        
        await fs.writeFile(
            path.join(CONFIG.outputDir, 'data_structure.md'),
            markdown,
            'utf8'
        );
        
        // 3. TypeScript-style definitions
        let typescript = `// Almaty OSM Data Type Definitions\n`;
        typescript += `// Generated: ${documentation.generated}\n\n`;
        
        for (const [featureType, data] of Object.entries(documentation.feature_types)) {
            const typeName = featureType.charAt(0).toUpperCase() + featureType.slice(1);
            
            typescript += `// ${data.files.join(', ')} - ${data.total_features} features\n`;
            typescript += `interface ${typeName}Properties {\n`;
            
            for (const [prop, info] of Object.entries(data.properties)) {
                const isOptional = info.frequency !== '100%' ? '?' : '';
                let type = 'any';
                
                if (info.types.length === 1) {
                    type = info.types[0];
                    if (type === 'object') type = 'any';
                }
                
                // For known enums, list the values
                if (info.unique_values <= 10 && info.types[0] === 'string') {
                    const values = info.sample_values.map(v => `"${v}"`).join(' | ');
                    if (values) type = values;
                }
                
                typescript += `  ${prop}${isOptional}: ${type};\n`;
            }
            
            typescript += `}\n\n`;
            typescript += `interface ${typeName}Feature {\n`;
            typescript += `  type: "Feature";\n`;
            typescript += `  geometry: {\n`;
            typescript += `    type: ${data.geometry_types.map(t => `"${t}"`).join(' | ')};\n`;
            typescript += `    coordinates: any;\n`;
            typescript += `  };\n`;
            typescript += `  properties: ${typeName}Properties;\n`;
            typescript += `}\n\n`;
        }
        
        await fs.writeFile(
            path.join(CONFIG.outputDir, 'data_types.ts'),
            typescript,
            'utf8'
        );
        
        console.log('Created documentation files:');
        console.log('  - data_structure.json (detailed analysis)');
        console.log('  - data_structure.md (human-readable)');
        console.log('  - data_types.ts (TypeScript-style definitions)');
    }
    
    async createMetadata() {
        console.log('\n=== CREATING METADATA ===');
        
        const metadata = {
            area: {
                name: AREA_TO_EXTRACT,
                bounds: CONFIG.selectedArea.bounds,
                description: CONFIG.selectedArea.description
            },
            settings: {
                simplifyGeometry: SIMPLIFY_GEOMETRY,
                coordinatePrecision: COORDINATE_PRECISION,
                minBuildingArea: MIN_BUILDING_AREA,
                mergeYesBuildings: MERGE_YES_BUILDINGS,
                removeYesBuildings: REMOVE_YES_BUILDINGS
            },
            generated: new Date().toISOString(),
            files: {}
        };
        
        // Get info about generated files
        for (const [featureType, baseFilename] of Object.entries(OUTPUT_FILENAMES)) {
            if (featureType === 'metadata') continue;
            
            // Always check for the minified version
            const filename = baseFilename.replace('.geojson', '.min.geojson');
            const filePath = path.join(CONFIG.outputDir, filename);
            
            try {
                const stats = await fs.stat(filePath);
                const content = await fs.readFile(filePath, 'utf8');
                const geojson = JSON.parse(content);
                
                metadata.files[filename] = {
                    size_kb: Math.round(stats.size / 1024),
                    features: geojson.features ? geojson.features.length : 0,
                    feature_type: featureType
                };

                if (PRETTY_PRINT_JSON) {
                     metadata.files[baseFilename] = {
                        size_kb: Math.round((await fs.stat(path.join(CONFIG.outputDir, baseFilename))).size / 1024),
                        features: geojson.features ? geojson.features.length : 0,
                        feature_type: featureType
                    };

                    const unfilteredFilename = baseFilename.replace('.geojson', '_unfiltered.geojson');
                    const unfilteredFilepath = path.join(CONFIG.outputDir, unfilteredFilename);
                    const unfilteredStats = await fs.stat(unfilteredFilepath);
                    const unfilteredContent = await fs.readFile(unfilteredFilepath, 'utf8');
                    const unfilteredGeojson = JSON.parse(unfilteredContent);

                    metadata.files[unfilteredFilename] = {
                        size_kb: Math.round(unfilteredStats.size / 1024),
                        features: unfilteredGeojson.features ? unfilteredGeojson.features.length : 0,
                        feature_type: featureType,
                        unfiltered: true
                    };
                }
            } catch (err) {
                // File doesn't exist
            }
        }
        
        await fs.writeFile(
            path.join(CONFIG.outputDir, OUTPUT_FILENAMES.metadata),
            JSON.stringify(metadata, null, 2),
            'utf8'
        );
        
        console.log('Created metadata.json');
    }
    
    async cleanup() {
        console.log('\n=== CLEANUP ===');
        
        try {
            const files = await fs.readdir(CONFIG.tempDir);
            for (const file of files) {
                await fs.unlink(path.join(CONFIG.tempDir, file));
            }
            console.log('Cleaned up temporary files');
        } catch (err) {
            console.log('No temporary files to clean');
        }
    }
    
    async run() {
        try {
            await this.init();
            await this.extractArea();
            await this.filterData();
            await this.convertToGeoJSON();
            await this.optimizeGeoJSON();
            await this.createDataDocumentation();
            await this.createMetadata();
            await this.cleanup();
            
            console.log('\n=== PROCESSING COMPLETE ===');
            console.log(`\nOutput files in ${CONFIG.outputDir}:`);
            
            const files = await fs.readdir(CONFIG.outputDir);
            for (const file of files.sort()) {
                if (file.endsWith('.geojson') || file.endsWith('.min.geojson') || file === 'metadata.json') {
                    const stats = await fs.stat(path.join(CONFIG.outputDir, file));
                    console.log(`  ${file}: ${Math.round(stats.size / 1024)} KB`);
                }
            }
            
        } catch (error) {
            console.error('\nError during processing:', error.message);
            process.exit(1);
        }
    }
}

// Run if called directly
if (require.main === module) {
    const processor = new OSMProcessor();
    processor.run();
}

module.exports = OSMProcessor;