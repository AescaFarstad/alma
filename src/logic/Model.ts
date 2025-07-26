import { GameState } from "./GameState";
import type { CmdInput } from './input/InputCommands';
import { Stats } from "./core/Stats";
import { processInputs } from "./input/InputProcessor";
import { sync as syncUIState } from "./UIStateManager";

/**
 * A global queue for commands. Components or other systems can push commands here.
 * The InputProcessor will process them on each game tick.
 */
export const globalInputQueue: CmdInput[] = [];

/**
 * The main update loop for the game logic.
 * @param gs The game state.
 * @param deltaTime The time elapsed since the last frame, in seconds.
 */
export function update(gs: GameState, deltaTime: number): void {
    gs.gameTime += deltaTime;
    processInputs(gs);
    Stats.processEventDispatcherQueue(gs.connections, gs);

    gs.invoker.update(deltaTime, gs);
    // In a real game, you would update game logic here.
    // e.g., update resources, check for events, etc.
    
    // Sync UI state after all game logic updates
    syncUIState(gs);
} 