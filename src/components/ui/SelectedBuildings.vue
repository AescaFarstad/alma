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
    </div>
    <ul class="building-list">
      <li v-for="building in buildings" :key="building.id" 
          @mouseover="showTooltip(building, $event)" 
          @mouseleave="hideTooltip" 
          @mousemove="updateTooltipPosition($event)">
        <span class="building-info">
          <span class="building-id">{{ building.id }}</span><span class="building-name">{{ building.stats.name ?? ""}}</span>
        </span>
        <div class="building-controls">
          <button @click="handleButtonClick($event, () => flyTo(building))">@</button>
          <button @click="handleButtonClick($event, () => copyBuildingProperties(building))">C</button>
          <!-- <button @click="simplifyBuilding(building)">S</button> -->
          <button @click="handleButtonClick($event, () => simplifyWithConvexHull(building))">Hull</button>
          <!-- <button @click="simplifyWithConvexHullAndSimplify(building)">S3</button> -->
          <button @click="handleButtonClick($event, () => simplifyWithUR(building))">UR</button>
          <button @click="handleButtonClick($event, () => simplifyWithFT(building))">FT</button>
          <button @click="handleButtonClick($event, () => simplifyWithS6(building))">S6</button>
          <button @click="handleButtonClick($event, () => simplifyWithS7(building))">S7</button>
          <button @click="handleButtonClick($event, () => inflate(building))">i</button>
          <button @click="handleButtonClick($event, () => inflateAndCornerize(building))">iC</button>
          <button @click="handleButtonClick($event, () => uniteBuilding(building))">U</button>
          <button @click="handleButtonClick($event, () => uniteAndSimplifyBuilding(building))">US</button>
          <button @click="handleButtonClick($event, () => findNearby(building))">?</button>
          <button @click="handleButtonClick($event, () => drawBlobs(building))">b</button>
          <button @click="handleButtonClick($event, () => removeBuilding(building.id))">X</button>
        </div>
      </li>
    </ul>
    <building-tooltip 
      v-if="tooltip.visible" 
      :building="tooltip.building" 
      :style="{ top: `${tooltip.y}px`, left: `${tooltip.x}px` }" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, inject, reactive } from 'vue';
import type { GameState } from '../../logic/GameState';
import { mapInstance } from '../../map_instance';
import { SceneState } from '../../logic/drawing/SceneState';
import BuildingTooltip from './BuildingTooltip.vue';
import { getConvexHull } from '../../logic/simplification/convexHull';
import type { Point2 } from '../../logic/core/math';
import { unround } from '../../logic/simplification/unrounding';
import { flatten } from '../../logic/simplification/flattening';
import { simplifyWithDilationErosion } from '../../logic/simplification/dilationErosion';
import { uniteGeometries, type BuildingWithPolygon } from '../../logic/simplification/unite';
import { Building, getPointsFromBuilding } from '../../logic/simplification/geometryUtils';
import { cornerize } from '../../logic/simplification/cornerize';
import { pullAway } from '../../logic/simplification/pullAway';

const handleButtonClick = (event: MouseEvent, action: () => void) => {
  (event.currentTarget as HTMLElement)?.blur();
  action();
};

const getBuildingArea = (building: Building) => {
    const ring = getPointsFromBuilding(building);
    let area = 0;
    if (!ring || ring.length < 3) return 0;
    for (let i = 0; i < ring.length - 1; i++) {
        area += ring[i].x * ring[i+1].y - ring[i+1].x * ring[i].y;
    }
    return Math.abs(area / 2);
}

const gameState = inject<GameState>('gameState');
const sceneState = inject<SceneState>('sceneState');
const buildingIdToAdd = ref('');

const SIMPLIFICATION_INFLATION = 3.6;
const MERGE_INFLATION = 2;

const tooltip = reactive({
  visible: false,
  building: null as Building | null,
  x: 0,
  y: 0,
});

const buildings = computed(() => {
  if (!gameState || !sceneState) return [];
  return Array.from(sceneState.selectedBuildingIds)
    .map((id: string) => gameState.buildingsById[id])
    .filter((b): b is Building => !!b);
});

const addBuilding = () => {
  if (!gameState || !sceneState) return;
  const id = buildingIdToAdd.value;
  if (id) {
    if (gameState.buildingsById[id]) {
      sceneState.selectBuilding(id);
      buildingIdToAdd.value = '';
    } else {
      console.warn(`Building with id ${id} not found.`);
    }
  }
};

