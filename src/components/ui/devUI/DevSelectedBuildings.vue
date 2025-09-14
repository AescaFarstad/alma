<template>
  <div id="selected-buildings-panel">
  <div class="panel-controls">
    <input v-model="buildingIdToAdd" @keyup.enter="addBuilding" placeholder="Add building by ID" />
    <button @click="handleButtonClick($event, addBuilding)" title="Add Building">➕</button>
    <button @click="handleButtonClick($event, copyIds)" title="Copy IDs">📋</button>
    <button @click="handleButtonClick($event, pasteIds)" title="Paste IDs">📄</button>
    <button @click="handleButtonClick($event, clearSelection)" title="Clear Selection">🗑️</button>
    <button @click="handleButtonClick($event, clearSimplified)" title="Clear Simplified">💥</button>
    <button @click="handleButtonClick($event, clearDebug)" title="Clear Debug">🐞</button>
    <button @click="handleButtonClick($event, uniteAndSimplifySelectedBuildings)" title="Unite and Simplify Selected">US Sel</button>
    <button @click="handleButtonClick($event, debugBlobMapping)" title="Debug Blob Mapping">🔍</button>
  </div>
  <ul class="building-list">
    <li v-for="building in buildings" :key="building.id" 
      @mouseover="showTooltip(building, $event)" 
      @mouseleave="hideTooltip" 
      @mousemove="updateTooltipPosition($event)">
    <span class="building-info">
      <span class="building-id">{{ building.id }}</span><span class="building-name">{{ building.stats?.name ?? ""}}</span>
    </span>
    <div class="building-controls">
      <button @click="handleButtonClick($event, () => flyTo(building.id))">@</button>
      <button @click="handleButtonClick($event, () => copyBuildingProperties(building.id))">C</button>
      <button @click="handleButtonClick($event, () => drawBlobs(building.id))">b</button>
      <button @click="handleButtonClick($event, () => simplifyVisual(building.id))">SVis</button>
      <button @click="handleButtonClick($event, () => simplifyNav(building.id))">SNav</button>
      <button @click="handleButtonClick($event, () => simplifyBlob(building.id))">SBlb</button>
      <button @click="handleButtonClick($event, () => simplifyBlobTest(building.id))">STst</button>
      <button @click="handleButtonClick($event, () => removeBuilding(building.id))">X</button>
    </div>
    </li>
  </ul>
  <teleport to="body">
    <building-tooltip 
      v-if="tooltip.visible" 
      :building="tooltip.building" 
      :area="tooltip.area"
      :style="{ top: `${tooltip.y}px`, left: `${tooltip.x}px` }" />
  </teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, inject, reactive } from 'vue';
import type { GameState } from '../../../logic/GameState';
import { mapInstance } from '../../../map_instance';
import { SceneState } from '../../../logic/drawing/SceneState';
import BuildingTooltip from './BuildingTooltip.vue';
import { getConvexHull } from '../../../mapgen/simplification/convexHull';
import type { Point2 } from '../../../logic/core/math';
import { unround } from '../../../mapgen/simplification/unrounding';
import { flatten } from '../../../mapgen/simplification/flattening';
import { simplifyWithDilationErosion } from '../../../mapgen/simplification/dilationErosion';
import { uniteGeometries, type BuildingWithPolygon } from '../../../mapgen/simplification/unite';
import { getBuildingGeometry, getPolygonVertices, getBuildingArea } from '../../../mapgen/simplification/geometryUtils';
import { cornerize } from '../../../mapgen/simplification/cornerize';
import { pullAway } from '../../../mapgen/simplification/pullAway';
import { BuildingProperties } from '../../../types';
import { devFeatures, ensureDevFeaturesLoaded } from '../../../logic/DevFeatures';
import { cutImposter } from '../../../mapgen/simplification/cutImposter';
import { slideToNeighbor } from '../../../mapgen/simplification/slideToNeighbor';
import { simplifyBlobTest as simplifyBlobTestAction } from '../../../mapgen/simplifyBlobTest';

type BuildingDisplayData = { 
  id: number;
  stats: BuildingProperties;
  area: number;
};

