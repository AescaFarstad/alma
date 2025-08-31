<template>
  <div class="panel">
    <button @click="click(() => toggleTsAgents())">{{ tsAgentsEnabled ? '🚫' : '👁' }} Agents</button>
    <button @click="click(() => toggleWasmAgents())">{{ wasmAgentsEnabled ? '🚫' : '👁' }} WAgents</button>
    <!-- <button @click="click(() => toggleAgentRenderMode())">{{ agentRenderMode === 'visual' ? 'Visual' : 'Sprite' }} Mode</button> -->
    <button @click="click(() => toggleWasmRender())">{{ wasmRenderEnabled ? '🚫' : '👁' }} WASM</button>
    <button @click="click(() => findCorridors())">pathfind</button>
    <button @click="click(() => spawnAgentFromJSON())">Spawn</button>
  </div>
</template>

<script setup lang="ts">
import { inject, ref, type Ref } from 'vue';
import type { GameState } from '../../../logic/GameState';
import type { AgentRenderingMode } from '../../../logic/drawing/AgentRenderer';
import { WasmFacade } from '../../../logic/WasmFacade';
import { usePathfinding } from '../../../logic/composables/usePathfinding';
import type { SceneState } from '../../../logic/drawing/SceneState';
import { createAgentWithConfig } from '../../../logic/agents/AgentSpawner';
import agentData from '../../../logic/agent-data.json';
import type { PixiLayer } from '../../../logic/Pixie';

const gameState = inject<GameState>('gameState');
const sceneState = inject<SceneState>('sceneState');
const pixieLayer = inject<Ref<PixiLayer | null> | undefined>('pixieLayer');
const wasmRenderEnabled = inject<Ref<boolean>>('wasmRenderEnabled')!;

const agentRenderMode = ref<AgentRenderingMode>('sprite');
const tsAgentsEnabled = ref(true);
const wasmAgentsEnabled = ref(false);

const { findCorridors } = usePathfinding(gameState, sceneState);

const click = (action: () => void) => action();

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
  wasmRenderEnabled.value = !wasmRenderEnabled.value;
  if (!wasmRenderEnabled.value && WasmFacade._sprite_renderer_clear) {
    WasmFacade._sprite_renderer_clear();
  }
};

const spawnAgentFromJSON = () => {
  if (!gameState) return;
  try {
    const newAgent = createAgentWithConfig(agentData as any);
    gameState.agents.push(newAgent);
    console.log('Spawned agent from JSON:', newAgent);
  } catch (error) {
    console.error('Failed to spawn agent from JSON:', error);
  }
};
</script>

<style scoped>
.panel {
  background: rgba(33, 33, 33, 0.9);
  padding: 4px;
  border-radius: 4px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  box-shadow: 0 2px 6px rgba(0,0,0,0.5);
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
}

button {
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

button:hover { background-color: #616161; }
</style>
