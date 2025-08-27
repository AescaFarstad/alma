import { NavConst } from "../agents/NavConst";
import { WasmFacade } from "../WasmFacade";

export function calculateConstMemory(): number {
    return Object.keys(NavConst).length * 4;
}

export function initializeConst(wasm: WasmFacade, buffer: ArrayBuffer, offset: number): number {
    const i32 = new Int32Array(buffer, offset);
    const f32 = new Float32Array(buffer, offset);
    
    let i = 0;
    f32[i++] = NavConst.STUCK_PASSIVE_X1;
    f32[i++] = NavConst.STUCK_DST_X2;
    f32[i++] = NavConst.STUCK_CORRIDOR_X3;
    f32[i++] = NavConst.STUCK_DECAY;
    f32[i++] = NavConst.STUCK_DANGER_1;
    f32[i++] = NavConst.STUCK_DANGER_2;
    f32[i++] = NavConst.STUCK_DANGER_3;
    f32[i++] = NavConst.STUCK_HIT_WALL;
    i32[i++] = NavConst.PATH_LOG_RATE;
    f32[i++] = NavConst.LOOK_ROT_SPEED_RAD_S;
    f32[i++] = NavConst.CORRIDOR_EXPECTED_JUMP;
    f32[i++] = NavConst.ARRIVAL_THRESHOLD_SQ_DEFAULT;
    f32[i++] = NavConst.ARRIVAL_DESIRED_SPEED_DEFAULT;
    f32[i++] = NavConst.MAX_SPEED_DEFAULT;
    f32[i++] = NavConst.ACCEL_DEFAULT;
    f32[i++] = NavConst.RESISTANCE_DEFAULT;
    f32[i++] = NavConst.MAX_FRUSTRATION_DEFAULT;
    f32[i++] = NavConst.CORNER_OFFSET;
    f32[i++] = NavConst.CORNER_OFFSET_SQ;

    if (i !== Object.keys(NavConst).length) {
        throw new Error("Mismatch between number of constants and initialized values");
    }

    console.log("--- TypeScript NavConst Values ---");
    for (const key in NavConst) {
        console.log(`${key}: ${NavConst[key as keyof typeof NavConst]}`);
    }
    console.log("------------------------------------");

    const bytesWritten = i * 4;
    
    wasm._set_constants_buffer(offset);

    return bytesWritten;
} 