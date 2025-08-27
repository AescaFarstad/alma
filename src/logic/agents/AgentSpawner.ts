import { agentsLimit, GameState } from "../GameState";
import { copy, Point2 } from "../core/math";
import { getTriangleFromPoint } from "../navmesh/NavUtils";
import { Agent } from "./Agent";

export type Spawner = {
    coordinate: Point2;
    spawnCooldown: number;
    spawnTimer: number;
    spawnCount: number;
};

// Create a default agent prototype with proper values (matching WAgentSpawner.ts)
const defaultAgent = new Agent();
defaultAgent.coordinate.x = 0;
defaultAgent.coordinate.y = 0;
defaultAgent.accel = 500;
defaultAgent.resistance = 0.9;
defaultAgent.maxFrustration = 4;
defaultAgent.intelligence = 1;
defaultAgent.arrivalDesiredSpeed = 1;
defaultAgent.arrivalThresholdSq = 4;
defaultAgent.display = "character_black_blue";
defaultAgent.lookSpeed = 50;
defaultAgent.maxSpeed = 500 / -Math.log(1 - defaultAgent.resistance);

export function createAgentWithConfig(config: Partial<Agent>): Agent {
    // Create shallow copy of defaultAgent = prototype
    const prototype = JSON.parse(JSON.stringify(defaultAgent));
    
    // For each field in config copy it to the prototype
    Object.assign(prototype, config);
    
    // Calculate maxSpeed based on final accel and resistance values
    if (prototype.resistance >= 1) {
        prototype.maxSpeed = 0;
    } else if (prototype.resistance <= 0) {
        prototype.maxSpeed = Infinity;
    } else {
        prototype.maxSpeed = prototype.accel / -Math.log(1 - prototype.resistance);
    }
    
    return prototype;
}

export function updateSpawners(gs: GameState, dt: number) {
    if (!gs.spawners || gs.agents.length > agentsLimit) {
        return;
    }
    for (const spawner of gs.spawners) {
        spawner.spawnTimer -= dt;
        if (spawner.spawnTimer <= 0) {
            spawner.spawnTimer += spawner.spawnCooldown;
            spawner.spawnCount++;

            let currentTri = getTriangleFromPoint(gs.navmesh, spawner.coordinate);

            // Create agent with default configuration
            const newAgent = createAgentWithConfig({
                coordinate: copy(spawner.coordinate),
                currentTri: currentTri,
                display: "character_blonde_green"
            });
            
            // Apply alt configuration for even spawns
            if (spawner.spawnCount % 2 === 0) {
                newAgent.arrivalDesiredSpeed = 0.05;
                newAgent.arrivalThresholdSq = 25;
                newAgent.intelligence = 0;
            }
            
            newAgent.lastValidTri = newAgent.currentTri;
            newAgent.debug = false;
            // newAgent.endTarget = { "x": 344.8666687011719, "y": 208.2133331298828 };
            // newAgent.endTargetTri = 2852;
            // findPathToDestination(gs.navmesh, gs, newAgent, newAgent.currentTri, newAgent.endTargetTri, "hardcoded")
            // newAgent.state = AgentState.Traveling
            
            gs.agents.push(newAgent);
            // Rare event: spawn
            
        }
    }
} 