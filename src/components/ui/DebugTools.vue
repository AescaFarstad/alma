<template>
  <div id="debug-tools">
    <div class="debug-section">
      <input type="text" v-model="coordinates" placeholder="" />
      <button @click="pasteCoordinates">Paste</button>
      <button @click="flyToCoordinates">Fly</button>
      <button @click="findTriangle">Tri</button>
      <button @click="drawPoint">Draw</button>
      <button @click="debugPoint">Debug</button>
    </div>
    <div class="debug-section">
      <input type="text" v-model="triangleIndex" placeholder="Triangle Index" />
      <button @click="pasteTriangleIndex">Paste</button>
      <button @click="flyToTriangle">Fly</button>
      <button @click="logTriangle">Log</button>
      <button @click="() => drawTriangle()">Draw</button>
    </div>
    <div class="debug-section">
      <input type="text" v-model="polygonIndex" placeholder="Polygon Index" />
      <button @click="pastePolygonIndex">Paste</button>
      <button @click="flyToPolygon">Fly</button>
      <button @click="logPolygon">Log</button>
      <button @click="() => drawPolygon()">Draw</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, inject } from 'vue';
import { mapInstance } from '../../map_instance';
import type { GameState } from '../../logic/GameState';
import { SceneState, ACGREEN, ACINDIGO, ACBLUE, ACYELLOW, ACBROWN } from '../../logic/drawing/SceneState';
import { getTriangleFromPoint, getPolygonFromPoint } from '../../logic/navmesh/NavUtils';

const gameState = inject<GameState>('gameState');
const sceneState = inject<SceneState>('sceneState');

const coordinates = ref('');
const triangleIndex = ref('');
const polygonIndex = ref('');

const pasteCoordinates = async () => {
  coordinates.value = await navigator.clipboard.readText();
};

const pasteTriangleIndex = async () => {
  triangleIndex.value = await navigator.clipboard.readText();
};

const pastePolygonIndex = async () => {
  polygonIndex.value = await navigator.clipboard.readText();
};

const parseCoordinatesFromString = (input: string): { x: number, y: number } | null => {
  const trimmedInput = input.trim();
  try {
    const parsed = JSON.parse(trimmedInput);
    if (parsed && typeof parsed.x === 'number' && typeof parsed.y === 'number') {
      return { x: parsed.x, y: parsed.y };
    }
  } catch (e) {
    if (trimmedInput.startsWith('{') && trimmedInput.endsWith('}')) {
      try {
        const jsonString = trimmedInput.replace(/([{,]\s*)(\w+)\s*:/g, '$1"$2":');
        const parsed = JSON.parse(jsonString);
        if (parsed && typeof parsed.x === 'number' && typeof parsed.y === 'number') {
          return { x: parsed.x, y: parsed.y };
        }
      } catch (e2) {
        // Fall through to CSV parsing
      }
    }
  }

  const parts = trimmedInput.split(',').map(s => parseFloat(s.trim()));
  if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
    const [x, y] = parts;
    return { x, y };
  }
  return null;
};

const flyToCoordinates = () => {
  const coords = parseCoordinatesFromString(coordinates.value);
  if (coords && mapInstance.map) {
    const view = mapInstance.map.getView();
    view.setCenter([coords.x, coords.y]);
    view.setZoom(9);
  }
};

const drawPoint = () => {
  if (!sceneState) return;
  const coords = parseCoordinatesFromString(coordinates.value);
  if (coords) {
    sceneState.addDebugPoint(coords, ACINDIGO);
  }
};

