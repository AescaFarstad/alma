import { cross, distance_sq, dot, set } from "../../core/math";
import { Point2 } from "../../core/math";
import { GameState } from "../../GameState";
import { WAgent } from "../../WAgent";
import { AgentState, STUCK_DANGER_1 } from "../Agent";
import { Agents, INDEX_BITS, INDEX_MASK } from "../Agents";
import { BrainCell, BrainCellResult, BrainCellType } from "./Brain";

let desired_look : Point2 = { x: 0, y: 0 };
let my_pos : Point2 = { x: 0, y: 0 };
let enemy_pos : Point2 = { x: 0, y: 0 };
export class MeleeAttackBC implements BrainCell{
  typeId = BrainCellType.MELEE_ATTACK;

  public static range : number = 7;
  public static attack_angle : number = Math.PI / 4;
  public static attack_hit_delay : number = 0.18;
  public static movement_allowed_delay : number = .5;
  public static attack_duration : number = 1;
  public static damage : number = 10;

  private attack_started_at : number = 0;
  private attack_hit_done : boolean = false;

  update(gs: GameState, a: WAgent, dt: number): BrainCellResult {
    const data = gs.wasm_agents;
    const handle = data.target[a.idx];
    if (handle === 0){
      return BrainCellResult.FAIL;
    }
    const enemyIdx = handle & INDEX_MASK;
    const gen = handle >>> INDEX_BITS;
    if (gen !== data.generation[enemyIdx]){
      data.target[a.idx] = 0;
      return BrainCellResult.FAIL;
    }

    set(my_pos, data.positions[a.idx * 2], data.positions[a.idx * 2 + 1]);
    set(desired_look, data.positions[enemyIdx * 2] - my_pos.x, data.positions[enemyIdx * 2 + 1] - my_pos.y);
    const lookDiff = look_at(data, a, desired_look, dt);
    if (lookDiff > MeleeAttackBC.attack_angle) return BrainCellResult.FAIL;

    if (data.cooldown[a.idx] < gs.gameTime){
      this.attack_started_at = gs.gameTime;
      data.cooldown[a.idx] = gs.gameTime + MeleeAttackBC.attack_duration;
      this.attack_hit_done = false;
      data.states[a.idx] = AgentState.Standing;
    }

    const attackTimePassed = gs.gameTime - this.attack_started_at;
    if (attackTimePassed > MeleeAttackBC.attack_hit_delay && !this.attack_hit_done){
      if (attackTimePassed < MeleeAttackBC.attack_duration){
        this.attack_hit_done = true;
        set(enemy_pos, data.positions[enemyIdx * 2], data.positions[enemyIdx * 2 + 1]);
        const dSq = distance_sq(my_pos, enemy_pos);
        if (dSq > MeleeAttackBC.range * MeleeAttackBC.range)
          return BrainCellResult.FAIL;
        damage_agent(data, enemyIdx, MeleeAttackBC.damage, gs.gameTime);
      }
    }

    return BrainCellResult.RUNNING;
  }

  public can_move(gs: GameState, a: WAgent): boolean {
    return gs.gameTime - this.attack_started_at > MeleeAttackBC.movement_allowed_delay;
  }
}

function damage_agent(data : Agents, enemyIdx : number, damage : number, timeStamp: number): void {
  data.hp[enemyIdx] -= damage;
  data.last_damage_stamp[enemyIdx] = timeStamp;
  if (data.hp[enemyIdx] <= 0){
    data.is_alive[enemyIdx] = 0;
    // Add to dead list for efficient pruning in Model
    if (data.dead_indices && data.dead_count < data.dead_indices.length) {
      data.dead_indices[data.dead_count++] = enemyIdx | 0;
    }

    let newGen = (data.generation[enemyIdx] + 1) & 0xffff;
    if (newGen === 0) newGen = 1; // skip invalid 0 generation
    data.generation[enemyIdx] = newGen;

    if (data.free_list && data.free_list_cursor > 0) {
      const pos = (data.free_list_cursor - 1) | 0;
      data.free_list[pos] = enemyIdx | 0;
      data.free_list_cursor = pos;
    }
  }
}

let agent_look : Point2 = { x: 0, y: 0 };
function look_at(data : Agents, a:WAgent, desired_dir : Point2, deltaTime : number): number {
  set(agent_look, data.looks[a.idx * 2], data.looks[a.idx * 2 + 1]);
  const dotVT = dot(agent_look, desired_dir);
  const clampedDot = Math.max(-1, Math.min(1, dotVT));
  const crossVT = cross(agent_look, desired_dir);
  const angleToTarget = Math.atan2(crossVT, clampedDot);
  const maxStep = data.look_speeds[a.idx] * deltaTime;
  const step = angleToTarget > maxStep ? maxStep : (angleToTarget < -maxStep ? -maxStep : angleToTarget);
  const s = Math.sin(step);
  const c = Math.cos(step);
  data.looks[a.idx * 2] = c * agent_look.x - s * agent_look.y;
  data.looks[a.idx * 2 + 1] = s * agent_look.x + c * agent_look.y;
  return angleToTarget - step;
}
