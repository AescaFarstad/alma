import { createApp, reactive } from 'vue'
import App from './App.vue'
import { loadBuildingData } from './LogicMapDataLoader';
import { GameState } from './logic/GameState';
import { processInputs } from './logic/input/InputProcessor';
import * as Model from './logic/Model';

async function initializeGame() {
    const gameState = new GameState();
    gameState.uiState = reactive(gameState.uiState);

    await loadBuildingData(gameState);

    // initNewGame(gameState); // This will now be called from Map.vue after the map is initialized.

    const app = createApp(App);

    app.provide('gameState', gameState);

    app.mount('#app');

    // --- Game Loop ---
    let lastTimestamp = 0;

    function gameLoop(timestamp: number) {
        if (lastTimestamp === 0) {
            lastTimestamp = timestamp;
        }
        const deltaTime = (timestamp - lastTimestamp) / 1000; // Delta time in seconds
        lastTimestamp = timestamp;

        processInputs(gameState);

        Model.update(gameState, deltaTime);

        requestAnimationFrame(gameLoop);
    }

    requestAnimationFrame(gameLoop);
}

initializeGame(); 