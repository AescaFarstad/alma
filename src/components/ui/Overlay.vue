<template>
  <div id="ui-overlay">
    <div id="left-panel">
      <SelectedBuildings />
      <DebugTools />
      <AddAgentDebug />
    </div>
    <div id="controls">
      <button @click="handleButtonClick($event, () => toggleLayer('buildings'))">Buildings</button>
      <button @click="handleButtonClick($event, () => toggleLayer('roads'))">Roads</button>
      <button @click="handleButtonClick($event, () => toggleLayer('footpaths'))">Footpaths</button>
      <button @click="handleButtonClick($event, () => drawNavmesh())">Draw Navmesh</button>
      <button @click="handleButtonClick($event, () => findCorridors())">Find Corridors</button>
      <button @click="handleButtonClick($event, () => buildPath())">Build Path</button>
      <button @click="handleButtonClick($event, () => drawNavGrid(1))">Draw Grid 1</button>
      <button @click="handleButtonClick($event, () => drawNavGrid(2))">Draw Grid 2</button>
      <button @click="handleButtonClick($event, () => copyAgentState())">Copy Agent State</button>
      <TimeControls />
    </div>
    <div id="fps-display" v-if="fpsMetrics">
      {{ fpsMetrics.currentFPS }}|{{ fpsMetrics.averageFPS }}|{{ fpsMetrics.maxFrameTime }}
    </div>
    <div id="agent-counter" v-if="props.agentCount !== null">
      Agents: {{ props.agentCount }}
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
    <AvatarState :avatar="props.avatar" />
  </div>
</template>

<script setup lang="ts">
import { defineProps, defineEmits, inject, type PropType } from 'vue';
import type { FPSMetrics } from '../../logic/FPSCounter';
import SelectedBuildings from './SelectedBuildings.vue';
import DebugTools from './DebugTools.vue';
import AddAgentDebug from './AddAgentDebug.vue';
import AvatarState from './AvatarState.vue';
import type { Avatar, GameState } from '../../logic/GameState';
import TimeControls from './TimeControls.vue';

// Inject the game state provided in main.ts
const fpsMetrics = inject<FPSMetrics>('fpsMetrics');
const gameState = inject<GameState>('gameState');

const copyAgentState = () => {
  if (gameState && gameState.agents.length > 0) {
    const agentState = JSON.stringify(gameState.agents, null, 2);
    navigator.clipboard.writeText(agentState);
  }
};

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
  },
  avatar: {
    type: Object as PropType<Avatar | null>,
    default: null
  },
  agentCount: {
    type: Number as PropType<number | null>,
    default: null
  }
});

const emit = defineEmits(['map-event']);

const handleButtonClick = (event: MouseEvent, action: () => void) => {
  (event.currentTarget as HTMLElement)?.blur();
  action();
};

const toggleLayer = (layerId: 'buildings' | 'roads' | 'footpaths') => {
  emit('map-event', { type: 'toggle-layer', payload: { layerId } });
};

const drawNavmesh = () => {
  emit('map-event', { type: 'draw-navmesh', payload: {} });
};

const findCorridors = () => {
  emit('map-event', { type: 'find-corridors', payload: {} });
};

const buildPath = () => {
  emit('map-event', { type: 'build-path', payload: {} });
};

const drawNavGrid = (pattern: number) => {
  emit('map-event', { type: 'draw-nav-grid', payload: { pattern } });
};

const clearDebugVisuals = () => {
  emit('map-event', { type: 'clear-debug', payload: {} });
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

#left-panel {
  position: absolute;
  top: 40px;
  left: 4px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  z-index: 1;
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

#agent-counter {
  position: absolute;
  top: 24px;
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