// Centroid for labeling: area-weighted polygon centroid with fallback
const centroidOfPolygon = (pts: Point2[]): Point2 => {
  if (!pts || pts.length === 0) return { x: 0, y: 0 };
  let area2 = 0; // twice the area
  let cx = 0;
  let cy = 0;
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const p = pts[i];
    const q = pts[j];
    const cross = p.x * q.y - q.x * p.y;
    area2 += cross;
    cx += (p.x + q.x) * cross;
    cy += (p.y + q.y) * cross;
  }
  if (Math.abs(area2) < 1e-6) {
    // Degenerate polygon: average vertices
    let ax = 0, ay = 0;
    for (const p of pts) { ax += p.x; ay += p.y; }
    return { x: ax / n, y: ay / n };
  }
  const inv = 1 / (3 * area2);
  return { x: cx * inv, y: cy * inv };
};

const handleButtonClick = (event: MouseEvent, action: () => void) => {
  (event.currentTarget as HTMLElement)?.blur();
  action();
};

const gameState = inject<GameState>('gameState');
const sceneState = inject<SceneState>('sceneState');
const buildingIdToAdd = ref('');

const SIMPLIFICATION_INFLATION = 1.6;
const MERGE_INFLATION = 2;

const tooltip = reactive({
  visible: false,
  building: null as BuildingProperties | null,
  area: 0,
  x: 0,
  y: 0,
});

const buildings = computed((): BuildingDisplayData[] => {
  if (!gameState || !sceneState) return [];

  return Array.from(sceneState.selectedBuildingIds)
  .map((id: number) => {
    const props = gameState.navmesh.building_properties[id];
    if (!props) return null;
    return {
      id,
      stats: props,
      area: getBuildingArea(gameState.navmesh, id)
    };
  })
  .filter((b): b is BuildingDisplayData => !!b);
});


const getOriginalOuterRingByBuildingId = async (id: number): Promise<Point2[] | null> => {
  if (!gameState) return null;
  const props = gameState.navmesh.building_properties[id];
  const osmId = props?.osm_id;
  if (!osmId) return null;
  await ensureDevFeaturesLoaded();
  const rings = devFeatures.buildings.get(osmId);
  if (!rings || rings.length === 0) return null;
  const ring = rings[0];
  if (!ring || ring.length < 3) return null;
  return ring;
};

const addBuilding = () => {
  if (!gameState || !sceneState) return;
  const id = parseInt(buildingIdToAdd.value, 10);
  if (!isNaN(id)) {
  if (gameState.navmesh.building_properties[id]) {
    sceneState.selectBuilding(id);
    buildingIdToAdd.value = '';
  } else {
    console.warn(`Building with id ${id} not found.`);
  }
  }
};

const removeBuilding = (id: number) => {
  sceneState!.deselectBuilding(id);
};

const simplifyVisual = async (id: number) => {
  if (!sceneState) return;
  const original = await getOriginalOuterRingByBuildingId(id);
  if (!original) return;


  let simplified = await simplifyWithDilationErosion(original, SIMPLIFICATION_INFLATION);
  simplified = unround(simplified, 10, 0.45);
  simplified = flatten(simplified, 3);
  simplified = unround(simplified, 10, 0.5);
  simplified = cornerize(simplified, original, SIMPLIFICATION_INFLATION + 0.1, 1);
  simplified = flatten(simplified, 5);
  simplified = unround(simplified, 5, 0.55);

  sceneState.addSimplifiedBuilding(id, simplified);
};

const simplifyNav = async (id: number) => {
  if (!sceneState) return;
  const original = await getOriginalOuterRingByBuildingId(id);
  if (!original) return;

  // Pre-blob-combining simplification (from create_blobs.ts)
  let simplified = unround(original, 10, 0.45);
  simplified = flatten(simplified, 3);

  sceneState.addSimplifiedBuilding(id, simplified);
};


