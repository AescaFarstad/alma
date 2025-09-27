import { GameState } from "../../GameState";
import { WAgent } from "../../WAgent";
import { AgentState } from "../Agent";
import { BrainCell, BrainCellResult, BrainCellType } from "./Brain";
import { ChaseEnemyBC, try_start_chasing_enemy } from "./ChaseEnemyBC";
import { MeleeAttackBC } from "./MeleeAttackBC";
import { WanderDirBC } from "./WanderDirBC";

enum Zombie1State{
  WANDER = 0,
  CHASE = 1,
  // FLEE = 2,
}

export class Zombie1MBC implements BrainCell{
  typeId = BrainCellType.ZOMBIE_1;

  private wanderBC : WanderDirBC = new WanderDirBC();
  private chaseBC : ChaseEnemyBC = new ChaseEnemyBC();
  private attackBC : MeleeAttackBC = new MeleeAttackBC();

  private state : Zombie1State = Zombie1State.WANDER;
  private attackTicket : boolean = false;
  private reactionCounter : number = 0;
  private reactionBreakpoint : number = 1;

  init(gs: GameState, a: WAgent): void {
    this.reactionBreakpoint = (a.idx / 100.0) % 1.3 + 0.2;
  }

  update(gs: GameState, a: WAgent, dt: number): BrainCellResult {
    const data = gs.wasm_agents;
    if (data.states[a.idx] == AgentState.Escaping || data.current_tris[a.idx] === -1){ return BrainCellResult.RUNNING; }
    this.reactionCounter += dt;
    if (this.reactionCounter >= this.reactionBreakpoint){
      this.reactionCounter -= this.reactionBreakpoint;
    }

    switch(this.state){
      case Zombie1State.WANDER:
        if (this.reactionCounter <= dt){
          const handle = try_start_chasing_enemy(gs, a);
          if (handle !== 0){
            this.chaseBC.init(gs, a, handle);
            this.state = Zombie1State.CHASE;
          }
        }
        else{
          this.wanderBC.update(gs, a, dt);
        }
        break;
      case Zombie1State.CHASE:
        if (this.attackBC.can_move(gs, a)){
          const result = this.chaseBC.update(gs, a, dt);
          if (result === BrainCellResult.SUCCESS)
            this.attackTicket = true;
          else if (result === BrainCellResult.FAIL)
            this.state = Zombie1State.WANDER;
        }
        if (this.attackTicket){
          this.chaseBC.renew_interest(gs);
          const result = this.attackBC.update(gs, a, dt);
          if (result != BrainCellResult.RUNNING)
            this.attackTicket = false;
        }
        break;
    }

    return BrainCellResult.RUNNING;
  }
}