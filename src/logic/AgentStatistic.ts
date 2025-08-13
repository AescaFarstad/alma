import {
    Agent, AgentState, STUCK_CORRIDOR_X3, STUCK_DST_X2, STUCK_PASSIVE_X1, STUCK_DECAY,
    PATH_LOG_RATE
} from "./Agent";
import { distance, length, distance_sq, Point2, set_, lerp } from "./core/math";
import { GameState } from "./GameState";

export function resetAgentStuck(agent: Agent){
        agent.minCorridorLength = agent.corridor.length;
        agent.lastDistanceToNextCorner = Number.POSITIVE_INFINITY;
        agent.stuckRating = 0;
        agent.sightRating = 0;
        agent.lastNextCornerPoly = -1; 
        set_(agent.lastEndTarget, agent.endTarget);
}

export function updateAgentStatistic(agent: Agent, gs: GameState, deltaTime: number): void {
    if (deltaTime === 0) return;
    
    // agent.pathLogCounter++;
    // if (agent.pathLogCounter >= PATH_LOG_RATE) {
    //     agent.pathLogCounter = 0;
    //     const point = agent.pathLog[agent.pathLogIdx];
    //     if (point) {
    //         set_(point, agent.coordinate);
    //     } else {
    //         agent.pathLog[agent.pathLogIdx] = { ...agent.coordinate };
    //     }
    //     agent.pathLogIdx = (agent.pathLogIdx + 1) % agent.pathLogMaxLen;
    // }

    if (agent.lastEndTarget.x !== agent.endTarget.x || agent.lastEndTarget.y !== agent.endTarget.y)
        resetAgentStuck(agent)
    
    if (agent.numValidCorners > 0) {
        const velocityMagnitude = Math.max(1, length(agent.velocity));
        const velocityFactor = velocityMagnitude / agent.maxSpeed;
        const velocityMult = lerp(2, 0.4, velocityFactor * velocityFactor * velocityFactor);
        agent.stuckRating += STUCK_PASSIVE_X1 * deltaTime * velocityMult;

        const dist = distance(agent.coordinate, agent.nextCorner);

        if (agent.lastNextCornerPoly !== agent.nextCornerPoly) {
            agent.lastDistanceToNextCorner = dist;
            agent.lastNextCornerPoly = agent.nextCornerPoly;
            agent.sightRating = 0;
        }

        const distanceDecrease = agent.lastDistanceToNextCorner - dist;
        if (distanceDecrease > 0) {
            const mult = (2 - agent.intelligence) / agent.maxSpeed * STUCK_DST_X2;
            const decreaseFactor = distanceDecrease / (velocityMagnitude * deltaTime);
            agent.stuckRating -= decreaseFactor * mult;
            agent.lastDistanceToNextCorner = dist;
        }
    }

    const corridorDecrease = agent.minCorridorLength - agent.corridor.length;
    if (corridorDecrease > 0) {
        agent.stuckRating -= corridorDecrease * STUCK_CORRIDOR_X3;
        agent.minCorridorLength = agent.corridor.length;
    }

    agent.stuckRating *= Math.pow(STUCK_DECAY, deltaTime);

    if (agent.stuckRating < 0) {
        agent.stuckRating = 0;
    }
} 