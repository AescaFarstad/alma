<template>
  <div class="time-controls">
  <span class="current-timescale">{{ currentTimeScaleDisplay }}x</span>
  <button @click="queueTickOnceCommand()" class="tick-button">Tick</button>
  <button
    v-for="control in timeControlScales"
    :key="control.label"
    @click="queueTimeScaleCommand(control.value)"
    :class="{ active: gameState && gameState.timeScale.current === control.value }"
  >
    {{ control.label }}
  </button>
  </div>
</template>

<script setup lang="ts">
import { inject, computed } from 'vue';
import type { GameState } from '../../../logic/GameState';
import { globalInputQueue } from '../../../logic/Model';
import type { CmdTimeScale, CmdTickOnce } from '../../../logic/input/InputCommands';

const gameState = inject<GameState>('gameState');

const timeControlScales = [
  { label: "Pause", value: 0 },
  { label: "0.01", value: 0.01 },
  { label: "0.1", value: 0.1 },
  { label: "0.4", value: 0.4 },
  { label: "1x", value: 1 },
  { label: "2x", value: 2 },
  { label: "5x", value: 5 },
];

const currentTimeScaleDisplay = computed(() => {
  if (gameState) {
  return gameState.timeScale.current.toFixed(2);
  }
  return '1.00';
});

const queueTimeScaleCommand = (scale: number) => {
  const command: CmdTimeScale = { name: "CmdTimeScale", scale: scale, playerId: "player1" };
  globalInputQueue.push(command);
};

const queueTickOnceCommand = () => {
  const command: CmdTickOnce = { name: "CmdTickOnce", playerId: "player1" };
  globalInputQueue.push(command);
};
</script>

<style>
.time-controls {
  background: rgba(33, 33, 33, 0.9);
  padding: 4px;
  border-radius: 4px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  gap: 4px;
}

.time-controls button {
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

.time-controls button:hover {
  background-color: #616161;
}

.time-controls button.active {
  background-color: #616161;
}

.current-timescale {
  margin-right: 6px;
  font-weight: bold;
  font-family: monospace;
}
</style>
