import { advanceSeed, seededRandom } from "../../core/mathUtils";
import { GameState } from "../../GameState";
import { getRandomTriangleInArea, getTriangleFromPoint } from "../../navmesh/NavUtils";
import { WAgent } from "../../WAgent";
import { AgentState } from "../Agent";
import { Agents } from "../Agents";
import { cmdSetCorridor, CorridorAction } from "../EventHandler";
import { raycastCorridor } from "../../Raycasting";
import { Point2, set, getLineSegmentIntersectionPoint, lineLineIntersect } from "../../core/math";
import { NavConst } from "../NavConst";

export class Brain{
  constructor(public stack : Array<BrainCell>) {}
}

export interface BrainCell{
  typeId : BrainCellType;
  update(gs:GameState, a : WAgent, dt : number):void;
}

export enum BrainCellType{
  RANDOM_JOURNEY = 0,
  WANDERER_DIR = 1,
  WANDERER_FLOAT = 2,
}


function update_random_journey(gs: GameState, a: WAgent, dt: number): void {
  if (gs.wasm_agents.states[a.idx] == AgentState.Standing) {
    const data = gs.wasm_agents;
    const navmesh = gs.navmesh;
    const endNode = getRandomTriangleInArea(navmesh, 0, 0, 30, gs.rngSeedW);
    gs.rngSeedW = advanceSeed(gs.rngSeedW);

    data.end_targets[a.idx * 2] = navmesh.triangle_centroids[endNode * 2];
    data.end_targets[a.idx * 2 + 1] = navmesh.triangle_centroids[endNode * 2 + 1];
    data.end_target_tris[a.idx] = endNode;
    data.predicament_ratings[a.idx] = 0;
    data.states[a.idx] = AgentState.Traveling;
  }
}

export class RandomJourneyCell implements BrainCell{
  typeId = BrainCellType.RANDOM_JOURNEY;
  update = update_random_journey;
}

let raycastPoint : Point2 = { x: 0, y: 0 };
let raycastEndPoint : Point2 = { x: 0, y: 0 };
let polyCorridor : number[] = [];

export class WanderDirCell implements BrainCell{

