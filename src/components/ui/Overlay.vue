<template>
  <div id="ui-overlay">
  <div id="left-panel">
    <SelectedBuildings />
    <DebugTools />
    <AddAgentDebug />
  </div>
  <div id="controls">
    <!-- <button @click="handleButtonClick($event, () => toggleLayer('buildings'))">Buildings</button>
    <button @click="handleButtonClick($event, () => toggleLayer('roads'))">Roads</button>
    <button @click="handleButtonClick($event, () => toggleLayer('footpaths'))">Footpaths</button> -->
    <button @click="handleButtonClick($event, () => toggleTsAgents())">{{ tsAgentsEnabled ? 'Hide' : 'Show' }} TS Agents</button>
    <button @click="handleButtonClick($event, () => toggleWasmAgents())">{{ wasmAgentsEnabled ? 'Hide' : 'Show' }} WAgents</button>
    <button @click="handleButtonClick($event, () => toggleAgentRenderMode())">{{ agentRenderMode === 'visual' ? 'Visual' : 'Sprite' }} Mode</button>
    <button @click="handleButtonClick($event, () => toggleWasmRender())">{{ wasmRenderEnabled ? 'Hide' : 'Show' }} WASM</button>
    <button @click="handleButtonClick($event, () => drawNavmesh())">Navmesh</button>
    <button @click="handleButtonClick($event, () => findCorridors())">pathfind</button>
    <!-- <button @click="handleButtonClick($event, () => buildPath())">Build Path</button> -->
    <button @click="handleButtonClick($event, () => drawNavGrid(1))">Grid 1</button>
    <button @click="handleButtonClick($event, () => drawNavGrid(2))">Grid 2</button>
    <button @click="handleButtonClick($event, () => spawnAgentFromJSON())">Spawn</button>
    <!-- <button @click="handleButtonClick($event, () => copyAgentState())">Copy Agent State</button> -->
    <!-- <button @click="handleButtonClick($event, () => runPitBenchmark())">Test PiT</button> -->
    <TimeControls />
  </div>
  <div id="fps-display" v-if="fpsMetrics">
    {{ fpsMetrics.currentFPS }}|{{ fpsMetrics.averageFPS }}|{{ fpsMetrics.longAverageFPS }}|{{ fpsMetrics.maxFrameTime }}|{{ gameState?.gameTime.toFixed(1) }}
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
import { defineProps, defineEmits, inject, type PropType, ref, type Ref } from 'vue';
import type { FPSMetrics } from '../../logic/FPSCounter';
import SelectedBuildings from './SelectedBuildings.vue';
import DebugTools from './DebugTools.vue';
import AddAgentDebug from './AddAgentDebug.vue';
import AvatarState from './AvatarState.vue';
import type { Avatar, GameState } from '../../logic/GameState';
import TimeControls from './TimeControls.vue';
import type { AgentRenderingMode } from '../../logic/drawing/AgentRenderer';
import { runPointInTriangleBenchmark } from '../../logic/debug/PointInTriangleBenchmark';
import type { PixiLayer } from '../../logic/Pixie';
import { WasmFacade } from '../../logic/WasmFacade';
import { usePathfinding } from '../../logic/composables/usePathfinding';
import { useNavmeshDebug } from '../../logic/composables/useNavmeshDebug';
import { useNavmeshGridDebug } from '../../logic/composables/useNavmeshGridDebug';
import { SceneState } from '../../logic/drawing/SceneState';
import { createAgentWithConfig } from '../../logic/agents/AgentSpawner';
import agentData from '../../logic/agent-data.json';

// Inject the game state provided in main.ts
const fpsMetrics = inject<FPSMetrics>('fpsMetrics');
const gameState = inject<GameState>('gameState');
const sceneState = inject<SceneState>('sceneState');
const pixieLayer = inject<Ref<PixiLayer | null> | undefined>('pixieLayer');
const wasmRenderEnabled = inject<Ref<boolean>>('wasmRenderEnabled');

const agentRenderMode = ref<AgentRenderingMode>('sprite');
const tsAgentsEnabled = ref(true);
const wasmAgentsEnabled = ref(false);

const { findCorridors, buildPath } = usePathfinding(gameState, sceneState);
const { drawNavmesh } = useNavmeshDebug(gameState, sceneState);
const { drawNavGrid } = useNavmeshGridDebug(gameState, sceneState);

const spawnAgentFromJSON = () => {
  if (!gameState) return;
  
  try {
  // Create agent from the JSON data
  const newAgent = createAgentWithConfig(agentData as any);
  
  // Add to the agents array
  gameState.agents.push(newAgent);
  
  console.log('Spawned agent from JSON:', newAgent);
  } catch (error) {
  console.error('Failed to spawn agent from JSON:', error);
  }
};

const copyAgentState = () => {
  if (gameState && gameState.agents.length > 0) {
  const agentState = JSON.stringify(gameState.agents, null, 2);
  navigator.clipboard.writeText(agentState);
  }
};

const runPitBenchmark = () => {
  if (gameState) {
  runPointInTriangleBenchmark(gameState);
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

const toggleAgentRenderMode = () => {
  agentRenderMode.value = agentRenderMode.value === 'visual' ? 'sprite' : 'visual';
  if (pixieLayer?.value) {
  pixieLayer.value.setAgentRenderingMode(agentRenderMode.value);
  }
};

const toggleTsAgents = () => {
  tsAgentsEnabled.value = !tsAgentsEnabled.value;
  if (pixieLayer?.value) {
  pixieLayer.value.setTsAgentRenderingEnabled(tsAgentsEnabled.value);
  }
};

const toggleWasmAgents = () => {
  wasmAgentsEnabled.value = !wasmAgentsEnabled.value;
  if (pixieLayer?.value) {
  pixieLayer.value.setWasmAgentRenderingEnabled(wasmAgentsEnabled.value);
  }
};

const toggleWasmRender = () => {
  if (wasmRenderEnabled) {
  wasmRenderEnabled.value = !wasmRenderEnabled.value;
  if (!wasmRenderEnabled.value && WasmFacade._sprite_renderer_clear) {
    WasmFacade._sprite_renderer_clear();
  }
  }
};

const clearDebugVisuals = () => {
  emit('map-event', { type: 'clear-debug', payload: {} });
};

const formatBounds = (bounds: string) => {
  if (!bounds) return '';
  
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
