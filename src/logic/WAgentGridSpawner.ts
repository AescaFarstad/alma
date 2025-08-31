import type { GameState } from "./GameState";
import { wagentsLimit } from "./GameState";
import type { AgentConfig } from "./agents/AgentConfigs";
import type { Navmesh } from "./navmesh/Navmesh";
import { createWasmAgent } from "./WAgentSpawner";

type Point = { x: number; y: number };

type TriStat = {
  tri: number;
  area: number;
  centroidX: number;
  centroidY: number;
  spawned: number;
};

export interface WAgentGridSpawner {
  config: AgentConfig;
  center: Point;
  extent: Point; // Half-size of AABB in world units (x, y)
  agentsPerSecond: number;
  maxSpawns: number;

  // Timing/state
  spawnCooldown: number; // seconds between spawns
  spawnTimer: number; // countdown timer
  spawnCount: number;

  // Precomputed triangles inside area
  triangles: TriStat[];
}

// Helper to compute area of a triangle (world units^2)
function triangleArea(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number
): number {
  return Math.abs((bx - ax) * (cy - ay) - (cx - ax) * (by - ay)) * 0.5;
}

function collectTriangles(navmesh: Navmesh, center: Point, extent: Point): TriStat[] {
  const minX = Math.max(center.x - extent.x, navmesh.triangleIndex.minX);
  const maxX = Math.min(center.x + extent.x, navmesh.triangleIndex.maxX);
  const minY = Math.max(center.y - extent.y, navmesh.triangleIndex.minY);
  const maxY = Math.min(center.y + extent.y, navmesh.triangleIndex.maxY);

  const startCellX = Math.max(
    0,
    Math.floor((minX - navmesh.triangleIndex.minX) / navmesh.triangleIndex.cellSize)
  );
  const endCellX = Math.min(
    navmesh.triangleIndex.gridWidth - 1,
    Math.floor((maxX - navmesh.triangleIndex.minX) / navmesh.triangleIndex.cellSize)
  );
  const startCellY = Math.max(
    0,
    Math.floor((minY - navmesh.triangleIndex.minY) / navmesh.triangleIndex.cellSize)
  );
  const endCellY = Math.min(
    navmesh.triangleIndex.gridHeight - 1,
    Math.floor((maxY - navmesh.triangleIndex.minY) / navmesh.triangleIndex.cellSize)
  );

  const candidateSet = new Set<number>();
  for (let cx = startCellX; cx <= endCellX; cx++) {
    for (let cy = startCellY; cy <= endCellY; cy++) {
      const cellIndex = cx + cy * navmesh.triangleIndex.gridWidth;
      if (cellIndex < 0 || cellIndex >= navmesh.triangleIndex.cellOffsets.length - 1) continue;
      const start = navmesh.triangleIndex.cellOffsets[cellIndex];
      const end = navmesh.triangleIndex.cellOffsets[cellIndex + 1];
      for (let i = start; i < end; i++) {
        candidateSet.add(navmesh.triangleIndex.cellItems[i]);
      }
    }
  }

  const triangles: TriStat[] = [];
  const EPS_AREA = 1e-6;
  for (const tri of candidateSet) {
    if (tri < 0 || tri >= navmesh.walkable_triangle_count) continue; // only walkable

    const cx = navmesh.triangle_centroids[tri * 2];
    const cy = navmesh.triangle_centroids[tri * 2 + 1];
    if (cx < minX || cx > maxX || cy < minY || cy > maxY) continue; // centroid filter

    const v1 = navmesh.triangles[tri * 3];
    const v2 = navmesh.triangles[tri * 3 + 1];
    const v3 = navmesh.triangles[tri * 3 + 2];
    const ax = navmesh.vertices[v1 * 2];
    const ay = navmesh.vertices[v1 * 2 + 1];
    const bx = navmesh.vertices[v2 * 2];
    const by = navmesh.vertices[v2 * 2 + 1];
    const cxv = navmesh.vertices[v3 * 2];
    const cyv = navmesh.vertices[v3 * 2 + 1];
    const area = triangleArea(ax, ay, bx, by, cxv, cyv);
    if (!(area > EPS_AREA)) continue; // skip degenerate

    triangles.push({ tri, area, centroidX: cx, centroidY: cy, spawned: 0 });
  }

  triangles.sort((a, b) => {
    if (b.area !== a.area) return b.area - a.area;
    return a.tri - b.tri;
  });

  return triangles;
}

export function createWAgentGridSpawner(
  center: Point,
  extent: Point,
  config: AgentConfig,
  agentsPerSecond: number,
  maxSpawns: number
): WAgentGridSpawner {
  const spawnCooldown = agentsPerSecond > 0 ? 1 / agentsPerSecond : Number.POSITIVE_INFINITY;
  return {
    config,
    center: { x: center.x, y: center.y },
    extent: { x: extent.x, y: extent.y },
    agentsPerSecond,
    maxSpawns,
    spawnCooldown,
    spawnTimer: 0,
    spawnCount: 0,
    triangles: [], // Initialize on first update when navmesh is ready
  };
}

function pickTriangle(triangles: TriStat[]): TriStat | null {
  if (triangles.length === 0) return null;
  let best: TriStat | null = null;
  let bestRatio = Number.POSITIVE_INFINITY;
  const EPS = 1e-12;

  for (const t of triangles) {
    const ratio = t.spawned / t.area;
    if (ratio < bestRatio - EPS) {
      best = t;
      bestRatio = ratio;
    } else if (Math.abs(ratio - bestRatio) <= EPS) {
      // Tie: choose the one with larger area; if still equal, smaller tri index
      if (!best || t.area > best.area || (t.area === best.area && t.tri < best.tri)) {
        best = t;
        bestRatio = ratio;
      }
    }
  }

  return best;
}

export function updateWAgentGridSpawners(
  spawners: WAgentGridSpawner[],
  dt: number,
  gs: GameState
): void {
  if (!spawners) return;

  // Skip spawning until WASM agents are initialized
  if (!gs.wasm_agents.positions || !gs.wasm_agents.is_alive) {
    // console.log(`[WASM Grid Spawner] Skipping spawn - WASM agents not initialized`);
    return;
  }

  if (gs.wagents.length > wagentsLimit) {
    return;
  }

  for (const spawner of spawners) {
    if (spawner.agentsPerSecond <= 0) continue;
    if (spawner.spawnCount >= spawner.maxSpawns) continue;

    // Lazily build triangle list if not initialized yet and navmesh is ready
    if (!spawner.triangles.length && gs.navmesh.triangles.length > 0) {
      spawner.triangles = collectTriangles(gs.navmesh, spawner.center, spawner.extent);
    }
    if (!spawner.triangles.length) continue;

    spawner.spawnTimer -= dt;

    // Spawn as many as time budget allows, respecting limits
    while (spawner.spawnTimer <= 0 && spawner.spawnCount < spawner.maxSpawns) {
      const tri = pickTriangle(spawner.triangles);
      if (!tri) break;

      const wAgent = createWasmAgent(gs, {
        ...spawner.config,
        coordinate: { x: tri.centroidX, y: tri.centroidY },
        currentTri: tri.tri,
        lastValidTri: tri.tri,
      });

      if (!wAgent) {
        // No available slots; stop attempting further spawns this frame
        break;
      }

      tri.spawned++;
      spawner.spawnCount++;
      spawner.spawnTimer += spawner.spawnCooldown;

      // Respect global soft limit as in WAgentSpawner
      if (gs.wagents.length > wagentsLimit) {
        break;
      }
    }
  }
}
