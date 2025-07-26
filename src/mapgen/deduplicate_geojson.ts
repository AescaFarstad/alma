/*
    Deduplication and Cleanup Script for GeoJSON Building Features

    This script processes GeoJSON files to identify and resolve duplicate or overlapping building features.
    Its primary purpose is to clean the data before it's used in the main application.

    Core Logic & Requirements:
    1.  Input Assumption: The script assumes that the input GeoJSON files have already been processed
        by `filter_geojson.cjs`, which must enforce a consistent counter-clockwise (CCW) winding order
        for all exterior rings of Polygons and all closed LineStrings.

    2.  Feature Handling: It specifically processes features that have a `building` property and are either
        `Polygon` or closed `LineString` geometries.

    3.  Duplicate Identification (Congruence):
        - To handle features that represent the same shape but have a different starting vertex, the script
          first "canonicalizes" their vertex rings. It finds the vertex with the lowest x (and then y)
          coordinate and rotates the ring to start there.
        - Two features are considered congruent (i.e., duplicates) if all their corresponding vertices
          in their canonical forms are within a 1-meter tolerance of each other.
        - When a duplicate pair consists of a Polygon and a LineString, the Polygon is always kept.

    4.  Suspicious Pair Resolution:
        - A "suspicious pair" is defined as two non-congruent features where the centroids of each one's
          consecutive vertex trios are consistently either inside or outside the other's geometry.
        - These pairs are resolved by calculating the area of each feature and removing the one with the
          smaller area.

    5.  Property Merging:
        - When any feature is removed (either as a duplicate or a resolved suspicious pair), its properties
          are merged into the feature that is kept.
        - This includes properties within the `properties` object and top-level feature properties like `inscribedCenter`.
          A property is only copied if the feature being kept does not already have it.

    6.  Performance: Utilizes an R-tree (`rbush`) for efficient spatial indexing to avoid a brute-force N^2 comparison.

    7.  Logging & Output:
        - Reports its progress every 20%.
        - Logs a comprehensive report for each file, including:
            - The total number of removed entries.
            - The number of times properties were merged.
            - The count of resolved suspicious pairs.
            - The total count of vertices remaining in the final geometry.
            - The total count of vertices forming the outer shells.
            - The resulting output file size in kilobytes.
        - Writes the output GeoJSON with one feature object per line to maintain consistency with the
          preceding step in the data pipeline.
*/

import fs from 'fs-extra';
import path from 'path';
import minimist from 'minimist';
import RBush from 'rbush';
import bbox from '@turf/bbox';
import booleanPointInPolygon from '@turf/boolean-point-in-polygon';
import { point, polygon } from '@turf/helpers';
import { Feature, GeoJSON, Geometry, Position, Point, Polygon } from 'geojson';

interface BoundingBox {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
    index: number;
}

interface BuildingFeature extends Feature {
    properties: {
        building: string;
        [key: string]: any;
    };
    inscribedCenter?: [number, number];
}

interface DeduplicateOptions {
    inputDir: string;
    outputDir: string;
}

function distance(p1: Position, p2: Position): number {
    const dx = p1[0] - p2[0];
    const dy = p1[1] - p2[1];
    return Math.sqrt(dx * dx + dy * dy);
}

function getVertexRing(geometry: Geometry): Position[] | null {
    if (!geometry) return null;
    if (geometry.type === 'Polygon' && geometry.coordinates.length > 0) {
        return geometry.coordinates[0];
    }
    if (geometry.type === 'LineString') {
        const coords = geometry.coordinates;
        if (coords.length > 2 && distance(coords[0], coords[coords.length - 1]) < 1e-9) {
            return coords;
        }
    }
    return null;
}

