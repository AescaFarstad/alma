import { createApp } from 'vue'
import App from './App.vue'
import { GameState } from './logic/GameState';
import { processInputs } from './logic/input/InputProcessor';

// --- Game Initialization ---
function initializeGame() {
    const gameState = new GameState();

    const app = createApp(App);

    // Provide the gameState instance to all components in the Vue app.
    // Components can inject it using `inject('gameState')`.
    app.provide('gameState', gameState);

    // Mount the Vue app to the DOM
    app.mount('#app');


    // --- Game Loop ---
    let lastTimestamp = 0;

    function gameLoop(timestamp: number) {
        if (lastTimestamp === 0) {
            lastTimestamp = timestamp;
        }
        const deltaTime = (timestamp - lastTimestamp) / 1000; // Delta time in seconds
        lastTimestamp = timestamp;

        // 1. Process all pending inputs.
        processInputs(gameState);

        // 2. Update the game state.
        gameState.update(deltaTime);

        // 3. Request the next frame.
        requestAnimationFrame(gameLoop);
    }

    // Start the game loop
    requestAnimationFrame(gameLoop);
}

initializeGame(); 