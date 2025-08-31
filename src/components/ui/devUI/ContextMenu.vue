<template>
  <div v-if="visible" class="context-menu" :style="{ top: y + 'px', left: x + 'px' }">
  <ul>
    <li @click="addPointMark">Add Point Mark</li>
    <li @click="moveNearestPointMark">Move nearest Point mark</li>
    <li @click="copyCoordinates">Copy coords</li>
    <li @click="copyCoordinatesJSON">Copy coords J</li>
    <li @click="copyAgentState">Copy Agent State</li>
    <li @click="copyWAgentState">Copy WAgent State</li>
    <li @click="selectWAgent">Select WAgent</li>
    <li @click="toggleAgentDebug">Toggle Agent Debug</li>
    <li @click="drawTriangles">Draw Triangles</li>
  </ul>
  </div>
</template>

<script setup lang="ts">
import { defineProps, defineEmits, inject, reactive, watch } from 'vue';
import type { GameState } from '../../../logic/GameState';
import { WAgent } from '../../../logic/WAgent';
import { SceneState } from '../../../logic/drawing/SceneState';
import { DynamicScene } from '../../../logic/drawing/DynamicScene';
import { WasmFacade } from '../../../logic/WasmFacade';
import { usePointMarks } from '../../../logic/composables/usePointMarks';
import { useNavmeshTrianglesDebug } from '../../../logic/composables/useNavmeshTrianglesDebug';
import { useAgentClipboard } from '../../../logic/composables/useAgentClipboard';

const props = defineProps({
  visible: Boolean,
  x: Number,
  y: Number,
  coordinate: Object as () => { lng: number; lat: number },
});

const emit = defineEmits(['hide']);

const gameState = inject<GameState>('gameState');
const sceneState = inject<SceneState>('sceneState');
const dynamicScene = inject<DynamicScene>('dynamicScene');

const localContextMenuState = reactive({
  coordinate: { lng: 0, lat: 0 },
  visible: false,
});

watch(() => props.coordinate, (newVal) => {
  if (newVal) {
  localContextMenuState.coordinate = newVal;
  }
});

const { addPointMark: addPointMarkComposable, moveNearestPointMark: moveNearestPointMarkComposable } = usePointMarks(
  gameState!,
  sceneState!,
  localContextMenuState
);
const { drawTriangles: drawDebugTriangles } = useNavmeshTrianglesDebug(gameState!, sceneState!);
const { copyAgentStateAtCoordinate, copyWAgentStateAtCoordinate } = useAgentClipboard(gameState!);

const addPointMark = () => {
  addPointMarkComposable();
  emit('hide');
};

const moveNearestPointMark = () => {
  moveNearestPointMarkComposable();
  emit('hide');
};

const copyCoordinates = () => {
  if (!props.coordinate) return;
  const { lng, lat } = props.coordinate;
  const textToCopy = `${lng}, ${lat}`;
  navigator.clipboard.writeText(textToCopy).catch((err) => {
  console.error('Could not copy text: ', err);
  });
  emit('hide');
};

const copyCoordinatesJSON = () => {
  if (!props.coordinate) return;
  const { lng, lat } = props.coordinate;
  const textToCopy = `{ x: ${lng}, y: ${lat} }`;
  navigator.clipboard.writeText(textToCopy).catch((err) => {
  console.error('Could not copy text: ', err);
  });
  emit('hide');
};

const copyAgentState = () => {
  if (!gameState || !props.coordinate) return;
  const { lng, lat } = props.coordinate;
  copyAgentStateAtCoordinate(lng, lat);
  emit('hide');
};

const copyWAgentState = () => {
  if (!gameState || !props.coordinate) return;
  const { lng, lat } = props.coordinate;
  copyWAgentStateAtCoordinate(lng, lat);
  emit('hide');
};

const toggleAgentDebug = () => {
  if (!gameState || !props.coordinate) return;

  const { lng, lat } = props.coordinate;
  let nearestAgent = null;
  let minDistance = Infinity;

  for (const agent of gameState.agents) {
  const distance = Math.sqrt(Math.pow(agent.coordinate.x - lng, 2) + Math.pow(agent.coordinate.y - lat, 2));
  if (distance < minDistance) {
    minDistance = distance;
    nearestAgent = agent;
  }
  }

  if (nearestAgent) {
  nearestAgent.debug = !nearestAgent.debug;
  }

  emit('hide');
};

const drawTriangles = () => {
  if (!props.coordinate) return;
  const { lng, lat } = props.coordinate;
  drawDebugTriangles({ x: lng, y: lat });
  emit('hide');
};

const selectWAgent = () => {
  if (!gameState || !props.coordinate || !dynamicScene) return;
  const { lng, lat } = props.coordinate;
  const wasm_agents = gameState.wasm_agents;
  if (!wasm_agents.positions) return;

  let nearest: WAgent | null = null;
  let minD2 = Infinity;
  for (const agent of gameState.wagents) {
    const idx = agent.idx;
    const ax = wasm_agents.positions[idx * 2];
    const ay = wasm_agents.positions[idx * 2 + 1];
    const dx = ax - lng;
    const dy = ay - lat;
    const d2 = dx * dx + dy * dy;
    if (d2 < minD2) {
      minD2 = d2;
      nearest = agent;
    }
  }
  if (nearest) {
    dynamicScene.selectedWAgentIdx = nearest.idx;
    dynamicScene.selectedWAgentCorridor = null;
    WasmFacade.setSelectedWAgentIdx?.(nearest.idx);
  }
  emit('hide');
};
</script>

<style scoped>
.context-menu {
  position: absolute;
  background: rgba(33, 33, 33, 0.9);
  border: 1px solid rgba(255, 255, 255, 0.1);
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.5);
  border-radius: 4px;
  z-index: 1000;
  color: #f0f0f0;
  font-size: 11px;
}

.context-menu ul {
  list-style: none;
  margin: 0;
  padding: 4px 0;
}

.context-menu li {
  padding: 4px 12px;
  cursor: pointer;
  transition: background-color 0.2s ease-in-out;
}

.context-menu li:hover {
  background-color: #4f4f4f;
}
</style> 
