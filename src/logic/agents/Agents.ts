import { EventBuffer } from "../EventBuffer";
import { WAgent } from "../WAgent";

export const INDEX_BITS = 16;
export const GENERATION_BITS = 16;

export const INDEX_MASK = (1 << INDEX_BITS) - 1;
export const GENERATION_MASK = (1 << GENERATION_BITS) - 1;

// Maximum number of agents supported by the system
export const MAX_AGENTS = 36100;

export class Agents {
  // Core physics
  public positions! : Float32Array;
  public last_coordinates! : Float32Array;
  public velocities! : Float32Array;
  public looks! : Float32Array;
  public states! : Uint8Array;
  public is_alive! : Uint8Array;

  // Navigation data
  public current_tris! : Int32Array;
  public next_corners! : Float32Array;
  public next_corner_tris! : Int32Array;
  public next_corners2! : Float32Array;
  public next_corner_tris2! : Int32Array;
  public num_valid_corners! : Uint8Array;
  public pre_escape_corners! : Float32Array;
  public pre_escape_corner_tris! : Int32Array;
  public end_targets! : Float32Array;
  public end_target_tris! : Int32Array;
  public last_valid_positions! : Float32Array;
  public last_valid_tris! : Int32Array;
  public alien_polys! : Int32Array;
  public last_visible_points_for_next_corner! : Float32Array;

  // Statistics
  public last_end_targets! : Float32Array;
  public min_corridor_lengths! : Int32Array;
  public last_distances_to_next_corner! : Float32Array;
  public sight_ratings! : Float32Array;
  public last_next_corner_tris! : Int32Array;
  public stuck_ratings! : Float32Array;
  public path_frustrations! : Float32Array;

  // Parameters
  public max_speeds! : Float32Array;
  public accels! : Float32Array;
  public resistances! : Float32Array;
  public intelligences! : Float32Array;
  public arrival_desired_speeds! : Float32Array;
  public look_speeds! : Float32Array;
  public max_frustrations! : Float32Array;
  public arrival_threshold_sqs! : Float32Array;
  public predicament_ratings! : Float32Array;

  // Combat/AI
  public proto!: Int32Array;
  public weapon_proto!: Int32Array;
  public team!: Int32Array;
  public hp!: Int32Array;
  public nearest_enemy!: Uint32Array;
  public target!: Uint32Array;
  public cooldown!: Float32Array;
  public morale!: Float32Array;
  public last_damage_stamp!: Float32Array;

  // At very end
  public frame_ids! : Uint16Array;
  public generation! : Uint16Array;

  public events!: EventBuffer;

  // Free-list of available SoA indices (stack semantics)
  public free_list!: Int32Array; // length MAX_AGENTS; values are indices
  public free_list_cursor: number = 0; // points to next slot to pop from

  // Dead indices recorded during a frame for efficient pruning of wrappers
  public dead_indices!: Int32Array; // length MAX_AGENTS
  public dead_count: number = 0;
}

// When adding a new field to Agents:
// - Add the typed array property here with the correct type.
// - Update memory sizing in `src/logic/initializers/AgentsInit.ts::calculateAgentsMemory`.
// - Map the new view in `initializeAgents` with correct order and element size.
// - Mirror the layout in WASM:
//   * Add pointer in `src/wasm/data_structures.h` AgentSoA.
//   * Map it in `src/wasm/agent_init.cpp::initialize_shared_buffer_layout`.
//   * Initialize zero or invalid defaults in `initialize_agent_defaults`.
// - If needed for tools/UI, extend serializers and dev UI (`src/logic/WAgent.ts`, `src/wasm/wasm_log.h`, `src/components/ui/devUI/DevAgentExplorer.vue`).
// - If the field is likely to be explicitly inited when creating an agent, add the property to `src/logic/agents/Agent.ts`:Agent.
