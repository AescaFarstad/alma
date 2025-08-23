import type { GameState } from "./GameState";

export class WAgent {
    constructor(public readonly agentIndex: number, public display: string) {}
}

export function serialize_wagent(gameState: GameState, agentIndex: number) {
    const wasm_agents = gameState.wasm_agents;
    const agent = gameState.wagents.find(a => a.agentIndex === agentIndex);

    if (!wasm_agents.positions || !agent) {
        return null;
    }

    return {
      agentIndex: agentIndex,
      display: agent.display,
      // Core physics
      position: { x: wasm_agents.positions[agentIndex * 2], y: wasm_agents.positions[agentIndex * 2 + 1] },
      last_coordinate: { x: wasm_agents.last_coordinates[agentIndex * 2], y: wasm_agents.last_coordinates[agentIndex * 2 + 1] },
      velocity: { x: wasm_agents.velocities[agentIndex * 2], y: wasm_agents.velocities[agentIndex * 2 + 1] },
      look: { x: wasm_agents.looks[agentIndex * 2], y: wasm_agents.looks[agentIndex * 2 + 1] },
      state: wasm_agents.states[agentIndex],
      is_alive: wasm_agents.is_alive[agentIndex],

      // Navigation data
      current_tri: wasm_agents.current_tris[agentIndex],
      next_corner: { x: wasm_agents.next_corners[agentIndex * 2], y: wasm_agents.next_corners[agentIndex * 2 + 1] },
      next_corner_tri: wasm_agents.next_corner_tris[agentIndex],
      next_corner2: { x: wasm_agents.next_corners2[agentIndex * 2], y: wasm_agents.next_corners2[agentIndex * 2 + 1] },
      next_corner_tri2: wasm_agents.next_corner_tris2[agentIndex],
      num_valid_corners: wasm_agents.num_valid_corners[agentIndex],
      pre_escape_corner: { x: wasm_agents.pre_escape_corners[agentIndex * 2], y: wasm_agents.pre_escape_corners[agentIndex * 2 + 1] },
      pre_escape_corner_tri: wasm_agents.pre_escape_corner_tris[agentIndex],
      end_target: { x: wasm_agents.end_targets[agentIndex * 2], y: wasm_agents.end_targets[agentIndex * 2 + 1] },
      end_target_tri: wasm_agents.end_target_tris[agentIndex],
      last_valid_position: { x: wasm_agents.last_valid_positions[agentIndex * 2], y: wasm_agents.last_valid_positions[agentIndex * 2 + 1] },
      last_valid_tri: wasm_agents.last_valid_tris[agentIndex],

      // Statistics
      last_end_target: { x: wasm_agents.last_end_targets[agentIndex * 2], y: wasm_agents.last_end_targets[agentIndex * 2 + 1] },
      min_corridor_length: wasm_agents.min_corridor_lengths[agentIndex],
      last_distance_to_next_corner: wasm_agents.last_distances_to_next_corner[agentIndex],
      sight_rating: wasm_agents.sight_ratings[agentIndex],
      last_next_corner_tri: wasm_agents.last_next_corner_tris[agentIndex],
      stuck_rating: wasm_agents.stuck_ratings[agentIndex],
      path_frustration: wasm_agents.path_frustrations[agentIndex],

      // Parameters
      max_speed: wasm_agents.max_speeds[agentIndex],
      accel: wasm_agents.accels[agentIndex],
      resistance: wasm_agents.resistances[agentIndex],
      intelligence: wasm_agents.intelligences[agentIndex],
      arrival_desired_speed: wasm_agents.arrival_desired_speeds[agentIndex],
      look_speed: wasm_agents.look_speeds[agentIndex],
      max_frustration: wasm_agents.max_frustrations[agentIndex],
      arrival_threshold_sq: wasm_agents.arrival_threshold_sqs[agentIndex],
      predicament_rating: wasm_agents.predicament_ratings[agentIndex],

      // At very end
      frame_id: wasm_agents.frame_ids[agentIndex],
    };
} 