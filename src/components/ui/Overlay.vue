<template>
  <div id="ui-overlay">
    <div id="controls">
      <button @click="toggleLayer('footways')">Footways</button>
      <button @click="toggleLayer('steps')">Steps</button>
      <button @click="toggleFill('buildings')">Roofs</button>
      <button @click="verifyBuildings">Verify Buildings</button>
      <div class="building-search-container">
        <input v-model="buildingIdToFind" placeholder="Building ID" @keyup.enter="findBuilding" />
        <button @click="findBuilding">Find</button>
      </div>
      <div class="coord-search-container">
        <input v-model="coordinateStringToFind" placeholder='{"x":...,"y":...}' @keyup.enter="findCoordinates" />
        <button @click="findCoordinates">Find</button>
      </div>
    </div>
    <div id="info-panel">
      <div>Coords: {{ props.mouseCoordinates.lng.toFixed(4) }}, {{ props.mouseCoordinates.lat.toFixed(4) }}</div>
      <div>Bounds: {{ props.mapBounds }}</div>
    </div>
    <div id="feature-info-panel" v-if="props.selectedFeatureInfo">
      <h3>Feature Information</h3>
      <pre>{{ props.selectedFeatureInfo }}</pre>
    </div>
    <div id="building-info-panel" v-if="gameState?.uiState.selectedBuilding">
        <h3>Selected Building</h3>
        <div><strong>ID:</strong> {{ gameState.uiState.selectedBuilding.id }}</div>
        <div><strong>Map ID:</strong> {{ gameState.uiState.selectedBuilding.mapId }}</div>
        <div><strong>Original Map ID:</strong> {{ gameState.uiState.selectedBuilding.originalMapId }}</div>
        <div><strong>Team:</strong> {{ gameState.uiState.selectedBuilding.team }}</div>
        <div><strong>Floors:</strong> {{ gameState.uiState.selectedBuilding.floors }}</div>
        <div><strong>Floor Size:</strong> {{ gameState.uiState.selectedBuilding.floorSize }}</div>
        <div><strong>Center:</strong> ({{ gameState.uiState.selectedBuilding.center.x.toFixed(4) }}, {{ gameState.uiState.selectedBuilding.center.y.toFixed(4) }})</div>
        <div><strong>Disabled Until:</strong> {{ gameState.uiState.selectedBuilding.disabledUntil }}</div>
        
        <h4>Slots ({{ gameState.uiState.selectedBuilding.slots.length }})</h4>
        <div v-for="(slot, index) in gameState.uiState.selectedBuilding.slots" :key="index" class="slot-info">
            <div><strong>Slot {{ index }}:</strong> Type {{ slot.type }}</div>
            <div v-if="slot.content" class="slot-content">
                <em>Module:</em> {{ slot.contentName || slot.content }}
            </div>
            <div v-if="slot.occupant" class="slot-occupant">
                <em>Occupant:</em> {{ slot.occupant }}
            </div>
        </div>
        
        <h4 v-if="gameState.uiState.selectedBuilding.outputs.length > 0">Outputs</h4>
        <div v-for="output in gameState.uiState.selectedBuilding.outputs" :key="output.resource" class="output-info">
            <div><strong>{{ output.resource }}:</strong> {{ output.income.toFixed(2) }} {{ output.isStorage ? '(storage)' : '(income)' }}</div>
        </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, defineProps, defineEmits, inject, type PropType } from 'vue';
import type { GameState } from '../../logic/GameState';
import { globalInputQueue } from '../../logic/Model';
import type { CmdQueryBuilding, CmdVerifyBuildings } from '../../logic/input/InputCommands';

// Inject the game state provided in main.ts
const gameState = inject<GameState>('gameState');

const buildingIdToFind = ref('');
const coordinateStringToFind = ref('');

const verifyBuildings = () => {
  if (props.mapCenter && gameState?.uiState.currentPlayerId) {
    const command: CmdVerifyBuildings = { 
      name: 'CmdVerifyBuildings', 
      center: props.mapCenter,
      playerId: gameState.uiState.currentPlayerId,
    };
    globalInputQueue.push(command);
  } else {
    console.warn("Map center is not available to verify buildings.");
  }
};

const findBuilding = () => {
  if (buildingIdToFind.value && gameState?.uiState.currentPlayerId) {
    const building = gameState.buildingsById[buildingIdToFind.value];
    if (building) {
      const command: CmdQueryBuilding = { 
        name: 'CmdQueryBuilding', 
        mapId: building.mapId,
        playerId: gameState.uiState.currentPlayerId,
      };
      globalInputQueue.push(command);
    }
    buildingIdToFind.value = '';
  }
};

