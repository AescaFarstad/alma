<template>
  <div class="time-controls">
    <span class="current-timescale">{{ currentTimeScaleDisplay }}x</span>
    <button
      v-for="control in timeControlScales"
      :key="control.label"
      @click="queueTimeScaleCommand(control.value)"
      :class="{ active: gameState && gameState.timeScale.current === control.value }"
    >
      {{ control.label }}
    </button>
    <button @click="queueTickOnceCommand()" class="tick-button">Tick</button>
  </div>
</template>

<script setup lang="ts">
import { inject, computed } from 'vue';
import type { GameState } from '../../logic/GameState';
import { globalInputQueue } from '../../logic/Model';
import type { CmdTimeScale, CmdTickOnce } from '../../logic/input/InputCommands';

const gameState = inject<GameState>('gameState');

const timeControlScales = [
  { label: "Pause", value: 0 },
  { label: "0.01x", value: 0.01 },
  { label: "0.1x", value: 0.1 },
  { label: "0.3x", value: 0.3 },
  { label: "1x", value: 1 },
  { label: "3x", value: 3 },
  { label: "10x", value: 10 },
  { label: "100x", value: 100 },
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
  display: flex;
  align-items: center;
  margin-left: 10px;
}

.time-controls button {
    background-color: #555;
    border: 1px solid #777;
}

.time-controls button.active {
    background-color: #777;
    border-color: #999;
}

.current-timescale {
  margin-right: 10px;
  font-weight: bold;
  font-family: monospace;
}
</style> 