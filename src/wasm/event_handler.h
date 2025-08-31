#pragma once
#include <cstdint>

// Shared event type codes across JS<->WASM
enum AgentEventType : uint16_t {
  EVT_NONE = 0,
  // JS -> WASM command: set agent corridor
  CMD_SET_CORRIDOR = 1,
  // WASM -> JS event: selected agent's full corridor broadcast
  EVT_SELECTED_CORRIDOR = 2,
};

// Process inbound JS->WASM events from the shared event buffer.
void process_events();
