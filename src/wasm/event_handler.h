#pragma once
#include <cstdint>

// Shared event type codes across JS<->WASM
enum AgentEventType : uint16_t {
  EVT_NONE = 0,
  // JS -> WASM command: set agent corridor
  CMD_SET_CORRIDOR = 1,
  // WASM -> JS event: selected agent's full corridor broadcast
  EVT_SELECTED_CORRIDOR = 2,
  // JS -> WASM command: navigate to current target (agent_data.target[idx])
  CMD_NAVIGATE_TO_NEARBY_TARGET = 3,
  // JS -> WASM command: add a temporary modifier to an agent property
  // Payload (words):
  // [1] agent_handle (u32)
  // [2] property_id (u32)  // see ModProperty in agent_mods.h
  // [3] op (u32)           // 0 = multiply, 1 = add
  // [4] mod_value (f32)
  // [5] end_time (f32)
  // [6] fade_at (f32)      // if negative, equals end_time
  CMD_ADD_AGENT_MOD = 4,
};

// Process inbound JS->WASM events from the shared event buffer.
// 'now' is the current simulation timestamp used by time-based commands.
void process_events(float now);
