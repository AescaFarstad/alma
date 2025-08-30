## Goals

- **What**: Add an alternative renderer that draws agent sprites (quads) from C++/WASM using a single atlas, with per-agent tinting.
- **Why**: Eliminate per-sprite JS/PIXI overhead, minimize draw calls, and achieve stable real-time performance at high agent counts.
- **How**: Keep the current Pixi-based pipeline intact for testing/compare, and introduce a C++ WebGL2 renderer on a dedicated canvas overlay.

---

## First iteration scope and constraints

- **Single hardcoded image**: All agents use the same image/frame (full-rect UV 0..1). No per-agent frames initially.
- **No tinting**: Ignore tints in iteration 1. Shaders multiply by 1.
- **Single real-time call**: All per-frame data (dt, camera, viewport/DPR) is passed in one exported call that also triggers the render. No separate `set_camera`, `set_viewport`, or `sprite_render` calls.
- **JS does not influence rendering decisions**: JS only calls the single update+render function; no per-agent iteration/toggling in JS.
- **Antialiasing required**: Request `antialias: true` when creating WebGL2 context.
- **No triple buffering**: Use a single dynamic instance buffer (or at most double without introducing a frame of latency). Rendering must be in the same RAF as Pixi/OpenLayers.

---

## High-level architecture

- **Separate canvas overlay**: Create a second canvas (WebGL2) positioned exactly like the Pixi canvas. Only one of the two pipelines draws agents at a time.
- **C++ renderer in WASM**: Maintain a persistent WebGL2 context and GPU resources (programs, buffers, textures) from C++ via Emscripten.
- **Instanced quads**: Render all agents in a single (or very few) draw calls with instanced rendering.
- **Shared data**: Reuse the existing SharedArrayBuffer (SoA) for positions/looks/etc.; for iteration 1 we do NOT add extra arrays. Later phases may add `frame_ids` and `tint_rgba`.
- **One atlas**: JS loads/decodes the single image once; uploads to WASM/GL. Iteration 1 assumes a full-frame quad.
- **Camera sync**: JS computes the world→screen transform each frame from OpenLayers and passes it to the single update+render call.

---

## Data model changes

Iteration 1: no SoA changes required.

Future (Phase 2+):
- **Per-agent fields**
  - `frame_ids: uint16_t*` (or `uint32_t*`)
  - `tint_rgba: uint32_t*`
- **Frame table** uploaded once: `{ u0, v0, u1, v1, w, h }`
- Mirror in `src/wasm/data_structures.h`, `src/wasm/agent_init.cpp`, and `src/logic/wasm/AgentSoALayout.ts`.

---

## Resource pipeline (atlas)

1. JS loads the single image used for all agents:
   - Image: `/public/img/base.webp` (or a dedicated minimal image if preferred for iteration 1)
2. JS decodes the image to raw RGBA:
   - `createImageBitmap` → draw to OffscreenCanvas/2D canvas → `getImageData().data`
3. JS uploads pixels to WASM/GL:
   - Copy pixels to WASM heap, call C++ `sprite_upload_atlas_rgba(ptr, width, height)` which creates a GL texture and sets filtering (`LINEAR`) and wrapping (`CLAMP_TO_EDGE`).

No frames/tints required in iteration 1.

---

## C++ WebGL2 renderer (new files)

Add `src/wasm/sprite_renderer.h/.cpp` with:

- Context setup
  - `sprite_renderer_init(const char* canvas_query_selector)`
  - `emscripten_webgl_create_context` with WebGL2 attrs: `alpha=true`, `premultipliedAlpha=true`, `antialias=true`, `preserveDrawingBuffer=false`
  - `emscripten_webgl_make_context_current`
  - Store DPR and canvas CSS size; set GL viewport accordingly.

- GPU resources
  - Static quad VBO (unit quad), EBO
  - Dynamic instance VBO for per-agent attributes (updated every frame)
  - Shader program:
  - Vertex: expands unit quad by instance position/rotation/scale
  - Fragment: samples atlas texture (no tint in iteration 1)
  - Texture: atlas RGBA8

- Per-frame single-call API (iteration 1)
  - `void render(float dt, const float* m3x3, int pixelWidth, int pixelHeight, float devicePixelRatio);`
  - Performs agent simulation step (or call existing `update(dt)` internally)
  - Updates camera/viewport state
  - Builds instance buffer from SoA (`positions`, `looks`, `is_alive`)
  - Issues a single `glDrawElementsInstanced`

- Integration with SoA
  - Iterate `i = 0..active_agents-1` where `agent_data.is_alive[i]`
  - Instance attributes per agent (iteration 1):
  - `pos.x, pos.y`
  - `cosθ, sinθ` from `look`
  - `scale` — use a global constant to match Pixi scale

- WebGL2 requirements
  - Use VAOs, vertex attrib divisors, instanced draw calls
  - Build flags: `-sUSE_WEBGL2=1 -sMIN_WEBGL_VERSION=2 -sMAX_WEBGL_VERSION=2`

---

## Shaders (iteration 1)

