<template>
  <div v-if="selectedPointMarks.length > 0" class="selected-point-marks-container">
  <div class="info-box">
    <h4>Selected Point Marks</h4>
    <ul>
    <li v-for="markId in selectedPointMarks" :key="markId">
      Point Mark #{{ markId }}
    </li>
    </ul>
    <div class="button-container">
    <button @click="deleteSelectedPointMarks" class="delete-button">Delete Selected</button>
    <button @click="deleteAllPointMarks" class="delete-all-button">Delete All</button>
    <button @click="selectAllPointMarks" class="select-all-button">Select All</button>
    <button @click="copySelectedAsJSON" class="copy-button">Copy Selected</button>
    <button @click="copyAllAsJSON" class="copy-all-button">Copy All</button>
    </div>
  </div>
  </div>
</template>

<script setup lang="ts">
import { computed, inject } from 'vue';
import { usePointMarks } from '../../../logic/composables/usePointMarks';
import type { GameState } from '../../../logic/GameState';
import type { SceneState } from '../../../logic/drawing/SceneState';

interface PointMark {
  id: number;
  x: number;
  y: number;
}

// Type guard helper to filter out undefined values
const isDefined = <T>(value: T | undefined): value is T => value !== undefined;

const gameState = inject<GameState>('gameState');
const sceneState = inject<SceneState>('sceneState');

const {
  selectedPointMarks,
  deleteSelectedPointMarks,
  deleteAllPointMarks,
  selectAllPointMarks,
} = usePointMarks(gameState, sceneState);

const allPointMarks = computed(() => gameState?.pointMarks || []);

const getSelectedPointMarkCoords = computed(() => {
  if (!gameState) return [];
  return selectedPointMarks.value
  .map((id: number) => gameState.pointMarks.find((mark: PointMark) => mark.id === id))
  .filter(isDefined)
  .map((mark: PointMark) => ({ x: mark.x, y: mark.y }));
});

const getAllPointMarkCoords = computed(() => {
  return allPointMarks.value.map((mark: PointMark) => ({ x: mark.x, y: mark.y }));
});

const copyToClipboard = async (data: { x: number; y: number }[]) => {
  try {
  const jsonString = JSON.stringify(data);
  await navigator.clipboard.writeText(jsonString);
  } catch (err) {
  console.error('Failed to copy to clipboard:', err);
  // Fallback for older browsers
  const textArea = document.createElement('textarea');
  textArea.value = JSON.stringify(data);
  document.body.appendChild(textArea);
  textArea.focus();
  textArea.select();
  try {
    document.execCommand('copy');
  } catch (fallbackErr) {
    console.error('Fallback copy failed:', fallbackErr);
  }
  document.body.removeChild(textArea);
  }
};

const copySelectedAsJSON = async () => {
  await copyToClipboard(getSelectedPointMarkCoords.value);
};

const copyAllAsJSON = async () => {
  await copyToClipboard(getAllPointMarkCoords.value);
};
</script>

<style scoped>
.selected-point-marks-container {
  position: absolute;
  bottom: 0;
  right: 0;
  z-index: 10;
  background: rgba(33, 33, 33, 0.9);
  padding: 8px;
  border-radius: 4px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.5);
  color: #f0f0f0;
  font-size: 12px;
  width: 140px;
}

.info-box {
  background: transparent;
  padding: 0;
  box-shadow: none;
}

h4 {
  margin: 0 0 6px 0;
  font-size: 14px;
}

ul {
  list-style-type: none;
  padding: 0;
  margin: 0 0 8px 0;
}

li {
  padding: 2px 0;
  font-size: 11px;
}

.button-container {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

button {
  border: none;
  border-radius: 2px;
  padding: 4px 6px;
  cursor: pointer;
  transition: background-color 0.3s ease;
  font-weight: 500;
  font-size: 11px;
  color: #f5f5f5;
  white-space: nowrap;
  width: 100%;
}

button:hover {
  opacity: 0.8;
}

.delete-button {
  background-color: #4f4f4f;
}

.delete-button:hover {
  background-color: #616161;
}

.delete-all-button {
  background-color: #8b2635;
}

.delete-all-button:hover {
  background-color: #a13242;
}

.copy-button {
  background-color: #2d5a27;
}

.copy-button:hover {
  background-color: #3d7537;
}

.copy-all-button {
  background-color: #1e3a5f;
}

.copy-all-button:hover {
  background-color: #2e4a6f;
}

.select-all-button {
  background-color: #007bff;
}

.select-all-button:hover {
  background-color: #0056b3;
}
</style> 