const simplifyBlob = async (id: number) => {
  if (!gameState || !sceneState) return;
  const blobIndex = gameState.navmesh.building_to_blob[id];
  if (blobIndex === undefined || blobIndex < 0) return;

  const start = gameState.navmesh.blob_buildings[blobIndex];
  const end = gameState.navmesh.blob_buildings[blobIndex + 1];
  if (start === undefined || end === undefined || end <= start) return;

  // Gather original rings for all buildings in this blob
  const buildingsForUnite: BuildingWithPolygon[] = [];
  for (let b = start; b < end; b++) {
    const ring = await getOriginalOuterRingByBuildingId(b);
    if (ring && ring.length >= 3) {
      buildingsForUnite.push({ id: String(b), polygon: ring });
    }
  }
  if (buildingsForUnite.length === 0) return;

  // Simplify each building for blob combining
  for (const b of buildingsForUnite) {
    let simplified = unround(b.polygon, 10, 0.45);
    simplified = flatten(simplified, 3);
    b.polygon = simplified;
  }

  const allPoints = buildingsForUnite.flatMap(g => g.polygon);
  const unitedGroups = await uniteGeometries(buildingsForUnite, MERGE_INFLATION);
  if (!unitedGroups || unitedGroups.length === 0) return;

  for (let i = 0; i < unitedGroups.length; i++) {
    const group = unitedGroups[i];
    let simplified = group.geom;
    simplified = pullAway(simplified, 1, 5);
    simplified = cornerize(simplified, allPoints, MERGE_INFLATION + 0.1, 0.5);
    simplified = unround(simplified, 10, 0.45);
    simplified = flatten(simplified, 3);
    simplified = unround(simplified, 10, 0.5);
    simplified = flatten(simplified, 5);
    simplified = unround(simplified, 5, 0.55);
    simplified = flatten(simplified, 7);
    simplified = unround(simplified, 5, 0.55);

    const targetId = i === 0 ? id : Math.round(Math.random() * -1000000);
    sceneState.addSimplifiedBuilding(targetId, simplified);
  }
};

// Test variant moved to module: two-pass grouping for accuracy
const simplifyBlobTest = async (id: number) => {
  if (!gameState || !sceneState) return;
  await simplifyBlobTestAction(gameState, sceneState, id, { mergeInflation: MERGE_INFLATION, radiusMeters: 30 });
};

const uniteAndSimplifySelectedBuildings = async () => {
  if (!gameState || !sceneState) return;

  const selectedBuildings = buildings.value;
  if (selectedBuildings.length === 0) {
    return;
  }

  const buildingsToUnite: BuildingWithPolygon[] = [];
  for (const building of selectedBuildings) {
  let polygon = getBuildingGeometry(gameState.navmesh, building.id);
  if (polygon) {
    polygon = unround(polygon, 10, 0.45);
    polygon = flatten(polygon, 3);
    buildingsToUnite.push({ id: building.id.toString(), polygon });
  }
  }
  let allPoints = buildingsToUnite.flatMap(g => g.polygon);

  if (buildingsToUnite.length === 0) return;

  let unitedGroups = await uniteGeometries(buildingsToUnite, MERGE_INFLATION * 2.5);

  if (unitedGroups.length === 0) return;


  for (let i = 0; i < unitedGroups.length; i++) {
    const group = unitedGroups[i];
    // let simplified = [...group.geom];
    let simplified = flatten(group.geom, 3);

    const beforeDilation = simplified;
    simplified = await simplifyWithDilationErosion(simplified, MERGE_INFLATION * 2.5);
    // simplified = unround(simplified, 10, 0.45);
    simplified = flatten(simplified, 3);

    // 5) Union pre/post dilation results to fuse small gaps
    const unionInput: BuildingWithPolygon[] = [
      { id: 'before', polygon: beforeDilation },
      { id: 'after',  polygon: simplified }
    ];
    const unioned = await uniteGeometries(unionInput, MERGE_INFLATION);
    if (unioned && unioned.length > 0) {
      const merged = unioned.find(g => g.buildings.length > 1) ?? unioned[0];
      simplified = merged.geom;
    }

    simplified = pullAway(simplified, 1, 6);
    simplified = cornerize(simplified, allPoints, MERGE_INFLATION + 0.1, 0.5);
    // simplified = pullAway(simplified, 1, 4);
    // simplified = await slideToNeighbor(allPoints, simplified, 0.75)
    // simplified = pullAway(simplified, 1, 5);
    simplified = unround(simplified, 10, 0.45);
    simplified = flatten(simplified, 3);
    simplified = unround(simplified, 10, 0.5);
    simplified = flatten(simplified, 5);
    simplified = unround(simplified, 5, 0.55);
    simplified = flatten(simplified, 7);
    simplified = unround(simplified, 5, 0.55);
    simplified = flatten(simplified, 9);
    // simplified = await slideToNeighbor(allPoints, simplified, 0.75)

    // // simplified = await cutImposter(buildingsToUnite.map(g => g.polygon), simplified)
    // simplified = await slideToNeighbor(group.geom, simplified, 1.25)
    // simplified = pullAway(simplified, 1, 5);
    // simplified = await slideToNeighbor(group.geom, simplified, 0.75)
    // simplified = pullAway(simplified, 1, 5);
    // simplified = await slideToNeighbor(group.geom, simplified, 0.5)
    // simplified = await slideToNeighbor(group.geom, simplified, 0.5)
    // simplified = pullAway(simplified, 1, 5);
    // simplified = await slideToNeighbor(group.geom, simplified, 0.25)
    // simplified = await slideToNeighbor(group.geom, simplified, 0.25)
    // simplified = await slideToNeighbor(group.geom, simplified, 0.15)
    // simplified = await slideToNeighbor(group.geom, simplified, 0.15)

    sceneState.addSimplifiedBuilding(Math.round(Math.random() * -1000000), simplified);
  }
};