  typeId = BrainCellType.WANDERER_DIR;
  private endAt: number = 0;
  update(gs: GameState, a: WAgent, dt: number): void {
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
      let startTri = data.current_tris[a.idx];
      if (startTri < 0) startTri = getTriangleFromPoint(navmesh, raycastPoint);
      const rc = raycastCorridor(navmesh, raycastPoint, raycastEndPoint, startTri);
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
        const p = lineLineIntersect(
          raycastPoint.x, raycastPoint.y, raycastEndPoint.x, raycastEndPoint.y,
          v1x, v1y, v2x, v2y);
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

let corridor : number[] = [-2, -2];
let optionsPoly: number[] = [];
let optionsW: number[] = [];
let triAreas: number[] = [];

export class WanderFloatCell implements BrainCell{

  typeId = BrainCellType.WANDERER_FLOAT;
  update(gs: GameState, a: WAgent, dt: number): void {
    if (gs.wasm_agents.states[a.idx] !== AgentState.Standing) return;
    // Choose a neighboring walkable polygon weighted by edge length
    const navmesh = gs.navmesh;
    const data = gs.wasm_agents;
    data.predicament_ratings[a.idx] = 0;
    let startTri = data.current_tris[a.idx];
    const curPoly = navmesh.triangle_to_polygon[startTri];

    const pstart = navmesh.polygons[curPoly];
    const pend = navmesh.polygons[curPoly + 1];
    let totalW = 0;
    optionsPoly.length = 0;
    optionsW.length = 0;
    for (let ei = pstart; ei < pend; ei++) {
      const n = navmesh.poly_neighbors[ei];
      if (n < navmesh.walkable_polygon_count) {
        const v1 = navmesh.poly_verts[ei];
        const v2 = navmesh.poly_verts[(ei + 1 < pend) ? (ei + 1) : pstart];
        const x1 = navmesh.vertices[v1 * 2], y1 = navmesh.vertices[v1 * 2 + 1];
        const x2 = navmesh.vertices[v2 * 2], y2 = navmesh.vertices[v2 * 2 + 1];
        const w = Math.hypot(x2 - x1, y2 - y1);
        if (w > 0) {
          optionsPoly.push(n);
          optionsW.push(w);
          totalW += w;
        }
      }
    }

    if (optionsPoly.length === 0) return;

    const r = seededRandom(gs.rngSeedW); gs.rngSeedW = r.newSeed;
    let pick = r.value * totalW;
    let nextPoly = optionsPoly[0];
    for (let i = 0; i < optionsPoly.length; i++) { 
      pick -= optionsW[i];
      if (pick <= 0) {
         nextPoly = optionsPoly[i];
         break;
      }
    }

    corridor[1] = curPoly;
    corridor[0] = nextPoly;

    // Pick random triangle in nextPoly (weighted by area), then uniform random point in that triangle
    const triStart = navmesh.poly_tris[nextPoly];
    const triEnd = navmesh.poly_tris[nextPoly + 1];
    let totalArea = 0;
    triAreas.length = 0;
    for (let ti = triStart; ti < triEnd; ti++) {
      const v1 = navmesh.triangles[ti * 3];
      const v2 = navmesh.triangles[ti * 3 + 1];
      const v3 = navmesh.triangles[ti * 3 + 2];
      const ax = navmesh.vertices[v1 * 2], ay = navmesh.vertices[v1 * 2 + 1];
      const bx = navmesh.vertices[v2 * 2], by = navmesh.vertices[v2 * 2 + 1];
      const cx = navmesh.vertices[v3 * 2], cy = navmesh.vertices[v3 * 2 + 1];
      const areaTwice = Math.abs((bx - ax) * (cy - ay) - (by - ay) * (cx - ax));
      triAreas.push(areaTwice);
      totalArea += areaTwice;
    }
    if (totalArea <= 0) return;
    let rPick = seededRandom(gs.rngSeedW); gs.rngSeedW = rPick.newSeed;
    let targetArea = rPick.value * totalArea;
    let endTri = triStart;
    for (let ti = triStart, k = 0; ti < triEnd; ti++, k++) {
      if (targetArea <= triAreas[k]) { endTri = ti; break; }
      targetArea -= triAreas[k];
    }
    const va = navmesh.triangles[endTri * 3];
    const vb = navmesh.triangles[endTri * 3 + 1];
    const vc = navmesh.triangles[endTri * 3 + 2];
    const ax = navmesh.vertices[va * 2], ay = navmesh.vertices[va * 2 + 1];
    const bx = navmesh.vertices[vb * 2], by = navmesh.vertices[vb * 2 + 1];
    const cx = navmesh.vertices[vc * 2], cy = navmesh.vertices[vc * 2 + 1];
    let rU = seededRandom(gs.rngSeedW); gs.rngSeedW = rU.newSeed;
    let rV = seededRandom(gs.rngSeedW); gs.rngSeedW = rV.newSeed;
    let u = rU.value, v = rV.value;
    if (u + v > 1) { u = 1 - u; v = 1 - v; }
    const endX = ax + u * (bx - ax) + v * (cx - ax);
    const endY = ay + u * (by - ay) + v * (cy - ay);
    data.end_targets[a.idx * 2] = endX;
    data.end_targets[a.idx * 2 + 1] = endY;
    data.end_target_tris[a.idx] = endTri;

    cmdSetCorridor(gs.wasm_agents.events, a.idx, corridor, CorridorAction.SET_AND_STRAIGHT_CORNER);
    gs.wasm_agents.states[a.idx] = AgentState.Traveling;
  }
}

const randomJourneryCell = new RandomJourneyCell(); //stateless, thus one is enough.
export function createBrain(cellTypes: BrainCellType[]): Brain {
  const cells: BrainCell[] = [];
  for (const typeId of cellTypes) {
    switch (typeId) {
      case BrainCellType.RANDOM_JOURNEY:
        cells.push(randomJourneryCell);
        break;
      case BrainCellType.WANDERER_DIR:
        cells.push(new WanderDirCell());
        break;
      case BrainCellType.WANDERER_FLOAT:
        cells.push(new WanderFloatCell());
        break;
    }
  }
  return new Brain(cells);
}
