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
          <!-- <button @click="simplifyBuilding(building)">S</button> -->
          <button @click="handleButtonClick($event, () => simplifyWithConvexHull(building.id))">Hull</button>
          <!-- <button @click="simplifyWithConvexHullAndSimplify(building)">S3</button> -->
          <button @click="handleButtonClick($event, () => simplifyWithUR(building.id))">UR</button>
          <button @click="handleButtonClick($event, () => simplifyWithFT(building.id))">FT</button>
          <button @click="handleButtonClick($event, () => simplifyWithS6(building.id))">S6</button>
          <button @click="handleButtonClick($event, () => simplifyWithS7(building.id))">S7</button>
          <button @click="handleButtonClick($event, () => inflate(building.id))">i</button>
          <button @click="handleButtonClick($event, () => inflateAndCornerize(building.id))">iC</button>
          <button @click="handleButtonClick($event, () => uniteBuilding(building.id))">U</button>
          <button @click="handleButtonClick($event, () => uniteAndSimplifyBuilding(building.id))">US</button>
          <button @click="handleButtonClick($event, () => findNearby(building.id))">?</button>
          <button @click="handleButtonClick($event, () => drawBlobs(building.id))">b</button>
          <button @click="handleButtonClick($event, () => removeBuilding(building.id))">X</button>
        </div>
      </li>
    </ul>
    <building-tooltip 
      v-if="tooltip.visible" 
      :building="tooltip.building" 
      :area="tooltip.area"
      :style="{ top: `${tooltip.y}px`, left: `${tooltip.x}px` }" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, inject, reactive } from 'vue';
import type { GameState } from '../../logic/GameState';
import { mapInstance } from '../../map_instance';
import { SceneState } from '../../logic/drawing/SceneState';
import BuildingTooltip from './BuildingTooltip.vue';
import { getConvexHull } from '../../mapgen/simplification/convexHull';
import type { Point2 } from '../../logic/core/math';
import { unround } from '../../mapgen/simplification/unrounding';
import { flatten } from '../../mapgen/simplification/flattening';
import { simplifyWithDilationErosion } from '../../mapgen/simplification/dilationErosion';
import { uniteGeometries, type BuildingWithPolygon } from '../../mapgen/simplification/unite';
import { getBuildingGeometry, getPolygonVertices, getBuildingArea } from '../../mapgen/simplification/geometryUtils';
import { cornerize } from '../../mapgen/simplification/cornerize';
import { pullAway } from '../../mapgen/simplification/pullAway';
import { BuildingProperties } from '../../types';

type BuildingDisplayData = { 
    id: number;
    stats: BuildingProperties;
    area: number;
};

const handleButtonClick = (event: MouseEvent, action: () => void) => {
  (event.currentTarget as HTMLElement)?.blur();
  action();
};

const gameState = inject<GameState>('gameState');
const sceneState = inject<SceneState>('sceneState');
const buildingIdToAdd = ref('');

const SIMPLIFICATION_INFLATION = 3.6;
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
  if (!sceneState) return;
  sceneState.deselectBuilding(id);
};

const simplifyWithConvexHull = (id: number) => {
  if (!sceneState || !gameState) return;
  const points = getBuildingGeometry(gameState.navmesh, id);
  if (!points) return;
  
  const convexHull = getConvexHull(points);

  sceneState.addSimplifiedBuilding(id, convexHull);
};

const simplifyWithUR = (id: number) => {
  if (!sceneState || !gameState) return;
  const points = getBuildingGeometry(gameState.navmesh, id);
  if (!points) return;

  const unrounded = unround(points, 5, 0.25);
  sceneState.addSimplifiedBuilding(id, unrounded);
};

const simplifyWithFT = (id: number) => {
  if (!sceneState || !gameState) return;
  const points = getBuildingGeometry(gameState.navmesh, id);
  if (!points) return;
  
  const flattened = flatten(points, 1.75);
  sceneState.addSimplifiedBuilding(id, flattened);
};

const simplifyWithS6 = (id: number) => {
    if (!sceneState || !gameState) return;
    const points = getBuildingGeometry(gameState.navmesh, id);
    if (!points) return;

    let res = unround(points, 5, 0.25);
    res = flatten(res, 1.75);
    res = unround(res, 5, 0.3);
    res = flatten(res, 2);
    // res = flatten(res, 3);
    // res = unround(res, 2.5, 1.5);
    // res = flatten(res, 5);
    // res = flatten(res, 6);

    sceneState.addSimplifiedBuilding(id, res);
    console.log(`Simplified: ${points.length} -> ${res.length}`);
};

const simplifyWithS7 = async (id: number) => {
    if (!sceneState || !gameState) return;
    const points = getBuildingGeometry(gameState.navmesh, id);
    if (!points) return;
    
    let simplified = await simplifyWithDilationErosion(points, SIMPLIFICATION_INFLATION);
    simplified = unround(simplified, 10, 0.45);
    simplified = flatten(simplified, 3);
    simplified = unround(simplified, 10, 0.5);
    simplified = cornerize(simplified, points, SIMPLIFICATION_INFLATION + 0.1, 1);
    simplified = flatten(simplified, 5);
    simplified = unround(simplified, 5, 0.55);

    sceneState.addSimplifiedBuilding(id, simplified);
    console.log(`Simplified: ${points.length} -> ${simplified.length}`);
};