const drawBlobs = (id: number) => {
  if (!gameState || !sceneState) {
    console.log('gameState or sceneState is missing');
    return;
  }

  console.log(`Drawing blob for building ${id}`);

  const blobIndex = gameState.navmesh.building_to_blob[id];
  console.log(`Building ${id} -> Blob Index: ${blobIndex}`);

  if (blobIndex === undefined || blobIndex < 0) {
    console.warn(`Building ${id} does not belong to a blob.`);
    return;
  }

  // Convert blob index to polygon ID
  // Blobs are impassable polygons with IDs >= walkable_polygon_count
  const blobPolygonId = gameState.navmesh.walkable_polygon_count + blobIndex;
  console.log(`Blob index ${blobIndex} -> Polygon ID: ${blobPolygonId}`);
  console.log(`Walkable polygon count: ${gameState.navmesh.walkable_polygon_count}`);
  console.log(`Total polygons: ${gameState.navmesh.polygons.length - 1}`);

  if (blobPolygonId >= gameState.navmesh.polygons.length - 1) {
    console.warn(`Blob polygon ID ${blobPolygonId} is out of range for polygons array (length: ${gameState.navmesh.polygons.length - 1})`);
    return;
  }

  const blobPolygon = getPolygonVertices(gameState.navmesh, blobPolygonId);
  console.log(`Retrieved ${blobPolygon.length} vertices for blob polygon ${blobPolygonId}`);

  if (blobPolygon.length > 0) {
    sceneState.addDebugPolygon(blobPolygon);
    for (const point of blobPolygon) {
      sceneState.addDebugPoint(point, "blue");
    }
    blobPolygon.forEach((point, index) => {
      sceneState.addDebugText(point, index.toString(), "white");
    });
    console.log(`Successfully drew blob ${blobIndex} (polygon ${blobPolygonId}) with ${blobPolygon.length} vertices`);
  } else {
    console.warn(`No vertices found for blob polygon ${blobPolygonId}.`);
  }
};

const copyBuildingProperties = (id: number) => {
  if (!gameState) return;
  const geometry = getBuildingGeometry(gameState.navmesh, id);
  const stats = { ...gameState.navmesh.building_properties[id], area: getBuildingArea(gameState.navmesh, id) };
  const text1 = JSON.stringify(stats, null, 2);
  const text2 = JSON.stringify(geometry, null);
  navigator.clipboard.writeText(text1 + "\n" + text2);
};

const copyIds = () => {
  if (!sceneState) return;
  const ids = Array.from(sceneState.selectedBuildingIds).join(',');
  navigator.clipboard.writeText(ids);
};

