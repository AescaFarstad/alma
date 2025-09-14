<template>
  <div v-if="count !== null" class="agent-counter-stack">
    <div class="agent-counter">
      <button class="clear-btn" @click="clearAgentsAndWagents" title="Delete all agents and wagents">💥</button>
      Agents: {{ count }}
    </div>
    <div v-if="protoEntries.length" class="proto-pills">
      <span v-for="([proto, c], i) in protoEntries" :key="proto" class="pill" :title="`proto ${proto}`">{{ proto }}] {{ c }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, inject, ref, onMounted, onBeforeUnmount, defineProps, type PropType } from 'vue';
import type { GameState } from '../../../logic/GameState';
import { WasmFacade } from '../../../logic/WasmFacade';
import { subscribeFrameUpdate } from '../../../logic/FrameUpdate';

const props = defineProps({
  agentCount: { type: Number as PropType<number | null>, default: null }
});

const gameState = inject<GameState>('gameState');

// Local per-frame tick to force reactive recomputation
const uiFrame = ref(0);
let unsubscribe: null | (() => void) = null;

onMounted(() => {
  unsubscribe = subscribeFrameUpdate(() => {
    uiFrame.value++;
  });
});

onBeforeUnmount(() => {
  unsubscribe?.();
  unsubscribe = null;
});

const count = computed(() => {
  // Recompute every frame unconditionally
  void uiFrame.value;
  if (!gameState) return null;
  return (gameState.agents?.length || 0) + (gameState.wagents?.length || 0);
});

// Brief per-proto counts for existing agents (TS + WASM), only alive
const protoEntries = computed(() => {
  // Force recompute each frame
  void uiFrame.value;
  if (!gameState) return [] as Array<[number, number]>;

  const map = new Map<number, number>();

  // Count TS agents by Agent.proto
  if (gameState.agents) {
    for (const a of gameState.agents) {
      if (!(a as any).isAlive) continue;
      const p = (a as any).proto as number | undefined;
      if (p === undefined || p === null) continue;
      map.set(p, (map.get(p) || 0) + 1);
    }
  }

  // Count WASM agents by wasm_agents.proto[idx] for each existing wrapper
  if (gameState.wagents && gameState.wasm_agents && (gameState.wasm_agents as any).proto) {
    const protoArr = (gameState.wasm_agents as any).proto as Int32Array;
    const aliveArr = (gameState.wasm_agents as any).is_alive as Uint8Array | undefined;
    for (const w of gameState.wagents) {
      const idx = (w as any).idx as number | undefined;
      if (idx === undefined || idx < 0 || idx >= protoArr.length) continue;
      if (aliveArr && !aliveArr[idx]) continue;
      const p = protoArr[idx];
      map.set(p, (map.get(p) || 0) + 1);
    }
  }

  // Sort by proto asc for stable display
  return Array.from(map.entries()).sort((a, b) => a[0] - b[0]);
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
.agent-counter-stack {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4px;
}

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

.proto-pills {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  flex-wrap: wrap;
  gap: 2px;
}

.pill {
  background: rgba(33, 33, 33, 0.9);
  border: 1px solid rgba(255, 255, 255, 0.1);
  box-shadow: 0 2px 6px rgba(0,0,0,0.5);
  color: #f0f0f0;
  border-radius: 4px;
  padding: 2px 6px;
  font-size: 11px;
  line-height: 1.2;
  white-space: nowrap;
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
