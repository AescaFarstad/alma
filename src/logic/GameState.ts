import { HypotheticalState } from "./core/Hypothetical";
import { Connections } from "./core/Stat";
import { Invoker } from "./core/behTree/Invoker";
import { Lib } from "./lib/Lib";
import RBush from "rbush";
import { Navmesh } from "./navmesh/Navmesh";
import { Point2 } from "./core/math";
import { Agent, createAgent } from "./agents/Agent";
import agentData from "./agent-data.json";
import { Spawner } from "./agents/AgentSpawner";
import { WAgentSpawner } from "./WAgentSpawner";
import { seededRandom } from "./core/mathUtils";
import { AgentGrid } from "./agents/AgentGrid";
import { Agents } from "./agents/Agents";
import { getRandomTriangle } from "./navmesh/NavUtils";
import { WAgent } from "./WAgent";

const INITIAL_SPAWN_SEED = 12345;

export type Avatar = {
    coordinate: Point2;
    velocity: Point2;
    look: Point2;
    lookSpeed: number;
    lookTarget: Point2;
    maxSpeed: number;
    accel: number;
    resistance: number;
    wallResistance: number;
    movement: Point2; // For WASD
    lastTriangle: number;
    wallContact: boolean;
    isOutsideNavmesh: boolean;
};

export type LaserBlast = {
    id: number;
    start: Point2;
    end: Point2;
    creationTime: number;
    corridor: number[] | null;
};
const spawnersCooldown = 0.01;
// export const wagentsLimit = 100;
export const wagentsLimit = 2;
export const agentsLimit = 2;
export class GameState { // This is a POD class. No functions allowed.
    public lib : Lib;
    public invoker: Invoker;
    public gameTime: number;
    public nextEventId: number;
    public uiState: {
        lastProcessedEventId: number;
    };

    public connections: Connections;

    public navmesh: Navmesh;
    public wasm_agents: Agents;

    public pointMarks: { id: number, x: number, y: number, selected: boolean }[] = [];
    public nextPointMarkId: number;
    public avatar: Avatar;
    public laserBlasts: LaserBlast[];
    public nextLaserBlastId: number;
    public scheduledLaserBlasts: number;
    public agents: Agent[];
    public wagents: WAgent[];
    public spawners: Spawner[];
    public wAgentSpawners: WAgentSpawner[];
    public agentGrid: AgentGrid;

    public timeScale: { current: number; previous: number };
    public allowedUpdates: number;

    public hypothetical: HypotheticalState | null = null;

    public rngSeed: number;

