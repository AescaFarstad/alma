#ifndef EVENT_BUFFER_H
#define EVENT_BUFFER_H

#include <cstdint>

class EventBuffer {
public:
    uint32_t  cursor = 0u;
    uint32_t* u32_base = nullptr;
    float*    f32_base = nullptr;
    uint32_t  cap_words = 0u;

    void set(uint8_t* base, uint32_t cap_words);
    void begin_frame();
    void commit_frame();

    // Emit header [type:int16 | size:int16]; returns false if insufficient capacity.
    void write_header(uint16_t type, uint16_t size_words);
};

extern EventBuffer g_event_buffer;

#endif // EVENT_BUFFER_H
