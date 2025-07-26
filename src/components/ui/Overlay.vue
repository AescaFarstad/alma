<template>
  <div id="ui-overlay">
    <SelectedBuildings />
    <div id="controls">
      <button @click="toggleLayer('buildings')">Buildings</button>
      <button @click="toggleLayer('roads')">Roads</button>
      <button @click="toggleLayer('footpaths')">Footpaths</button>
    </div>
    <div id="fps-display" v-if="fpsMetrics">
      {{ fpsMetrics.currentFPS }}|{{ fpsMetrics.averageFPS }}|{{ fpsMetrics.maxFrameTime }}
    </div>
    <div id="info-panel">
      <div>{{ props.mouseCoordinates.lng.toFixed(1) }}, {{ props.mouseCoordinates.lat.toFixed(1) }}</div>
      <div>{{ formatBounds(props.mapBounds) }}</div>
      <div v-if="props.zoomLevel !== null">Zoom: {{ props.zoomLevel.toFixed(2) }}</div>
    </div>
    <div id="measurement-panel" v-if="props.measurementDistance">
      {{ props.measurementDistance.toFixed(1) }}m
    </div>
    <div id="feature-info-panel" v-if="props.selectedFeatureInfo">
      <h3>Feature Information</h3>
      <pre>{{ props.selectedFeatureInfo }}</pre>
    </div>
  </div>
</template>

<script setup lang="ts">
import { defineProps, defineEmits, inject, type PropType } from 'vue';
import type { FPSMetrics } from '../../logic/FPSCounter';
import SelectedBuildings from './SelectedBuildings.vue';

// Inject the game state provided in main.ts
const fpsMetrics = inject<FPSMetrics>('fpsMetrics');

const props = defineProps({
  mouseCoordinates: {
    type: Object,
    default: null
  },
  mapBounds: {
    type: String,
    default: ''
  },
  mapCenter: {
    type: Object as PropType<{ lng: number, lat: number } | null>,
    default: null
  },
  selectedFeatureInfo: {
    type: Object,
    default: null
  },
  measurementDistance: {
    type: Number as PropType<number | null>,
    default: null
  },
  zoomLevel: {
    type: Number as PropType<number | null>,
    default: null
  }
});

const emit = defineEmits(['map-event']);

const toggleLayer = (layerId: 'buildings' | 'roads' | 'footpaths') => {
  emit('map-event', { type: 'toggle-layer', payload: { layerId } });
};

const formatBounds = (bounds: string) => {
  if (!bounds) return '';
  
  // Parse bounds string to extract coordinates
  const match = bounds.match(/\[(-?\d+\.?\d*), (-?\d+\.?\d*)\] - \[(-?\d+\.?\d*), (-?\d+\.?\d*)\]/);
  if (!match) return bounds;
  
  const [, lng1, lat1, lng2, lat2] = match;
  return `[${parseFloat(lng1).toFixed(0)},${parseFloat(lat1).toFixed(0)}]-[${parseFloat(lng2).toFixed(0)},${parseFloat(lat2).toFixed(0)}]`;
};
</script>

<style>
#ui-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none; /* Let map events pass through */
  color: #f0f0f0;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
  font-size: 12px;
}

#ui-overlay > * {
  pointer-events: auto; /* But allow interaction with UI elements */
}

#controls {
  position: absolute;
  top: 4px;
  left: 4px;
  background: rgba(33, 33, 33, 0.9);
  padding: 4px;
  border-radius: 4px;
  z-index: 1;
  display: flex;
  gap: 4px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.5);
  align-items: center;
}

#controls button {
    background-color: #4f4f4f;
    color: #f5f5f5;
    border: none;
    border-radius: 3px;
    padding: 4px 8px;
    cursor: pointer;
    transition: background-color 0.3s ease;
    font-weight: 500;
    font-size: 11px;
}

#controls button:hover {
    background-color: #616161;
}

#fps-display {
  position: absolute;
  top: 4px;
  right: 4px;
  background: rgba(33, 33, 33, 0.9);
  padding: 4px 6px;
  border-radius: 4px;
  z-index: 1;
  border: 1px solid rgba(255, 255, 255, 0.1);
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.5);
  font-family: monospace;
  font-size: 11px;
  letter-spacing: 0.5px;
}

#info-panel {
  position: absolute;
  bottom: 4px;
  left: 4px;
  background: rgba(33, 33, 33, 0.9);
  padding: 4px 6px;
  border-radius: 4px;
  z-index: 1;
  border: 1px solid rgba(255, 255, 255, 0.1);
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.5);
  font-family: monospace;
  font-size: 11px;
  line-height: 1.2;
}

#measurement-panel {
  position: absolute;
  bottom: 4px;
  left: 150px;
  background: rgba(33, 33, 33, 0.9);
  padding: 4px 6px;
  border-radius: 4px;
  z-index: 1;
  border: 1px solid rgba(255, 255, 255, 0.1);
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.5);
  font-family: monospace;
  font-size: 11px;
  line-height: 1.2;
}

#feature-info-panel {
  position: absolute;
  bottom: 10px;
  right: 10px;
  background: rgba(33, 33, 33, 0.9);
  padding: 12px;
  border-radius: 6px;
  z-index: 1;
  max-width: 300px;
  max-height: 200px;
  overflow: auto;
  border: 1px solid rgba(255, 255, 255, 0.1);
  box-shadow: 0 2px 8px rgba(0,0,0,0.4);
}
</style>