const debugPoint = () => {
  if (!gameState?.navmesh || !sceneState) {
    console.error("Navmesh or SceneState not available");
    return;
  }
  const coords = parseCoordinatesFromString(coordinates.value);
  if (!coords) {
    console.error("Invalid coordinates");
    return;
  }
  sceneState.addDebugPoint(coords, ACBROWN);

  // 1. log the triangle that corresponds to this point
  const triIndex = getTriangleFromPoint(gameState.navmesh, coords);
  console.log(`Triangle index at ${coords.x}, ${coords.y}: ${triIndex}`);
  if (triIndex !== -1) {
    triangleIndex.value = triIndex.toString();
  }

  // 2. log the polygon index and specifying if it is walkable
  const polyIndex = getPolygonFromPoint(gameState.navmesh, coords);
  if (polyIndex === -1) {
    console.log("Point is not within any polygon.");
    return;
  }

  const navmesh = gameState.navmesh;
  const isPolyWalkable = (pIndex: number): boolean => {
    if (!gameState?.navmesh) return false;
    const navmesh = gameState.navmesh;
    const pTriStart = navmesh.poly_tris[pIndex];
    const pTriEnd = navmesh.poly_tris[pIndex + 1];
    for (let i = pTriStart; i < pTriEnd; i++) {
      if (i >= navmesh.walkable_triangle_count) {
        return false;
      }
    }
    return true;
  }
  
  const polyTriStart = navmesh.poly_tris[polyIndex];
  const polyTriEnd = navmesh.poly_tris[polyIndex + 1];
  
  const polyTriangleIndexes = [];
  for (let i = polyTriStart; i < polyTriEnd; i++) {
    polyTriangleIndexes.push(i);
  }
  console.log(`Polygon index: ${polyIndex}, Walkable: ${isPolyWalkable(polyIndex)}`);

  // 3. log all triangle indexes this poly contains
  console.log(`Polygon ${polyIndex} contains triangles:`, polyTriangleIndexes);

  // 4. drawing the polygon in transparent blue and all neighbour polygons in transparent yellow
  drawPolygon(polyIndex, ACBLUE);
  
  const polyVertStart = navmesh.polygons[polyIndex];
  const polyVertEnd = navmesh.polygons[polyIndex + 1];
  const neighborPolys = new Set<number>();
  for (let i = polyVertStart; i < polyVertEnd; i++) {
    const neighborIndex = navmesh.poly_neighbors[i];
    if (neighborIndex !== -1 && !neighborPolys.has(neighborIndex)) {
      neighborPolys.add(neighborIndex);
      console.log(`Neighbor polygon index: ${neighborIndex}, Walkable: ${isPolyWalkable(neighborIndex)}`);
      const vertIndex = navmesh.poly_verts[i];
      const color = vertIndex % 2 === 0 ? ACYELLOW : ACGREEN;
      drawPolygon(neighborIndex, color);
    }
  }

  // 5. draw all triangles of the affected polygons
  const drawTrianglesForPolygon = (pIndex: number) => {
    const pTriStart = navmesh.poly_tris[pIndex];
    const pTriEnd = navmesh.poly_tris[pIndex + 1];
    for (let i = pTriStart; i < pTriEnd; i++) {
      drawTriangle(i, ACGREEN, false);
    }
  };

  drawTrianglesForPolygon(polyIndex);
  neighborPolys.forEach(drawTrianglesForPolygon);
};

const findTriangle = () => {
  if (!gameState?.navmesh) {
    console.error("Navmesh not loaded");
    return;
  }
  const coords = parseCoordinatesFromString(coordinates.value);
  if (coords) {
    const triIndex = getTriangleFromPoint(gameState.navmesh, coords);
    console.log(`Triangle index at ${coords.x}, ${coords.y}: ${triIndex}`);
    if (triIndex !== -1) {
      triangleIndex.value = triIndex.toString();
    }
  }
};

const flyToTriangle = () => {
  const triIndex = parseInt(triangleIndex.value, 10);
  if (isNaN(triIndex) || !gameState?.navmesh || !mapInstance.map) {
    return;
  }
  const centroidX = gameState.navmesh.triangle_centroids[triIndex * 2];
  const centroidY = gameState.navmesh.triangle_centroids[triIndex * 2 + 1];

  if (centroidX && centroidY) {
    const view = mapInstance.map.getView();
    view.setCenter([centroidX, centroidY]);
    view.setZoom(9);
  }
};

const logTriangle = () => {
  const triIndex = parseInt(triangleIndex.value, 10);
  if (isNaN(triIndex) || !gameState?.navmesh) {
    return;
  }
  const navmesh = gameState.navmesh;
  const triVertexStartIndex = triIndex * 3;
  const p1Index = navmesh.triangles[triVertexStartIndex];
  const p2Index = navmesh.triangles[triVertexStartIndex + 1];
  const p3Index = navmesh.triangles[triVertexStartIndex + 2];

  const p1 = { x: navmesh.vertices[p1Index * 2], y: navmesh.vertices[p1Index * 2 + 1] };
  const p2 = { x: navmesh.vertices[p2Index * 2], y: navmesh.vertices[p2Index * 2 + 1] };
  const p3 = { x: navmesh.vertices[p3Index * 2], y: navmesh.vertices[p3Index * 2 + 1] };
  
  const neighbors = [
    navmesh.neighbors[triIndex * 3],
    navmesh.neighbors[triIndex * 3 + 1],
    navmesh.neighbors[triIndex * 3 + 2]
  ];

  console.log(`Triangle ${triIndex} vertices:`, { p1, p2, p3 });
  console.log(`Triangle ${triIndex} neighbors:`, neighbors);
};