    constructor() {
        // this.pointMarks = [
        //     {id:1, x:1039.2013310648636, y:1363.7068431395105, selected: true},
        //     {id:0, x:-1282.2998158032574, y:-1495.2916003989103, selected: true},
        // ]
        this.pointMarks = [
            {id:1, x:85.78881648274813, y:16.75091448166262, selected: true},
            {id:0, x:31.288327958551292, y:452.45371500383493, selected: true},
        ]
        this.spawners = [
            { coordinate: { x: -100, y: 50 }, spawnCooldown: spawnersCooldown, spawnTimer: 1.1, spawnCount: 0 },
            // { coordinate: { x: -100, y: 50 }, spawnCooldown: spawnersCooldown, spawnTimer: 0.2, spawnCount: 0 },
            // { coordinate: { x: -100, y: 50 }, spawnCooldown: spawnersCooldown, spawnTimer: 0.3, spawnCount: 0 },
            // { coordinate: { x: -100, y: 50 }, spawnCooldown: spawnersCooldown, spawnTimer: 0.4, spawnCount: 0 },
            // { coordinate: { x: -100, y: 50 }, spawnCooldown: spawnersCooldown, spawnTimer: 0.5, spawnCount: 0 },
            // { coordinate: { x: 100, y: -50 }, spawnCooldown: spawnersCooldown, spawnTimer: 0.2, spawnCount: 0 },
            // { coordinate: { x: -581.8, y: 662.6 }, spawnCooldown: spawnersCooldown, spawnTimer: 0.3, spawnCount: 0 },
            // { coordinate: { x: 485.5, y: -47.1 }, spawnCooldown: spawnersCooldown, spawnTimer: 0.4, spawnCount: 0 },
            // { coordinate: { x: -401, y: -245.6 }, spawnCooldown: spawnersCooldown, spawnTimer: 0.5, spawnCount: 0 },
            // { coordinate: { x: -108, y: 532 }, spawnCooldown: spawnersCooldown, spawnTimer: 0.6, spawnCount: 0 },
            // { coordinate: { x: 589, y: 282 }, spawnCooldown: spawnersCooldown, spawnTimer: 0.7, spawnCount: 0 },
            // { coordinate: { x: 49, y: 347 }, spawnCooldown: spawnersCooldown, spawnTimer: 0.8, spawnCount: 0 },
            // { coordinate: { x: 327, y: 216 }, spawnCooldown: spawnersCooldown, spawnTimer: 0.9, spawnCount: 0 },
            // { coordinate: { x: 346, y: 116 }, spawnCooldown: spawnersCooldown, spawnTimer: 0.0, spawnCount: 0 },
            // { coordinate: { x: 469, y: 551 }, spawnCooldown: spawnersCooldown, spawnTimer: 0.0, spawnCount: 0 },
        ]
        
        // Initialize WAgent spawners
        this.wAgentSpawners = [
            { coordinate: { x: -100, y: 50 }, spawnCooldown: spawnersCooldown, spawnTimer: 1.1, spawnCount: 0 },
            // { coordinate: { x: -100, y: 50 }, spawnCooldown: spawnersCooldown, spawnTimer: 0.2, spawnCount: 0 },
            // { coordinate: { x: -100, y: 50 }, spawnCooldown: spawnersCooldown, spawnTimer: 0.3, spawnCount: 0 },
            // { coordinate: { x: -100, y: 50 }, spawnCooldown: spawnersCooldown, spawnTimer: 0.4, spawnCount: 0 },
            // { coordinate: { x: -100, y: 50 }, spawnCooldown: spawnersCooldown, spawnTimer: 0.5, spawnCount: 0 },
            // { coordinate: { x: 100, y: -50 }, spawnCooldown: spawnersCooldown, spawnTimer: 0.2, spawnCount: 0 },
            // { coordinate: { x: 100, y: -50 }, spawnCooldown: spawnersCooldown, spawnTimer: 0.1, spawnCount: 0 },
            // { coordinate: { x: -581.8, y: 662.6 }, spawnCooldown: spawnersCooldown, spawnTimer: 0.3, spawnCount: 0 },
            // { coordinate: { x: -581.8, y: 662.6 }, spawnCooldown: spawnersCooldown, spawnTimer: 0.2, spawnCount: 0 },
            // { coordinate: { x: 485.5, y: -47.1 }, spawnCooldown: spawnersCooldown, spawnTimer: 0.4, spawnCount: 0 },
            // { coordinate: { x: 485.5, y: -47.1 }, spawnCooldown: spawnersCooldown, spawnTimer: 0.3, spawnCount: 0 },
            // { coordinate: { x: -401, y: -245.6 }, spawnCooldown: spawnersCooldown, spawnTimer: 0.5, spawnCount: 0 },
            // { coordinate: { x: -401, y: -245.6 }, spawnCooldown: spawnersCooldown, spawnTimer: 0.4, spawnCount: 0 },
            // { coordinate: { x: -108, y: 532 }, spawnCooldown: spawnersCooldown, spawnTimer: 0.6, spawnCount: 0 },
            // { coordinate: { x: -108, y: 532 }, spawnCooldown: spawnersCooldown, spawnTimer: 0.5, spawnCount: 0 },
            // { coordinate: { x: 589, y: 282 }, spawnCooldown: spawnersCooldown, spawnTimer: 0.7, spawnCount: 0 },
            // { coordinate: { x: 589, y: 282 }, spawnCooldown: spawnersCooldown, spawnTimer: 0.6, spawnCount: 0 },
            // { coordinate: { x: 49, y: 347 }, spawnCooldown: spawnersCooldown, spawnTimer: 0.8, spawnCount: 0 },
            // { coordinate: { x: 49, y: 347 }, spawnCooldown: spawnersCooldown, spawnTimer: 0.7, spawnCount: 0 },
            // { coordinate: { x: 327, y: 216 }, spawnCooldown: spawnersCooldown, spawnTimer: 0.9, spawnCount: 0 },
            // { coordinate: { x: 327, y: 216 }, spawnCooldown: spawnersCooldown, spawnTimer: 0.8, spawnCount: 0 },
            // { coordinate: { x: 346, y: 116 }, spawnCooldown: spawnersCooldown, spawnTimer: 0.0, spawnCount: 0 },
            // { coordinate: { x: 346, y: 116 }, spawnCooldown: spawnersCooldown, spawnTimer: 0.1, spawnCount: 0 },
            // { coordinate: { x: 469, y: 551 }, spawnCooldown: spawnersCooldown, spawnTimer: 0.0, spawnCount: 0 },
            // { coordinate: { x: 469, y: 551 }, spawnCooldown: spawnersCooldown, spawnTimer: 0.1, spawnCount: 0 },
        ];
        this.lib = new Lib();
        this.invoker = new Invoker();
        this.gameTime = 0;
        this.nextEventId = 0;
        this.uiState = {
            lastProcessedEventId: -1,
        };
        this.connections = new Connections();
        this.navmesh = new Navmesh();
        this.wasm_agents = new Agents();
        this.nextPointMarkId = 2;
        this.laserBlasts = [];
        this.nextLaserBlastId = 0;
        this.scheduledLaserBlasts = 0;
        this.agents = [];
        this.wagents = [];
        this.agentGrid = new AgentGrid();
        this.timeScale = { current: 1.0, previous: 1.0 };
        this.allowedUpdates = 0;
        this.avatar = {
            coordinate: { x: -83, y: 6 },
            velocity: { x: 0, y: 0 },
            look: { x: 1, y: 0 }, // Pointing right by default
            lookSpeed: 15,
            lookTarget: { x: 1, y: 0 },
            maxSpeed: 80,
            accel: 700,
            resistance: 0.95,
            wallResistance: 0.98,
            movement: { x: 0, y: 0 },
            lastTriangle: -1,
            wallContact: false,
            isOutsideNavmesh: false,
        };

        this.rngSeed = INITIAL_SPAWN_SEED;
    }

    public swapTimeScale(): void {
        const temp = this.timeScale.current;
        this.timeScale.current = this.timeScale.previous;
        this.timeScale.previous = temp;
    }

    public setTimeScale(newScale: number): void {
        this.timeScale.previous = this.timeScale.current;
        this.timeScale.current = newScale;
    }
}