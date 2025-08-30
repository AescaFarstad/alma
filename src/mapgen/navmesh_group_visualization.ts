import { NavmeshData } from './navmesh_struct';
import { createCanvas, CanvasRenderingContext2D } from 'canvas';
import fs from 'fs';

const IMAGE_SIZE = 2000;
const CANVAS_CENTER = IMAGE_SIZE / 2;

const availableColors: string[] = [
  '#9ACD32', '#3399FF', '#FFFF00', '#FF00FF', '#00FFFF',
  '#FFA500', '#A52A2A', '#808080', '#50C878', '#4B0082', '#FFC0CB', '#FF0000'
];

function drawTriangle(ctx: CanvasRenderingContext2D, navmeshData: NavmeshData, triIndex: number, color: string) {
  const v1Index = navmeshData.triangles[triIndex * 3];
  const v2Index = navmeshData.triangles[triIndex * 3 + 1];
  const v3Index = navmeshData.triangles[triIndex * 3 + 2];
  
  ctx.beginPath();
  ctx.moveTo(navmeshData.vertices[v1Index * 2] + CANVAS_CENTER, -navmeshData.vertices[v1Index * 2 + 1] + CANVAS_CENTER);
  ctx.lineTo(navmeshData.vertices[v2Index * 2] + CANVAS_CENTER, -navmeshData.vertices[v2Index * 2 + 1] + CANVAS_CENTER);
  ctx.lineTo(navmeshData.vertices[v3Index * 2] + CANVAS_CENTER, -navmeshData.vertices[v3Index * 2 + 1] + CANVAS_CENTER);
  ctx.closePath();
  
  ctx.fillStyle = color;
  ctx.fill();
  
  ctx.strokeStyle = 'black';
  ctx.lineWidth = 0.5;
  ctx.stroke();
}

export function drawTriangleGroups(navmeshData: NavmeshData, groups: number[][], outputPath: string): void {
  const canvas = createCanvas(IMAGE_SIZE, IMAGE_SIZE);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = 'white';
  ctx.fillRect(0, 0, IMAGE_SIZE, IMAGE_SIZE);

  groups.forEach((group, groupIndex) => {
    const color = availableColors[groupIndex % availableColors.length];
    group.forEach(triIndex => {
      drawTriangle(ctx, navmeshData, triIndex, color);
    });
  });

  const buffer = canvas.toBuffer('image/png');
  fs.writeFileSync(outputPath, buffer);
  console.log(`Triangle group visualization saved to ${outputPath}`);
} 