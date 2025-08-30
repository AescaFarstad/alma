import { Brain } from "./agents/ai/Brain";
import type { GameState } from "./GameState";

export class WAgent {
  constructor(public readonly idx: number, public display: string, public brain : Brain) {}
}

export function serialize_wagent(gameState: GameState, idx: number) {
  const wasm_agents = gameState.wasm_agents;
  const agent = gameState.wagents.find(a => a.idx === idx);

  if (!wasm_agents.positions || !agent) {
    return null;
  }

  return {
    idx: idx,
    display: agent.display,
    // Core physics
    position: { x: wasm_agents.positions[idx * 2], y: wasm_agents.positions[idx * 2 + 1] },
    last_coordinate: { x: wasm_agents.last_coordinates[idx * 2], y: wasm_agents.last_coordinates[idx * 2 + 1] },
    velocity: { x: wasm_agents.velocities[idx * 2], y: wasm_agents.velocities[idx * 2 + 1] },
    look: { x: wasm_agents.looks[idx * 2], y: wasm_agents.looks[idx * 2 + 1] },
    state: wasm_agents.states[idx],
    is_alive: wasm_agents.is_alive[idx],

    // Navigation data
    current_tri: wasm_agents.current_tris[idx],
    next_corner: { x: wasm_agents.next_corners[idx * 2], y: wasm_agents.next_corners[idx * 2 + 1] },
    next_corner_tri: wasm_agents.next_corner_tris[idx],
    next_corner2: { x: wasm_agents.next_corners2[idx * 2], y: wasm_agents.next_corners2[idx * 2 + 1] },
    next_corner_tri2: wasm_agents.next_corner_tris2[idx],
    num_valid_corners: wasm_agents.num_valid_corners[idx],
    pre_escape_corner: { x: wasm_agents.pre_escape_corners[idx * 2], y: wasm_agents.pre_escape_corners[idx * 2 + 1] },
    pre_escape_corner_tri: wasm_agents.pre_escape_corner_tris[idx],
    end_target: { x: wasm_agents.end_targets[idx * 2], y: wasm_agents.end_targets[idx * 2 + 1] },
    end_target_tri: wasm_agents.end_target_tris[idx],
    last_valid_position: { x: wasm_agents.last_valid_positions[idx * 2], y: wasm_agents.last_valid_positions[idx * 2 + 1] },
    last_valid_tri: wasm_agents.last_valid_tris[idx],

    // Statistics
    last_end_target: { x: wasm_agents.last_end_targets[idx * 2], y: wasm_agents.last_end_targets[idx * 2 + 1] },
    min_corridor_length: wasm_agents.min_corridor_lengths[idx],
    last_distance_to_next_corner: wasm_agents.last_distances_to_next_corner[idx],
    sight_rating: wasm_agents.sight_ratings[idx],
    last_next_corner_tri: wasm_agents.last_next_corner_tris[idx],
    stuck_rating: wasm_agents.stuck_ratings[idx],
    path_frustration: wasm_agents.path_frustrations[idx],

    // Parameters
    max_speed: wasm_agents.max_speeds[idx],
    accel: wasm_agents.accels[idx],
    resistance: wasm_agents.resistances[idx],
    intelligence: wasm_agents.intelligences[idx],
    arrival_desired_speed: wasm_agents.arrival_desired_speeds[idx],
    look_speed: wasm_agents.look_speeds[idx],
    max_frustration: wasm_agents.max_frustrations[idx],
    arrival_threshold_sq: wasm_agents.arrival_threshold_sqs[idx],
    predicament_rating: wasm_agents.predicament_ratings[idx],

    // At very end
    frame_id: wasm_agents.frame_ids[idx],
  };
} 