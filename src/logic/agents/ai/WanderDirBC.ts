import { lineLineIntersect, Point2, set } from "../../core/math";
import { seededRandom } from "../../core/mathUtils";
import { GameState } from "../../GameState";
import { raycastCorridor } from "../../Raycasting";
import { WAgent } from "../../WAgent";
import { AgentState } from "../Agent";
import { cmdSetCorridor, CorridorAction } from "../EventHandler";
import { NavConst } from "../NavConst";
import { BrainCell, BrainCellType } from "./Brain";
import { try_start_chasing_enemy } from "./ChaseEnemyBC";

let raycastPoint : Point2 = { x: 0, y: 0 };
let raycastEndPoint : Point2 = { x: 0, y: 0 };
let polyCorridor : number[] = [];

export class WanderDirBC implements BrainCell{

  typeId = BrainCellType.WANDERER_DIR;
  private endAt: number = 0;
  update(gs: GameState, a: WAgent, dt: number): void {
    if (try_start_chasing_enemy(gs, a)) return;
    if (gs.wasm_agents.states[a.idx] === AgentState.Standing || gs.gameTime >= this.endAt){
      const data = gs.wasm_agents;
      const navmesh = gs.navmesh;
      data.predicament_ratings[a.idx] = 0;
      // Choose a random direction, raycast ~150m; use entire corridor
      set(raycastPoint, data.positions[a.idx * 2], data.positions[a.idx * 2 + 1]);

      const r1 = seededRandom(gs.rngSeedW); gs.rngSeedW = r1.newSeed;
      const angle = r1.value * Math.PI * 2;
      const dx = Math.cos(angle);
      const dy = Math.sin(angle);

      const maxDist = 150;
      set(raycastEndPoint, raycastPoint.x + dx * maxDist, raycastPoint.y + dy * maxDist);
      // Debug: raycast segment (black)
      // sceneState.addDebugLine({ x: raycastPoint.x, y: raycastPoint.y }, { x: raycastEndPoint.x, y: raycastEndPoint.y }, ACBLACK);
      const rc = raycastCorridor(navmesh, raycastPoint, raycastEndPoint, data.current_tris[a.idx]);
      if (!rc.corridor || rc.corridor.length === 0) return;

      // Poly corridor from tri corridor, assembled backwards (end->start) and dedup consecutive
      polyCorridor.length = 0;
      for (let i = rc.corridor.length - 1; i >= 0; i--) {
        const tri = rc.corridor[i];
        const poly = navmesh.triangle_to_polygon[tri];
        if (polyCorridor.length === 0 || polyCorridor[polyCorridor.length - 1] !== poly) {
          polyCorridor.push(poly);
        }
      }
      if (polyCorridor.length < 1) return;

      // End target = ray-wall intersection minus CORNER_OFFSET along ray
      const endTri = rc.corridor[rc.corridor.length - 1];
      let endX: number;
      let endY: number;
      if (rc.hitV1_idx !== -1) {
        const v1x = navmesh.vertices[rc.hitV1_idx * 2];
        const v1y = navmesh.vertices[rc.hitV1_idx * 2 + 1];
        const v2x = navmesh.vertices[rc.hitV2_idx * 2];
        const v2y = navmesh.vertices[rc.hitV2_idx * 2 + 1];
        // console.log(`hit edge: ${v1x.toFixed(2)}, ${v1y.toFixed(2)}, ${v2x.toFixed(2)}, ${v2y.toFixed(2)}`);
        // Debug: hit edge (yellow)
        // sceneState.addDebugLine({ x: v1x, y: v1y }, { x: v2x, y: v2y }, ACYELLOW);
        const p = lineLineIntersect(
          raycastPoint.x, raycastPoint.y, raycastEndPoint.x, raycastEndPoint.y,
          v1x, v1y, v2x, v2y);
        // Debug: intersection point (red)
        // if (p) sceneState.addDebugPoint({ x: p.x, y: p.y }, ACRED);
        const len = Math.hypot(dx, dy) || 1;
        endX = p!.x - (dx / len) * NavConst.CORNER_OFFSET;
        endY = p!.y - (dy / len) * NavConst.CORNER_OFFSET;
      } else {
        endX = raycastEndPoint.x;
        endY = raycastEndPoint.y;
      }
      data.end_targets[a.idx * 2] = endX;
      data.end_targets[a.idx * 2 + 1] = endY;
      data.end_target_tris[a.idx] = endTri;

      // Estimate travel time from distance/maxSpeed; pick 50-100% of it
      const maxSpeed = Math.max(1e-3, data.max_speeds[a.idx] || 1);
      const dxTot = endX - raycastPoint.x;
      const dyTot = endY - raycastPoint.y;
      const dist = Math.hypot(dxTot, dyTot);
      const rLen = seededRandom(gs.rngSeedW); gs.rngSeedW = rLen.newSeed;
      const factor = 0.5 + 0.5 * rLen.value; // 50–100%
      this.endAt = gs.gameTime + (dist / maxSpeed) * factor;

      cmdSetCorridor(gs.wasm_agents.events, a.idx, polyCorridor, CorridorAction.SET_AND_STRAIGHT_CORNER);
      data.states[a.idx] = AgentState.Traveling;
    }
  }
}
