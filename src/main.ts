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
import { initWasmModule } from './WasmModule';
import { WasmAgentSystem } from './logic/WasmAgentSystem';

async function initializeGame() {
    await initWasmModule();
    const gameState = new GameState();
    gameState.uiState = reactive(gameState.uiState);
    const agentCount = ref(0);
    
    await ensureDataLoaded();
    await loadBuildingData(gameState);
    const rawBlobs = await loadBlobData(gameState);
    await loadAndProcessNavmesh(gameState);
    
    const wasmAgentSystem = new WasmAgentSystem(12100, gameState.rngSeed);
    if (gameState.navmesh) {
        await wasmAgentSystem.init(gameState.navmesh, rawBlobs);
    }

    // Block game start until WASM is ready
    if (!wasmAgentSystem.isReady()) {
        const waitStart = performance.now();
        while (!wasmAgentSystem.isReady() && performance.now() - waitStart < 5000) {
            await new Promise(r => setTimeout(r, 10));
        }
    }

    const app = createApp(App);

    const fpsCounter = new FPSCounter();
    const fpsMetrics = reactive({
        currentFPS: 0,
        averageFPS: 0,
        longAverageFPS: 0,
        maxFrameTime: 0,

    });

    const wasmRenderEnabled = ref(true);

    app.provide('gameState', gameState);
    app.provide('sceneState', sceneState);
    app.provide('dynamicScene', dynamicScene);
    app.provide('fpsMetrics', fpsMetrics);
    app.provide('agentCount', agentCount);
    app.provide('wasmAgentSystem', wasmAgentSystem);
    app.provide('wasmRenderEnabled', wasmRenderEnabled);

    app.mount('#app');

    // --- Game Loop ---
    let lastTimestamp = 0;

    function gameLoop(timestamp: number) {
        if (!wasmAgentSystem.isReady()) {
            requestAnimationFrame(gameLoop);
            return;
        }

        fpsCounter.update(timestamp);
        const metrics = fpsCounter.getMetrics();
        fpsMetrics.currentFPS = metrics.currentFPS;
        fpsMetrics.averageFPS = metrics.averageFPS;
        fpsMetrics.maxFrameTime = metrics.maxFrameTime;
        fpsMetrics.longAverageFPS = metrics.longAverageFPS;

        if (lastTimestamp === 0) {
            lastTimestamp = timestamp;
        }
        const deltaTime = (timestamp - lastTimestamp) / 1000; // Delta time in seconds
        lastTimestamp = timestamp;

        processInputs(gameState);
        gameState.continueInitialAgentSpawning();

        // Update TS-side logic and WASM simulation regardless of render flag
        Model.update(gameState, Math.min(1, deltaTime), wasmAgentSystem);

        // WASM render with fresh map data only if enabled
        if (wasmRenderEnabled.value) {
            wasmAgentSystem.renderOnly();
        }

        const totalAgents = gameState.agents.length + wasmAgentSystem.agents.length;
        agentCount.value = totalAgents;

        requestAnimationFrame(gameLoop);
    }

    requestAnimationFrame(gameLoop);
}

initializeGame(); 