/**
 * This module is responsible for processing the global command queue. It maps command names to handler functions, ensuring that player inputs are translated into game state changes.
 */
import type { GameState } from '../GameState';
import { globalInputQueue } from '../Model'; // Import globalInputQueue
import type { CmdInput, CmdTimeScale } from './InputCommands';

const handlersByName = new Map<string, (gameState: GameState, command: CmdInput) => void>();
handlersByName.set("CmdTimeScale", handleTimeScale);
handlersByName.set("CmdTickOnce", handleTickOnce);

export function processInputs(gameState: GameState): void {
  for (const command of globalInputQueue) { // Use globalInputQueue
    const handler = handlersByName.get(command.name);
    if (handler) {
      handler(gameState, command);
    } else {
      console.error(`No handler registered for command: ${command.name}`);
    }
  }
  globalInputQueue.length = 0; // Clear the globalInputQueue
}

function handleTimeScale(gameState: GameState, command: CmdInput): void {
  const specificCommand = command as CmdTimeScale;
  if (gameState.timeScale.current === specificCommand.scale) {
    gameState.swapTimeScale();
  } else {
    gameState.setTimeScale(specificCommand.scale);
  }
}

function handleTickOnce(gameState: GameState, _command: CmdInput): void {
  gameState.allowedUpdates++;
  if (gameState.timeScale.current !== 0) {
    gameState.timeScale.previous = gameState.timeScale.current;
  }
  gameState.timeScale.current = 0;
} 