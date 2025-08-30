import { getTriangleFromPoint } from './navmesh/NavUtils';
import { wagentsLimit, type GameState } from "./GameState";
import { WAgent } from "./WAgent";
import { Agent } from "./agents/Agent";
import { AgentConfigs, type AgentConfig } from "./agents/AgentConfigs";
import { MAX_AGENTS } from "./agents/Agents";
import { baseAtlas } from "./BaseAtlas";
import { Brain, BrainCellType, createBrain } from './agents/ai/Brain';

export interface WAgentSpawner {
  config : AgentConfig;
  coordinate: { x: number, y: number };
  spawnCooldown: number;
  spawnTimer: number;
  spawnCount: number;
}

export function createWasmAgent(gs: GameState, agent: Partial<Agent> & { brainCells?: readonly BrainCellType[] }): WAgent | null {
  const prototype = new Agent();
  Object.assign(prototype, agent);

  if (agent.brainCells) {
    prototype.brain = createBrain(agent.brainCells as BrainCellType[]);
  } else if (agent.brain) {
    const cellTypes = agent.brain.stack.map(cell => cell.typeId);
    prototype.brain = createBrain(cellTypes);
  } else {
    console.error("Agent configuration must provide either 'brain' or 'brainCells'.", agent);
    return null;
  }

  if (prototype.resistance >= 1) prototype.maxSpeed = 0;
  else if (prototype.resistance <= 0) prototype.maxSpeed = Infinity;
  else prototype.maxSpeed = prototype.accel / -Math.log(1 - prototype.resistance);
  return createWasmAgentFromPrototype(gs, prototype);
}

export function createWasmAgentFromPrototype(gs: GameState, agent: Agent): WAgent | null {
  const agents = gs.wasm_agents;
  
  if (gs.wagents.length >= MAX_AGENTS) {
    return null;
  }
  
  const idx = gs.wagents.length;
  
  agents.positions[idx * 2] = agent.coordinate.x;
  agents.positions[idx * 2 + 1] = agent.coordinate.y;
  agents.last_coordinates[idx * 2] = agent.coordinate.x;
  agents.last_coordinates[idx * 2 + 1] = agent.coordinate.y;
  agents.velocities[idx * 2] = 0;
  agents.velocities[idx * 2 + 1] = 0;
  agents.looks[idx * 2] = 1;
  agents.looks[idx * 2 + 1] = 0;
  agents.states[idx] = 0; // Standing
  agents.is_alive[idx] = 1;
  
  // Navigation data
  agents.current_tris[idx] = agent.currentTri;
  agents.last_valid_tris[idx] = agent.lastValidTri;
  
  // Agent parameters
  agents.accels[idx] = agent.accel;
  agents.resistances[idx] = agent.resistance;
  agents.intelligences[idx] = agent.intelligence;
  agents.max_speeds[idx] = agent.maxSpeed;
  
  // Additional parameters
  agents.max_frustrations[idx] = agent.maxFrustration;
  agents.arrival_desired_speeds[idx] = agent.arrivalDesiredSpeed;
  agents.arrival_threshold_sqs[idx] = agent.arrivalThresholdSq;
  agents.look_speeds[idx] = agent.lookSpeed;
  
  // Statistics and ratings
  agents.stuck_ratings[idx] = agent.stuckRating;
  agents.path_frustrations[idx] = agent.pathFrustration;
  agents.predicament_ratings[idx] = agent.predicamentRating;
  
  // Frame ID for display - use BaseAtlas mapping
  const frameId = baseAtlas.getFrameId(agent.display) ?? 0;
  agents.frame_ids[idx] = frameId;
  
  // Create WAgent, assign the new index, return WAgent
  const wAgent = new WAgent(idx, agent.display, new Brain([...agent.brain.stack]));
  gs.wagents.push(wAgent);
  
  return wAgent;
}

export function updateWAgentSpawnersBench(spawners: WAgentSpawner[], dt: number, gs: GameState) {
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

      // Select config from AgentConfigs and apply dynamic fields
      const baseConfig: AgentConfig = (spawner.spawnCount % 2 === 0)
        ? AgentConfigs.benchmarkerStupid
        : AgentConfigs.benchmarkerSmart;

      const tri = getTriangleFromPoint(gs.navmesh, spawner.coordinate);

      const wAgent = createWasmAgent(gs, {
        ...baseConfig,
        coordinate: spawner.coordinate,
        currentTri: tri,
        lastValidTri: tri,
        display: "character_black_blue",
      });
      
      if (!wAgent) {
        console.warn("Failed to create WASM agent - no available slots");
        continue;
      }
    }
  }
} 

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

      const tri = getTriangleFromPoint(gs.navmesh, spawner.coordinate);

      const wAgent = createWasmAgent(gs, {
        ...spawner.config,
        coordinate: spawner.coordinate,
        currentTri: tri,
        lastValidTri: tri
      });
      
      if (!wAgent) {
        console.warn("Failed to create WASM agent - no available slots");
        continue;
      }
    }
  }
} 
