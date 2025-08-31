<template>
  <div class="panel">
    <button @click="handleClick(() => drawNavmesh())">Navmesh</button>
    <button @click="handleClick(() => drawNavGrid(1))">Grid 1</button>
    <button @click="handleClick(() => drawNavGrid(2))">Grid 2</button>
  </div>
</template>

<script setup lang="ts">
import { inject } from 'vue';
import type { GameState } from '../../../logic/GameState';
import type { SceneState } from '../../../logic/drawing/SceneState';
import { useNavmeshDebug } from '../../../logic/composables/useNavmeshDebug';
import { useNavmeshGridDebug } from '../../../logic/composables/useNavmeshGridDebug';

const gameState = inject<GameState>('gameState');
const sceneState = inject<SceneState>('sceneState');

const { drawNavmesh } = useNavmeshDebug(gameState, sceneState);
const { drawNavGrid } = useNavmeshGridDebug(gameState, sceneState);

const handleClick = (action: () => void) => {
  action();
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

