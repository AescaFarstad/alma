/**
 * Manages UI state updates from the game state to the reactive UI objects.
 * This system efficiently copies only relevant parts of the game state to the UI,
 * avoiding full state copies and providing reactive updates for Vue components.
 */

import { GameState } from "./GameState";

/**
 * Processes the game's event log and updates the UI state accordingly.
 * This is the central place for handling events that the UI needs to react to.
 * @param gameState The game state.
 */
function syncEvents(_gameState: GameState): void {
  // const lastProcessedId = gameState.uiState.lastProcessedEventId;


}

/**
 * Main sync function that updates all UI state from the game state.
 * This should be called every frame to keep the UI in sync.
 */
export function sync(gameState: GameState): void {
  syncEvents(gameState);
  // Sync point marks from non-reactive game state to reactive UI state
  // Use a shallow copy to trigger Vue reactivity reliably
  const src = gameState.pointMarks;
  const mirrored = new Array(src.length);
  for (let i = 0; i < src.length; i++) {
    const m = src[i];
    mirrored[i] = { id: m.id, x: m.x, y: m.y, selected: m.selected };
  }
  gameState.uiState.pointMarks = mirrored;
}
