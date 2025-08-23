<template>
  <div class="add-agent-debug">
    <input type="text" v-model="agentJson" placeholder="" />
    <button @click="addAgent">Add Agent</button>
  </div>
</template>

<script setup lang="ts">
import { ref, inject } from 'vue';
import type { GameState } from '../../logic/GameState';
import { Agent } from '../../logic/agents/Agent';

const agentJson = ref('');
const gameState = inject<GameState>('gameState');

const addAgent = () => {
  if (!gameState) {
    console.error("GameState not injected");
    return;
  }
  try {
    const agentData = JSON.parse(agentJson.value);
    const newAgent = Object.assign(new Agent(), agentData);
    newAgent.debugLog = [];
    gameState.agents.push(newAgent);
    agentJson.value = ''; // Clear input after adding
  } catch (error) {
    console.error("Error parsing agent JSON or adding agent:", error);
    alert("Invalid Agent JSON!");
  }
};
</script>

<style scoped>
.add-agent-debug {
  background: rgba(33, 33, 33, 0.9);
  padding: 8px;
  border-radius: 4px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.5);
  display: flex;
  flex-direction: row;
  gap: 4px;
}

input {
  background-color: #2c2c2c;
  border: 1px solid #555;
  color: #f0f0f0;
  border-radius: 2px;
  padding: 4px;
  width: 150px;
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
  align-self: flex-start;
}

button:hover {
  background-color: #616161;
}
</style> 