import type { GameState } from '../GameState';
import { globalInputQueue } from '../GameState';
import type { CmdInput, CmdDoSomething } from './InputCommands';

// Map of command handlers
const handlersByName = new Map<string, (gameState: GameState, command: CmdInput) => void>();
handlersByName.set("CmdDoSomething", handleDoSomething);

/**
 * Processes all queued commands.
 * @param gameState The current game state.
 */
export function processInputs(gameState: GameState): void {
    for (const command of globalInputQueue) {
        const handler = handlersByName.get(command.name);
        if (handler) {
            handler(gameState, command);
        } else {
            console.warn(`No handler for command: ${command.name}`);
        }
    }
    // Clear the queue after processing
    globalInputQueue.length = 0;
}


// --- Handlers ---

function handleDoSomething(gameState: GameState, command: CmdInput): void {
    const specificCommand = command as CmdDoSomething;
    console.log(`Handling CmdDoSomething with payload: ${specificCommand.payload}`);
    // Here you would modify the gameState based on the command
    gameState.uiState.lastCommand = specificCommand.payload;
} 