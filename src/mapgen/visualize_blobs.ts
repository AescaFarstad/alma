import type { Point2 } from '../logic/core/math';
import type { BuildingWithPolygon } from './simplification/unite';
import { createCanvas, CanvasRenderingContext2D } from 'canvas';
import fs from 'fs';

type SplitLine = Point2[];

const IMAGE_SIZE = 4096;

const availableColors: string[] = [
  '#FF0000', '#9ACD32', '#3399FF', '#FFFF00', '#FF00FF', '#00FFFF',
  '#FFA500', '#A52A2A', '#808080', '#50C878', '#4B0082', '#FFC0CB'
];

export function visualizeBlobs(
  buildings: BuildingWithPolygon[],
  partitions: BuildingWithPolygon[][],
  splitLines: SplitLine[],
  rayDirections: Point2[],
  outputPath: string
): void {
  const canvas = createCanvas(IMAGE_SIZE, IMAGE_SIZE);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = 'white';
  ctx.fillRect(0, 0, IMAGE_SIZE, IMAGE_SIZE);

  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;

  const allPoints = buildings.flatMap(b => b.polygon);
  splitLines.forEach(line => allPoints.push(...line));

  for (const p of allPoints) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }

  const dataWidth = maxX - minX;
  const dataHeight = maxY - minY;
  const dataCenterX = minX + dataWidth / 2;
  const dataCenterY = minY + dataHeight / 2;

  const scale = Math.min(IMAGE_SIZE / dataWidth, IMAGE_SIZE / dataHeight) * 0.95;

  function transform(p: Point2): Point2 {
    return {
      x: (p.x - dataCenterX) * scale + IMAGE_SIZE / 2,
      y: -(p.y - dataCenterY) * scale + IMAGE_SIZE / 2
    };
  }

  const partitionColors = partitions.map((_, i) => availableColors[i % availableColors.length]);
  const buildingToPartition = new Map<string, number>();
  partitions.forEach((partition, i) => {
    partition.forEach(building => {
      buildingToPartition.set(building.id, i);
    });
  });

  for (const building of buildings) {
    const partitionIndex = buildingToPartition.get(building.id);
    if (partitionIndex === undefined) continue;

    const color = partitionColors[partitionIndex];
    ctx.fillStyle = color;
    ctx.beginPath();
    const transformedPolygon = building.polygon.map(transform);
    if (transformedPolygon.length > 0) {
      ctx.moveTo(transformedPolygon[0].x, transformedPolygon[0].y);
      for (let i = 1; i < transformedPolygon.length; i++) {
        ctx.lineTo(transformedPolygon[i].x, transformedPolygon[i].y);
      }
      ctx.closePath();
      ctx.fill();
    }
  }

  ctx.strokeStyle = 'black';
  ctx.lineWidth = 2;
  for (const line of splitLines) {
    ctx.beginPath();
    const transformedLine = line.map(transform);
    if (transformedLine.length > 0) {
      ctx.moveTo(transformedLine[0].x, transformedLine[0].y);
      for (let i = 1; i < transformedLine.length; i++) {
        ctx.lineTo(transformedLine[i].x, transformedLine[i].y);
      }
      ctx.stroke();
    }
  }

  ctx.strokeStyle = 'orange';
  ctx.lineWidth = 1;
  splitLines.forEach((line, i) => {
    const rayDir = rayDirections[i];
    for (let j = 0; j < line.length - 1; j++) {
      const p1 = line[j];
      const p2 = line[j + 1];
      const midPoint = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };

      const length = Math.max(dataWidth, dataHeight) * 2;
      const p_start = { x: midPoint.x - rayDir.x * length, y: midPoint.y - rayDir.y * length };
      const p_end = { x: midPoint.x + rayDir.x * length, y: midPoint.y + rayDir.y * length };

      const start = transform(p_start);
      const end = transform(p_end);

      ctx.beginPath();
      ctx.moveTo(start.x, start.y);
      ctx.lineTo(end.x, end.y);
      ctx.stroke();
    }
  });

  const buffer = canvas.toBuffer('image/png');
  fs.writeFileSync(outputPath, buffer);
  console.log(`Blob visualization saved to ${outputPath}`);
} 