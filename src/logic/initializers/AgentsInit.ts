import { Agents, MAX_AGENTS } from "../agents/Agents";
import { WasmFacade } from "../WasmFacade";
import { GameState } from "../GameState";

function calculateAgentGridMemory(): number {
    const CELL_SIZE = 256.0;
    const WORLD_MIN_X = -10000.0;
    const WORLD_MIN_Y = -10000.0;
    const WORLD_MAX_X = 10000.0;
    const WORLD_MAX_Y = 10000.0;
    const GRID_WIDTH = Math.ceil((WORLD_MAX_X - WORLD_MIN_X) / CELL_SIZE);
    const GRID_HEIGHT = Math.ceil((WORLD_MAX_Y - WORLD_MIN_Y) / CELL_SIZE);
    const MAX_AGENTS_PER_CELL = 256;
    const TOTAL_CELLS = GRID_WIDTH * GRID_HEIGHT;

    const cell_data_size = TOTAL_CELLS * MAX_AGENTS_PER_CELL * 4;
    const cell_offsets_size = TOTAL_CELLS * 4;
    const cell_counts_size = TOTAL_CELLS * 4;

    return cell_data_size + cell_offsets_size + cell_counts_size;
}

export function calculateAgentsMemory(): number {
    const sizeOfPoint2 = 2 * 4; // 8 bytes
    const sizeOfInt = 4;
    const sizeOfFloat = 4;
    const sizeOfUint8 = 1;
    const sizeOfBool = 1;

    let totalSize = 0;

    // Core physics
    totalSize += sizeOfPoint2 * MAX_AGENTS; // positions
    totalSize += sizeOfPoint2 * MAX_AGENTS; // last_coordinates
    totalSize += sizeOfPoint2 * MAX_AGENTS; // velocities
    totalSize += sizeOfPoint2 * MAX_AGENTS; // looks
    totalSize += sizeOfUint8 * MAX_AGENTS; // states
    totalSize += sizeOfBool * MAX_AGENTS; // is_alive

    // Navigation data
    totalSize += sizeOfInt * MAX_AGENTS; // current_tris
    totalSize += sizeOfPoint2 * MAX_AGENTS; // next_corners
    totalSize += sizeOfInt * MAX_AGENTS; // next_corner_tris
    totalSize += sizeOfPoint2 * MAX_AGENTS; // next_corners2
    totalSize += sizeOfInt * MAX_AGENTS; // next_corner_tris2
    totalSize += sizeOfUint8 * MAX_AGENTS; // num_valid_corners
    totalSize += sizeOfPoint2 * MAX_AGENTS; // pre_escape_corners
    totalSize += sizeOfInt * MAX_AGENTS; // pre_escape_corner_tris
    totalSize += sizeOfPoint2 * MAX_AGENTS; // end_targets
    totalSize += sizeOfInt * MAX_AGENTS; // end_target_tris
    totalSize += sizeOfPoint2 * MAX_AGENTS; // last_valid_positions
    totalSize += sizeOfInt * MAX_AGENTS; // last_valid_tris
    totalSize += sizeOfFloat * MAX_AGENTS; // stuck_ratings
    totalSize += sizeOfFloat * MAX_AGENTS; // path_frustrations

    // Statistics
    totalSize += sizeOfPoint2 * MAX_AGENTS; // last_end_targets
    totalSize += sizeOfInt * MAX_AGENTS; // min_corridor_lengths
    totalSize += sizeOfFloat * MAX_AGENTS; // last_distances_to_next_corner
    totalSize += sizeOfFloat * MAX_AGENTS; // sight_ratings
    totalSize += sizeOfInt * MAX_AGENTS; // last_next_corner_tris

    // Parameters
    totalSize += sizeOfFloat * MAX_AGENTS; // max_speeds
    totalSize += sizeOfFloat * MAX_AGENTS; // accels
    totalSize += sizeOfFloat * MAX_AGENTS; // resistances
    totalSize += sizeOfFloat * MAX_AGENTS; // intelligences
    totalSize += sizeOfFloat * MAX_AGENTS; // arrival_desired_speeds
    totalSize += sizeOfFloat * MAX_AGENTS; // look_speeds
    totalSize += sizeOfFloat * MAX_AGENTS; // max_frustrations
    totalSize += sizeOfFloat * MAX_AGENTS; // arrival_threshold_sqs
    totalSize += sizeOfFloat * MAX_AGENTS; // predicament_ratings

    // At very end: frame_ids
    totalSize += 2 * MAX_AGENTS; // frame_ids (uint16)

    // C++ dynamic allocations
    totalSize += calculateAgentGridMemory();
    totalSize += MAX_AGENTS * 24; // corridors (approximate size of std::vector)
    totalSize += MAX_AGENTS * 4; // corridor_indices
    totalSize += MAX_AGENTS * 4; // wall_contact

    return totalSize;
}

