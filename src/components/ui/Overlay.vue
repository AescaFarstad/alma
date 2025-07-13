<template>
  <div id="ui-overlay">
    <div id="controls">
      <button @click="toggleLayer('footways')">Footways</button>
      <button @click="toggleLayer('steps')">Steps</button>
      <button @click="toggleFill('buildings')">Roofs</button>
    </div>
    <div id="info-panel">
      <div>Coords: {{ mouseCoordinates.lng.toFixed(4) }}, {{ mouseCoordinates.lat.toFixed(4) }}</div>
      <div>Bounds: {{ mapBounds }}</div>
    </div>
    <div id="feature-info-panel" v-if="selectedFeatureInfo">
      <h3>Feature Information</h3>
      <pre>{{ selectedFeatureInfo }}</pre>
    </div>
    <div id="game-state-panel">
        <h3>Game State</h3>
        <div>Last command: {{ gameState?.uiState.lastCommand }}</div>
        <button @click="doSomething">Do Something</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, defineProps, defineEmits, inject } from 'vue';
import type { GameState } from '../../logic/GameState';
import { globalInputQueue } from '../../logic/GameState';
import type { CmdDoSomething } from '../../logic/input/InputCommands';

// Inject the game state provided in main.ts
const gameState = inject<GameState>('gameState');

const props = defineProps({
  mouseCoordinates: {
    type: Object,
    default: () => ({ lng: 0, lat: 0 })
  },
  mapBounds: {
    type: String,
    default: ''
  },
  selectedFeatureInfo: {
    type: Object,
    default: null
  }
});

const emit = defineEmits(['toggle-layer', 'toggle-fill']);

const showFootways = ref(true);
const showSteps = ref(true);
const showBuildingFill = ref(true);

const toggleLayer = (layerId: 'footways' | 'steps') => {
  if (layerId === 'footways') {
    showFootways.value = !showFootways.value;
    emit('toggle-layer', { layerId, visible: showFootways.value });
  } else if (layerId === 'steps') {
    showSteps.value = !showSteps.value;
    emit('toggle-layer', { layerId, visible: showSteps.value });
  }
};

const toggleFill = (layerId: 'buildings') => {
  if (layerId === 'buildings') {
    showBuildingFill.value = !showBuildingFill.value;
    emit('toggle-fill', { layerId, visible: showBuildingFill.value });
  }
};

const doSomething = () => {
    const command: CmdDoSomething = {
        name: 'CmdDoSomething',
        payload: `Hello from the UI at ${new Date().toLocaleTimeString()}`
    };
    globalInputQueue.push(command);
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
}

#ui-overlay > * {
  pointer-events: auto; /* But allow interaction with UI elements */
}

#controls {
  position: absolute;
  top: 10px;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(255, 255, 255, 0.8);
  padding: 5px;
  border-radius: 3px;
  z-index: 1;
  display: flex;
  gap: 5px;
}

#info-panel {
  position: absolute;
  bottom: 10px;
  left: 10px;
  background: rgba(255, 255, 255, 0.8);
  padding: 5px;
  border-radius: 3px;
  z-index: 1;
}

#feature-info-panel {
  position: absolute;
  bottom: 10px;
  right: 10px;
  background: rgba(255, 255, 255, 0.8);
  padding: 10px;
  border-radius: 5px;
  z-index: 1;
  max-width: 300px;
  max-height: 200px;
  overflow: auto;
}

#game-state-panel {
    position: absolute;
    top: 10px;
    right: 10px;
    background: rgba(255, 255, 255, 0.8);
    padding: 10px;
    border-radius: 5px;
    z-index: 1;
}
</style> 