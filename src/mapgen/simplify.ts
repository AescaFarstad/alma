import fs from 'fs';
import path from 'path';
import minimist from 'minimist';
import { flatten } from '../logic/simplification/flattening';
import { unround } from '../logic/simplification/unrounding';
import { uniteGeometries, type BuildingWithPolygon, type UnitedGroup } from '../logic/simplification/unite';
import { getPointsFromBuildingFeature, createPolygonFeature, formatCoordsRounded, type BuildingFeature } from '../logic/simplification/geometryUtils';
import { simplifyWithDilationErosion } from '../logic/simplification/dilationErosion';
import { cornerize } from '../logic/simplification/cornerize';

import type { FeatureCollection } from 'geojson';
import type { Point2 } from '../logic/core/math';
import { pullAway } from '../logic/simplification/pullAway';

const SIMPLIFICATION_INFLATION = 3.6;
const MERGE_INFLATION = 2;
const MIN_AREA = 10;
const SAFE_TO_SKIP_AREA = 20;

const RUN_S6 = true;
const RUN_BLOBS = true;
const RUN_S7 = true;

// Helper function to calculate polygon area
function calculatePolygonArea(points: Point2[]): number {
    if (!points || points.length < 3) return 0;
    
    let area = 0;
    for (let i = 0; i < points.length - 1; i++) {
        area += points[i].x * points[i + 1].y - points[i + 1].x * points[i].y;
    }
    // Close the polygon if not already closed
    if (points.length > 0 && (points[0].x !== points[points.length - 1].x || points[0].y !== points[points.length - 1].y)) {
        area += points[points.length - 1].x * points[0].y - points[0].x * points[points.length - 1].y;
    }
    return Math.abs(area / 2);
}



