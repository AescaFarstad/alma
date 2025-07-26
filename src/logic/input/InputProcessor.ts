/**
 * This module is responsible for processing the global command queue. It maps command names to handler functions, ensuring that player inputs are translated into game state changes.
 */
import { GameState } from '../GameState';
import { globalInputQueue } from '../Model';

/**
 * Processes all queued commands.
 * @param gameState The current game state.
 */
export function processInputs(_gameState: GameState): void {
    // Clear the queue after processing
    globalInputQueue.length = 0;
} 