import { GameState } from "./GameState";
import { Agent, AgentState, createAgent } from "./Agent";
import { Point2 } from "./core/math";
import { findPathToDestination } from "./AgentNavigation";
import { getTriangleFromPoint } from "./navmesh/pathfinding";

export type Spawner = {
    coordinate: Point2;
    spawnCooldown: number;
    spawnTimer: number;
};

export function updateSpawners(gs: GameState, dt: number) {
    if (!gs.spawners) {
        return;
    }
    for (const spawner of gs.spawners) {
        spawner.spawnTimer -= dt;
        if (spawner.spawnTimer <= 0) {
            spawner.spawnTimer += spawner.spawnCooldown;

            const newAgent = createAgent(
                spawner.coordinate.x,
                spawner.coordinate.y,
                500, 0.9, 30, 
                Math.random() > 0.5 ? 0 : 1
                // 0.5
            );
            // newAgent.arrivalDesiredSpeed = 0.05;
            // newAgent.arrivalThresholdSq = 25;
            newAgent.currentPoly = getTriangleFromPoint(gs.navmesh, spawner.coordinate);
            newAgent.lastValidPoly = newAgent.currentPoly;
            // newAgent.endTarget = { "x": 344.8666687011719, "y": 208.2133331298828 };
            // newAgent.endTargetPoly = 2852;
            // findPathToDestination(gs.navmesh, gs, newAgent, newAgent.currentPoly, newAgent.endTargetPoly, "hardcoded")
            // newAgent.state = AgentState.Traveling
            gs.agents.push(newAgent);
        }
    }
} 