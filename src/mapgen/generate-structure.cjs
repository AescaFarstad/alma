const fs = require('fs');
const path = require('path');

function generateStructure() {
    const args = process.argv.slice(2);
    const isMinifiedMode = args.includes('--minified');

    const fileSuffix = isMinifiedMode ? '.min.geojson' : '_unfiltered.geojson';
    const outputFileName = isMinifiedMode ? 'structure_min.ts' : 'structure.ts';
    
    const dataDir = path.resolve(__dirname, '../../public/data');
    const outputFilePath = path.resolve(dataDir, outputFileName);

    let output = '';

    try {
        const files = fs.readdirSync(dataDir);
        const geojsonFiles = files.filter(file => file.endsWith(fileSuffix));

        if (geojsonFiles.length === 0) {
            console.log(`No '*${fileSuffix}' files found.`);
            return;
        }

        const allStructNames = [];

        for (const fileName of geojsonFiles) {
            const filePath = path.join(dataDir, fileName);
            const content = fs.readFileSync(filePath, 'utf-8');
            const geojson = JSON.parse(content);
            const features = geojson.features;

            if (!features || !Array.isArray(features) || features.length === 0) {
                console.log(`No features found in ${fileName}.`);
                continue;
            }

            const geometryTypes = new Set();
            const propertiesMap = new Map();
            const totalFeatures = features.length;

            for (const feature of features) {
                if (feature.geometry && feature.geometry.type) {
                    geometryTypes.add(feature.geometry.type);
                }

                if (feature.properties) {
                    for (const key in feature.properties) {
                        if (!propertiesMap.has(key)) {
                            propertiesMap.set(key, {
                                types: new Set(),
                                values: new Set(),
                                count: 0,
                            });
                        }
                        const propInfo = propertiesMap.get(key);
                        const value = feature.properties[key];
                        const type = typeof value;

                        propInfo.types.add(type);
                        propInfo.count++;

                        if (type === 'string' || type === 'number') {
                            propInfo.values.add(value);
                        }
                    }
                }
            }

            const baseName = fileName.replace(fileSuffix, '');
            const structName = baseName
                .replace(/[-_](.)/g, (_, group1) => group1.toUpperCase())
                .replace(/^(.)/, (_, group1) => group1.toUpperCase()) + 'FeatureStructure';
            
            allStructNames.push(structName);

            output += `export type ${structName} = {\n`;
            output += '    type: "Feature";\n';
            output += '    geometry: {\n';
            const geomTypesString = Array.from(geometryTypes).map(t => `"${t}"`).join(' | ');
            output += `        type: ${geomTypesString || 'string'};\n`;
            output += `        coordinates: any[];\n`;
            output += '    };\n';
            output += '    properties: {\n';

            const sortedKeys = Array.from(propertiesMap.keys()).sort();

            for (const key of sortedKeys) {
                const propInfo = propertiesMap.get(key);
                const optional = propInfo.count < totalFeatures ? '?' : '';

                const types = Array.from(propInfo.types);
                let typeString;
                let comment = '';
                
                const hasOnlyStrings = types.length === 1 && types[0] === 'string';
                const hasOnlyNumbers = types.length === 1 && types[0] === 'number';

                if (hasOnlyStrings) {
                    if (propInfo.values.size > 12) {
                        typeString = 'string';
                        comment = ` // ${propInfo.values.size} string values`;
                    } else if (propInfo.values.size > 0) {
                        typeString = Array.from(propInfo.values).map(v => `"${String(v).replace(/"/g, '\\"')}"`).join(' | ');
                    } else {
                        typeString = 'string';
                    }
                } else if (hasOnlyNumbers) {
                    typeString = 'number';
                } else {
                    typeString = types.map(t => (t === 'object' ? 'any' : t)).join(' | ');
                }
                
                if (!typeString) {
                    typeString = 'any';
                }

                output += `        "${key}"${optional}: ${typeString};${comment}\n`;
            }

            output += '    };\n';
            output += '};\n\n';
        }

        if (allStructNames.length > 0) {
          if (allStructNames.length > 1) {
            output += `export type FeatureStructure = ${allStructNames.join(' | ')};\n`;
          } else {
            output += `export type FeatureStructure = ${allStructNames[0]};\n`;
          }
        }

    } catch (error) {
        console.error(`Error processing files: ${error.message}`);
        return;
    }

    try {
        fs.writeFileSync(outputFilePath, output);
        console.log(`Successfully generated structure file at: ${outputFilePath}`);
    } catch (error) {
        console.error(`Error writing to file: ${error.message}`);
    }
}

generateStructure();