const removeBuilding = (id: string) => {
  if (!sceneState) return;
  sceneState.deselectBuilding(id);
};

const simplifyWithConvexHull = (building: Building) => {
  if (!sceneState) return;
  const points = getPointsFromBuilding(building);
  if (!points) return;
  
  const convexHull = getConvexHull(points);

  sceneState.addSimplifiedBuilding(building.id, convexHull);
};

const simplifyWithUR = (building: Building) => {
  if (!sceneState) return;
  const points = getPointsFromBuilding(building);
  if (!points) return;

  const unrounded = unround(points, 5, 0.25);
  sceneState.addSimplifiedBuilding(building.id, unrounded);
};

const simplifyWithFT = (building: Building) => {
  if (!sceneState) return;
  const points = getPointsFromBuilding(building);
  if (!points) return;
  
  const flattened = flatten(points, 1.75);
  sceneState.addSimplifiedBuilding(building.id, flattened);
};

const simplifyWithS6 = (building: Building) => {
    if (!sceneState) return;
    const points = getPointsFromBuilding(building);
    if (!points) return;

    let res = unround(points, 5, 0.25);
    res = flatten(res, 1.75);
    res = unround(res, 5, 0.3);
    res = flatten(res, 2);
    // res = flatten(res, 3);
    // res = unround(res, 2.5, 1.5);
    // res = flatten(res, 5);
    // res = flatten(res, 6);

    sceneState.addSimplifiedBuilding(building.id, res);
    console.log(`Simplified: ${points.length} -> ${res.length}`);
};

const simplifyWithS7 = async (building: Building) => {
    if (!sceneState) return;
    const points = getPointsFromBuilding(building);
    if (!points) return;
    
    let simplified = await simplifyWithDilationErosion(points, SIMPLIFICATION_INFLATION);
    simplified = unround(simplified, 10, 0.45);
    simplified = flatten(simplified, 3);
    simplified = unround(simplified, 10, 0.5);
    simplified = cornerize(simplified, points, SIMPLIFICATION_INFLATION + 0.1, 1);
    simplified = flatten(simplified, 5);
    simplified = unround(simplified, 5, 0.55);

    sceneState.addSimplifiedBuilding(building.id, simplified);
    console.log(`Simplified: ${points.length} -> ${simplified.length}`);
};

const getBuildingsToUnite = (building: Building, range: number, modifiedMainPolygon?: Point2[]): BuildingWithPolygon[] => {
  if (!gameState) return [];
  const originalMainPolygon = getPointsFromBuilding(building);
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

  const nearbyBuildings = gameState.buildingSpatialIndex
    .search(searchArea)
    .map((item: any) => gameState.buildingsById[item.id])
    .filter(b => b && b.id !== building.id);
  
  const buildingsWithPolygons: BuildingWithPolygon[] = [{ id: building.id, polygon: mainPolygonForUnite }];
  
  for(const b of nearbyBuildings) {
    const polygon = getPointsFromBuilding(b);
    if(polygon) {
        buildingsWithPolygons.push({ id: b.id, polygon });
    }
  }

  return buildingsWithPolygons;
};

const inflate = async (building: Building) => {
    if (!gameState || !sceneState) return;
    
    const buildingsToUnite = getBuildingsToUnite(building, 0.1);
    if (buildingsToUnite.length === 0) return;

    for(let b of buildingsToUnite) {
      b.polygon = unround(b.polygon, 10, 0.45);
      b.polygon = flatten(b.polygon, 3);
    }

    const unitedGroups = await uniteGeometries(buildingsToUnite, MERGE_INFLATION);
    unitedGroups.forEach((group, index) => {
      sceneState.addSimplifiedBuilding(`${building.id}-united-${index}`, group.geom);
    });
};

const inflateAndCornerize = async (building: Building) => {
    if (!gameState || !sceneState) return;

    const buildingsToUnite = getBuildingsToUnite(building, 0.1);
    if (buildingsToUnite.length === 0) return;

    for(let b of buildingsToUnite) {
      b.polygon = unround(b.polygon, 10, 0.45);
      b.polygon = flatten(b.polygon, 3);
    }

    let allPoints = buildingsToUnite.flatMap(g => g.polygon);
    const unitedGroups = await uniteGeometries(buildingsToUnite, MERGE_INFLATION);


    unitedGroups.forEach((group, index) => {
      let simplified = cornerize(group.geom, allPoints, MERGE_INFLATION + 0.1, 0.5);
      sceneState.addSimplifiedBuilding(`${building.id}-united-${index}`, simplified);
    });
};

