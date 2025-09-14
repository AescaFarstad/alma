import type { GameState } from "./GameState";
import { wagentsLimit } from "./GameState";
import type { AgentConfig } from "./agents/AgentConfigs";
import { createWasmAgent } from "./SpawnWAgent";

export interface WAgentAllSpawner {
  config: AgentConfig;
  agentsPerSecond: number;
  maxSpawns: number;

  // Timing/state
  spawnCooldown: number; // seconds between spawns
  spawnTimer: number; // countdown timer
  spawnCount: number;
}

export function createWAgentAllSpawner(
  config: AgentConfig,
  agentsPerSecond: number,
  maxSpawns: number
): WAgentAllSpawner {
  const spawnCooldown = agentsPerSecond > 0 ? 1 / agentsPerSecond : Number.POSITIVE_INFINITY;
  return {
    config,
    agentsPerSecond,
    maxSpawns,
    spawnCooldown,
    spawnTimer: 0,
    spawnCount: 0,
  };
}

export function updateWAgentAllSpawners(
  spawners: WAgentAllSpawner[],
  dt: number,
  gs: GameState
): void {
  if (!spawners) return;

  // Ensure WASM agents are initialized
  if (!gs.wasm_agents.positions) {
    return;
  }

  if (gs.wagents.length > wagentsLimit) {
    return;
  }

  const nav = gs.navmesh;
  if (!nav || nav.walkable_triangle_count <= 0 || nav.triangles.length <= 0) {
    return;
  }

  for (const spawner of spawners) {
    if (spawner.agentsPerSecond <= 0) continue;
    if (spawner.spawnCount >= spawner.maxSpawns) continue;

    spawner.spawnTimer -= dt;

    while (spawner.spawnTimer <= 0 && spawner.spawnCount < spawner.maxSpawns) {
      // Pick a random walkable triangle
      const tri = Math.floor(Math.random() * nav.walkable_triangle_count);
      const x = nav.triangle_centroids[tri * 2];
      const y = nav.triangle_centroids[tri * 2 + 1];

      const wAgent = createWasmAgent(gs, {
        ...spawner.config,
        coordinate: { x, y },
        currentTri: tri,
        lastValidTri: tri,
      });

      if (!wAgent) {
        // No available slots; stop attempting further spawns this frame
        break;
      }

      spawner.spawnCount++;
      spawner.spawnTimer += spawner.spawnCooldown;

      // Respect global soft limit
      if (gs.wagents.length > wagentsLimit) {
        break;
      }
    }
  }
}