const getBuildingsToUnite = (id: number, range: number, modifiedMainPolygon?: Point2[]): BuildingWithPolygon[] => {
  if (!gameState) return [];
  const originalMainPolygon = getBuildingGeometry(gameState.navmesh, id);
  if (!originalMainPolygon) return [];

  const mainPolygonForUnite = modifiedMainPolygon || originalMainPolygon;

  const { minX, minY, maxX, maxY } = originalMainPolygon.reduce(
    (acc, p) => ({
      minX: Math.min(acc.minX, p.x),
      minY: Math.min(acc.minY, p.y),
      maxX: Math.max(acc.maxX, p.x),
      maxY: Math.max(acc.maxY, p.y),
    }),
    { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity }
  );

  const searchArea = {
    minX: minX - range,
    minY: minY - range,
    maxX: maxX + range,
    maxY: maxY + range,
  };

  const buildingIndex = gameState.navmesh.buildingIndex;
  const minCellX = Math.floor((searchArea.minX - buildingIndex.minX) / buildingIndex.cellSize);
  const maxCellX = Math.floor((searchArea.maxX - buildingIndex.minX) / buildingIndex.cellSize);
  const minCellY = Math.floor((searchArea.minY - buildingIndex.minY) / buildingIndex.cellSize);
  const maxCellY = Math.floor((searchArea.maxY - buildingIndex.minY) / buildingIndex.cellSize);

  const nearbyBuildingIds = new Set<number>();
  for (let cy = minCellY; cy <= maxCellY; cy++) {
    for (let cx = minCellX; cx <= maxCellX; cx++) {
      const items = buildingIndex.getItemsInCell(cx, cy);
      for (let i = 0; i < items.length; i++) {
        nearbyBuildingIds.add(items[i]);
      }
    }
  }
  
  const buildingsMap = new Map(gameState.navmesh.building_properties.map((p, index) => [index, p]));
  const nearbyBuildings = Array.from(nearbyBuildingIds)
    .map(buildingId => {
        const props = buildingsMap.get(buildingId);
        if (!props) return null;
        return { id: buildingId, stats: props };
    })
    .filter((b): b is { id: number; stats: BuildingProperties } => !!b && b.id !== id);
  
  const buildingsWithPolygons: BuildingWithPolygon[] = [{ id: id.toString(), polygon: mainPolygonForUnite }];
  
  for(const b of nearbyBuildings) {
    const polygon = getBuildingGeometry(gameState.navmesh, b.id);
    if(polygon) {
        buildingsWithPolygons.push({ id: b.id.toString(), polygon });
    }
  }

  return buildingsWithPolygons;
};

const inflate = async (id: number) => {
    if (!gameState || !sceneState) return;
    
    const buildingsToUnite = getBuildingsToUnite(id, 0.1);
    if (buildingsToUnite.length === 0) return;

    for(let b of buildingsToUnite) {
      b.polygon = unround(b.polygon, 10, 0.45);
      b.polygon = flatten(b.polygon, 3);
    }

    const unitedGroups = await uniteGeometries(buildingsToUnite, MERGE_INFLATION);
    unitedGroups.forEach((group, index) => {
      sceneState.addSimplifiedBuilding(id, group.geom);
    });
};

const inflateAndCornerize = async (id: number) => {
    if (!gameState || !sceneState) return;

    const buildingsToUnite = getBuildingsToUnite(id, 0.1);
    if (buildingsToUnite.length === 0) return;

    for(let b of buildingsToUnite) {
      b.polygon = unround(b.polygon, 10, 0.45);
      b.polygon = flatten(b.polygon, 3);
    }

    let allPoints = buildingsToUnite.flatMap(g => g.polygon);
    const unitedGroups = await uniteGeometries(buildingsToUnite, MERGE_INFLATION);


    unitedGroups.forEach((group, index) => {
      let simplified = cornerize(group.geom, allPoints, MERGE_INFLATION + 0.1, 0.5);
      sceneState.addSimplifiedBuilding(id, simplified);
    });
};

const uniteBuilding = async (id: number) => {
  if (!gameState || !sceneState) return;
  const buildingsToUnite = getBuildingsToUnite(id, 0.1);
  if (buildingsToUnite.length === 0) return;

  const unitedGroups = await uniteGeometries(buildingsToUnite, 3.6);
  
  unitedGroups.forEach((group, index) => {
    console.log(`United group ${index}: ${group.buildings.join(', ')}`);
    sceneState.addSimplifiedBuilding(id, group.geom);
  });
};

const uniteAndSimplifyBuilding = async (id: number) => {
  if (!gameState || !sceneState) return;

  let mainPolygon = getBuildingGeometry(gameState.navmesh, id);
  if (!mainPolygon) return;

  const buildingsToUnite = getBuildingsToUnite(id, 50.1, mainPolygon);
  if (buildingsToUnite.length === 0) return;
  let allPoints = buildingsToUnite.flatMap(g => g.polygon);

  buildingsToUnite.forEach((b) => {
    b.polygon = unround(b.polygon, 10, 0.45);
    b.polygon = flatten(b.polygon, 3);
  });

  let unitedGroups = await uniteGeometries(buildingsToUnite, MERGE_INFLATION);
  unitedGroups.forEach((group) => {
    group.geom = cornerize(group.geom, allPoints, MERGE_INFLATION + 0.1, 0.5);
  });
  
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
    sceneState.addSimplifiedBuilding(id, simplified);
  }
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

  let unitedGroups = await uniteGeometries(buildingsToUnite, MERGE_INFLATION);
  
  if (unitedGroups.length === 0) return;

  
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

const findNearby = (id: number) => {
  if (!gameState || !sceneState) return;
  const nearbyBuildings = getBuildingsToUnite(id, 1);
  nearbyBuildings.forEach(b => sceneState!.selectBuilding(parseInt(b.id, 10)));
};

const flyTo = (id: number) => {
  if (mapInstance.map && gameState) {
    const points = getBuildingGeometry(gameState.navmesh, id);
    if (!points || points.length === 0) return;
    
    mapInstance.map.getView().animate({
      center: [points[0].x, points[0].y],
      zoom: 19,
      duration: 500,
    });
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