function canonicalizeRing(ring: Position[]): Position[] {
    // A ring must have at least 3 unique points (4 with the closing point) to define a polygon area.
    // For simpler cases, the original ring is returned as-is.
    if (!ring || ring.length < 4) return ring;

    let minX = ring[0][0];
    let minY = ring[0][1];
    let startIndex = 0;

    // Find the vertex with the lowest x, then lowest y coordinate.
    // We iterate up to ring.length - 1 because the last point is a duplicate of the first.
    for (let i = 1; i < ring.length - 1; i++) {
        const [x, y] = ring[i];
        if (x < minX || (x === minX && y < minY)) {
            minX = x;
            minY = y;
            startIndex = i;
        }
    }

    // If the ring is already starting with the canonical vertex, no change is needed.
    if (startIndex === 0) {
        return ring;
    }

    // Rotate the ring to start with the canonical vertex.
    const numUniquePoints = ring.length - 1;
    const newRing = new Array(ring.length) as Position[];
    for (let i = 0; i < numUniquePoints; i++) {
        newRing[i] = ring[(startIndex + i) % numUniquePoints];
    }
    newRing[numUniquePoints] = newRing[0]; // Close the ring

    return newRing;
}

function areRingsCongruent(ringA: Position[] | null, ringB: Position[] | null, tolerance: number): boolean {
    if (!ringA || !ringB || ringA.length !== ringB.length) return false;
    const len = ringA.length;
    if (len === 0) return true;

    // Canonicalize both rings to make comparison robust to shifted vertex order.
    const canonicalA = canonicalizeRing(ringA);
    const canonicalB = canonicalizeRing(ringB);

    // The filter script now ensures congruent winding order.
    // We only need to check in the forward direction.
    for (let i = 0; i < len; i++) {
        if (distance(canonicalA[i], canonicalB[i]) > tolerance) {
            return false;
        }
    }
    return true;
}

function areFeaturesCongruent(featureA: BuildingFeature, featureB: BuildingFeature, tolerance: number): boolean {
    const ringA = getVertexRing(featureA.geometry);
    const ringB = getVertexRing(featureB.geometry);
    return areRingsCongruent(ringA, ringB, tolerance);
}

function getFeatureArea(feature: BuildingFeature): number {
    const ring = getVertexRing(feature.geometry);
    let area = 0;
    if (!ring || ring.length < 3) return 0;
    for (let i = 0; i < ring.length - 1; i++) {
        area += ring[i][0] * ring[i+1][1] - ring[i+1][0] * ring[i][1];
    }
    return Math.abs(area / 2);
}

function getTriangleCentroids(poly: Polygon): ReturnType<typeof point>[] {
    const centroids: ReturnType<typeof point>[] = [];
    const vertices = poly.coordinates[0];
    if (vertices.length < 3) return [];

    for (let i = 0; i < vertices.length - 2; i++) {
        const v1 = vertices[i];
        const v2 = vertices[i+1];
        const v3 = vertices[i+2];
        const centroid = point([(v1[0] + v2[0] + v3[0]) / 3, (v1[1] + v2[1] + v3[1]) / 3]);
        centroids.push(centroid);
    }
    return centroids;
}

function checkCentroids(
    centroids: ReturnType<typeof point>[], 
    polyToCheckA: Polygon, 
    polyToCheckB: Polygon
): boolean {
    const turfPolyA = polygon(polyToCheckA.coordinates);
    const turfPolyB = polygon(polyToCheckB.coordinates);

    for(const centroid of centroids) {
        const inA = booleanPointInPolygon(centroid, turfPolyA);
        const inB = booleanPointInPolygon(centroid, turfPolyB);
        if (inA !== inB) return false;
    }
    return true;
}

