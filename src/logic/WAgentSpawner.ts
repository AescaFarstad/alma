import { getTriangleFromPoint } from './navmesh/NavUtils';
import { wagentsLimit, type GameState } from "./GameState";
import { WAgent } from "./WAgent";
import { Agent } from "./agents/Agent";
import { MAX_AGENTS } from "./agents/Agents";
import { baseAtlas } from "./BaseAtlas";

export type WAgentSpawner = 
    { coordinate: { x: number, y: number } } & 
    { spawnCooldown: number } & 
    { spawnTimer: number } & 
    { spawnCount: number };

// Create a default agent prototype with proper values
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

export function createWasmAgent(gs: GameState, agent: Partial<Agent>): WAgent | null {
    // Create shallow copy of defaultAgent = prototype
    const prototype = { ...defaultAgent };
    
    // For each field in agent copy it to the prototype
    Object.assign(prototype, agent);
    
    // Return createWasmAgentFromPrototype(gs, prototype)
    return createWasmAgentFromPrototype(gs, prototype);
}

export function createWasmAgentFromPrototype(gs: GameState, agent: Agent): WAgent | null {
    const agents = gs.wasm_agents;
    
    // Check if we have room for more agents
    if (gs.wagents.length >= MAX_AGENTS) {
        return null;
    }
    
    const agentIndex = gs.wagents.length;
    
    // Write data to wasm views. Assume everything exists.
    // Basic position and state
    agents.positions[agentIndex * 2] = agent.coordinate.x;
    agents.positions[agentIndex * 2 + 1] = agent.coordinate.y;
    agents.last_coordinates[agentIndex * 2] = agent.coordinate.x;
    agents.last_coordinates[agentIndex * 2 + 1] = agent.coordinate.y;
    agents.velocities[agentIndex * 2] = 0;
    agents.velocities[agentIndex * 2 + 1] = 0;
    agents.looks[agentIndex * 2] = 1;
    agents.looks[agentIndex * 2 + 1] = 0;
    agents.states[agentIndex] = 0; // Standing
    agents.is_alive[agentIndex] = 1;
    
    // Navigation data
    agents.current_tris[agentIndex] = agent.currentTri;
    agents.last_valid_tris[agentIndex] = agent.lastValidTri;
    
    // Agent parameters
    agents.accels[agentIndex] = agent.accel;
    agents.resistances[agentIndex] = agent.resistance;
    agents.intelligences[agentIndex] = agent.intelligence;
    agents.max_speeds[agentIndex] = agent.maxSpeed;
    
    // Additional parameters
    agents.max_frustrations[agentIndex] = agent.maxFrustration;
    agents.arrival_desired_speeds[agentIndex] = agent.arrivalDesiredSpeed;
    agents.arrival_threshold_sqs[agentIndex] = agent.arrivalThresholdSq;
    agents.look_speeds[agentIndex] = agent.lookSpeed;
    
    // Statistics and ratings
    agents.stuck_ratings[agentIndex] = agent.stuckRating;
    agents.path_frustrations[agentIndex] = agent.pathFrustration;
    agents.predicament_ratings[agentIndex] = agent.predicamentRating;
    
    // Frame ID for display - use BaseAtlas mapping
    const frameId = baseAtlas.getFrameId(agent.display) ?? 0;
    agents.frame_ids[agentIndex] = frameId;
    
    // Create WAgent, assign the new index, return WAgent
    const wAgent = new WAgent(agentIndex, agent.display);
    gs.wagents.push(wAgent);
    
    return wAgent;
}

// The main spawner function creates an object with the fields that it customizes and calls createWasmAgent
// Then it adds the result to gamestate
export function updateWAgentSpawners(spawners: WAgentSpawner[], dt: number, gs: GameState) {
    if (!spawners) {
        return;
    }

    // Skip spawning until WASM agents are initialized
    if (!gs.wasm_agents.positions || !gs.wasm_agents.is_alive) {
        console.log(`[WASM Spawner] Skipping spawn - WASM agents not initialized`);
        return;
    }

    if (gs.wagents.length > wagentsLimit) {
        return;
    }

    for (const spawner of spawners) {
        spawner.spawnTimer -= dt;
        if (spawner.spawnTimer <= 0) {
            spawner.spawnTimer += spawner.spawnCooldown;
            spawner.spawnCount++;

            // Create an object with the fields that this spawner customizes
            const customConfig: Partial<Agent> = {
                coordinate: spawner.coordinate,
                currentTri: getTriangleFromPoint(gs.navmesh, spawner.coordinate),
                lastValidTri: getTriangleFromPoint(gs.navmesh, spawner.coordinate),
                display: "character_black_blue"
            };
            
            // Apply alt configuration for even spawns
            if (spawner.spawnCount % 2 === 0) {
                customConfig.arrivalDesiredSpeed = 0.05;
                customConfig.arrivalThresholdSq = 25;
                customConfig.intelligence = 0;
            }
            
            const wAgent = createWasmAgent(gs, customConfig);
            
            if (!wAgent) {
                console.warn("Failed to create WASM agent - no available slots");
                continue;
            }
        }
    }
} 