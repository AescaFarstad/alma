const fs = require('fs');
const path = require('path');
const { argv } = require('process');

function parseArgs() {
    const args = argv.slice(2);
    const inputArg = args.find(arg => arg.startsWith('--input='));
    const outputArg = args.find(arg => arg.startsWith('--output='));

    if (!inputArg || !outputArg) {
        console.error('Usage: node generate-structure.cjs --input=<directory> --output=<file>');
        process.exit(1);
    }

    return {
        inputDir: inputArg.split('=')[1],
        outputFile: outputArg.split('=')[1],
    };
}

function generateStructure({ inputDir, outputFile }) {
    const MAX_ENUM_VALUES = 12;
    const MAX_COMMENT_VALUES = 60;
    const COMMENT_VALUES_PER_ROW = 7;

    const fileSuffix = '.geojson';
    
    let output = `// Generated from ${path.basename(inputDir)}\n\n`;

    try {
        const files = fs.readdirSync(inputDir);
        const geojsonFiles = files.filter(file => file.endsWith(fileSuffix));

        if (geojsonFiles.length === 0) {
            console.log(`No '*${fileSuffix}' files found in ${inputDir}.`);
            return;
        }

        const allStructNames = [];

        for (const fileName of geojsonFiles) {
            const filePath = path.join(inputDir, fileName);
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
            let hasIdField = false;
            let doesNotHaveIdField = false;

            for (const feature of features) {
                if (feature.id !== undefined) {
                    hasIdField = true;
                }
                else {
                    doesNotHaveIdField = true;
                }

                if (feature.geometry && feature.geometry.type) {
                    geometryTypes.add(feature.geometry.type);
                }

                if (feature.properties) {
                    for (const key in feature.properties) {
                        if (!propertiesMap.has(key)) {
                            propertiesMap.set(key, {
                                types: new Set(),
                                valueCounts: new Map(),
                                count: 0,
                            });
                        }
                        const propInfo = propertiesMap.get(key);
                        const value = feature.properties[key];
                        const type = typeof value;

                        propInfo.types.add(type);
                        propInfo.count++;

                        const count = propInfo.valueCounts.get(value) || 0;
                        propInfo.valueCounts.set(value, count + 1);
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
            
            if (hasIdField && !doesNotHaveIdField) {
                output += '    id: string;\n';
            }
            else if (hasIdField && doesNotHaveIdField) {
                output += '    id?: string;\n';
            }
            
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
                let preComment = '';
                
                const hasOnlyStrings = types.length === 1 && types[0] === 'string';
                const hasOnlyNumbers = types.length === 1 && types[0] === 'number';

                if (hasOnlyStrings) {
                    const uniqueValuesCount = propInfo.valueCounts.size;
                    if (uniqueValuesCount > MAX_COMMENT_VALUES) {
                        typeString = 'string';
                        comment = ` // ${uniqueValuesCount} string values`;
                    } else if (uniqueValuesCount > MAX_ENUM_VALUES) {
                        typeString = 'string';
                        const sortedValues = Array.from(propInfo.valueCounts.entries()).sort(([, a], [, b]) => b - a);
                        
                        let commentBlock = '/**\n';
                        let row = [];
                        for (const [value, count] of sortedValues) {
                            row.push(`${String(value).replace(/\*/g, '\\*')}(${count})`);
                            if (row.length >= COMMENT_VALUES_PER_ROW) {
                                commentBlock += ` * ${row.join('\t')}\n`;
                                row = [];
                            }
                        }
                        if (row.length > 0) {
                            commentBlock += ` * ${row.join('\t')}\n`;
                        }
                        commentBlock += ' */';

                        preComment = '        ' + commentBlock.replace(/\n/g, '\n         ') + '\n';
                    } else if (uniqueValuesCount > 0) {
                        typeString = Array.from(propInfo.valueCounts.keys()).map(v => `"${String(v).replace(/"/g, '\\"')}"`).join(' | ');
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

                if (preComment) {
                    output += preComment;
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
        fs.writeFileSync(outputFile, output);
        console.log(`Successfully generated structure file at: ${outputFile}`);
    } catch (error) {
        console.error(`Error writing to file: ${error.message}`);
    }
}

const args = parseArgs();
generateStructure(args);