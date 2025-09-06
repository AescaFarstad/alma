<template>
  <div v-if="count !== null" class="agent-counter">
    <button class="clear-btn" @click="clearAgentsAndWagents" title="Delete all agents and wagents">💥</button>
    Agents: {{ count }}
  </div>
</template>

<script setup lang="ts">
import { computed, inject, type Ref, defineProps, type PropType } from 'vue';
import type { GameState } from '../../../logic/GameState';
import { WasmFacade } from '../../../logic/WasmFacade';

const props = defineProps({
  agentCount: { type: Number as PropType<number | null>, default: null }
});

const injectedCount = inject<Ref<number> | null>('agentCount', null);
const gameState = inject<GameState>('gameState');

const count = computed(() => {
  if (props.agentCount !== null) return props.agentCount;
  if (injectedCount && injectedCount.value !== undefined) return injectedCount.value;
  if (gameState) return (gameState.agents?.length || 0) + (gameState.wagents?.length || 0);
  return null;
});

const clearAgentsAndWagents = () => {
  if (!gameState) return;
  // Clear TypeScript agents
  if (gameState.agents) gameState.agents.length = 0;
  // Clear WASM agents wrapper list
  if (gameState.wagents) gameState.wagents.length = 0;
  // Clear selected WASM agent index if API is available
  if (WasmFacade && typeof WasmFacade.setSelectedWAgentIdx === 'function') {
    WasmFacade.setSelectedWAgentIdx(null);
  }
};
</script>

<style scoped>
.agent-counter {
  background: rgba(33, 33, 33, 0.9);
  padding: 4px 6px;
  border-radius: 4px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  box-shadow: 0 2px 6px rgba(0,0,0,0.5);
  font-family: monospace;
  font-size: 11px;
  letter-spacing: 0.5px;
}

.clear-btn {
  background-color: #4f4f4f;
  color: #f5f5f5;
  border: none;
  border-radius: 3px;
  padding: 2px 6px;
  cursor: pointer;
  margin-left: 6px;
  font-weight: 600;
  font-size: 11px;
}

.clear-btn:hover { background-color: #616161; }
</style>
