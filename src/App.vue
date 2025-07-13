<template>
  <div id="map-container">
    <Map ref="mapComponent" @map-event="handleMapEvent" />
    <Overlay
      :mouse-coordinates="mouseCoordinates"
      :map-bounds="mapBounds"
      :selected-feature-info="selectedFeatureInfo"
      :map-center="mapCenter"
      @toggle-layer="handleToggleLayer"
      @toggle-fill="handleToggleFill"
      @show-coordinates="handleShowCoordinates"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, inject, watch } from 'vue';
import Map from './components/map/Map.vue';
import Overlay from './components/ui/Overlay.vue';
import { globalInputQueue } from './logic/Model';
import type { CmdInput } from './logic/input/InputCommands';
import { GameState } from './logic/GameState';

const mapComponent = ref<InstanceType<typeof Map> | null>(null);
const gameState = inject<GameState>('gameState')!;
const mapReady = ref(false);
const mapCenter = ref<{ lng: number, lat: number } | null>(null);

const mouseCoordinates = ref({ lng: 0, lat: 0 });
const mapBounds = ref('');
const selectedFeatureInfo = ref<any>(null);

watch(() => [...gameState.uiState.mapBuildingColorChanges], (newChanges) => {
  if (mapReady.value && newChanges.length > 0) {
    mapComponent.value?.setBuildingColors(newChanges);
  }
});

const handleShowCoordinates = (coords: { x: number; y: number }) => {
  mapComponent.value?.showCoordinates(coords);
};

const handleMapEvent = (event: { type: string, payload: any }) => {
  if (event.type === 'bounds-updated') {
    const bounds = event.payload;
    mapBounds.value = `SW(${bounds.getSouthWest().lng.toFixed(4)}, ${bounds.getSouthWest().lat.toFixed(4)}), NE(${bounds.getNorthEast().lng.toFixed(4)}, ${bounds.getNorthEast().lat.toFixed(4)})`;
  } else if (event.type === 'feature-selected') {
    selectedFeatureInfo.value = event.payload;
  } else if (event.type === 'mouse-moved') {
    mouseCoordinates.value = event.payload;
  } else if (event.type === 'command') {
    globalInputQueue.push(event.payload as CmdInput);
  } else if (event.type === 'map-ready') {
    mapReady.value = true;
    const initialChanges = gameState.uiState.mapBuildingColorChanges;
    if (initialChanges.length > 0) {
      mapComponent.value?.setBuildingColors(initialChanges);
    }
  } else if (event.type === 'center-updated') {
    mapCenter.value = event.payload;
  }
};

const handleToggleLayer = ({ layerId, visible }: { layerId: 'footways' | 'steps', visible: boolean }) => {
  mapComponent.value?.toggleLayer(layerId, visible);
};

const handleToggleFill = (event: { layerId: 'buildings'; visible: boolean }) => {
  mapComponent.value?.toggleFill(event.layerId, event.visible);
};

</script>

<style>
#map-container {
  position: relative;
  width: 100vw;
  height: 100vh;
}
</style> 