import { WasmModule } from "../../WasmModule";

export interface AgentDataViews {
  // Core physics
  positions: Float32Array;
  last_coordinates: Float32Array;
  velocities: Float32Array;
  looks: Float32Array;
  states: Uint8Array;
  is_alive: Uint8Array;

  // Navigation data
  current_tris: Int32Array;
  next_corners: Float32Array;
  next_corner_tris: Int32Array;
  next_corners2: Float32Array;
  next_corner_tris2: Int32Array;
  num_valid_corners: Uint8Array;
  pre_escape_corners: Float32Array;
  pre_escape_corner_tris: Int32Array;
  end_targets: Float32Array;
  end_target_tris: Int32Array;
  last_valid_positions: Float32Array;
  last_valid_tris: Int32Array;

  // Statistics
  last_end_targets: Float32Array;
  min_corridor_lengths: Int32Array;
  last_distances_to_next_corner: Float32Array;
  sight_ratings: Float32Array;
  last_next_corner_tris: Int32Array;
  stuck_ratings: Float32Array;
  path_frustrations: Float32Array;

  // Parameters
  max_speeds: Float32Array;
  accels: Float32Array;
  resistances: Float32Array;
  intelligences: Float32Array;
  arrival_desired_speeds: Float32Array;
  look_speeds: Float32Array;
  max_frustrations: Float32Array;
  arrival_threshold_sqs: Float32Array;
  predicament_ratings: Float32Array;

  // At very end
  frame_ids: Uint16Array;
}

export function calculateAgentDataSize(maxAgents: number): number {
  const sizeOfPoint2 = 2 * 4; // 8 bytes
  const sizeOfInt = 4;
  const sizeOfFloat = 4;
  const sizeOfUint8 = 1;
  const sizeOfBool = 1;

  let totalSize = 0;

  // Core physics
  totalSize += sizeOfPoint2 * maxAgents; // positions
  totalSize += sizeOfPoint2 * maxAgents; // last_coordinates
  totalSize += sizeOfPoint2 * maxAgents; // velocities
  totalSize += sizeOfPoint2 * maxAgents; // looks
  totalSize += sizeOfUint8 * maxAgents; // states
  totalSize += sizeOfBool * maxAgents; // is_alive

  // Navigation data
  totalSize += sizeOfInt * maxAgents; // current_tris
  totalSize += sizeOfPoint2 * maxAgents; // next_corners
  totalSize += sizeOfInt * maxAgents; // next_corner_tris
  totalSize += sizeOfPoint2 * maxAgents; // next_corners2
  totalSize += sizeOfInt * maxAgents; // next_corner_tris2
  totalSize += sizeOfUint8 * maxAgents; // num_valid_corners
  totalSize += sizeOfPoint2 * maxAgents; // pre_escape_corners
  totalSize += sizeOfInt * maxAgents; // pre_escape_corner_tris
  totalSize += sizeOfPoint2 * maxAgents; // end_targets
  totalSize += sizeOfInt * maxAgents; // end_target_tris
  totalSize += sizeOfPoint2 * maxAgents; // last_valid_positions
  totalSize += sizeOfInt * maxAgents; // last_valid_tris
  totalSize += sizeOfFloat * maxAgents; // stuck_ratings
  totalSize += sizeOfFloat * maxAgents; // path_frustrations

  // Statistics
  totalSize += sizeOfPoint2 * maxAgents; // last_end_targets
  totalSize += sizeOfInt * maxAgents; // min_corridor_lengths
  totalSize += sizeOfFloat * maxAgents; // last_distances_to_next_corner
  totalSize += sizeOfFloat * maxAgents; // sight_ratings
  totalSize += sizeOfInt * maxAgents; // last_next_corner_tris

  // Parameters
  totalSize += sizeOfFloat * maxAgents; // max_speeds
  totalSize += sizeOfFloat * maxAgents; // accels
  totalSize += sizeOfFloat * maxAgents; // resistances
  totalSize += sizeOfFloat * maxAgents; // intelligences
  totalSize += sizeOfFloat * maxAgents; // arrival_desired_speeds
  totalSize += sizeOfFloat * maxAgents; // look_speeds
  totalSize += sizeOfFloat * maxAgents; // max_frustrations
  totalSize += sizeOfFloat * maxAgents; // arrival_threshold_sqs
  totalSize += sizeOfFloat * maxAgents; // predicament_ratings

  // At very end: frame_ids
  totalSize += 2 * maxAgents; // frame_ids (uint16)

  return totalSize;
}

