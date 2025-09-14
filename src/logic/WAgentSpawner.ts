import { getTriangleFromPoint } from './navmesh/NavUtils';
import { wagentsLimit, type GameState } from "./GameState";
import { AgentConfigs, type AgentConfig } from "./agents/AgentConfigs";
import { createWasmAgent } from './SpawnWAgent';

export interface WAgentSpawner {
  config : AgentConfig;
  coordinate: { x: number, y: number };
  spawnCooldown: number;
  spawnTimer: number;
  spawnCount: number;
}

export function updateWAgentSpawnersBench(spawners: WAgentSpawner[], dt: number, gs: GameState) {
  if (!spawners) {
    return;
  }

  // Skip spawning until WASM agents are initialized
  if (!gs.wasm_agents.positions) {
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
  if (!gs.wasm_agents.positions) {
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
