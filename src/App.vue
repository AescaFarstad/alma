<template>
  <div id="map-container" @keydown="handleKeyDown" @keyup="handleKeyUp" tabindex="0">
    <Map ref="mapComponent" @map-event="handleMapEvent" :layer-visibility="layerVisibility" />
    <Overlay
      @map-event="handleMapEvent"
      :mouse-coordinates="mouseCoordinates"
      :map-bounds="mapBounds"
      :selected-feature-info="selectedFeatureInfo"
      :map-center="mapCenter"
      :measurement-distance="measurementDistance"
      :zoom-level="zoomLevel"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, provide, inject, reactive, onMounted, onUnmounted } from 'vue';
import Map from './components/map/Map.vue';
import Overlay from './components/ui/Overlay.vue';
import { globalInputQueue } from './logic/Model';
import type { MouseCoordinates } from './types.ts';
import type { CmdInput } from './logic/input/InputCommands';
import { mapInstance } from './map_instance';
import VectorTileLayer from 'ol/layer/VectorTile';
import type { GameState } from './logic/GameState';
import type { FPSMetrics } from './logic/FPSCounter';
import Feature from 'ol/Feature';
import { PixiLayer } from './logic/Pixie';
import { SceneState } from './logic/drawing/SceneState';

const gameState = inject<GameState>('gameState');
const fpsMetrics = inject<FPSMetrics>('fpsMetrics');
const sceneState = inject<SceneState>('sceneState');

const mapComponent = ref<{ pixieLayer: PixiLayer | null } | null>(null);
const mapReady = ref(false);
const mapCenter = ref<{ lng: number, lat: number } | null>(null);

const mouseCoordinates = ref<MouseCoordinates>({ lng: 0, lat: 0 });
const mapBounds = ref('');
const selectedFeatureInfo = ref<any>(null);
const zoomLevel = ref<number | null>(null);

const measurementStartPoint = ref<MouseCoordinates | null>(null);
const measurementDistance = ref<number | null>(null);

const layerVisibility = reactive({
  buildings: true,
  roads: true,
  footpaths: true,
});

const handleMapEvent = (event: { type: string, payload: any }) => {
  if (event.type === 'bounds-updated') {
    const sw = event.payload._sw;
    const ne = event.payload._ne;
    mapBounds.value = `${sw.lng.toFixed()}, ${sw.lat.toFixed()} | ${ne.lng.toFixed()}, ${ne.lat.toFixed()}`;
  } else if (event.type === 'feature-selected') {
    selectedFeatureInfo.value = event.payload;
  } else if (event.type === 'mouse-moved') {
    mouseCoordinates.value = event.payload;
    if (measurementStartPoint.value) {
      const dx = mouseCoordinates.value.lng - measurementStartPoint.value.lng;
      const dy = mouseCoordinates.value.lat - measurementStartPoint.value.lat;
      measurementDistance.value = Math.sqrt(dx * dx + dy * dy);
      if (sceneState) {
        sceneState.setMeasurementLine(measurementStartPoint.value, mouseCoordinates.value);
      }
    }
  } else if (event.type === 'command') {
    globalInputQueue.push(event.payload as CmdInput);
  } else if (event.type === 'map-ready') {
    mapReady.value = true;
  } else if (event.type === 'center-updated') {
    mapCenter.value = event.payload;
  } else if (event.type === 'zoom-updated') {
    zoomLevel.value = event.payload;
  } else if (event.type === 'toggle-layer') {
    const layerId = event.payload.layerId as 'buildings' | 'roads' | 'footpaths';
    layerVisibility[layerId] = !layerVisibility[layerId];
    
    // In combined mode, we need to refresh the layer source to apply the style changes
    const combinedLayer = mapInstance.map?.getLayers().getArray().find(layer => layer.get('name') === 'combined') as VectorTileLayer<Feature>;
    if (combinedLayer) {
      combinedLayer.getSource()?.refresh();
    }
  }
};

const handleKeyDown = (event: KeyboardEvent) => {
  if (event.key === 'm' && !measurementStartPoint.value) {
    measurementStartPoint.value = { ...mouseCoordinates.value };
  }
};

const handleKeyUp = (event: KeyboardEvent) => {
  if (event.key === 'm') {
    measurementStartPoint.value = null;
    measurementDistance.value = null;
    if (sceneState) {
      sceneState.clearMeasurementLine();
    }
  }
};

onMounted(() => {
  window.addEventListener('keydown', handleKeyDown);
  window.addEventListener('keyup', handleKeyUp);
});

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeyDown);
  window.removeEventListener('keyup', handleKeyUp);
});

provide('gameState', gameState);
provide('fpsMetrics', fpsMetrics);
provide('pixieLayer', mapComponent.value?.pixieLayer);
</script>

<style>
#map-container {
  position: relative;
  width: 100vw;
  height: 100vh;
  outline: none;
}
</style> 