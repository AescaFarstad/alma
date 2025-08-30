#include "wasm_impulse.h"
#include "benchmarks.h"
#include <stdio.h>
#include <emscripten/emscripten.h>

extern "C" {
  EMSCRIPTEN_KEEPALIVE
  void wasm_impulse(int impulse_code) {
    switch (impulse_code) {
      case WasmImpulse::POINT_IN_TRIANGLE_BENCH:
        point_in_triangle_bench();
        break;
      case WasmImpulse::POINT_IN_POLYGON_BENCH:
        point_in_polygon_bench();
        break;
      default:
        printf("[WASM] Unknown impulse code: %d\n", impulse_code);
        break;
    }
  }
} 