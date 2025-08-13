#pragma once

#include <cstdint>

#ifdef __cplusplus
extern "C" {
#endif

// Initialize WebGL2 renderer on the given canvas (CSS selector string)
void sprite_renderer_init(const char* canvas_selector);

// Upload raw RGBA8 atlas pixels to GPU
void sprite_upload_atlas_rgba(uint8_t* pixels, int width, int height);

// Upload frame table UVs (packed as [u0,v0,u1,v1] per frame, length=frameCount*4)
void sprite_upload_frame_table(const float* uv4_array, int frameCount);

// Single per-frame call that updates simulation timing/camera and renders
// m3x3 is a 3x3 row-major matrix for world->NDC mapping
void update_rt(float dt, const float* m3x3, int widthPx, int heightPx, float dpr);

#ifdef __cplusplus
}
#endif 