async function main() {
    const args = minimist(process.argv.slice(2));
    const inputDir = args.input;
    const outputDir = args.output;

    if (!inputDir || !outputDir) {
        console.error('Usage: ts-node simplify.ts --input <input_dir> --output <output_dir>');
        process.exit(1);
    }

    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }

    // 1. Load all buildings from buildings.geojson file only
    const buildingsFile = path.join(inputDir, 'buildings.geojson');
    if (!fs.existsSync(buildingsFile)) {
        throw new Error(`Buildings file not found: ${buildingsFile}`);
    }
    
    const content = fs.readFileSync(buildingsFile, 'utf-8');
    const featureCollection = JSON.parse(content) as FeatureCollection;
    let allFeatures: BuildingFeature[] = featureCollection.features as BuildingFeature[];

    console.log(`Loaded ${allFeatures.length} features.`);

    // 2. Manual Corrections
    console.log('Applying manual corrections...');
    let correctedBuildings: BuildingFeature[] = [];
    
    for (const f of allFeatures) {
        let feature = f;
        
        // Convert LineString to Polygon if it's closed, skip if open
        if (f.geometry.type === 'LineString') {
            const points = getPointsFromBuildingFeature(f);
            if (points) {
                feature = createPolygonFeature(points, f.properties, f.id);
            } else {
                // Skip open LineStrings (not valid building polygons)
                console.log(`Skipping open LineString feature ${f.id}`);
                continue;
            }
        }
        
        // Validate geometry
        if (feature.geometry.type !== 'Polygon') {
            throw new Error(`Invalid geometry type ${feature.geometry.type} for feature ${feature.id}`);
        }
        
        if (!feature.geometry.coordinates || !feature.geometry.coordinates[0] || feature.geometry.coordinates[0].length < 4) {
            throw new Error(`Invalid polygon geometry for feature ${feature.id}: insufficient points`);
        }
        
        // Validate that we can extract points from the feature
        const points = getPointsFromBuildingFeature(feature);
        if (!points || points.length < 3) {
            throw new Error(`Cannot extract valid points from feature ${feature.id}`);
        }
        
        correctedBuildings.push(feature);
    }

    // Remove problematic buildings except for the main one (Ma1036526660)
    const problematicIds = ['Ma27375097540', 'Ma27375097480', 'Ma27375097520', 'Ma27375097500', 'Ma23832971900', 'Ma23832971920', 'Ma23307134820', 'Ma27369249000'];
    const remainingBuildings = correctedBuildings.filter(b => !problematicIds.includes(b.id ?? ''));
    
    const removedCount = correctedBuildings.length - remainingBuildings.length;
    console.log(`Removed ${removedCount} problematic buildings. Main building Ma1036526660 kept.`);
    correctedBuildings = remainingBuildings;
    console.log(`Corrections applied. Total buildings: ${correctedBuildings.length}`);

    // 3. Filter out buildings with area < MIN_AREA
    console.log(`Filtering out buildings with area < ${MIN_AREA}...`);
    const filteredBuildings: BuildingFeature[] = [];
    let smallBuildingsCount = 0;
    
    for (const building of correctedBuildings) {
        const points = getPointsFromBuildingFeature(building);
        if (points) {
            const area = calculatePolygonArea(points);
            if (area >= MIN_AREA) {
                filteredBuildings.push(building);
            } else {
                smallBuildingsCount++;
            }
        }
    }
    
    correctedBuildings = filteredBuildings;
    console.log(`Removed ${smallBuildingsCount} buildings with area < ${MIN_AREA}. Remaining: ${correctedBuildings.length}`);


    // Calculate total vertices before simplification
    let totalVerticesBeforeS6 = 0;
    for (const building of correctedBuildings) {
        const points = getPointsFromBuildingFeature(building);
        if (points) {
            totalVerticesBeforeS6 += points.length;
        }
    }

    // 4. Simplify with S6 logic
    if (RUN_S6) {
        console.log('Simplifying buildings (S6)...');
    
        let s6SkippedCount = 0;
        const simplifiedFeaturesS6: BuildingFeature[] = correctedBuildings.map(building => {
            const points = getPointsFromBuildingFeature(building);
            if (!points) return null;

            let res = unround(points, 5, 0.25);
            res = flatten(res, 1.75);
            res = unround(res, 5, 0.3);
            res = flatten(res, 2);
            
            const simplifiedPoints = res.map(p => ({ x: Math.round(p.x * 100) / 100, y: Math.round(p.y * 100) / 100 }));

            if (simplifiedPoints.length < 3 && calculatePolygonArea(simplifiedPoints) < SAFE_TO_SKIP_AREA) {
                s6SkippedCount++;
                return null;
            }

            return createPolygonFeature(simplifiedPoints, {}, building.id);
        }).filter((f): f is BuildingFeature => !!f);

        // Calculate total vertices after S6 simplification
        let totalVerticesAfterS6 = 0;
        for (const building of simplifiedFeaturesS6) {
            const points = getPointsFromBuildingFeature(building);
            if (points) {
                totalVerticesAfterS6 += points.length;
            }
        }
        console.log(`S6 vertices: before: ${totalVerticesBeforeS6} after: ${totalVerticesAfterS6} gone: ${totalVerticesBeforeS6 - totalVerticesAfterS6}`);
        console.log(`S6: Skipped ${s6SkippedCount} buildings with < 3 vertices and area < ${SAFE_TO_SKIP_AREA}.`);

        const simplifiedS6Collection: FeatureCollection = {
            type: 'FeatureCollection',
            features: simplifiedFeaturesS6
        };
        fs.writeFileSync(path.join(outputDir, 'buildings_simplified.geojson'), JSON.stringify(simplifiedS6Collection));
        console.log('S6 simplification saved to buildings_simplified.geojson');
    }


    // 5. Unite all buildings into blobs
    if (RUN_BLOBS) {
        console.log('Uniting all buildings into blobs...');
        const buildingsForUnite: BuildingWithPolygon[] = correctedBuildings.map(b => {
            let points = getPointsFromBuildingFeature(b);
            if (!points) {
                throw new Error(`Cannot extract points from building ${b.id} for blob generation`);
            }
            
            points = unround(points, 10, 0.45);
            points = flatten(points, 3);

            return {
                id: b.id!,
                polygon: points
            };
        });
        
        let allPoints = buildingsForUnite.flatMap(g => g.polygon);
        
        let unitedBlobs: UnitedGroup[] = [];
        const startedAt = Date.now();
        unitedBlobs = await uniteGeometries(buildingsForUnite, MERGE_INFLATION);
        console.log(`uniteGeometries finished. Found ${unitedBlobs.length} blobs in ${Date.now() - startedAt}ms`);

        let blobOutput = '';
        let totalBlobVertices = 0;
        let blobsSkippedCount = 0;
        unitedBlobs.forEach((group, index) => {
            let simplified = pullAway(group.geom, 1, 5);
            simplified = cornerize(simplified, allPoints, MERGE_INFLATION + 0.1, 0.5);
            simplified = unround(simplified, 10, 0.45);
            simplified = flatten(simplified, 3);
            simplified = unround(simplified, 10, 0.5);
            simplified = flatten(simplified, 5);
            simplified = unround(simplified, 5, 0.55);
            simplified = flatten(simplified, 7);
            simplified = unround(simplified, 5, 0.55);
            
            if (simplified.length < 3 && calculatePolygonArea(simplified) < SAFE_TO_SKIP_AREA) {
                blobsSkippedCount++;
                return;
            }
            totalBlobVertices += simplified.length;
            
            const blobBuildings = group.buildings.join(',');
            const coordsStr = formatCoordsRounded(simplified, 2);
            blobOutput += `${index};[${blobBuildings}];[${coordsStr}]\n`;
        });
        
        console.log(`Blobs: Skipped ${blobsSkippedCount} blobs with < 3 vertices and area < ${SAFE_TO_SKIP_AREA}.`);
        console.log(`Blob vertices: ${totalBlobVertices}`);
        
        fs.writeFileSync(path.join(outputDir, 'blobs.txt'), blobOutput);
        console.log('Blobs saved to blobs.txt');
    }

    // 6. Simplify with S7 logic
    if (RUN_S7) {
        console.log('Simplifying buildings (S7)...');
        
        let s7Output = '';
        let totalVerticesAfterS7 = 0;
        let s7SkippedCount = 0;
        const s7StartedAt = Date.now();
        for (const building of correctedBuildings) {
            const points = getPointsFromBuildingFeature(building);
            if (!points) continue;
            
            let simplified = await simplifyWithDilationErosion(points, SIMPLIFICATION_INFLATION);
            simplified = unround(simplified, 10, 0.45);
            simplified = flatten(simplified, 3);
            simplified = unround(simplified, 10, 0.5);
            simplified = cornerize(simplified, points, SIMPLIFICATION_INFLATION + 0.1, 1);
            simplified = flatten(simplified, 5);
            simplified = unround(simplified, 5, 0.55);

            if (simplified.length < 3 && calculatePolygonArea(simplified) < SAFE_TO_SKIP_AREA) {
                s7SkippedCount++;
                continue;
            }
            totalVerticesAfterS7 += simplified.length;

            const propertiesJson = JSON.stringify(building.properties || {});
            const coordsStr = formatCoordsRounded(simplified, 2);
            s7Output += `${building.id};${propertiesJson}[${coordsStr}]\n`;
        }
        
        console.log(`S7: Skipped ${s7SkippedCount} buildings with < 3 vertices and area < ${SAFE_TO_SKIP_AREA}.`);
        console.log(`S7 vertices: before: ${totalVerticesBeforeS6} after: ${totalVerticesAfterS7} gone: ${totalVerticesBeforeS6 - totalVerticesAfterS7} (${Date.now() - s7StartedAt}ms)`);
        
        fs.writeFileSync(path.join(outputDir, 'buildings_s7.txt'), s7Output);
        console.log('S7 simplification saved to buildings_s7.txt');
    }

    console.log('Simplification step completed.');
}

main(); 