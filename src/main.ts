import { createApp, reactive } from 'vue'
import App from './App.vue'
import { GameState } from './logic/GameState';
import { processInputs } from './logic/input/InputProcessor';
import * as Model from './logic/Model';
import { FPSCounter } from './logic/FPSCounter';
import { ensureDataLoaded } from './logic/GeoJsonStore';
import { sceneState } from './logic/drawing/SceneState';
import { loadBuildingData } from './LogicMapDataLoader';

async function initializeGame() {
    const gameState = new GameState();
    gameState.uiState = reactive(gameState.uiState);
    
    await ensureDataLoaded();
    await loadBuildingData(gameState);

    // initNewGame(gameState); // This will now be called from Map.vue after the map is initialized.

    const app = createApp(App);

    const fpsCounter = new FPSCounter();
    const fpsMetrics = reactive({
        currentFPS: 0,
        averageFPS: 0,
        maxFrameTime: 0
    });

    app.provide('gameState', gameState);
    app.provide('sceneState', sceneState);
    app.provide('fpsMetrics', fpsMetrics);

    app.mount('#app');

    // --- Game Loop ---
    let lastTimestamp = 0;

    function gameLoop(timestamp: number) {
        fpsCounter.update(timestamp);
        const metrics = fpsCounter.getMetrics();
        fpsMetrics.currentFPS = metrics.currentFPS;
        fpsMetrics.averageFPS = metrics.averageFPS;
        fpsMetrics.maxFrameTime = metrics.maxFrameTime;

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