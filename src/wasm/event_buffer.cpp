#include "event_buffer.h"
#include <emscripten/emscripten.h>
#include "wasm_log.h"

EventBuffer g_event_buffer;

void EventBuffer::set(uint8_t* base, uint32_t cap_words_) {
  uintptr_t addr = reinterpret_cast<uintptr_t>(base);
  addr = (addr + 3) & ~static_cast<uintptr_t>(3);
  u32_base = reinterpret_cast<uint32_t*>(addr);
  f32_base = reinterpret_cast<float*>(addr);
  cap_words = cap_words_;
  cursor = 0u;
}

void EventBuffer::begin_frame() {
  cursor = 0u;
}

void EventBuffer::commit_frame() {
  if (u32_base && cursor < cap_words) u32_base[cursor] = 0u;
}

void EventBuffer::write_header(uint16_t type, uint16_t size_words) {
  if (cursor + size_words >= cap_words){
    wasm_console_error("Event buffer full");
    return;
  }
  u32_base[cursor] = (static_cast<uint32_t>(size_words) << 16) | static_cast<uint32_t>(type);
  cursor += size_words;
}
