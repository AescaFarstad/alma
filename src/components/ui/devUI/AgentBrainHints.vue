<template>
  <div class="hover-wrap" ref="hoverWrapEl" @mouseenter="updateHintTop">
    <button class="btn" :disabled="!selectedIdxValid" @click.stop="toggleAiPinned">AI</button>
    <div
      class="hints-row"
      v-if="selectedIdxValid"
      :class="{ visible: aiPinned }"
      :style="{ top: hintTop + 'px' }"
    >
      <template v-if="brainCellsForUI.length > 0">
        <div class="hint" v-for="(cell, i) in brainCellsForUI" :key="i">
          <div class="hint-title">{{ cell.name }}</div>
          <div class="hint-body">
            <div class="hint-line" v-for="(line, li) in cell.lines" :key="li">{{ line }}</div>
          </div>
        </div>
      </template>
      <template v-else>
        <div class="hint empty">No brain cells</div>
      </template>
      <div class="hint hint-close" @click.stop="closeHints">Close ×</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, inject, onBeforeUnmount, onMounted, ref } from 'vue';
import type { GameState } from '../../../logic/GameState';
import { subscribeFrameUpdate } from '../../../logic/FrameUpdate';

const props = defineProps<{
  selectedIdx: number | null;
}>();

const gameState = inject<GameState>('gameState')!;

const selectedIdxValid = computed(() => typeof props.selectedIdx === 'number' && props.selectedIdx !== null);

// Local frame tick to force recomputation each frame for non-reactive WASM arrays
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

// Brain cell data
const selectedAgent = computed(() => {
  void uiFrame.value; // ensure per-frame refresh
  if (!selectedIdxValid.value) return null as any;
  const idx = props.selectedIdx as number;
  return gameState.wagents.find(a => a.idx === idx) ?? null;
});

const brainCells = computed(() => {
  const a = selectedAgent.value;
  if (!a || !a.brain || !Array.isArray(a.brain.stack)) return [] as any[];
  return a.brain.stack as any[];
});

const cleanJson = (s: string) => s.replace(/"/g, '');
const brainCellsForUI = computed(() => {
  const cells = brainCells.value;
  const out: { name: string; lines: string[] }[] = [];
  for (const c of cells) {
    const name = (c && c.constructor && c.constructor.name) ? c.constructor.name : 'BrainCell';
    const props: string[] = [];
    try {
      const obj = { ...(c || {}) } as Record<string, unknown>;
      for (const k of Object.keys(obj)) {
        const v = (obj as any)[k];
        if (typeof v === 'function') continue;
        const j = (() => { try { return JSON.stringify(v); } catch { return '[unserializable]'; } })();
        const line = `${k}: ${cleanJson(j)}`;
        props.push(line);
      }
    } catch {
      props.push('[unserializable]');
    }
    out.push({ name, lines: props });
  }
  return out;
});

// Show/hide and positioning
const aiPinned = ref(false);
const hoverWrapEl = ref<HTMLElement | null>(null);
const hintTop = ref(8);
const updateHintTop = () => {
  const el = hoverWrapEl.value;
  if (!el) return;
  const rect = el.getBoundingClientRect();
  hintTop.value = Math.max(4, rect.bottom + 4);
};
const toggleAiPinned = () => {
  if (!selectedIdxValid.value) return;
  aiPinned.value = !aiPinned.value;
  updateHintTop();
};
const closeHints = () => { aiPinned.value = false; };

onMounted(() => {
  window.addEventListener('resize', updateHintTop);
  window.addEventListener('scroll', updateHintTop, { passive: true });
});
onBeforeUnmount(() => {
  window.removeEventListener('resize', updateHintTop);
  window.removeEventListener('scroll', updateHintTop);
});
</script>

<style scoped>
.hover-wrap { position: relative; display: inline-block; }
.btn { background-color: #4f4f4f; color: #f5f5f5; border: none; border-radius: 3px; padding: 3px 8px; cursor: pointer; }
.btn:disabled { opacity: 0.5; cursor: default; }

.hints-row {
  position: fixed;
  left: 0;
  display: flex;
  gap: 6px;
  padding: 6px;
  opacity: 0;
  pointer-events: none;
  transform: translateY(-4px);
  transition: opacity 120ms ease, transform 120ms ease;
  z-index: 20;
  max-width: 98vw;
}
.hover-wrap:hover .hints-row { opacity: 1; pointer-events: auto; transform: translateY(0); }
.hints-row.visible { opacity: 1; pointer-events: auto; transform: translateY(0); }
.hint {
  background: rgba(55,55,55,0.95);
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 4px;
  padding: 4px 6px;
  display: inline-block;
  width: max-content;
  min-width: 0;
  max-width: none;
}
.hint-title { font-weight: 600; font-size: 11px; margin-bottom: 2px; color: #cfd8dc; }
.hint-body { font-family: monospace; font-size: 10px; line-height: 1.3; color: #e0e0e0; white-space: pre-wrap; }
.hint-line { white-space: pre; }
.hint-close { cursor: pointer; font-weight: 600; align-self: stretch; display: flex; align-items: center; }
.empty { color: #aaa; font-size: 11px; }
</style>

