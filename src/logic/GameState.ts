import { reactive } from 'vue';
import { Connections } from './core/Stat';
import { Lib } from './lib/Lib';
import type { CmdInput } from './input/InputCommands';

/**
 * A global queue for commands. Components or other systems can push commands here.
 * The InputProcessor will process them on each game tick.
 */
export const globalInputQueue: CmdInput[] = [];

export class GameState {
    // Core systems
    public connections: Connections = new Connections();
    public lib: Lib = new Lib();

    // Game state data
    public gameTime: number = 0;

    /**
     * Reactive state for UI consumption.
     * Vue components will bind to this object.
     */
    public uiState: {
        lastCommand: string | null;
    };

    constructor() {
        this.uiState = reactive({
            lastCommand: null,
        });
    }

    /**
     * The main update loop for the game logic.
     * @param deltaTime The time elapsed since the last frame, in seconds.
     */
    public update(deltaTime: number): void {
        this.gameTime += deltaTime;

        // In a real game, you would update game logic here.
        // e.g., update resources, check for events, etc.
    }
} 