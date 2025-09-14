import { distance_sq, lineLineIntersect, Point2, set } from "../../core/math";
import { GameState } from "../../GameState";
import { raycastCorridor } from "../../Raycasting";
import { WAgent } from "../../WAgent";
import { AgentState } from "../Agent";
import { Agents, INDEX_BITS, INDEX_MASK } from "../Agents";
import { cmdNavigateToNearbyTarget, cmdSetCorridor, CorridorAction } from "../EventHandler";
import { BrainCell, BrainCellType } from "./Brain";
import { MeleeAttackBC } from "./MeleeAttackBC";

export function try_start_chasing_enemy(gs: GameState, a: WAgent): boolean {
  const handle = gs.wasm_agents.nearest_enemy[a.idx];
  if (handle === 0) return false;
  const enemyIdx = handle & INDEX_MASK;
  const gen = handle >>> INDEX_BITS;
  if (gen !== gs.wasm_agents.generation[enemyIdx]) return false;
  const chase = new ChaseEnemyBC();
  chase.init(gs, a, handle);
  a.brain.stack.push(chase);
  return true;
}

const empty_corridor : number[] = [];
export class ChaseEnemyBC implements BrainCell{
  typeId = BrainCellType.CHASE_ENEMY;

  public static switch_interval : number = 1;

  private lastEnemyPoly: number = -1;
  private loseInterestAt : number = 0;
  private polyChanges : number = 0;
  private lastSwitch : number = 0;

  init(gs: GameState, a: WAgent, enemyHandle: number): void {
    gs.wasm_agents.target[a.idx] = enemyHandle;
    this.lastEnemyPoly = -1;
    this.loseInterestAt = gs.gameTime + 5;
    gs.wasm_agents.predicament_ratings[a.idx] = 0;
    this.polyChanges = 0;
    cmdNavigateToNearbyTarget(gs.wasm_agents.events, a.idx);
  }

  update(gs: GameState, a: WAgent, dt: number): void {
    const data = gs.wasm_agents;
    if (data.states[a.idx] == AgentState.Escaping || data.current_tris[a.idx] === -1){ return; }
    const handle = data.target[a.idx];
    if (handle === 0){
      data.states[a.idx] = AgentState.Standing;
      data.target[a.idx] = 0;
      a.brain.stack.pop();
      return;
    }
    const enemyIdx = handle & INDEX_MASK;
    const gen = handle >>> INDEX_BITS;
    if (gen !== data.generation[enemyIdx] || gs.gameTime > this.loseInterestAt || data.predicament_ratings[a.idx] > 10){
      data.states[a.idx] = AgentState.Standing;
      data.target[a.idx] = 0;
      a.brain.stack.pop();
      return;
    }

    if (gs.gameTime - this.lastSwitch > ChaseEnemyBC.switch_interval){
      this.lastSwitch = gs.gameTime;
      if (data.nearest_enemy[a.idx] != gs.wasm_agents.target[a.idx]){
        this.init(gs, a, data.nearest_enemy[a.idx]);
      }
    }

    data.end_target_tris[a.idx] = data.last_valid_tris[enemyIdx];
    data.end_targets[a.idx * 2] = data.last_valid_positions[enemyIdx * 2];
    data.end_targets[a.idx * 2 + 1] = data.last_valid_positions[enemyIdx * 2 + 1];


    if (data.num_valid_corners[a.idx] == 1){
      data.next_corners[a.idx * 2] = data.end_targets[a.idx * 2];
      data.next_corners[a.idx * 2 + 1] = data.end_targets[a.idx * 2 + 1];
    }

    const enemyPoly = gs.navmesh.triangle_to_polygon[data.last_valid_tris[enemyIdx]];
    // const myPoly = gs.navmesh.triangle_to_polygon[data.current_tris[a.idx]];
    if (enemyPoly !== this.lastEnemyPoly || data.states[a.idx] == AgentState.Standing){
      this.lastEnemyPoly = enemyPoly;
      this.polyChanges++;
      if (this.polyChanges > 2 || data.states[a.idx] == AgentState.Standing){
        data.stuck_ratings[a.idx] = 0;
        data.path_frustrations[a.idx] = 0;
        cmdNavigateToNearbyTarget(gs.wasm_agents.events, a.idx);
        this.polyChanges = 0;
      }
    }
    data.states[a.idx] = AgentState.Traveling;
    data.arrival_desired_speeds[a.idx] = 1;
    data.arrival_threshold_sqs[a.idx] = 0.1;

    const posDiffX = data.positions[a.idx * 2] - data.positions[enemyIdx * 2];
    const posDiffY = data.positions[a.idx * 2 + 1] - data.positions[enemyIdx * 2 + 1];
    const distSq = posDiffX * posDiffX + posDiffY * posDiffY;
    if (distSq < MeleeAttackBC.range * MeleeAttackBC.range * 0.25){
      const melee = new MeleeAttackBC();
      melee.init(gs, a, enemyIdx);
      a.brain.stack.push(melee);
      return;
    }
  }
}
