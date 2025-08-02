import { HypotheticalState } from "./core/Hypothetical";
import { Connections } from "./core/Stat";
import { Invoker } from "./core/behTree/Invoker";
import { Lib } from "./lib/Lib";
import RBush from "rbush";
import { Navmesh } from "./navmesh/Navmesh";
import { Point2 } from "./core/math";
import { Agent, AgentState } from "./Agent";
import { Spawner } from "./AgentSpawner";

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
const spawnersCooldown = 0.3;
export class GameState { // This is a POD class. No functions allowed.
    public lib : Lib;
    public invoker: Invoker;
    public gameTime: number;
    public nextEventId: number;
    public uiState: {
        lastProcessedEventId: number;
    };
    public buildingSpatialIndex: RBush<any>;
    public blobSpatialIndex: RBush<any>;

    public connections: Connections;

    public buildingsById: Record<string, any>;
    public blobsById: Record<string, any>;
    public navmesh: Navmesh;

    public pointMarks: { id: number, x: number, y: number }[];
    public nextPointMarkId: number;
    public avatar: Avatar;
    public laserBlasts: LaserBlast[];
    public nextLaserBlastId: number;
    public scheduledLaserBlasts: number;
    public agents: Agent[];
    public spawners: Spawner[];

    public timeScale: { current: number; previous: number };
    public allowedUpdates: number;

    public hypothetical: HypotheticalState | null = null;

    constructor() {
        this.lib = new Lib();
        this.invoker = new Invoker();
        this.gameTime = 0;
        this.nextEventId = 0;
        this.uiState = {
            lastProcessedEventId: -1,
        };
        this.buildingSpatialIndex = new RBush();
        this.blobSpatialIndex = new RBush();
        this.connections = new Connections();
        this.buildingsById = {};
        this.blobsById = {};
        this.navmesh = new Navmesh();
        this.pointMarks = [];
        this.nextPointMarkId = 0;
        this.laserBlasts = [];
        this.nextLaserBlastId = 0;
        this.scheduledLaserBlasts = 0;
        this.agents = [];
        this.spawners = [
            { coordinate: { x: -100, y: 50 }, spawnCooldown: spawnersCooldown, spawnTimer: 0.1 },
            { coordinate: { x: 100, y: -50 }, spawnCooldown: spawnersCooldown, spawnTimer: 0.2 },
            { coordinate: { x: -581.8, y: 662.6 }, spawnCooldown: spawnersCooldown, spawnTimer: 0.3 },
            { coordinate: { x: 485.5, y: -47.1 }, spawnCooldown: spawnersCooldown, spawnTimer: 0.4 },
            { coordinate: { x: -401, y: -245.6 }, spawnCooldown: spawnersCooldown, spawnTimer: 0.5 },
            { coordinate: { x: -108, y: 532 }, spawnCooldown: spawnersCooldown, spawnTimer: 0.6 },
            { coordinate: { x: 589, y: 282 }, spawnCooldown: spawnersCooldown, spawnTimer: 0.7 },
            { coordinate: { x: 49, y: 347 }, spawnCooldown: spawnersCooldown, spawnTimer: 0.8 },
            { coordinate: { x: 327, y: 216 }, spawnCooldown: spawnersCooldown, spawnTimer: 0.9 },
            { coordinate: { x: 346, y: 116 }, spawnCooldown: spawnersCooldown, spawnTimer: 0.0 },
        ];
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