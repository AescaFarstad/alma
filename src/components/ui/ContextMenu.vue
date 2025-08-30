<template>
  <div v-if="visible" class="context-menu" :style="{ top: y + 'px', left: x + 'px' }">
  <ul>
    <li @click="addPointMark">Add Point Mark</li>
    <li @click="moveNearestPointMark">Move nearest Point mark</li>
    <li @click="copyCoordinates">Copy coords</li>
    <li @click="copyCoordinatesJSON">Copy coords J</li>
    <li @click="copyAgentState">Copy Agent State</li>
    <li @click="copyWAgentState">Copy WAgent State</li>
    <li @click="toggleAgentDebug">Toggle Agent Debug</li>
    <li @click="drawTriangles">Draw Triangles</li>
  </ul>
  </div>
</template>

<script setup lang="ts">
import { defineProps, defineEmits, inject, ref, reactive, watch } from 'vue';
import type { GameState } from '../../logic/GameState';
import { WAgent, serialize_wagent } from '../../logic/WAgent';
import { SceneState } from '../../logic/drawing/SceneState';
import { usePointMarks } from '../../logic/composables/usePointMarks';
import { useNavmeshTrianglesDebug } from '../../logic/composables/useNavmeshTrianglesDebug';

const props = defineProps({
  visible: Boolean,
  x: Number,
  y: Number,
  coordinate: Object as () => { lng: number; lat: number },
});

const emit = defineEmits(['hide']);

const gameState = inject<GameState>('gameState');
const sceneState = inject<SceneState>('sceneState');

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

function customStringify(obj: any): string {
  // Handle circular references but preserve full arrays
  const seen = new WeakSet();
  const replacer = (key: string, value: any) => {
  if (typeof value === "object" && value !== null) {
    if (seen.has(value)) {
    return "[Circular Reference]";
    }
    seen.add(value);
  }
  
  // Only limit extremely long strings, not arrays
  if (typeof value === "string" && value.length > 10000) {
    return value.substring(0, 10000) + "... (truncated)";
  }
  
  return value;
  };
  
  const json = JSON.stringify(obj, replacer, 2);
  const inlineSimpleArrays = json.replace(/(\[\s+)([\s\S]+?)(\s+\])/g, (match, open, content, close) => {
  const flattened = content.trim().replace(/\s*\n\s*/g, ' ');
  if (/^(\d+(,\s*)?)+$/.test(flattened) || /^(".*?"(,\s*)?)+$/.test(flattened)) {
    return `[ ${flattened} ]`;
  }
  return match;
  });
  const inlineCoords = inlineSimpleArrays.replace(
  /\{\s+"x": ([^,]+),\s+"y": ([^}]+)\s+\}/g,
  (match, x, y) => `{ "x": ${x.trim()}, "y": ${y.trim()} }`
  );
  return inlineCoords;
}

const copyAgentState = () => {
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
  try {
    // Create a complete copy using JSON serialization to capture ALL properties automatically
    // This will include any new properties added to the Agent class without manual updates
    const completeAgentState = JSON.parse(JSON.stringify(nearestAgent));
    
    const agentState = customStringify(completeAgentState);
    navigator.clipboard.writeText(agentState).catch((err) => {
    console.error('Could not copy agent state: ', err);
    });
  } catch (error) {
    console.error('Error creating agent state copy:', error);
    // Fallback: just copy basic info
    const basicInfo = `Agent ID: ${nearestAgent.id}, Position: (${nearestAgent.coordinate.x}, ${nearestAgent.coordinate.y}), NextCorner: (${nearestAgent.nextCorner.x}, ${nearestAgent.nextCorner.y}), NextCornerTri: ${nearestAgent.nextCornerTri}`;
    navigator.clipboard.writeText(basicInfo);
  }
  }

  emit('hide');
};

const copyWAgentState = () => {
  if (!gameState || !props.coordinate) return;

  const { lng, lat } = props.coordinate;
  let nearestAgent: WAgent | null = null;
  let minDistance = Infinity;

  const wasm_agents = gameState.wasm_agents;
  if (!wasm_agents.positions) {
  console.error("WASM agents not initialized");
  emit('hide');
  return;
  }

  // Find nearest WAgent
  for (const agent of gameState.wagents) {
  const idx = agent.idx;
  const agentX = wasm_agents.positions[idx * 2];
  const agentY = wasm_agents.positions[idx * 2 + 1];

  const distance = Math.sqrt(Math.pow(agentX - lng, 2) + Math.pow(agentY - lat, 2));
  if (distance < minDistance) {
    minDistance = distance;
    nearestAgent = agent;
  }
  }

  if (nearestAgent) {
  const state = serialize_wagent(gameState, nearestAgent.idx);

  if (state) {
    const agentState = customStringify(state);
    navigator.clipboard.writeText(agentState).catch((err) => {
    console.error('Could not copy agent state: ', err);
    });
  }
  }

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