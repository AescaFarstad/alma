<template>
  <div v-if="count !== null" class="agent-counter">
    Agents: {{ count }}
  </div>
</template>

<script setup lang="ts">
import { computed, inject, type Ref, defineProps, type PropType } from 'vue';
import type { GameState } from '../../../logic/GameState';

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
</style>

