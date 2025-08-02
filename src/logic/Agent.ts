import { Point2 } from "./core/math";

export enum AgentState {
    Standing,
    Traveling,
    Escaping,
}

export class Agent {
    // Navigation
    corridor: number[] = [];
    currentPoly: number = -1;
    nextCorner: Point2 = { x: 0, y: 0 };
    nextCornerPoly: number = -1;
    nextCorner2: Point2 = { x: 0, y: 0 };
    nextCorner2Poly: number = -1;
    numValidCorners: 0 | 1 | 2 = 0;
    preEscapeCorner: Point2 = { x: 0, y: 0 };
    preEscapeCornerPoly: number = -1;
    lastValidPosition: Point2 = { x: 0, y: 0 };
    lastValidPoly: number = -1;
    endTarget: Point2 = { x: 0, y: 0 };
    endTargetPoly: number = -1;
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
    
    // Parameters
    lookSpeed: number = 0.1;
    maxSpeed: number = 3;
    accel: number = 20;
    resistance: number = 0.1;
    maxFrustration: number = 10;
    debug: boolean = false;
    
    debugLog!: string[];
}

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

    return agent;
}

// export function logAgentEvent(agent: Agent, message: string): void {
//     const timestamp = Date.now();
//     const logEntry = `[${timestamp}] ${message}`;
//     agent.debugLog.push(logEntry);
    
//     // Keep only the last 300 entries
//     if (agent.debugLog.length > 300) {
//         agent.debugLog = agent.debugLog.slice(-300);
//     }
// }