const uniteBuilding = async (building: Building) => {
  if (!gameState || !sceneState) return;
  const buildingsToUnite = getBuildingsToUnite(building, 0.1);
  if (buildingsToUnite.length === 0) return;

  const unitedGroups = await uniteGeometries(buildingsToUnite, 3.6);
  
  unitedGroups.forEach((group, index) => {
    console.log(`United group ${index}: ${group.buildings.join(', ')}`);
    sceneState.addSimplifiedBuilding(`${building.id}-united-${index}`, group.geom);
  });
};

const uniteAndSimplifyBuilding = async (building: Building) => {
  if (!gameState || !sceneState) return;

  let mainPolygon = getPointsFromBuilding(building);
  if (!mainPolygon) return;

  const buildingsToUnite = getBuildingsToUnite(building, 50.1, mainPolygon);
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
    sceneState.addSimplifiedBuilding(`${building.id}-united-simplified-${i}`, simplified);
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
    let polygon = getPointsFromBuilding(building);
    if (polygon) {
      polygon = unround(polygon, 10, 0.45);
      polygon = flatten(polygon, 3);
      buildingsToUnite.push({ id: building.id, polygon });
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

    const newId = `united-selected-simplified-${i}-${group.buildings.join('_')}`;
    sceneState.addSimplifiedBuilding(newId, simplified);
  }
};

const drawBlobs = (building: Building) => {
  if (!gameState || !sceneState) {
    console.log('gameState or sceneState is missing');
    return;
  }

  const buildingPolygon = getPointsFromBuilding(building);
  if (!buildingPolygon) {
    console.log('Could not get building polygon');
    return;
  }

  const { minX, minY, maxX, maxY } = buildingPolygon.reduce(
    (acc, p) => ({
      minX: Math.min(acc.minX, p.x),
      minY: Math.min(acc.minY, p.y),
      maxX: Math.max(acc.maxX, p.x),
      maxY: Math.max(acc.maxY, p.y),
    }),
    { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity }
  );

  const range = 50; // 50 meters

  const searchArea = {
    minX: minX - range,
    minY: minY - range,
    maxX: maxX + range,
    maxY: maxY + range,
  };

  const nearbyBlobItems = gameState.blobSpatialIndex.search(searchArea);

  const nearbyBlobs = nearbyBlobItems.map((item: any) => gameState.blobsById[item.id]);

  if (nearbyBlobs.length === 0) {
    console.log('No nearby blobs found.');
  }

  for (const blob of nearbyBlobs) {
    if (blob && blob.geometry && blob.geometry.length > 0 && blob.geometry[0].length > 0) {
      const blobPolygon: Point2[] = blob.geometry[0].map((p: number[]) => ({ x: p[0], y: p[1] }));
      sceneState.addDebugPolygon(blobPolygon);
      for (const point of blobPolygon) {
        sceneState.addDebugPoint(point, "blue");
      }

      blobPolygon.forEach((point, index) => {
        sceneState.addDebugText(point, index.toString(), "white");
      });

    } else {
      console.log('Skipping invalid blob:', JSON.stringify(blob));
    }
  }
};

const findNearby = (building: Building) => {
  if (!gameState || !sceneState) return;
  const nearbyBuildings = getBuildingsToUnite(building, 1);
  nearbyBuildings.forEach(b => sceneState!.selectBuilding(b.id));
};

const flyTo = (building: Building) => {
  if (mapInstance.map) {
    const flat = (building.geometry as unknown as number[]).flat(Infinity) as number[];
    let rawCoords = new Float32Array(flat);
    mapInstance.map.getView().animate({
      center: [rawCoords[0], rawCoords[1]],
      zoom: 9,
      duration: 500,
    });
  }
};

const copyBuildingProperties = (building: Building) => {
  const stats = { ...building.stats, area: getBuildingArea(building) };
  const text1 = JSON.stringify(stats, null, 2);
  const text2 = JSON.stringify(building.geometry, null);
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
  const ids = text.split(',').map(id => id.trim()).filter(id => id);
  ids.forEach(id => {
    if (gameState.buildingsById[id]) {
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

const showTooltip = (building: Building, event: MouseEvent) => {
  tooltip.visible = true;
  tooltip.building = building;
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