import { NavmeshData } from './navmesh_struct';
import { createCanvas, CanvasRenderingContext2D } from 'canvas';
import fs from 'fs';

const IMAGE_SIZE = 2000;
const CANVAS_CENTER = IMAGE_SIZE / 2;

const availableColors: string[] = [
  '#9ACD32', '#3399FF', '#FFFF00', '#FF00FF', '#00FFFF',
  '#FFA500', '#A52A2A', '#808080', '#50C878', '#4B0082', '#FFC0CB', '#FF0000'
];

function assignPolygonColors(navmeshData: NavmeshData): string[] {
  const polygonColors = new Array<string>(navmeshData.stats.polygons).fill('');
  const adjacency = buildAdjacencyList(navmeshData);

  for (let i = 0; i < navmeshData.stats.walkable_polygons; i++) {
    const usedColors = new Set<string>();
    for (const neighbor of adjacency[i]) {
      if (polygonColors[neighbor]) {
        usedColors.add(polygonColors[neighbor]);
      }
    }
    
    let colorAssigned = false;
    for (const color of availableColors) {
      if (!usedColors.has(color)) {
        polygonColors[i] = color;
        colorAssigned = true;
        break;
      }
    }
    
    if (!colorAssigned) {
      polygonColors[i] = availableColors[i % availableColors.length];
    }
  }

  return polygonColors;
}

function buildAdjacencyList(navmeshData: NavmeshData): number[][] {
  const adjacency: number[][] = Array.from({ length: navmeshData.stats.polygons }, () => []);
  let polyVertsIndex = 0;
  for (let i = 0; i < navmeshData.stats.polygons; i++) {
    const nextPolyVertsIndex = navmeshData.polygons[i + 1];
    for (let j = polyVertsIndex; j < nextPolyVertsIndex; j++) {
      const neighbor = navmeshData.poly_neighbors[j];
      if (neighbor !== -1) {
        adjacency[i].push(neighbor);
        adjacency[neighbor].push(i);
      }
    }
    polyVertsIndex = nextPolyVertsIndex;
  }

  for (let i = 0; i < adjacency.length; i++) {
    adjacency[i] = [...new Set(adjacency[i])];
  }
  return adjacency;
}

function drawPolygon(ctx: CanvasRenderingContext2D, navmeshData: NavmeshData, polyIndex: number, color: string) {
  const startIndex = navmeshData.polygons[polyIndex];
  const endIndex = navmeshData.polygons[polyIndex + 1];

  if (startIndex === endIndex) return;

  ctx.beginPath();
  const firstVertexIndex = navmeshData.poly_verts[startIndex];
  ctx.moveTo(navmeshData.vertices[firstVertexIndex * 2] + CANVAS_CENTER, -navmeshData.vertices[firstVertexIndex * 2 + 1] + CANVAS_CENTER);

  for (let i = startIndex + 1; i < endIndex; i++) {
    const vertexIndex = navmeshData.poly_verts[i];
    ctx.lineTo(navmeshData.vertices[vertexIndex * 2] + CANVAS_CENTER, -navmeshData.vertices[vertexIndex * 2 + 1] + CANVAS_CENTER);
  }
  
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}

function drawTriangle(ctx: CanvasRenderingContext2D, navmeshData: NavmeshData, triIndex: number) {
  const v1Index = navmeshData.triangles[triIndex * 3];
  const v2Index = navmeshData.triangles[triIndex * 3 + 1];
  const v3Index = navmeshData.triangles[triIndex * 3 + 2];
  
  ctx.beginPath();
  ctx.moveTo(navmeshData.vertices[v1Index * 2] + CANVAS_CENTER, -navmeshData.vertices[v1Index * 2 + 1] + CANVAS_CENTER);
  ctx.lineTo(navmeshData.vertices[v2Index * 2] + CANVAS_CENTER, -navmeshData.vertices[v2Index * 2 + 1] + CANVAS_CENTER);
  ctx.lineTo(navmeshData.vertices[v3Index * 2] + CANVAS_CENTER, -navmeshData.vertices[v3Index * 2 + 1] + CANVAS_CENTER);
  ctx.closePath();
  ctx.stroke();
}

export function drawNavmesh(navmeshData: NavmeshData, outputPath: string): { path: string, sizeBytes: number } {
  const canvas = createCanvas(IMAGE_SIZE, IMAGE_SIZE);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = 'white';
  ctx.fillRect(0, 0, IMAGE_SIZE, IMAGE_SIZE);

  const polygonColors = assignPolygonColors(navmeshData);

  for (let i = 0; i < navmeshData.stats.walkable_polygons; i++) {
    drawPolygon(ctx, navmeshData, i, polygonColors[i]);
  }

  for (let i = navmeshData.stats.walkable_polygons; i < navmeshData.stats.polygons; i++) {
    drawPolygon(ctx, navmeshData, i, 'black');
  }

  ctx.strokeStyle = 'black';
  ctx.lineWidth = 1;
  for (let i = 0; i < navmeshData.stats.triangles; i++) {
    drawTriangle(ctx, navmeshData, i);
  }

  const buffer = canvas.toBuffer('image/png');
  fs.writeFileSync(outputPath, buffer);
  const stats = fs.statSync(outputPath);
  console.log(`Navmesh visualization saved to ${outputPath}`);
  
  return { path: outputPath, sizeBytes: stats.size };
} 