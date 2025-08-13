import { agentsLimit, GameState } from "./GameState";
import { Agent, AgentState, createAgent } from "./Agent";
import { Point2 } from "./core/math";
import { getTriangleFromPoint } from "./navmesh/pathCorridor";

export type Spawner = {
    coordinate: Point2;
    spawnCooldown: number;
    spawnTimer: number;
    spawnCount: number;
};

export function updateSpawners(gs: GameState, dt: number) {
    if (!gs.spawners || gs.agents.length > agentsLimit) {
        return;
    }
    for (const spawner of gs.spawners) {
        spawner.spawnTimer -= dt;
        if (spawner.spawnTimer <= 0) {
            spawner.spawnTimer += spawner.spawnCooldown;
            spawner.spawnCount++;

            const newAgent = createAgent(
                spawner.coordinate.x,
                spawner.coordinate.y,
                500, 0.9, 30, 
                1
            );
            if (spawner.spawnCount % 2 === 0) {
                newAgent.arrivalDesiredSpeed = 0.05;
                newAgent.arrivalThresholdSq = 25;
                newAgent.intelligence = 0;
            }
            newAgent.display = "character_blonde_green"
            newAgent.currentPoly = getTriangleFromPoint(gs.navmesh, spawner.coordinate);
            newAgent.lastValidPoly = newAgent.currentPoly;
            // newAgent.endTarget = { "x": 344.8666687011719, "y": 208.2133331298828 };
            // newAgent.endTargetPoly = 2852;
            // findPathToDestination(gs.navmesh, gs, newAgent, newAgent.currentPoly, newAgent.endTargetPoly, "hardcoded")
            // newAgent.state = AgentState.Traveling
            gs.agents.push(newAgent);
            // Rare event: spawn
            
        }
    }
} 