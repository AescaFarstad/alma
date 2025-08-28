import { createApp, reactive, ref } from 'vue'
import App from './App.vue'
import { GameState } from './logic/GameState';
import { processInputs } from './logic/input/InputProcessor';
import * as Model from './logic/Model';
import { FPSCounter } from './logic/FPSCounter';
import { sceneState } from './logic/drawing/SceneState';
import { dynamicScene } from './logic/drawing/DynamicScene';
import { WasmInit } from './logic/initializers/WasmInit';
import { Wasm } from './logic/Wasm';
import { runPointInTriangleBenchmark } from './logic/debug/PointInTriangleBenchmark';
import { WasmFacade } from './logic/WasmFacade';


async function initializeGame() {
    const gameState = new GameState();
    gameState.uiState = reactive(gameState.uiState);
    const agentCount = ref(0);

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
    app.provide('wasmRenderEnabled', wasmRenderEnabled);

    app.mount('#app');

    // Initialize WASM after Vue app mounts (so canvas element exists)
    const wasmInit = new WasmInit();
    await wasmInit.initializeWasm(gameState);

    (window as any).runPointInTriangleBenchmark = () => runPointInTriangleBenchmark(gameState);
    (window as any).runPointInTriangleBenchmarkWasm = () => WasmFacade.triggerPointInTriangleBench();
    (window as any).runPointInPolygonBenchmarkWasm = () => WasmFacade.triggerPointInPolygonBench();

    // --- Game Loop ---
    let lastTimestamp = 0;

    function gameLoop(timestamp: number) {
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
        Model.update(gameState, Math.min(1, deltaTime));

        if (wasmRenderEnabled.value) {
            Wasm.render(gameState);
        }

        const totalAgents = gameState.agents.length + gameState.wagents.length;
        agentCount.value = totalAgents;

        requestAnimationFrame(gameLoop);
    }

    requestAnimationFrame(gameLoop);
}

initializeGame(); 