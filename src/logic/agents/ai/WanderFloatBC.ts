import { seededRandom } from "../../core/mathUtils";
import { GameState } from "../../GameState";
import { WAgent } from "../../WAgent";
import { AgentState, STUCK_DANGER_1 } from "../Agent";
import { cmdSetCorridor, CorridorAction } from "../EventHandler";
import { BrainCell, BrainCellResult, BrainCellType } from "./Brain";

let corridor : number[] = [-2, -2];
let optionsPoly: number[] = [];
let optionsW: number[] = [];
let triAreas: number[] = [];

export class WanderFloatBC implements BrainCell{

  typeId = BrainCellType.WANDERER_FLOAT;
  update(gs: GameState, a: WAgent, dt: number): BrainCellResult {
    if (gs.wasm_agents.states[a.idx] !== AgentState.Standing && 
        gs.wasm_agents.stuck_ratings[a.idx] < STUCK_DANGER_1) return BrainCellResult.RUNNING;
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

    if (optionsPoly.length === 0) return BrainCellResult.FAIL;

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
      return BrainCellResult.RUNNING;
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

    if (optionsPoly.length === 0) return BrainCellResult.FAIL; // skip turn this frame

    // Weighted pick among neighbor-of-neighbor polys
    const r2 = seededRandom(gs.rngSeedW); gs.rngSeedW = r2.newSeed;
    let pick2 = r2.value * totalW2;
    let nextPoly2 = optionsPoly[0];
    for (let i = 0; i < optionsPoly.length; i++) {
      pick2 -= optionsW[i];
      if (pick2 <= 0) { nextPoly2 = optionsPoly[i]; break; }
    }

    const second = tryFindPointInPoly(gs, nextPoly2, curX, curY, 5, MIN_DIST);
    if (!second) return BrainCellResult.FAIL; // skip turn this frame

    corridor.length = 0;
    corridor.push(nextPoly2, nextPoly, curPoly);
    data.end_targets[a.idx * 2] = second.x;
    data.end_targets[a.idx * 2 + 1] = second.y;
    data.end_target_tris[a.idx] = second.tri;
    cmdSetCorridor(gs.wasm_agents.events, a.idx, corridor, CorridorAction.SET_AND_RECALC_CORNERS);
    gs.wasm_agents.states[a.idx] = AgentState.Traveling;
    return BrainCellResult.RUNNING;
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
