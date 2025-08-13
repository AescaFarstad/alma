import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';
import { Packer, ImageToPack } from './Packer';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(SCRIPT_DIR, '../../');
const INPUT_DIR = path.resolve(PROJECT_ROOT, 'data', 'img');
const OUTPUT_DIR = path.resolve(PROJECT_ROOT, 'public', 'img');

async function getImagesInFolder(folderPath: string, folderName: string): Promise<ImageToPack[]> {
    const imagePaths = await fs.readdir(folderPath);
    const imagePromises = imagePaths
        .filter(imagePath => /\.(png|jpg|jpeg|webp|gif|avif)$/i.test(imagePath))
        .map(async (imagePath) => {
        const fullPath = path.join(folderPath, imagePath);
        const buffer = await fs.readFile(fullPath);
        const metadata = await sharp(buffer).metadata();
        const id = `${path.parse(imagePath).name}`;
        
        return {
            id,
            width: metadata.width!,
            height: metadata.height!,
            buffer,
        };
    });
    return Promise.all(imagePromises);
}

async function createAtlas(images: ImageToPack[], atlasName: string) {
    const packer = new Packer();
    const { packedRects, atlasWidth, atlasHeight } = packer.pack(images);

    if (packedRects.length === 0) {
        console.log(`No images found for atlas: ${atlasName}. Skipping.`);
        return;
    }

    const atlasImage = sharp({
        create: {
            width: atlasWidth,
            height: atlasHeight,
            channels: 4,
            background: { r: 0, g: 0, b: 0, alpha: 0 },
        },
    });

    const compositeOperations = packedRects.map(rect => ({
        input: rect.buffer,
        left: rect.x,
        top: rect.y,
    }));

    await atlasImage.composite(compositeOperations).toFile(path.join(OUTPUT_DIR, `${atlasName}.webp`));

    const atlasMap: { [key: string]: { x: number; y: number; w: number; h: number } } = {};
    for (const rect of packedRects) {
        atlasMap[rect.id] = {
            x: rect.x,
            y: rect.y,
            w: rect.width,
            h: rect.height,
        };
    }

    const sortedKeys = Object.keys(atlasMap).sort((a,b)=> a.localeCompare(b));
    const atlasJsonSorted: { [key: string]: { x: number; y: number; w: number; h: number } } = {};
    for (const k of sortedKeys) atlasJsonSorted[k] = atlasMap[k];

    await fs.writeFile(path.join(OUTPUT_DIR, `${atlasName}.json`), JSON.stringify(atlasJsonSorted, null, 2));
    console.log(`Successfully created atlas: ${atlasName}`);
}

async function main() {
    try {
        await fs.mkdir(OUTPUT_DIR, { recursive: true });
        const atlasFolders = await fs.readdir(INPUT_DIR);

        for (const folderName of atlasFolders) {
            const folderPath = path.join(INPUT_DIR, folderName);
            const stats = await fs.stat(folderPath);

            if (stats.isDirectory()) {
                const images = await getImagesInFolder(folderPath, folderName);
                await createAtlas(images, folderName);
            }
        }
    } catch (error) {
        console.error("Error creating atlases:", error);
        process.exit(1);
    }
}

main(); 