import fs from 'fs';
import path from 'path';
import minimist from 'minimist';
import { Point, SweepContext } from 'poly2tri';

type MyPoint = [number, number];
type MyPolygon = MyPoint[];

// Simple bounding box check for a single point
function isPointInBbox(point: MyPoint, bbox: number[]): boolean {
    return point[0] >= bbox[0] && point[0] <= bbox[2] && point[1] >= bbox[1] && point[1] <= bbox[3];
}

function main() {
    const args = minimist(process.argv.slice(2));
    const inputDir = args.input;
    const outputDir = args.output;
    
    // To speed up testing, you can process a smaller area.
    // Set this to `null` to process all data.
    const DEBUG_BBOX: readonly [number, number, number, number] | null = [-2000, -2000, 2000, 2000];

    if (!inputDir || !outputDir) {
        console.error('Usage: ts-node build_navmesh.ts --input <input_dir> --output <output_dir>');
        process.exit(1);
    }

    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }

    console.log(`Running navmesh build step with poly2tri`);
    console.log(`Input directory: ${inputDir}`);
    console.log(`Output directory: ${outputDir}`);
    if (DEBUG_BBOX) {
        console.log(`Processing with BBOX: [${DEBUG_BBOX.join(', ')}]`);
    } else {
        console.log(`Processing all data (no BBOX).`);
    }

    const blobsFilePath = path.join(inputDir, 'blobs.txt');
    if (!fs.existsSync(blobsFilePath)) {
        console.error(`Input file not found: ${blobsFilePath}`);
        process.exit(1);
    }

    const fileContent = fs.readFileSync(blobsFilePath, 'utf-8');
    const lines = fileContent.split('\n').filter(line => line.trim() !== '');
    
    let holePolygons: MyPolygon[] = [];

    // This regex now assumes the coordinate array is valid JSON.
    const lineRegex = /\[[-?\d\.,\s]+\]$/;

    for (const line of lines) {
        const match = line.match(lineRegex);
        if (!match) continue;

        const coords: number[] = JSON.parse(match[0]);
        const polygon: MyPolygon = [];
        for (let i = 0; i < coords.length; i += 2) {
            const p: MyPoint = [coords[i], coords[i + 1]];
            polygon.push(p);
        }

        holePolygons.push(polygon);
    }
    
    if (DEBUG_BBOX) {
        holePolygons = holePolygons.filter(poly => 
            poly.every(p => isPointInBbox(p, DEBUG_BBOX as any))
        );
    }

    console.log(`Found ${holePolygons.length} blobs within the bounding box to use as holes.`);

    // Determine the bounding box for processing
    let processingBbox: readonly [number, number, number, number];
    if (DEBUG_BBOX) {
        processingBbox = DEBUG_BBOX;
    } else {
        // If not debugging, calculate bbox from all hole polygons
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const poly of holePolygons) {
            for (const p of poly) {
                if (p[0] < minX) minX = p[0];
                if (p[1] < minY) minY = p[1];
                if (p[0] > maxX) maxX = p[0];
                if (p[1] > maxY) maxY = p[1];
            }
        }
        processingBbox = [minX, minY, maxX, maxY];
    }

    // Debug: Check actual bbox of filtered holes
    if (holePolygons.length > 0) {
        let actualMinX = Infinity, actualMinY = Infinity, actualMaxX = -Infinity, actualMaxY = -Infinity;
        for (const poly of holePolygons) {
            for (const p of poly) {
                if (p[0] < actualMinX) actualMinX = p[0];
                if (p[1] < actualMinY) actualMinY = p[1];
                if (p[0] > actualMaxX) actualMaxX = p[0];
                if (p[1] > actualMaxY) actualMaxY = p[1];
            }
        }
        console.log(`Actual bbox of filtered holes: [${actualMinX}, ${actualMinY}, ${actualMaxX}, ${actualMaxY}]`);
    }

    // Define the outer boundary, inflated.
    const inflation = 100;
    const minX = processingBbox[0] - inflation;
    const minY = processingBbox[1] - inflation;
    const maxX = processingBbox[2] + inflation;
    const maxY = processingBbox[3] + inflation;

    console.log(`Outer boundary: [${minX}, ${minY}, ${maxX}, ${maxY}]`);

    // The outer boundary polygon must have a clockwise winding order for poly2tri.
    const outerBoundary: MyPoint[] = [
        [minX, minY],
        [maxX, minY],
        [maxX, maxY],
        [minX, maxY]
    ];
    
    // Create the sweep context with the outer boundary.
    const sweepContext = new SweepContext(outerBoundary.map(p => new Point(p[0], p[1])));
    
    // Add each blob as a hole in the sweep context.
    holePolygons.forEach(poly => {
        const holePoints = poly.map(p => new Point(p[0], p[1]));
        sweepContext.addHole(holePoints);
    });

    console.log(`Triangulating the area...`);
    // Perform the Constrained Delaunay Triangulation.
    sweepContext.triangulate();
    
    // Get the results.
    const triangles = sweepContext.getTriangles();
    console.log(`Generated ${triangles.length} triangles in the navmesh.`);

    // --- Format the output ---

    // poly2tri may introduce new Steiner points. We need to collect all unique points
    // from the triangulation result to build our final vertex list.
    const pointMap = new Map<string, number>();
    const finalPoints: MyPoint[] = [];

    const getPointIndex = (p: { x: number; y: number }): number => {
        const key = `${p.x};${p.y}`;
        let idx = pointMap.get(key);
        if (idx === undefined) {
            idx = finalPoints.length;
            finalPoints.push([p.x, p.y]);
            pointMap.set(key, idx);
        }
        return idx;
    };
    
    const finalTriangles: number[] = [];
    for (const t of triangles) {
        // Triangle indices store vertex indices (logical indices), not coordinate indices.
        // To get coordinates of vertex `vertex_idx`: x = points[vertex_idx * 2], y = points[vertex_idx * 2 + 1]
        const p1_idx = getPointIndex(t.getPoint(0));
        const p2_idx = getPointIndex(t.getPoint(1));
        const p3_idx = getPointIndex(t.getPoint(2));
        finalTriangles.push(p1_idx, p2_idx, p3_idx);
    }
    
    console.log(`Final vertex count: ${finalPoints.length}`);

    // --- Calculate stats ---
    const numVertices = finalPoints.length;
    const numTriangles = triangles.length;

    let resultBboxMinX = Infinity, resultBboxMinY = Infinity, resultBboxMaxX = -Infinity, resultBboxMaxY = -Infinity;
    if (finalPoints.length > 0) {
        for (const p of finalPoints) {
            if (p[0] < resultBboxMinX) resultBboxMinX = p[0];
            if (p[1] < resultBboxMinY) resultBboxMinY = p[1];
            if (p[0] > resultBboxMaxX) resultBboxMaxX = p[0];
            if (p[1] > resultBboxMaxY) resultBboxMaxY = p[1];
        }
    } else {
        resultBboxMinX = 0;
        resultBboxMinY = 0;
        resultBboxMaxX = 0;
        resultBboxMaxY = 0;
    }
    const resultingBbox = [resultBboxMinX, resultBboxMinY, resultBboxMaxX, resultBboxMaxY];

    let maxTriangleBboxArea = 0;
    let largestTriangleBbox: number[] = [0, 0, 0, 0];
    let totalTriangleArea = 0;

    for (const t of triangles) {
        const p0 = t.getPoint(0);
        const p1 = t.getPoint(1);
        const p2 = t.getPoint(2);

        // Bbox for this triangle
        const minX = Math.min(p0.x, p1.x, p2.x);
        const minY = Math.min(p0.y, p1.y, p2.y);
        const maxX = Math.max(p0.x, p1.x, p2.x);
        const maxY = Math.max(p0.y, p1.y, p2.y);
        const area = (maxX - minX) * (maxY - minY);
        if (area > maxTriangleBboxArea) {
            maxTriangleBboxArea = area;
            largestTriangleBbox = [minX, minY, maxX, maxY];
        }

        // Area of this triangle
        const triArea = Math.abs(p0.x * (p1.y - p2.y) + p1.x * (p2.y - p0.y) + p2.x * (p0.y - p1.y)) / 2;
        totalTriangleArea += triArea;
    }

    const avgTriangleArea = numTriangles > 0 ? totalTriangleArea / numTriangles : 0;
    
    // Prepare output file content
    const stats = {
        vertices: numVertices,
        triangles: numTriangles,
        bbox: resultingBbox,
        largestTriangleBbox: largestTriangleBbox,
        avgTriangleArea: avgTriangleArea
    };
    const statsStr = `stats:${JSON.stringify(stats)}`;
    const pointsStr = `points:[${finalPoints.flat().join(',')}]`;
    const trianglesStr = `triangles:[${finalTriangles.join(',')}]`;

    const outputPath = path.join(outputDir, 'navmesh.txt');
    fs.writeFileSync(outputPath, `${statsStr}\n${pointsStr}\n${trianglesStr}`);

    console.log(`Navmesh successfully generated at: ${outputPath}`);
}

main(); 