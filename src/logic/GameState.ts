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

// Constants for initial agent spawning
const ENABLE_INITIAL_AGENT_SPAWNING = true;
const INITIAL_AGENT_COUNT = 0;
const INITIAL_SPAWN_SEED = 12345;
const AGENTS_PER_FRAME = 5;

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
// export const wagentsLimit = 0;
export const wagentsLimit = 18000;
export const agentsLimit = 5000;
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

    public pointMarks: { id: number, x: number, y: number }[];
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

    // Initial agent spawning state
    public initialAgentSpawningInProgress: boolean;
    public agentsSpawnedSoFar: number;
    public currentSpawnSeed: number;
    // Deterministic RNG seed for regular (TS) systems
    public rngSeed: number;

    constructor() {
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
        this.pointMarks = [];
        this.nextPointMarkId = 0;
        this.laserBlasts = [];
        this.nextLaserBlastId = 0;
        this.scheduledLaserBlasts = 0;
        // this.agents = [agentData as Agent];
        this.agents = [];
        this.wagents = [];
        // Comment out regular spawners and use WAgent spawners instead
        this.spawners = [
            
            // { coordinate: { x: -100, y: 50 }, spawnCooldown: spawnersCooldown, spawnTimer: 1.1, spawnCount: 0 },
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
            { coordinate: { x: -100, y: 50 }, spawnCooldown: spawnersCooldown, spawnTimer: 0.2, spawnCount: 0 },
            { coordinate: { x: -100, y: 50 }, spawnCooldown: spawnersCooldown, spawnTimer: 0.3, spawnCount: 0 },
            { coordinate: { x: -100, y: 50 }, spawnCooldown: spawnersCooldown, spawnTimer: 0.4, spawnCount: 0 },
            { coordinate: { x: -100, y: 50 }, spawnCooldown: spawnersCooldown, spawnTimer: 0.5, spawnCount: 0 },
            { coordinate: { x: 100, y: -50 }, spawnCooldown: spawnersCooldown, spawnTimer: 0.2, spawnCount: 0 },
            { coordinate: { x: 100, y: -50 }, spawnCooldown: spawnersCooldown, spawnTimer: 0.1, spawnCount: 0 },
            { coordinate: { x: -581.8, y: 662.6 }, spawnCooldown: spawnersCooldown, spawnTimer: 0.3, spawnCount: 0 },
            { coordinate: { x: -581.8, y: 662.6 }, spawnCooldown: spawnersCooldown, spawnTimer: 0.2, spawnCount: 0 },
            { coordinate: { x: 485.5, y: -47.1 }, spawnCooldown: spawnersCooldown, spawnTimer: 0.4, spawnCount: 0 },
            { coordinate: { x: 485.5, y: -47.1 }, spawnCooldown: spawnersCooldown, spawnTimer: 0.3, spawnCount: 0 },
            { coordinate: { x: -401, y: -245.6 }, spawnCooldown: spawnersCooldown, spawnTimer: 0.5, spawnCount: 0 },
            { coordinate: { x: -401, y: -245.6 }, spawnCooldown: spawnersCooldown, spawnTimer: 0.4, spawnCount: 0 },
            { coordinate: { x: -108, y: 532 }, spawnCooldown: spawnersCooldown, spawnTimer: 0.6, spawnCount: 0 },
            { coordinate: { x: -108, y: 532 }, spawnCooldown: spawnersCooldown, spawnTimer: 0.5, spawnCount: 0 },
            { coordinate: { x: 589, y: 282 }, spawnCooldown: spawnersCooldown, spawnTimer: 0.7, spawnCount: 0 },
            { coordinate: { x: 589, y: 282 }, spawnCooldown: spawnersCooldown, spawnTimer: 0.6, spawnCount: 0 },
            { coordinate: { x: 49, y: 347 }, spawnCooldown: spawnersCooldown, spawnTimer: 0.8, spawnCount: 0 },
            { coordinate: { x: 49, y: 347 }, spawnCooldown: spawnersCooldown, spawnTimer: 0.7, spawnCount: 0 },
            { coordinate: { x: 327, y: 216 }, spawnCooldown: spawnersCooldown, spawnTimer: 0.9, spawnCount: 0 },
            { coordinate: { x: 327, y: 216 }, spawnCooldown: spawnersCooldown, spawnTimer: 0.8, spawnCount: 0 },
            { coordinate: { x: 346, y: 116 }, spawnCooldown: spawnersCooldown, spawnTimer: 0.0, spawnCount: 0 },
            { coordinate: { x: 346, y: 116 }, spawnCooldown: spawnersCooldown, spawnTimer: 0.1, spawnCount: 0 },
            { coordinate: { x: 469, y: 551 }, spawnCooldown: spawnersCooldown, spawnTimer: 0.0, spawnCount: 0 },
            { coordinate: { x: 469, y: 551 }, spawnCooldown: spawnersCooldown, spawnTimer: 0.1, spawnCount: 0 },
        ];
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

        // Initialize spawning state
        this.initialAgentSpawningInProgress = false;
        this.agentsSpawnedSoFar = 0;
        this.currentSpawnSeed = INITIAL_SPAWN_SEED;
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

    public startInitialAgentSpawning(): void {
        if (!ENABLE_INITIAL_AGENT_SPAWNING || !this.navmesh.triangleIndex) {
            return;
        }

        this.initialAgentSpawningInProgress = true;
        this.agentsSpawnedSoFar = 0;
        this.currentSpawnSeed = INITIAL_SPAWN_SEED;
        
        // console.log(`Starting initial agent spawning: ${INITIAL_AGENT_COUNT} agents, ${AGENTS_PER_FRAME} per frame`);
    }

    public continueInitialAgentSpawning(): void {
        if (!this.initialAgentSpawningInProgress || !this.navmesh.triangleIndex) {
            return;
        }

        const agentsToSpawn = Math.min(AGENTS_PER_FRAME, INITIAL_AGENT_COUNT - this.agentsSpawnedSoFar);
        
        for (let i = 0; i < agentsToSpawn; i++) {
            // Use seeded random to get a triangle index
            const triangleIndex = getRandomTriangle(this.navmesh, this.currentSpawnSeed);
            const { newSeed } = seededRandom(this.currentSpawnSeed);
            this.currentSpawnSeed = newSeed;
            
            // Get a random point within the triangle
            const coordinate = this.getRandomPointInTriangle(triangleIndex, this.currentSpawnSeed);
            const { newSeed: finalSeed } = seededRandom(this.currentSpawnSeed);
            this.currentSpawnSeed = finalSeed;

            // Create agent with same parameters as AgentSpawner
            const newAgent = createAgent(
                coordinate.x,
                coordinate.y,
                500, 0.9, 30, 
                1
            );

            // Alternate between intelligent and non-intelligent agents (same logic as AgentSpawner)
            if ((this.agentsSpawnedSoFar + i) % 2 === 0) {
                newAgent.arrivalDesiredSpeed = 0.05;
                newAgent.arrivalThresholdSq = 25;
                newAgent.intelligence = 0;
            }

            newAgent.currentTri = triangleIndex;
            newAgent.lastValidTri = newAgent.currentTri;
            
            this.agents.push(newAgent);
        }

        this.agentsSpawnedSoFar += agentsToSpawn;

        if (this.agentsSpawnedSoFar >= INITIAL_AGENT_COUNT) {
            this.initialAgentSpawningInProgress = false;
            // console.log(`Completed initial agent spawning: ${this.agentsSpawnedSoFar} agents spawned`);
        }
    }

    public spawnInitialAgents(): void {
        // Legacy method - now just starts the progressive spawning
        this.startInitialAgentSpawning();
    }

    private getRandomPointInTriangle(triangleIndex: number, seed: number): Point2 {
        const { triangle_centroids } = this.navmesh;
        const centroidX = triangle_centroids[triangleIndex * 2];
        const centroidY = triangle_centroids[triangleIndex * 2 + 1];
        
        return {
            x: centroidX,
            y: centroidY
        };
    }
}