export function initializeAgents(
    agents: Agents, 
    gs: GameState,
    wasmModule: WasmFacade, 
    buffer: ArrayBuffer, 
    offset: number
): number {
    let currentOffset = offset;

    // Core physics
    agents.positions = new Float32Array(buffer, currentOffset, MAX_AGENTS * 2);
    currentOffset += MAX_AGENTS * 2 * 4;

    agents.last_coordinates = new Float32Array(buffer, currentOffset, MAX_AGENTS * 2);
    currentOffset += MAX_AGENTS * 2 * 4;

    agents.velocities = new Float32Array(buffer, currentOffset, MAX_AGENTS * 2);
    currentOffset += MAX_AGENTS * 2 * 4;

    agents.looks = new Float32Array(buffer, currentOffset, MAX_AGENTS * 2);
    currentOffset += MAX_AGENTS * 2 * 4;

    agents.states = new Uint8Array(buffer, currentOffset, MAX_AGENTS);
    currentOffset += MAX_AGENTS * 1;

    agents.is_alive = new Uint8Array(buffer, currentOffset, MAX_AGENTS);
    currentOffset += MAX_AGENTS * 1;

    // Navigation data
    agents.current_tris = new Int32Array(buffer, currentOffset, MAX_AGENTS);
    currentOffset += MAX_AGENTS * 4;

    agents.next_corners = new Float32Array(buffer, currentOffset, MAX_AGENTS * 2);
    currentOffset += MAX_AGENTS * 2 * 4;

    agents.next_corner_tris = new Int32Array(buffer, currentOffset, MAX_AGENTS);
    currentOffset += MAX_AGENTS * 4;

    agents.next_corners2 = new Float32Array(buffer, currentOffset, MAX_AGENTS * 2);
    currentOffset += MAX_AGENTS * 2 * 4;

    agents.next_corner_tris2 = new Int32Array(buffer, currentOffset, MAX_AGENTS);
    currentOffset += MAX_AGENTS * 4;

    agents.num_valid_corners = new Uint8Array(buffer, currentOffset, MAX_AGENTS);
    currentOffset += MAX_AGENTS * 1;

    agents.pre_escape_corners = new Float32Array(buffer, currentOffset, MAX_AGENTS * 2);
    currentOffset += MAX_AGENTS * 2 * 4;

    agents.pre_escape_corner_tris = new Int32Array(buffer, currentOffset, MAX_AGENTS);
    currentOffset += MAX_AGENTS * 4;

    agents.end_targets = new Float32Array(buffer, currentOffset, MAX_AGENTS * 2);
    currentOffset += MAX_AGENTS * 2 * 4;

    agents.end_target_tris = new Int32Array(buffer, currentOffset, MAX_AGENTS);
    currentOffset += MAX_AGENTS * 4;

    agents.last_valid_positions = new Float32Array(buffer, currentOffset, MAX_AGENTS * 2);
    currentOffset += MAX_AGENTS * 2 * 4;

    agents.last_valid_tris = new Int32Array(buffer, currentOffset, MAX_AGENTS);
    currentOffset += MAX_AGENTS * 4;

    agents.stuck_ratings = new Float32Array(buffer, currentOffset, MAX_AGENTS);
    currentOffset += MAX_AGENTS * 4;

    agents.path_frustrations = new Float32Array(buffer, currentOffset, MAX_AGENTS);
    currentOffset += MAX_AGENTS * 4;

    // Statistics
    agents.last_end_targets = new Float32Array(buffer, currentOffset, MAX_AGENTS * 2);
    currentOffset += MAX_AGENTS * 2 * 4;

    agents.min_corridor_lengths = new Int32Array(buffer, currentOffset, MAX_AGENTS);
    currentOffset += MAX_AGENTS * 4;

    agents.last_distances_to_next_corner = new Float32Array(buffer, currentOffset, MAX_AGENTS);
    currentOffset += MAX_AGENTS * 4;

    agents.sight_ratings = new Float32Array(buffer, currentOffset, MAX_AGENTS);
    currentOffset += MAX_AGENTS * 4;

    agents.last_next_corner_tris = new Int32Array(buffer, currentOffset, MAX_AGENTS);
    currentOffset += MAX_AGENTS * 4;

    // Parameters
    agents.max_speeds = new Float32Array(buffer, currentOffset, MAX_AGENTS);
    currentOffset += MAX_AGENTS * 4;

    agents.accels = new Float32Array(buffer, currentOffset, MAX_AGENTS);
    currentOffset += MAX_AGENTS * 4;

    agents.resistances = new Float32Array(buffer, currentOffset, MAX_AGENTS);
    currentOffset += MAX_AGENTS * 4;

    agents.intelligences = new Float32Array(buffer, currentOffset, MAX_AGENTS);
    currentOffset += MAX_AGENTS * 4;

    agents.arrival_desired_speeds = new Float32Array(buffer, currentOffset, MAX_AGENTS);
    currentOffset += MAX_AGENTS * 4;

    agents.look_speeds = new Float32Array(buffer, currentOffset, MAX_AGENTS);
    currentOffset += MAX_AGENTS * 4;

    agents.max_frustrations = new Float32Array(buffer, currentOffset, MAX_AGENTS);
    currentOffset += MAX_AGENTS * 4;

    agents.arrival_threshold_sqs = new Float32Array(buffer, currentOffset, MAX_AGENTS);
    currentOffset += MAX_AGENTS * 4;

    agents.predicament_ratings = new Float32Array(buffer, currentOffset, MAX_AGENTS);
    currentOffset += MAX_AGENTS * 4;

    // At very end
    agents.frame_ids = new Uint16Array(buffer, currentOffset, MAX_AGENTS);
    currentOffset += MAX_AGENTS * 2;

    const bytesWritten = currentOffset - offset;
    
    // Call wasm-side initializer
    wasmModule._init_agents(offset, MAX_AGENTS, gs.rngSeed);
    
    return bytesWritten;
}