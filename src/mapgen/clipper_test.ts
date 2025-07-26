import * as clipperLib from 'js-angusj-clipper';

// Helper functions matching unite.ts exactly
function isPolygonClosed(polygon: Array<{x: number, y: number}>): boolean {
    if (polygon.length < 2) return false;
    const first = polygon[0];
    const last = polygon[polygon.length - 1];
    return Math.abs(first.x - last.x) < 1e-9 && Math.abs(first.y - last.y) < 1e-9;
}

function ensurePolygonClosed(polygon: Array<{x: number, y: number}>): Array<{x: number, y: number}> {
    if (polygon.length === 0) return polygon;
    if (isPolygonClosed(polygon)) return polygon;
    return [...polygon, { ...polygon[0] }];
}

function toClipperPath(polygon: Array<{x: number, y: number}>, scale: number): clipperLib.Path {
    return polygon.map(p => ({ x: Math.round(p.x * scale), y: Math.round(p.y * scale) }));
}

function fromClipperPath(path: clipperLib.Path, scale: number): Array<{x: number, y: number}> {
    return path.map(p => ({ x: p.x / scale, y: p.y / scale }));
}

// Complete offset + union workflow test
async function testCompleteUniteWorkflow(clipper: any) {
    // Original polygon from browser
    const originalPolygon = [
        {"x": -4373.53, "y": -1266.18},
        {"x": -4371.87, "y": -1286.46},
        {"x": -4347.09, "y": -1284.42},
        {"x": -4342.65, "y": -1338.63},
        {"x": -4325.46, "y": -1337.11},
        {"x": -4330.879885802269, "y": -1271.0113999795913},
        {"x": -4345.83, "y": -1272.24},
        {"x": -4346.5, "y": -1263.96}
    ];

    const inflate = 3.6;
    const scale = 1e7;

    console.log('=== TESTING COMPLETE UNITE WORKFLOW ===');
    console.log('Environment: Node.js with FIXED clipper params');
    console.log('Original polygon points:', originalPolygon.length);

    // Step 1: Offset (inflate) - same as unite.ts
    console.log('\n--- STEP 1: OFFSET (INFLATE) ---');
    const closedPolygon = ensurePolygonClosed(originalPolygon);
    const scaledPolygon = toClipperPath(closedPolygon, scale);

    const offsetResult = clipper.offsetToPaths({
        delta: inflate * scale,
        offsetInputs: [{
            data: scaledPolygon,
            joinType: clipperLib.JoinType.Square,
            endType: clipperLib.EndType.ClosedPolygon
        }]
    });

    console.log('Offset result paths:', offsetResult ? offsetResult.length : 0);
    if (!offsetResult || offsetResult.length === 0) {
        console.log('OFFSET FAILED - no result');
        return;
    }

    const inflatedPolygons = offsetResult.map((path: clipperLib.Path) => fromClipperPath(path, scale));
    console.log('Inflated polygons count:', inflatedPolygons.length);

    // Step 2: Union - with the FIX applied
    console.log('\n--- STEP 2: UNION (WITH FIX) ---');
    const scaledInflatedPolygons = inflatedPolygons.map((p: Array<{x: number, y: number}>) => toClipperPath(p, scale));

    const unionParams = {
        clipType: clipperLib.ClipType.Union,
        subjectInputs: scaledInflatedPolygons.map((p: clipperLib.Path) => ({ data: p, closed: true })), // <<<< THE FIX
        subjectFillType: clipperLib.PolyFillType.NonZero,
    };

    console.log('Union input polygons:', scaledInflatedPolygons.length);

    try {
        const unionResult = clipper.clipToPaths(unionParams);
        console.log('UNION SUCCESS!');
        console.log('Union result polygons:', unionResult ? unionResult.length : 0);
        
        if (unionResult && unionResult.length > 0) {
            const unitedPolygons = unionResult.map((path: clipperLib.Path) => fromClipperPath(path, scale));
            console.log('Union result - first polygon points:', unitedPolygons[0].length);

            // Step 3: Deflate - same as unite.ts
            console.log('\n--- STEP 3: DEFLATE ---');
            const deflateParams = {
                delta: -inflate * scale,
                offsetInputs: unitedPolygons.map((poly: Array<{x: number, y: number}>) => ({
                    data: toClipperPath(poly, scale),
                    joinType: clipperLib.JoinType.Square,
                    endType: clipperLib.EndType.ClosedPolygon
                }))
            };

            const deflateResult = clipper.offsetToPaths(deflateParams);
            console.log('Deflate result paths:', deflateResult ? deflateResult.length : 0);

            if (deflateResult && deflateResult.length > 0) {
                const finalPolygons = deflateResult.map((path: clipperLib.Path) => fromClipperPath(path, scale));
                console.log('COMPLETE WORKFLOW SUCCESS!');
                console.log('Final result polygons:', finalPolygons.length);
                console.log('Final result - first polygon points:', finalPolygons[0].length);
                return finalPolygons;
            }
        }
    } catch (error: any) {
        console.log('UNION FAILED:', error.message);
        return null;
    }
}

// Main test function
async function main() {
    try {
        const clipper = await clipperLib.loadNativeClipperLibInstanceAsync(
            clipperLib.NativeClipperLibRequestedFormat.WasmWithAsmJsFallback
        );

        console.log('Successfully loaded Clipper in Node.js!');
        console.log('Clipper constructor name:', clipper.constructor?.name);

        await testCompleteUniteWorkflow(clipper);

    } catch (error) {
        console.error('Complete workflow test failed:', error);
        throw error;
    }
}

export default main;

// If running directly (not imported), execute the test
if (import.meta.url === `file://${process.argv[1]}`) {
    main().catch(err => {
        console.error(err);
        process.exit(1);
    });
} 