async function deduplicateGeojson({ inputDir, outputDir }: DeduplicateOptions): Promise<void> {
    try {
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }

        const files = fs.readdirSync(inputDir).filter(f => f.endsWith('.geojson'));

        for (const file of files) {
            console.log(`\n--- Processing ${file} ---`);
            const sourcePath = path.join(inputDir, file);
            const destPath = path.join(outputDir, file);

            const geojson = fs.readJsonSync(sourcePath) as GeoJSON & { features: BuildingFeature[] };
            const features = geojson.features.filter(f =>
                f.properties && f.properties.building && f.geometry &&
                (f.geometry.type === 'Polygon' ||
                 (f.geometry.type === 'LineString' && f.geometry.coordinates.length > 2 && distance(f.geometry.coordinates[0], f.geometry.coordinates[f.geometry.coordinates.length - 1]) < 1e-9))
            );

            if (features.length === 0) {
                console.log('No polygon features to process. Copying file as is.');
                fs.copySync(sourcePath, destPath);
                continue;
            }

            const tree = new RBush<BoundingBox>();
            tree.load(features.map((feature, index) => {
                const [minX, minY, maxX, maxY] = bbox(feature);
                return { minX, minY, maxX, maxY, index };
            }));

            const toDelete = new Set<number>();
            let propertiesCopiedCount = 0;
            let resolvedSuspiciousPairsCount = 0;
            let lastReportedProgress = -1;

            console.log(`Starting analysis of ${features.length} features...`);

            for (let i = 0; i < features.length; i++) {
                const progress = Math.floor((i / features.length) * 100);
                if (progress % 20 === 0 && progress > lastReportedProgress) {
                    console.log(`  ... progress: ${progress}%`);
                    lastReportedProgress = progress;
                }

                if (toDelete.has(i)) continue;

                const featureA = features[i];
                const [minX, minY, maxX, maxY] = bbox(featureA);
                const candidates = tree.search({ minX, minY, maxX, maxY });

                for (const candidate of candidates) {
                    const j = candidate.index;
                    if (i >= j) continue;
                    if (toDelete.has(j)) continue;

                    const featureB = features[j];

                    if (areFeaturesCongruent(featureA, featureB, 1)) {
                        let indexToKeep = i;
                        let indexToDelete = j;

                        // Prefer to keep Polygon features
                        if (featureA.geometry.type === 'LineString' && featureB.geometry.type === 'Polygon') {
                            indexToKeep = j;
                            indexToDelete = i;
                        }

                        toDelete.add(indexToDelete);

                        const featureToKeep = features[indexToKeep];
                        const featureToDelete = features[indexToDelete];
                        
                        let propsCopiedThisPair = false;

                        // Merge properties
                        const propsTo = featureToKeep.properties || {};
                        const propsFrom = featureToDelete.properties || {};
                        Object.keys(propsFrom).forEach(key => {
                            if (!propsTo.hasOwnProperty(key)) {
                                propsTo[key] = propsFrom[key];
                                propsCopiedThisPair = true;
                            }
                        });
                        featureToKeep.properties = propsTo;

                        // Merge inscribedCenter
                        if (!featureToKeep.inscribedCenter && featureToDelete.inscribedCenter) {
                            featureToKeep.inscribedCenter = featureToDelete.inscribedCenter;
                            propsCopiedThisPair = true;
                        }

                        if (propsCopiedThisPair) {
                            propertiesCopiedCount++;
                        }
                        
                        if (indexToDelete === i) {
                            break; // Current feature is marked for deletion, move to the next i
                        }

                    } else {
                        // Only process polygon geometries for suspicious pair detection
                        if (featureA.geometry.type === 'Polygon' && featureB.geometry.type === 'Polygon') {
                            const centroidsA = getTriangleCentroids(featureA.geometry);
                            const centroidsB = getTriangleCentroids(featureB.geometry);

                            if (centroidsA.length > 0 && centroidsB.length > 0) {
                                const a_ok = checkCentroids(centroidsA, featureA.geometry, featureB.geometry);
                                const b_ok = checkCentroids(centroidsB, featureA.geometry, featureB.geometry);

                            if (a_ok && b_ok) {
                                // Suspicious pair found, resolve by removing the one with the smaller area.
                                const areaA = getFeatureArea(featureA);
                                const areaB = getFeatureArea(featureB);

                                let indexToKeep = i;
                                let indexToDelete = j;
                                if (areaB > areaA) {
                                    indexToKeep = j;
                                    indexToDelete = i;
                                }

                                toDelete.add(indexToDelete);
                                resolvedSuspiciousPairsCount++;

                                const featureToKeep = features[indexToKeep];
                                const featureToDelete = features[indexToDelete];
                                
                                let propsCopiedThisPair = false;

                                // Merge properties
                                const propsTo = featureToKeep.properties || {};
                                const propsFrom = featureToDelete.properties || {};
                                Object.keys(propsFrom).forEach(key => {
                                    if (!propsTo.hasOwnProperty(key)) {
                                        propsTo[key] = propsFrom[key];
                                        propsCopiedThisPair = true;
                                    }
                                });
                                featureToKeep.properties = propsTo;

                                // Merge inscribedCenter
                                if (!featureToKeep.inscribedCenter && featureToDelete.inscribedCenter) {
                                    featureToKeep.inscribedCenter = featureToDelete.inscribedCenter;
                                    propsCopiedThisPair = true;
                                }

                                if (propsCopiedThisPair) {
                                    propertiesCopiedCount++;
                                }
                                
                                if (indexToDelete === i) {
                                    break;
                                }
                            }
                            }
                        }
                    }
                }
            }
            
            console.log('  ... progress: 100%');
            console.log('\nAnalysis complete. Finalizing results...');
            
            const newFeatures = features.filter((_, i) => !toDelete.has(i));
            
            let totalVertices = 0;
            let outerShellVertices = 0;

            for (const feature of newFeatures) {
                const geometry = feature.geometry;
                if (!geometry) continue;

                if (geometry.type === 'Polygon') {
                    if (geometry.coordinates && geometry.coordinates.length > 0) {
                        outerShellVertices += geometry.coordinates[0].length; // Outer shell
                        geometry.coordinates.forEach(ring => {
                            totalVertices += ring.length; // All vertices
                        });
                    }
                } else if (geometry.type === 'LineString') {
                    const vertexCount = geometry.coordinates.length;
                    outerShellVertices += vertexCount;
                    totalVertices += vertexCount;
                }
            }
            
            const geojsonHeader = { ...geojson } as any;
            delete geojsonHeader.features;
            const featuresJson = newFeatures.map(f => JSON.stringify(f));
            const outputContent = JSON.stringify(geojsonHeader).slice(0, -1) + ',"features":[\n' + featuresJson.join(',\n') + '\n]}';
            fs.writeFileSync(destPath, outputContent);

            const fileStats = fs.statSync(destPath);
            const fileSizeInKB = Math.round(fileStats.size / 1024);

            console.log(`\nWritten processed file to ${destPath}`);
            console.log(`Output file size: ${fileSizeInKB} KB`);
            
            console.log(`\nResults for ${file}:`);
            console.log(`  - Original feature count: ${features.length}`);
            console.log(`  - Removed entries: ${toDelete.size}`);
            console.log(`  - Final feature count: ${newFeatures.length}`);
            console.log(`  - Total remaining vertices: ${totalVertices}`);
            console.log(`  - Total outer shell vertices: ${outerShellVertices}`);
            console.log(`  - Properties copied over: ${propertiesCopiedCount} times.`);
            console.log(`  - Suspicious pairs resolved by area: ${resolvedSuspiciousPairsCount}`);
        }

        console.log('\nGeoJSON deduplication and analysis step completed.');
    } catch (error) {
        console.error('Error during GeoJSON deduplication:', error);
        process.exit(1);
    }
}

// Main execution
const args = minimist(process.argv.slice(2));
const inputDir = args.input;
const outputDir = args.output;

if (!inputDir || !outputDir) {
    console.error('Please provide --input and --output arguments.');
    process.exit(1);
}

deduplicateGeojson({ inputDir, outputDir }); 