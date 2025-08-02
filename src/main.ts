import { createApp, reactive, ref } from 'vue'
import App from './App.vue'
import { GameState } from './logic/GameState';
import { processInputs } from './logic/input/InputProcessor';
import * as Model from './logic/Model';
import { FPSCounter } from './logic/FPSCounter';
import { ensureDataLoaded } from './logic/GeoJsonStore';
import { sceneState } from './logic/drawing/SceneState';
import { dynamicScene } from './logic/drawing/DynamicScene';
import { loadBuildingData, loadBlobData, loadAndProcessNavmesh } from './LogicMapDataLoader';

async function initializeGame() {
    const gameState = new GameState();
    gameState.uiState = reactive(gameState.uiState);
    const agentCount = ref(0);
    
    await ensureDataLoaded();
    await loadBuildingData(gameState);
    await loadBlobData(gameState);
    await loadAndProcessNavmesh(gameState);

    const app = createApp(App);

    const fpsCounter = new FPSCounter();
    const fpsMetrics = reactive({
        currentFPS: 0,
        averageFPS: 0,
        maxFrameTime: 0
    });

    app.provide('gameState', gameState);
    app.provide('sceneState', sceneState);
    app.provide('dynamicScene', dynamicScene);
    app.provide('fpsMetrics', fpsMetrics);
    app.provide('agentCount', agentCount);

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
        agentCount.value = gameState.agents.length;

        requestAnimationFrame(gameLoop);
    }

    requestAnimationFrame(gameLoop);
}

initializeGame(); 