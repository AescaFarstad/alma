// No imports on purpose; keep this a dumb data module

import { Agent } from "./Agent";
import { BrainCellType } from "./ai/Brain";
export type AgentConfig = Readonly<Partial<Omit<Agent, 'brain'>> & { brainCells: readonly BrainCellType[] }>;

export class AgentConfigs {

  static readonly walker2 = {
    coordinate: { x: 0, y: 0 },
    accel: 500,
    resistance: 0.99,
    maxFrustration: 4,
    intelligence: 1,
    arrivalDesiredSpeed: 0.05,
    arrivalThresholdSq: 25,
    display: "character_black_red",
    lookSpeed: 30,
    maxSpeed: 217,
    brainCells: [BrainCellType.WANDERER_FLOAT],
  } as const;

  static readonly walker1 = {
    coordinate: { x: 0, y: 0 },
    accel: 500,
    resistance: 0.99,
    maxFrustration: 4,
    intelligence: 1,
    arrivalDesiredSpeed: 0.05,
    arrivalThresholdSq: 25,
    display: "character_black_green",
    lookSpeed: 30,
    maxSpeed: 217,
    brainCells: [BrainCellType.WANDERER_DIR],
  } as const;

  static readonly benchmarkerSmart = {
    coordinate: { x: 0, y: 0 },
    accel: 500,
    resistance: 0.9,
    maxFrustration: 4,
    intelligence: 1,
    arrivalDesiredSpeed: 1,
    arrivalThresholdSq: 4,
    display: "character_black_blue",
    lookSpeed: 50,
    maxSpeed: 217,
    brainCells: [BrainCellType.RANDOM_JOURNEY],
  } as const;

  static readonly benchmarkerStupid = {
    coordinate: { x: 0, y: 0 },
    accel: 500,
    resistance: 0.9,
    maxFrustration: 4,
    intelligence: 0,
    arrivalDesiredSpeed: 0.05,
    arrivalThresholdSq: 25,
    display: "character_black_blue",
    lookSpeed: 50,
    maxSpeed: 217,
    brainCells: [BrainCellType.RANDOM_JOURNEY],
  } as const;
}