const pasteIds = async () => {
  if (!gameState || !sceneState) return;
  const text = await navigator.clipboard.readText();
  const ids = text.split(',').map(id => parseInt(id.trim(), 10)).filter(id => !isNaN(id));
  const buildingsMap = new Map(gameState.navmesh.building_properties.map((p, index) => [index, p]));
  ids.forEach(id => {
  if (buildingsMap.has(id)) {
    sceneState.selectBuilding(id);
  } else {
    console.warn(`Pasted building with id ${id} not found.`);
  }
  });
};

const clearSelection = () => {
  if (!sceneState) return;
  sceneState.clearSelectedBuildings();
};

const clearSimplified = () => {
  if (!sceneState) return;
  sceneState.clearSimplifiedGeometries();
};

const clearDebug = () => {
  if (!sceneState) return;
  sceneState.clearDebugVisuals();
};

const debugBlobMapping = () => {
  if (!gameState || !sceneState) return;
  console.log("=== Building to Blob Mapping Debug ===");
  console.log(`building_to_blob array length: ${gameState.navmesh.building_to_blob.length}`);
  console.log(`building_properties length: ${gameState.navmesh.building_properties.length}`);
  console.log(`walkable_polygon_count: ${gameState.navmesh.walkable_polygon_count}`);
  console.log(`total polygons: ${gameState.navmesh.polygons.length - 1}`);

  // Show first 20 mappings
  const limit = Math.min(20, gameState.navmesh.building_to_blob.length);
  for (let i = 0; i < limit; i++) {
  const blobIndex = gameState.navmesh.building_to_blob[i];
  const blobPolygonId = blobIndex >= 0 ? gameState.navmesh.walkable_polygon_count + blobIndex : -1;
  console.log(`Building ID: ${i}, Blob Index: ${blobIndex}, Blob Polygon ID: ${blobPolygonId}`);
  }

  // Count how many buildings have valid blob mappings
  let validMappings = 0;
  for (let i = 0; i < gameState.navmesh.building_to_blob.length; i++) {
  if (gameState.navmesh.building_to_blob[i] >= 0) {
    validMappings++;
  }
  }
  console.log(`Valid blob mappings: ${validMappings} out of ${gameState.navmesh.building_to_blob.length}`);
};

const showTooltip = (building: BuildingDisplayData, event: MouseEvent) => {
  tooltip.visible = true;
  tooltip.building = building.stats;
  tooltip.area = building.area;
  updateTooltipPosition(event);
};

const hideTooltip = () => {
  tooltip.visible = false;
  tooltip.building = null;
};

const updateTooltipPosition = (event: MouseEvent) => {
  tooltip.x = event.clientX + 15;
  tooltip.y = event.clientY + 15;
};
</script>

<style scoped>
#selected-buildings-panel {
  background: rgba(33, 33, 33, 0.9);
  border-radius: 4px;
  z-index: 1;
  border: 1px solid rgba(255, 255, 255, 0.1);
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.5);
  max-height: calc(100vh - 150px);
  display: flex;
  flex-direction: column;
  color: #f0f0f0;
  font-size: 12px;
}

.panel-controls {
  display: flex;
  gap: 4px;
  padding: 4px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.panel-controls input {
  background: #212121;
  border: 1px solid #4f4f4f;
  color: #f0f0f0;
  border-radius: 2px;
  padding: 2px 4px;
  width: 100px;
  font-size: 11px;
}

.panel-controls button {
  background-color: #4f4f4f;
  color: #f5f5f5;
  border: none;
  border-radius: 3px;
  padding: 2px 6px;
  cursor: pointer;
  font-size: 11px;
}

.building-list {
  list-style: none;
  padding: 0;
  margin: 0;
  overflow-y: auto;
  flex-grow: 1;
}

.building-list li {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 2px 4px;
  border-bottom: 1px solid #4f4f4f;
}

.building-list li:last-child {
  border-bottom: none;
}

.building-list li span {
  font-family: monospace;
}

.building-info {
  display: flex;
  flex-direction: column;
}

.building-id {
  font-weight: bold;
}

.building-name {
  font-size: 10px;
  color: #ccc;
}

.building-controls {
  display: flex;
  gap: 4px;
}

.building-controls button {
  background: #616161;
  border: none;
  color: white;
  border-radius: 2px;
  padding: 0 4px;
  cursor: pointer;
}
</style> 
