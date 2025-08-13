<template>
  <div id="debug-tools">
    <div class="debug-section">
      <input type="text" v-model="coordinates" placeholder="" />
      <button @click="flyToCoordinates">Fly</button>
      <button @click="findTriangle">Tri</button>
      <button @click="drawPoint">Draw</button>
    </div>
    <div class="debug-section">
      <input type="text" v-model="triangleIndex" placeholder="Triangle Index" />
      <button @click="flyToTriangle">Fly</button>
      <button @click="logTriangle">Log</button>
      <button @click="drawTriangle">Draw</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, inject } from 'vue';
import { mapInstance } from '../../map_instance';
import { getTriangleFromPoint } from '../../logic/navmesh/pathCorridor';
import type { GameState } from '../../logic/GameState';
import { SceneState, ACGREEN, ACINDIGO } from '../../logic/drawing/SceneState';

const gameState = inject<GameState>('gameState');
const sceneState = inject<SceneState>('sceneState');

const coordinates = ref('');
const triangleIndex = ref('');

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
  const centroidX = gameState.navmesh.centroids[triIndex * 2];
  const centroidY = gameState.navmesh.centroids[triIndex * 2 + 1];

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

  const p1 = { x: navmesh.points[p1Index * 2], y: navmesh.points[p1Index * 2 + 1] };
  const p2 = { x: navmesh.points[p2Index * 2], y: navmesh.points[p2Index * 2 + 1] };
  const p3 = { x: navmesh.points[p3Index * 2], y: navmesh.points[p3Index * 2 + 1] };
  
  const neighbors = [
    navmesh.neighbors[triIndex * 3],
    navmesh.neighbors[triIndex * 3 + 1],
    navmesh.neighbors[triIndex * 3 + 2]
  ];

  console.log(`Triangle ${triIndex} vertices:`, { p1, p2, p3 });
  console.log(`Triangle ${triIndex} neighbors:`, neighbors);
};

const drawTriangle = () => {
  const triIndex = parseInt(triangleIndex.value, 10);
  if (isNaN(triIndex) || !gameState?.navmesh || !sceneState) {
    return;
  }
  
  const navmesh = gameState.navmesh;
  const triVertexStartIndex = triIndex * 3;
  const p1Index = navmesh.triangles[triVertexStartIndex];
  const p2Index = navmesh.triangles[triVertexStartIndex + 1];
  const p3Index = navmesh.triangles[triVertexStartIndex + 2];

  const p1 = { x: navmesh.points[p1Index * 2], y: navmesh.points[p1Index * 2 + 1] };
  const p2 = { x: navmesh.points[p2Index * 2], y: navmesh.points[p2Index * 2 + 1] };
  const p3 = { x: navmesh.points[p3Index * 2], y: navmesh.points[p3Index * 2 + 1] };

  sceneState.addDebugArea([p1, p2, p3], ACGREEN);
  sceneState.addDebugText(p1, 'v1', ACGREEN)
  sceneState.addDebugText(p2, 'v2', ACGREEN)
  sceneState.addDebugText(p3, 'v3', ACGREEN)
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