const drawTriangle = (triIndexToDraw?: number, color = ACGREEN, withLabels = true) => {
  const triIndex = triIndexToDraw ?? parseInt(triangleIndex.value, 10);
  if (isNaN(triIndex) || !gameState?.navmesh || !sceneState) {
    return;
  }
  
  const navmesh = gameState.navmesh;
  const triVertexStartIndex = triIndex * 3;
  const p1Index = navmesh.triangles[triVertexStartIndex];
  const p2Index = navmesh.triangles[triVertexStartIndex + 1];
  const p3Index = navmesh.triangles[triVertexStartIndex + 2];

  const p1 = { x: navmesh.vertices[p1Index * 2], y: navmesh.vertices[p1Index * 2 + 1] };
  const p2 = { x: navmesh.vertices[p2Index * 2], y: navmesh.vertices[p2Index * 2 + 1] };
  const p3 = { x: navmesh.vertices[p3Index * 2], y: navmesh.vertices[p3Index * 2 + 1] };

  sceneState.addDebugLine(p1, p2, color);
  sceneState.addDebugLine(p2, p3, color);
  sceneState.addDebugLine(p3, p1, color);
  if (withLabels) {
    sceneState.addDebugText(p1, 'v1', color)
    sceneState.addDebugText(p2, 'v2', color)
    sceneState.addDebugText(p3, 'v3', color)
  }
};

const flyToPolygon = () => {
  const polyIndex = parseInt(polygonIndex.value, 10);
  if (isNaN(polyIndex) || !gameState?.navmesh || !mapInstance.map) {
    return;
  }
  const centroidX = gameState.navmesh.poly_centroids[polyIndex * 2];
  const centroidY = gameState.navmesh.poly_centroids[polyIndex * 2 + 1];

  if (centroidX !== undefined && centroidY !== undefined) {
    const view = mapInstance.map.getView();
    view.setCenter([centroidX, centroidY]);
    view.setZoom(9);
  }
};

const logPolygon = () => {
  const polyIndex = parseInt(polygonIndex.value, 10);
  if (isNaN(polyIndex) || !gameState?.navmesh) {
    return;
  }
  const navmesh = gameState.navmesh;
  if (polyIndex >= navmesh.polygons.length - 1) {
    console.error(`Polygon index ${polyIndex} is out of bounds.`);
    return;
  }

  const polyVertStart = navmesh.polygons[polyIndex];
  const polyVertEnd = navmesh.polygons[polyIndex + 1];

  const vertexIndices = [];
  for (let i = polyVertStart; i < polyVertEnd; i++) {
    vertexIndices.push(navmesh.poly_verts[i]);
  }

  const vertices = vertexIndices.map(index => ({
    x: navmesh.vertices[index * 2],
    y: navmesh.vertices[index * 2 + 1]
  }));

  const neighbors = [];
  for (let i = polyVertStart; i < polyVertEnd; i++) {
    neighbors.push(navmesh.poly_neighbors[i]);
  }

  console.log(`Polygon ${polyIndex} vertices:`, vertices);
  console.log(`Polygon ${polyIndex} vertex indices:`, vertexIndices);
  console.log(`Polygon ${polyIndex} neighbors:`, neighbors);
};

const drawPolygon = (polyIndexToDraw?: number, color = ACGREEN) => {
  const polyIndex = polyIndexToDraw ?? parseInt(polygonIndex.value, 10);
  if (isNaN(polyIndex) || !gameState?.navmesh || !sceneState) {
    return;
  }
  const navmesh = gameState.navmesh;
  if (polyIndex >= navmesh.polygons.length - 1) {
    console.error(`Polygon index ${polyIndex} is out of bounds.`);
    return;
  }

  const polyVertStart = navmesh.polygons[polyIndex];
  const polyVertEnd = navmesh.polygons[polyIndex + 1];

  const vertices = [];
  for (let i = polyVertStart; i < polyVertEnd; i++) {
    const vertIndex = navmesh.poly_verts[i];
    vertices.push({
      x: navmesh.vertices[vertIndex * 2],
      y: navmesh.vertices[vertIndex * 2 + 1]
    });
  }

  sceneState.addDebugArea(vertices, color);
};

</script>

<style scoped>
#debug-tools {
  background: rgba(33, 33, 33, 0.9);
  padding: 8px;
  border-radius: 4px;
  z-index: 1;
  display: flex;
  flex-direction: column;
  gap: 8px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.5);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
  font-size: 11px;
}

.debug-section {
  display: flex;
  gap: 4px;
  align-items: center;
}

#debug-tools input {
  background-color: #2c2c2c;
  border: 1px solid #555;
  color: #f0f0f0;
  border-radius: 2px;
  padding: 4px;
  width: 150px;
}

#debug-tools button {
    background-color: #4f4f4f;
    color: #f5f5f5;
    border: none;
    border-radius: 3px;
    padding: 4px 8px;
    cursor: pointer;
    transition: background-color 0.3s ease;
    font-weight: 500;
}

#debug-tools button:hover {
    background-color: #616161;
}
</style> 