const findCoordinates = () => {
  if (coordinateStringToFind.value) {
    try {
      const coords = JSON.parse(coordinateStringToFind.value);
      if (coords && typeof coords.x === 'number' && typeof coords.y === 'number') {
        emit('show-coordinates', coords);
      }
    } catch (e) {
      console.error("Invalid coordinate format:", e);
    }
    coordinateStringToFind.value = '';
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
  }
});

const emit = defineEmits(['toggle-layer', 'toggle-fill', 'show-coordinates']);

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
}

#ui-overlay > * {
  pointer-events: auto; /* But allow interaction with UI elements */
}

#controls {
  position: absolute;
  top: 10px;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(33, 33, 33, 0.9);
  padding: 8px;
  border-radius: 6px;
  z-index: 1;
  display: flex;
  gap: 8px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
  align-items: center;
}

#controls .building-search-container {
  display: flex;
  margin-left: 16px;
}

#controls .building-search-container input {
    background-color: #2d2d2d;
    color: #f5f5f5;
    border: 1px solid #4f4f4f;
    border-radius: 4px;
    padding: 8px 12px;
    margin-right: 4px;
    width: 120px;
}

#controls .building-search-container input::placeholder {
    color: #a0a0a0;
}

#controls .building-search-container button {
    background-color: #4f4f4f;
    color: #f5f5f5;
    border: none;
    border-radius: 4px;
    padding: 8px 14px;
    cursor: pointer;
    transition: background-color 0.3s ease;
    font-weight: 500;
}

#controls .building-search-container button:hover {
    background-color: #616161;
}

#controls .coord-search-container {
  display: flex;
  margin-left: 16px;
}

#controls .coord-search-container input {
    background-color: #2d2d2d;
    color: #f5f5f5;
    border: 1px solid #4f4f4f;
    border-radius: 4px;
    padding: 8px 12px;
    margin-right: 4px;
    width: 200px;
}

#controls .coord-search-container input::placeholder {
    color: #a0a0a0;
}

#controls .coord-search-container button {
    background-color: #4f4f4f;
    color: #f5f5f5;
    border: none;
    border-radius: 4px;
    padding: 8px 14px;
    cursor: pointer;
    transition: background-color 0.3s ease;
    font-weight: 500;
}

#controls .coord-search-container button:hover {
    background-color: #616161;
}

#controls button {
    background-color: #4f4f4f;
    color: #f5f5f5;
    border: none;
    border-radius: 4px;
    padding: 8px 14px;
    cursor: pointer;
    transition: background-color 0.3s ease;
    font-weight: 500;
}

#controls button:hover {
    background-color: #616161;
}

#info-panel {
  position: absolute;
  bottom: 10px;
  left: 10px;
  background: rgba(33, 33, 33, 0.9);
  padding: 8px 12px;
  border-radius: 6px;
  z-index: 1;
  border: 1px solid rgba(255, 255, 255, 0.1);
  box-shadow: 0 2px 8px rgba(0,0,0,0.4);
  font-size: 0.9em;
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

#building-info-panel {
    position: absolute;
    top: 10px;
    left: 10px;
    background: rgba(33, 33, 33, 0.92);
    padding: 15px;
    border-radius: 8px;
    z-index: 1;
    max-width: 320px;
    max-height: calc(100vh - 20px);
    overflow-y: auto;
    border: 1px solid rgba(255, 255, 255, 0.1);
    box-shadow: 0 4px 12px rgba(0,0,0,0.5);
}

h3, h4 {
    color: #ffffff;
    border-bottom: 1px solid #4f4f4f;
    padding-bottom: 8px;
    margin-top: 0;
    margin-bottom: 12px;
}

.slot-info {
    margin: 8px 0;
    padding: 10px;
    background: rgba(255, 255, 255, 0.05);
    border-radius: 4px;
    border-left: 4px solid #4dabf7;
}

.slot-content, .slot-occupant {
    margin-left: 10px;
    font-style: italic;
}

.slot-content {
    color: #82c9ff;
}

.slot-occupant {
    color: #ffb48a;
}

.output-info {
    margin: 4px 0;
    padding: 6px 8px;
    background: rgba(255, 255, 255, 0.05);
    border-radius: 4px;
    font-size: 0.9em;
}
</style> 