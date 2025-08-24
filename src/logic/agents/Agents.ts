import { WAgent } from "../WAgent";

// Maximum number of agents supported by the system
export const MAX_AGENTS = 18100;

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

  // At very end
  public frame_ids! : Uint16Array;
}