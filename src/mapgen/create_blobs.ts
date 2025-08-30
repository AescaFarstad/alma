import type { Point2 } from '../logic/core/math';
import { subtract, normalize_, dot, lineSegmentIntersectionTest, length } from '../logic/core/math';
import { BuildingWithPolygon, UnitedGroup, uniteGeometries } from './simplification/unite';
import { getPointsFromBuildingFeature, formatCoordsRounded } from './simplification/geometryUtils';
import { pullAway } from './simplification/pullAway';
import { cornerize } from './simplification/cornerize';
import { unround } from './simplification/unrounding';
import { flatten } from './simplification/flattening';
import { BuildingFeature } from './simplification/geometryUtils';
import fs from 'fs';
import path from 'path';
import { visualizeBlobs } from './visualize_blobs';

type SplitLine = Point2[];

function calculatePolygonArea(points: Point2[]): number {
  if (!points || points.length < 3) return 0;
  
  let area = 0;
  for (let i = 0; i < points.length - 1; i++) {
    area += points[i].x * points[i + 1].y - points[i + 1].x * points[i].y;
  }
  if (points.length > 0 && (points[0].x !== points[points.length - 1].x || points[0].y !== points[points.length - 1].y)) {
    area += points[points.length - 1].x * points[0].y - points[0].x * points[points.length - 1].y;
  }
  return Math.abs(area / 2);
}

function chooseRayDirection(line: SplitLine): Point2 {
  const directions = [
    { x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 },
    { x: 0.707, y: 0.707 }, { x: -0.707, y: 0.707 }, { x: 0.707, y: -0.707 }, { x: -0.707, y: -0.707 }
  ];

  for (let i = 0; i < 12; i++) {
    const angle = Math.random() * 2 * Math.PI;
    directions.push({ x: Math.cos(angle), y: Math.sin(angle) });
  }

  let bestDirection = directions[0];
  let minMaxDotProduct = Infinity;

  for (const dir of directions) {
    let maxDotProduct = -Infinity;
    for (let i = 0; i < line.length - 1; i++) {
      const segStart = line[i];
      const segEnd = line[i + 1];
      let segVec = subtract(segEnd, segStart);
      normalize_(segVec);

      let dotProduct = Math.abs(dot(dir, segVec));
      if (i === 0 || i === line.length - 2) {
        dotProduct /= 2;
      }

      if (dotProduct > maxDotProduct) {
        maxDotProduct = dotProduct;
      }
    }
    if (maxDotProduct < minMaxDotProduct) {
      minMaxDotProduct = maxDotProduct;
      bestDirection = dir;
    }
  }

  return bestDirection;
}

function getSideOfLine(point: Point2, line: SplitLine, rayDir: Point2): number {
  let intersections = 0;
  const rayEnd = { x: point.x + rayDir.x * 1e9, y: point.y + rayDir.y * 1e9 }; 

  for (let i = 0; i < line.length - 1; i++) {
    const segStart = line[i];
    const segEnd = line[i + 1];
    if (lineSegmentIntersectionTest(point, rayEnd, segStart, segEnd)) {
      intersections++;
    }
  }
  
  const firstSeg = line[0];
  const firstSegDir = subtract(line[1], firstSeg);
  normalize_(firstSegDir);
  const rayStart = { x: firstSeg.x - firstSegDir.x * 1e9, y: firstSeg.y - firstSegDir.y * 1e9 };
  if (lineSegmentIntersectionTest(point, rayEnd, rayStart, firstSeg)) {
    intersections++;
  }

  const lastSegEnd = line[line.length - 1];
  const lastSegDir = subtract(lastSegEnd, line[line.length - 2]);
  normalize_(lastSegDir);
  const rayEndSeg = { x: lastSegEnd.x + lastSegDir.x * 1e9, y: lastSegEnd.y + lastSegDir.y * 1e9 };
  if (lineSegmentIntersectionTest(point, rayEnd, lastSegEnd, rayEndSeg)) {
    intersections++;
  }

  return intersections % 2;
}

export async function createBlobs(
  correctedBuildings: BuildingFeature[],
  splitLines: SplitLine[],
  outputDir: string,
  mergeInflation: number,
  safeToSkipArea: number
): Promise<void> {
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

  if (splitLines.length > 0) {
    console.log('Partitioning buildings using split lines...');
    const numPartitions = 1 << splitLines.length;
    const partitions: BuildingWithPolygon[][] = Array.from({ length: numPartitions }, () => []);

    const rayDirections = splitLines.map(line => chooseRayDirection(line));

    for (const building of buildingsForUnite) {
      if (building.polygon.length > 0) {
        const point = building.polygon[0];
        let partitionIndex = 0;
        for (let i = 0; i < splitLines.length; i++) {
          const side = getSideOfLine(point, splitLines[i], rayDirections[i]);
          partitionIndex |= side << i;
        }
        partitions[partitionIndex].push(building);
      }
    }
    
    console.log('Partition sizes:', partitions.map(p => p.length));

    visualizeBlobs(
      buildingsForUnite,
      partitions,
      splitLines,
      rayDirections,
      path.join(outputDir, 'blob_partitions.png')
    );

    for (let i = 0; i < partitions.length; i++) {
      const partition = partitions[i];
      if (partition.length > 0) {
        console.log(`Running unite on partition ${i} with ${partition.length} buildings...`);
        const partitionStartedAt = Date.now();
        const partitionBlobs = await uniteGeometries(partition, mergeInflation);
        console.log(`Unite on partition ${i} finished in ${Date.now() - partitionStartedAt}ms, found ${partitionBlobs.length} blobs`);
        unitedBlobs.push(...partitionBlobs);
      }
    }

  } else {
    const uniteStartedAt = Date.now();
    unitedBlobs = await uniteGeometries(buildingsForUnite, mergeInflation);
    console.log(`Unite finished in ${Date.now() - uniteStartedAt}ms, found ${unitedBlobs.length} blobs`);
  }

  console.log(`uniteGeometries finished. Found ${unitedBlobs.length} blobs in ${Date.now() - startedAt}ms`);

  let blobOutput = '';
  let totalBlobVertices = 0;
  let blobsSkippedCount = 0;
  unitedBlobs.forEach((group, index) => {
    let simplified = pullAway(group.geom, 1, 5);
    simplified = cornerize(simplified, allPoints, mergeInflation + 0.1, 0.5);
    simplified = unround(simplified, 10, 0.45);
    simplified = flatten(simplified, 3);
    simplified = unround(simplified, 10, 0.5);
    simplified = flatten(simplified, 5);
    simplified = unround(simplified, 5, 0.55);
    simplified = flatten(simplified, 7);
    simplified = unround(simplified, 5, 0.55);
    
    if (simplified.length < 3 && calculatePolygonArea(simplified) < safeToSkipArea) {
      blobsSkippedCount++;
      return;
    }
    totalBlobVertices += simplified.length;
    
    const blobBuildings = group.buildings.join(',');
    const coordsStr = formatCoordsRounded(simplified, 2);
    blobOutput += `${index};[${blobBuildings}];[${coordsStr}]\n`;
  });
  
  console.log(`Blobs: Skipped ${blobsSkippedCount} blobs with < 3 vertices and area < ${safeToSkipArea}.`);
  console.log(`Blob vertices: ${totalBlobVertices}`);
  
  fs.writeFileSync(path.join(outputDir, 'blobs.txt'), blobOutput);
  console.log('Blobs saved to blobs.txt');
} 