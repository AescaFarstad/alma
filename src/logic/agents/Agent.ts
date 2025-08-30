import { Point2 } from "../core/math";
import { Brain } from "./ai/Brain";

export const STUCK_PASSIVE_X1 = 14;
export const STUCK_DST_X2 = 18;
export const STUCK_CORRIDOR_X3 = 40;
export const STUCK_DECAY = 0.8;
export const STUCK_DANGER_1 = 35;
export const STUCK_DANGER_2 = 45;
export const STUCK_DANGER_3 = 75;
export const PATH_LOG_RATE = 3;

// Shared constants
export const LOOK_ROT_SPEED_RAD_S = 6.0; // radians per second (synced to WASM)


export enum AgentState {
    Standing,
    Traveling,
    Escaping,
}

export class Agent {
    brain! : Brain;
    // Navigation
    corridor: number[] = [];
    currentTri: number = -1;
    nextCorner: Point2 = { x: 0, y: 0 };
    nextCornerTri: number = -1;
    nextCorner2: Point2 = { x: 0, y: 0 };
    nextCorner2Tri: number = -1;
    numValidCorners: 0 | 1 | 2 = 0;
    preEscapeCorner: Point2 = { x: 0, y: 0 };
    preEscapeCornerTri: number = -1;
    lastValidPosition: Point2 = { x: 0, y: 0 };
    lastVisiblePointForNextCorner: Point2 = { x: 0, y: 0 };
    lastValidTri: number = -1;
    alienPoly: number = -1;
    endTarget: Point2 = { x: 0, y: 0 };
    endTargetTri: number = -1;
    pathFrustration: number = 0;
    state: AgentState = AgentState.Standing;
    intelligence: number = 0;
    arrivalThresholdSq: number = 4;
    arrivalDesiredSpeed: number = 1;

    // Core Stats
    coordinate: Point2 = { x: 0, y: 0 };
    lastCoordinate: Point2 = { x: 0, y: 0 };
    velocity: Point2 = { x: 0, y: 0 };
    lastAppliedAccel: Point2 = { x: 0, y: 0 };
    debug_velocityDiff: Point2 = { x: 0, y: 0 };
    debug_desiredVelocity: Point2 = { x: 0, y: 0 };
    look: Point2 = { x: 1, y: 0 };
    isAlive:boolean = true;
    
    // Parameters
    lookSpeed: number = 50;
    maxSpeed: number = 3;
    accel: number = 20;
    resistance: number = 0.1;
    maxFrustration: number = 10;
    debug: boolean = false;
    stuckRating = 0;
    sightRating = 0;
    predicamentRating = 0;
    lastDistanceToNextCorner: number = Number.POSITIVE_INFINITY;
    minCorridorLength: number = Number.POSITIVE_INFINITY;
    lastEndTarget: Point2  = { x: 0, y: 0 };
    lastNextCornerTri: number = -1;
    
    debugLog!: string[];
    pathLog: Point2[] = [];
    pathLogMaxLen = 200;
    pathLogIdx = 0;
    // pathLogCounter = 0;

    display:string = "character_black_blue"

    // Logging/Debug identifiers and state
    id: number = -1;
    wallContact: boolean = false;
}

let NEXT_AGENT_ID = 1;

export function createAgent(
    x: number, y: number,
    accel: number,
    resistance: number,
    maxFrustration: number,
    intelligence: number
): Agent {
    const agent = new Agent();

    agent.coordinate.x = x;
    agent.coordinate.y = y;

    agent.accel = accel;
    agent.resistance = resistance;
    agent.maxFrustration = maxFrustration;
    agent.intelligence = intelligence;

    if (resistance >= 1) {
        agent.maxSpeed = 0;
    } else if (resistance <= 0) {
        agent.maxSpeed = Infinity;
    } else {
        agent.maxSpeed = agent.accel / -Math.log(1 - agent.resistance);
    }

    agent.id = NEXT_AGENT_ID++;

    return agent;
}

// export function logAgentEvent(agent: Agent, message: string): void {
//     const timestamp = Date.now();
//     const logEntry = `[${timestamp}] ${message}`;
//     agent.debugLog.push(logEntry);
//     
//     // Keep only the last 300 entries
//     if (agent.debugLog.length > 300) {
//         agent.debugLog = agent.debugLog.slice(-300);
//     }
// }
