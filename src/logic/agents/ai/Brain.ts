import { cross, distance_sq, dot, set } from "../../core/math";
import { Point2 } from "../../core/math";
import { advanceSeed, seededRandom } from "../../core/mathUtils";
import { GameState } from "../../GameState";
import { getRandomTriangleInArea, getTriangleFromPoint } from "../../navmesh/NavUtils";
import { WAgent } from "../../WAgent";
import { AgentState, STUCK_DANGER_1 } from "../Agent";
import { Agents } from "../Agents";
import { cmdSetCorridor, CorridorAction } from "../EventHandler";
import { ChaseEnemyBC } from "./ChaseEnemyBC";
import { MeleeAttackBC } from "./MeleeAttackBC";
import { WanderDirBC } from "./WanderDirBC";
import { WanderFloatBC } from "./WanderFloatBC";
import { Zombie1MBC } from "./Zombie1MBC";

export class Brain{
  constructor(public stack : Array<BrainCell>) {}
}

export interface BrainCell{
  typeId : BrainCellType;
  update(gs:GameState, a : WAgent, dt : number):BrainCellResult;
}

export enum BrainCellType{
  RANDOM_JOURNEY = 0,
  WANDERER_DIR = 1,
  WANDERER_FLOAT = 2,
  CHASE_ENEMY = 3,
  MELEE_ATTACK = 4,
  ZOMBIE_1,
}


export enum BrainCellResult{
  FAIL = 0,
  RUNNING = 1,
  SUCCESS = 2,
}

/*
Brain cells must not set state Standing if they are not on the navmesh.
*/

function update_random_journey(gs: GameState, a: WAgent, dt: number): BrainCellResult {
  if (gs.wasm_agents.states[a.idx] == AgentState.Standing) {
    const data = gs.wasm_agents;
    const navmesh = gs.navmesh;
    const endNode = getRandomTriangleInArea(navmesh, 0, 0, 100, gs.rngSeedW);
    gs.rngSeedW = advanceSeed(gs.rngSeedW);

    data.end_targets[a.idx * 2] = navmesh.triangle_centroids[endNode * 2];
    data.end_targets[a.idx * 2 + 1] = navmesh.triangle_centroids[endNode * 2 + 1];
    data.end_target_tris[a.idx] = endNode;
    data.predicament_ratings[a.idx] = 0;
    data.states[a.idx] = AgentState.Traveling;
  }
  return BrainCellResult.RUNNING;
}

export class RandomJourneyCell implements BrainCell{
  typeId = BrainCellType.RANDOM_JOURNEY;
  update = update_random_journey;
}

const randomJourneryCell = new RandomJourneyCell(); //stateless, thus one is enough.
export function createBrain(cellTypes: BrainCellType[], gs: GameState, wAgent: WAgent): Brain {
  const cells: BrainCell[] = [];
  for (const typeId of cellTypes) {
    switch (typeId) {
      case BrainCellType.RANDOM_JOURNEY:
        cells.push(randomJourneryCell);
        break;
      case BrainCellType.WANDERER_DIR:
        cells.push(new WanderDirBC());
        break;
      case BrainCellType.ZOMBIE_1:
        cells.push(new Zombie1MBC());
        break;
      case BrainCellType.WANDERER_FLOAT:
        cells.push(new WanderFloatBC());
        break;
      case BrainCellType.CHASE_ENEMY:
        cells.push(new ChaseEnemyBC());
        break;
      case BrainCellType.MELEE_ATTACK:
        cells.push(new MeleeAttackBC());
        break;
    }
    if (cells[cells.length - 1].hasOwnProperty('init')){
      (cells[cells.length - 1] as any).init(gs, wAgent);
    }
  }
  return new Brain(cells);
}