import { advanceSeed, seededRandom } from "../../core/mathUtils";
import { GameState } from "../../GameState";
import { getRandomTriangleInArea, getTriangleFromPoint } from "../../navmesh/NavUtils";
import { WAgent } from "../../WAgent";
import { AgentState, STUCK_DANGER_1 } from "../Agent";
import { Agents } from "../Agents";
import { cmdSetCorridor, CorridorAction } from "../EventHandler";
import { raycastCorridor } from "../../Raycasting";
import { Point2, set, getLineSegmentIntersectionPoint, lineLineIntersect } from "../../core/math";
import { NavConst } from "../NavConst";
import { sceneState, ACBLACK, ACYELLOW, ACRED } from "../../drawing/SceneState";

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

let corridor : number[] = [-2, -2];
let optionsPoly: number[] = [];
let optionsW: number[] = [];
let triAreas: number[] = [];

export class WanderFloatCell implements BrainCell{

  typeId = BrainCellType.WANDERER_FLOAT;
  update(gs: GameState, a: WAgent, dt: number): void {
    if (gs.wasm_agents.states[a.idx] !== AgentState.Standing && 
        gs.wasm_agents.stuck_ratings[a.idx] < STUCK_DANGER_1) return;
    // Choose a neighboring walkable polygon weighted by edge length
    const navmesh = gs.navmesh;
    const data = gs.wasm_agents;
    data.predicament_ratings[a.idx] = 0;
    data.stuck_ratings[a.idx] = 0;
    data.path_frustrations[a.idx] = 0;
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

    // Current position for distance checks
    const curX = data.positions[a.idx * 2];
    const curY = data.positions[a.idx * 2 + 1];

    // First try: pick a point inside neighbor poly, up to 5 attempts, >=10m away
    const MIN_DIST = 10.0;
    const first = tryFindPointInPoly(gs, nextPoly, curX, curY, 5, MIN_DIST);
    if (first) {
      corridor.length = 0;
      corridor.push(nextPoly, curPoly);
      data.end_targets[a.idx * 2] = first.x;
      data.end_targets[a.idx * 2 + 1] = first.y;
      data.end_target_tris[a.idx] = first.tri;
      cmdSetCorridor(gs.wasm_agents.events, a.idx, corridor, CorridorAction.SET_AND_STRAIGHT_CORNER);
      gs.wasm_agents.states[a.idx] = AgentState.Traveling;
      return;
    }

    // Fallback: pick in neighbor-of-neighbor poly, up to 5 attempts, then recalc corners in WASM
    optionsPoly.length = 0;
    optionsW.length = 0;
    let p2start = navmesh.polygons[nextPoly];
    let p2end = navmesh.polygons[nextPoly + 1];
    let totalW2 = 0;
    for (let ei = p2start; ei < p2end; ei++) {
      const n2 = navmesh.poly_neighbors[ei];
      if (n2 < navmesh.walkable_polygon_count && n2 !== curPoly) {
        const v1 = navmesh.poly_verts[ei];
        const v2 = navmesh.poly_verts[(ei + 1 < p2end) ? (ei + 1) : p2start];
        const x1 = navmesh.vertices[v1 * 2], y1 = navmesh.vertices[v1 * 2 + 1];
        const x2 = navmesh.vertices[v2 * 2], y2 = navmesh.vertices[v2 * 2 + 1];
        const w = Math.hypot(x2 - x1, y2 - y1);
        if (w > 0) {
          optionsPoly.push(n2);
          optionsW.push(w);
          totalW2 += w;
        }
      }
    }

    if (optionsPoly.length === 0) return; // skip turn this frame

    // Weighted pick among neighbor-of-neighbor polys
    const r2 = seededRandom(gs.rngSeedW); gs.rngSeedW = r2.newSeed;
    let pick2 = r2.value * totalW2;
    let nextPoly2 = optionsPoly[0];
    for (let i = 0; i < optionsPoly.length; i++) {
      pick2 -= optionsW[i];
      if (pick2 <= 0) { nextPoly2 = optionsPoly[i]; break; }
    }

    const second = tryFindPointInPoly(gs, nextPoly2, curX, curY, 5, MIN_DIST);
    if (!second) return; // skip turn this frame

    corridor.length = 0;
    corridor.push(nextPoly2, nextPoly, curPoly);
    data.end_targets[a.idx * 2] = second.x;
    data.end_targets[a.idx * 2 + 1] = second.y;
    data.end_target_tris[a.idx] = second.tri;
    cmdSetCorridor(gs.wasm_agents.events, a.idx, corridor, CorridorAction.SET_AND_RECALC_CORNERS);
    gs.wasm_agents.states[a.idx] = AgentState.Traveling;
  }
}

// Try to sample a random point within polygon polyIdx.
// Returns null if it cannot find a point at least minDist away from (curX,curY) in 'attempts' tries.
function tryFindPointInPoly(
  gs: GameState,
  polyIdx: number,
  curX: number,
  curY: number,
  attempts: number,
  minDist: number,
): { x: number, y: number, tri: number } | null {
  const navmesh = gs.navmesh;
  const triStart = navmesh.poly_tris[polyIdx];
  const triEnd = navmesh.poly_tris[polyIdx + 1];
  if (triStart >= triEnd) return null;

  // Precompute triangle areas for weighted selection
  triAreas.length = 0;
  let totalArea = 0;
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
  if (totalArea <= 0) return null;

  const minDistSq = minDist * minDist;
  for (let attempt = 0; attempt < attempts; attempt++) {
    // Pick triangle by area weight
    let rPick = seededRandom(gs.rngSeedW); gs.rngSeedW = rPick.newSeed;
    let targetArea = rPick.value * totalArea;
    let endTri = triStart;
    for (let ti = triStart, k = 0; ti < triEnd; ti++, k++) {
      if (targetArea <= triAreas[k]) { endTri = ti; break; }
      targetArea -= triAreas[k];
    }

    // Sample uniformly inside triangle via barycentric coords
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
    const x = ax + u * (bx - ax) + v * (cx - ax);
    const y = ay + u * (by - ay) + v * (cy - ay);

    const dx = x - curX;
    const dy = y - curY;
    if ((dx * dx + dy * dy) >= minDistSq) {
      return { x, y, tri: endTri };
    }
  }
  return null;
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