export function createAgentDataViews(wasm: WasmModule, sharedBufferPtr: number, maxAgents: number): AgentDataViews {
  const wasmHeap = wasm.HEAPU8;
  const views = {} as AgentDataViews;
  let offset = sharedBufferPtr >>> 0;

  // Core physics
  views.positions = new Float32Array(wasmHeap.buffer, offset, maxAgents * 2);
  offset += maxAgents * 2 * 4;

  views.last_coordinates = new Float32Array(wasmHeap.buffer, offset, maxAgents * 2);
  offset += maxAgents * 2 * 4;

  views.velocities = new Float32Array(wasmHeap.buffer, offset, maxAgents * 2);
  offset += maxAgents * 2 * 4;

  views.looks = new Float32Array(wasmHeap.buffer, offset, maxAgents * 2);
  offset += maxAgents * 2 * 4;

  views.states = new Uint8Array(wasmHeap.buffer, offset, maxAgents);
  offset += maxAgents * 1;

  views.is_alive = new Uint8Array(wasmHeap.buffer, offset, maxAgents);
  offset += maxAgents * 1;

  // Navigation data
  views.current_tris = new Int32Array(wasmHeap.buffer, offset, maxAgents);
  offset += maxAgents * 4;

  views.next_corners = new Float32Array(wasmHeap.buffer, offset, maxAgents * 2);
  offset += maxAgents * 2 * 4;

  views.next_corner_tris = new Int32Array(wasmHeap.buffer, offset, maxAgents);
  offset += maxAgents * 4;

  views.next_corners2 = new Float32Array(wasmHeap.buffer, offset, maxAgents * 2);
  offset += maxAgents * 2 * 4;

  views.next_corner_tris2 = new Int32Array(wasmHeap.buffer, offset, maxAgents);
  offset += maxAgents * 4;

  views.num_valid_corners = new Uint8Array(wasmHeap.buffer, offset, maxAgents);
  offset += maxAgents * 1;

  views.pre_escape_corners = new Float32Array(wasmHeap.buffer, offset, maxAgents * 2);
  offset += maxAgents * 2 * 4;

  views.pre_escape_corner_tris = new Int32Array(wasmHeap.buffer, offset, maxAgents);
  offset += maxAgents * 4;

  views.end_targets = new Float32Array(wasmHeap.buffer, offset, maxAgents * 2);
  offset += maxAgents * 2 * 4;

  views.end_target_tris = new Int32Array(wasmHeap.buffer, offset, maxAgents);
  offset += maxAgents * 4;

  views.last_valid_positions = new Float32Array(wasmHeap.buffer, offset, maxAgents * 2);
  offset += maxAgents * 2 * 4;

  views.last_valid_tris = new Int32Array(wasmHeap.buffer, offset, maxAgents);
  offset += maxAgents * 4;

  views.stuck_ratings = new Float32Array(wasmHeap.buffer, offset, maxAgents);
  offset += maxAgents * 4;

  views.path_frustrations = new Float32Array(wasmHeap.buffer, offset, maxAgents);
  offset += maxAgents * 4;

  // Statistics
  views.last_end_targets = new Float32Array(wasmHeap.buffer, offset, maxAgents * 2);
  offset += maxAgents * 2 * 4;

  views.min_corridor_lengths = new Int32Array(wasmHeap.buffer, offset, maxAgents);
  offset += maxAgents * 4;

  views.last_distances_to_next_corner = new Float32Array(wasmHeap.buffer, offset, maxAgents);
  offset += maxAgents * 4;

  views.sight_ratings = new Float32Array(wasmHeap.buffer, offset, maxAgents);
  offset += maxAgents * 4;

  views.last_next_corner_tris = new Int32Array(wasmHeap.buffer, offset, maxAgents);
  offset += maxAgents * 4;

  // Parameters
  views.max_speeds = new Float32Array(wasmHeap.buffer, offset, maxAgents);
  offset += maxAgents * 4;

  views.accels = new Float32Array(wasmHeap.buffer, offset, maxAgents);
  offset += maxAgents * 4;

  views.resistances = new Float32Array(wasmHeap.buffer, offset, maxAgents);
  offset += maxAgents * 4;

  views.intelligences = new Float32Array(wasmHeap.buffer, offset, maxAgents);
  offset += maxAgents * 4;

  views.arrival_desired_speeds = new Float32Array(wasmHeap.buffer, offset, maxAgents);
  offset += maxAgents * 4;

  views.look_speeds = new Float32Array(wasmHeap.buffer, offset, maxAgents);
  offset += maxAgents * 4;

  views.max_frustrations = new Float32Array(wasmHeap.buffer, offset, maxAgents);
  offset += maxAgents * 4;

  views.arrival_threshold_sqs = new Float32Array(wasmHeap.buffer, offset, maxAgents);
  offset += maxAgents * 4;

  views.predicament_ratings = new Float32Array(wasmHeap.buffer, offset, maxAgents);
  offset += maxAgents * 4;

  // At very end
  views.frame_ids = new Uint16Array(wasmHeap.buffer, offset, maxAgents);
  offset += maxAgents * 2;

  return views;
} 