Vertex:
```glsl
#version 300 es
layout(location=0) in vec2 a_pos;    // quad unit vertex: (-0.5..+0.5)
layout(location=1) in vec2 i_worldXY;  // instance
layout(location=2) in vec2 i_cosSin;   // instance
layout(location=3) in float i_scale;   // instance

uniform mat3 u_worldToClip; // 3x3 affine to NDC
out vec2 v_uv;

void main() {
  vec2 local = a_pos * i_scale; // uniform scale
  vec2 rotated = vec2(
  local.x * i_cosSin.x - local.y * i_cosSin.y,
  local.x * i_cosSin.y + local.y * i_cosSin.x
  );
  vec2 world = i_worldXY + rotated;

  // Full-frame UVs
  vec2 uv01 = a_pos + 0.5; // 0..1
  v_uv = uv01;

  vec3 clip = u_worldToClip * vec3(world, 1.0);
  gl_Position = vec4(clip.xy, 0.0, 1.0);
}
```

Fragment:
```glsl
#version 300 es
precision mediump float;
uniform sampler2D u_atlas;
in vec2 v_uv;
out vec4 o_color;
void main() {
  vec4 tex = texture(u_atlas, v_uv);
  o_color = tex;
}
```

---

## JS/TS integration steps

1. Canvas management
   - In `PixieLayer.init()`, create an additional canvas element `wasmCanvas` (below Pixi canvas), CSS:
   - `position:absolute; top:0; left:0; pointer-events:none; z-index` aligned with Pixi
   - Keep references and handle resize via the existing `ResizeObserver` and `sync()`

2. WASM renderer initialization
   - Export from C++: `sprite_renderer_init("#wasm-canvas-id")`
   - Call it after Pixi init (or under a dev flag for A/B testing)
   - On init, upload the atlas pixels via `_sprite_upload_atlas_rgba(ptr,w,h)`

3. Render/update loop (single call)
   - In `PixieLayer.tick()` (same RAF as Pixi/OL):
   - Compute world→clip 3×3 matrix from OL view
   - Query canvas pixel size and DPR
   - Call `_render(dt, m3x3, widthPx*dpr, heightPx*dpr, dpr)`; this updates sim and renders agents within the same frame
   - JS does not perform any rendering steps or per-agent work

---

## Build system

- Add `src/wasm/sprite_renderer.cpp` to the build and link flags:
  - `-sUSE_WEBGL2=1 -sMIN_WEBGL_VERSION=2 -sMAX_WEBGL_VERSION=2`
  - `-O3 -sASSERTIONS=0 -sALLOW_MEMORY_GROWTH=1`
- Export functions:
  - `EXPORTED_FUNCTIONS=[
    "_init","_update","_add_agent","_get_active_agent_count",
    "_sprite_renderer_init", "_sprite_upload_atlas_rgba",
    "_render"
  ]`
- If OffscreenCanvas is evaluated later, ensure no extra buffering introduces frame latency; keep main-thread rendering for perfect sync.

---

## Performance checklist (iteration 1)

- Single atlas, single draw call, instanced
- No per-agent JS in the hot path
- Single dynamic instance buffer; no triple buffering; avoid any scheme that can add one-frame latency
- Frustum culling (optional) in C++ to reduce instances when zoomed in
- Use `glBufferSubData` to update the instance buffer; keep VAO/VBO/program bound across frames
- Request `antialias: true`; use linear filtering for texture
- Premultiplied alpha consistent with canvas/Pixi background

---

## Migration plan (phases)

- Phase 0: Wireframe test — instanced quads without texture to validate camera and transforms
- Phase 1: Single image textured quads (this spec)
- Phase 2: Add frame table and per-agent `frame_id`; still no tint
- Phase 3: Add per-agent tint; verify alpha blending
- Phase 4: Optimize instance updates (culling, tighter packing, optional GPU frame-table lookup)

---

## Keeping Pixi for testing

- Keep current Pixi sprites path intact
- Add a runtime switch to toggle: `pixi-sprite` vs `wasm-gl` (development only)
- Render cross-check: draw both to different z-indices for quick visual compare in dev mode

---

## Integration points (files to touch)

- `src/logic/Pixie.ts`
  - Create/manage `wasmCanvas`
  - In tick, call `_render(dt, m3x3, widthPx*dpr, heightPx*dpr, dpr)`
- `src/logic/drawing/AgentRenderer.ts`
  - Optional dev switch for selecting Pixi vs WASM drawing
- `src/logic/WasmAgentSystem.ts`
  - Atlas upload during `init` (pixels + call into C++)
- `src/wasm/sprite_renderer.h/.cpp` (new)
  - Implement WebGL2 renderer and exported functions (`sprite_renderer_init`, `sprite_upload_atlas_rgba`, `render`)
- `src/components/map/Map.vue`
  - No structural changes; the Pixi layer manages the overlay canvas

---

## Caveats and notes

- Do not share the WebGL context with Pixi; use a separate canvas below Pixi
- Ensure CSS sizing and DPR handling match Pixi to avoid misalignment
- Render on the main thread to stay in the same RAF as Pixi/OL; avoid mechanisms that introduce one-frame delay

---

## Minimal API surface (iteration 1)

- Initialization:
  - `void sprite_renderer_init(const char* canvas_selector);`
  - `void sprite_upload_atlas_rgba(uint8_t* pixels, int width, int height);`
- Per-frame (single call that also renders):
  - `void render(float dt, const float* m3x3, int widthPx, int heightPx, float dpr);`

This revised plan matches the constraints for iteration 1 (single image, no tint), ensures perfect frame sync by rendering inside the same update call, enables antialiasing, and avoids any buffering scheme that could add latency relative to Pixi/OpenLayers. 