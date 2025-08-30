const fs = require('fs');
const path = require('path');
const { argv } = require('process');

function parseArgs() {
  const args = argv.slice(2);
  const inputArg = args.find(arg => arg.startsWith('--input='));
  const outputArg = args.find(arg => arg.startsWith('--output='));

  if (!inputArg || !outputArg) {
    console.error('Usage: node generate-building-props-structure.cjs --input=<file> --output=<file>');
    process.exit(1);
  }

  return {
    inputFile: inputArg.split('=')[1],
    outputFile: outputArg.split('=')[1],
  };
}

function generateStructure({ inputFile, outputFile }) {
  const MAX_ENUM_VALUES = 12;
  const MAX_COMMENT_VALUES = 60;
  const COMMENT_VALUES_PER_ROW = 7;
  
  let output = `// Generated from ${path.basename(inputFile)}\n\n`;

  try {
    const content = fs.readFileSync(inputFile, 'utf-8');
    const propertiesArray = JSON.parse(content);

    if (!Array.isArray(propertiesArray) || propertiesArray.length === 0) {
      console.log(`No properties found in ${inputFile}.`);
      return;
    }

    const propertiesMap = new Map();
    const totalObjects = propertiesArray.length;

    for (const props of propertiesArray) {
      for (const key in props) {
        if (!propertiesMap.has(key)) {
          propertiesMap.set(key, {
            types: new Set(),
            valueCounts: new Map(),
            count: 0,
          });
        }
        const propInfo = propertiesMap.get(key);
        const value = props[key];
        const type = typeof value;

        propInfo.types.add(type);
        propInfo.count++;

        const count = propInfo.valueCounts.get(value) || 0;
        propInfo.valueCounts.set(value, count + 1);
      }
    }

    const baseName = path.basename(inputFile, '.json');
    const structName = baseName
      .replace(/[-_](.)/g, (_, group1) => group1.toUpperCase())
      .replace(/^(.)/, (_, group1) => group1.toUpperCase()) + 'Properties';

    output += `export type ${structName} = {\n`;

    const sortedKeys = Array.from(propertiesMap.keys()).sort();

    for (const key of sortedKeys) {
      const propInfo = propertiesMap.get(key);
      const optional = propInfo.count < totalObjects ? '?' : '';

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

          preComment = '  ' + commentBlock.replace(/\n/g, '\n   ') + '\n';
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
      output += `  "${key}"${optional}: ${typeString};${comment}\n`;
    }

    output += '};\n';

  } catch (error) {
    console.error(`Error processing file: ${error.message}`);
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