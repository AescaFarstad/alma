import fs from 'fs';
import path from 'path';
import minimist from 'minimist';

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

    console.log(`Running navmesh build step (placeholder)`);
    console.log(`Input directory: ${inputDir}`);
    console.log(`Output directory: ${outputDir}`);

    const filesToCopy = fs.readdirSync(inputDir).filter(f => f.endsWith('.geojson'));

    for (const file of filesToCopy) {
        fs.copyFileSync(path.join(inputDir, file), path.join(outputDir, file));
        console.log(`  - Copied ${file} (no navmesh generated)`);
    }

    console.log('Navmesh build step completed.');
}

main(); 