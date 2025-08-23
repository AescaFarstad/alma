#include "sprite_renderer.h"

#include <emscripten/emscripten.h>
#include <emscripten/html5.h>
#include <GLES3/gl3.h>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <cmath>
#include <vector>
#include "data_structures.h"

// Pull SoA and counters from main TU (C++ linkage)
extern AgentSoA agent_data;

namespace {
EMSCRIPTEN_WEBGL_CONTEXT_HANDLE g_ctx = 0;
int g_viewport_w = 0;
int g_viewport_h = 0;
float g_dpr = 1.0f;
GLuint g_program = 0;
GLuint g_tex = 0;
GLuint g_vao = 0;
GLuint g_vbo = 0;
GLuint g_ebo = 0;
GLuint g_instance_vbo = 0;
GLint u_worldToClip_loc = -1;
GLint u_atlas_loc = -1;
GLint u_uv_loc = -1;
bool g_debugOverlay = false;
// Derived each frame: pixels per world unit
float g_pixelsPerWorld = 1.0f;

// Frame table (u0,v0,u1,v1) per frame id
std::vector<float> g_frameUVs; // length = g_frameCount * 4
int g_frameCount = 0;

// Persistent instance storage to avoid per-frame allocations
struct Instance { float x, y, cosv, sinv, scale; };

const char* kVS = R"(#version 300 es
layout(location=0) in vec2 a_pos;        // quad unit vertex: (-0.5..+0.5)
layout(location=1) in vec2 i_worldXY;    // instance
layout(location=2) in vec2 i_cosSin;     // instance
layout(location=3) in float i_scale;     // instance

uniform mat3 u_worldToClip; // 3x3 affine to NDC
uniform vec4 u_uv; // u0,v0,u1,v1
uniform sampler2D u_atlas; // for textureSize
out vec2 v_uv;

void main() {
  // derive aspect ratio of the frame in pixels (handles non-square atlases)
  ivec2 texSize = textureSize(u_atlas, 0);
  vec2 uvSize = abs(u_uv.zw - u_uv.xy);
  vec2 pxSize = uvSize * vec2(texSize);
  float aspect = pxSize.y > 0.0 ? (pxSize.x / pxSize.y) : 1.0;

  // non-uniform scale in world units: i_scale encodes height; width = height * aspect
  vec2 local = a_pos * vec2(i_scale * aspect, i_scale);
  vec2 rotated = vec2(
    local.x * i_cosSin.x - local.y * i_cosSin.y,
    local.x * i_cosSin.y + local.y * i_cosSin.x
  );
  vec2 world = i_worldXY + rotated;
  vec2 uv01 = a_pos + 0.5; // 0..1 within the quad
  v_uv = mix(u_uv.xy, u_uv.zw, uv01);
  vec3 clip = u_worldToClip * vec3(world, 1.0);
  gl_Position = vec4(clip.xy, 0.0, 1.0);
}
)";

const char* kFS = R"(#version 300 es
precision mediump float;
uniform sampler2D u_atlas;
in vec2 v_uv;
out vec4 o_color;
void main(){
  vec4 tex = texture(u_atlas, v_uv);
  o_color = tex;
}
)";

GLuint compileShader(GLenum type, const char* src) {
    GLuint sh = glCreateShader(type);
    glShaderSource(sh, 1, &src, nullptr);
    glCompileShader(sh);
    GLint ok = GL_FALSE;
    glGetShaderiv(sh, GL_COMPILE_STATUS, &ok);
    if (!ok) {
        char log[1024];
        glGetShaderInfoLog(sh, sizeof(log), nullptr, log);
        printf("[WASM-GL] Shader compile error: %s\n", log);
    }
    return sh;
}

GLuint linkProgram(GLuint vs, GLuint fs) {
    GLuint prog = glCreateProgram();
    glAttachShader(prog, vs);
    glAttachShader(prog, fs);
    glLinkProgram(prog);
    GLint ok = GL_FALSE;
    glGetProgramiv(prog, GL_LINK_STATUS, &ok);
    if (!ok) {
        char log[1024];
        glGetProgramInfoLog(prog, sizeof(log), nullptr, log);
        printf("[WASM-GL] Program link error: %s\n", log);
    }
    glDetachShader(prog, vs);
    glDetachShader(prog, fs);
    glDeleteShader(vs);
    glDeleteShader(fs);
    return prog;
}

void ensurePipeline() {
    if (g_program) return;
    GLuint vs = compileShader(GL_VERTEX_SHADER, kVS);
    GLuint fs = compileShader(GL_FRAGMENT_SHADER, kFS);
    g_program = linkProgram(vs, fs);
    u_worldToClip_loc = glGetUniformLocation(g_program, "u_worldToClip");
    u_atlas_loc = glGetUniformLocation(g_program, "u_atlas");
    u_uv_loc = glGetUniformLocation(g_program, "u_uv");

    // Unit quad
    const float quadVerts[] = {
        -0.5f, -0.5f,
         0.5f, -0.5f,
         0.5f,  0.5f,
        -0.5f,  0.5f,
    };
    const uint16_t quadIdx[] = { 0,1,2, 2,3,0 };

    glGenVertexArrays(1, &g_vao);
    glBindVertexArray(g_vao);

    glGenBuffers(1, &g_vbo);
    glBindBuffer(GL_ARRAY_BUFFER, g_vbo);
    glBufferData(GL_ARRAY_BUFFER, sizeof(quadVerts), quadVerts, GL_STATIC_DRAW);
    glEnableVertexAttribArray(0);
    glVertexAttribPointer(0, 2, GL_FLOAT, GL_FALSE, 2*sizeof(float), (void*)0);

    glGenBuffers(1, &g_ebo);
    glBindBuffer(GL_ELEMENT_ARRAY_BUFFER, g_ebo);
    glBufferData(GL_ELEMENT_ARRAY_BUFFER, sizeof(quadIdx), quadIdx, GL_STATIC_DRAW);

    // Instance buffer (pos, cossin, scale)
    glGenBuffers(1, &g_instance_vbo);
    glBindBuffer(GL_ARRAY_BUFFER, g_instance_vbo);
    const GLsizei stride = sizeof(float)*5; // 2 + 2 + 1
    glBufferData(GL_ARRAY_BUFFER, 0, nullptr, GL_STREAM_DRAW);

    glEnableVertexAttribArray(1);
    glVertexAttribPointer(1, 2, GL_FLOAT, GL_FALSE, stride, (void*)(0));
    glVertexAttribDivisor(1, 1);

    glEnableVertexAttribArray(2);
    glVertexAttribPointer(2, 2, GL_FLOAT, GL_FALSE, stride, (void*)(sizeof(float)*2));
    glVertexAttribDivisor(2, 1);

    glEnableVertexAttribArray(3);
    glVertexAttribPointer(3, 1, GL_FLOAT, GL_FALSE, stride, (void*)(sizeof(float)*4));
    glVertexAttribDivisor(3, 1);

    glBindVertexArray(0);
}

void ensureTexture() {
    if (g_tex) return;
    glGenTextures(1, &g_tex);
    glBindTexture(GL_TEXTURE_2D, g_tex);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_LINEAR);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, GL_LINEAR);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_S, GL_CLAMP_TO_EDGE);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_T, GL_CLAMP_TO_EDGE);
}

void renderInstances(const float* m3x3, int active_agents) {
    const float scaleWorld = 2.5f;

    int aliveCount = 0;
    for (int i = 0; i < active_agents; ++i) {
        if (agent_data.is_alive[i]) aliveCount++;
    }

    if (aliveCount <= 0) return;

    // Update dynamic uniform per frame
    if (u_worldToClip_loc >= 0 && m3x3) {
        float m[9] = { m3x3[0], m3x3[3], m3x3[6], m3x3[1], m3x3[4], m3x3[7], m3x3[2], m3x3[5], m3x3[8] };
        glUniformMatrix3fv(u_worldToClip_loc, 1, GL_FALSE, m);
    }

    // Require a valid frame table
    if (g_frameCount <= 0 || (int)g_frameUVs.size() < g_frameCount * 4 || u_uv_loc < 0) return;

    struct FrameBatch { int fid; std::vector<Instance> instances; };
    std::vector<FrameBatch> batches;
    batches.reserve(4); // assume few distinct fids per frame

    // Single pass over agents: bucket by frame id (few unique expected)
    for (int i = 0; i < active_agents; ++i) {
        if (!agent_data.is_alive[i]) continue;
        const uint16_t frameId = agent_data.frame_ids ? agent_data.frame_ids[i] : 0;
        const Point2 p = agent_data.positions[i];
        const Point2 look = agent_data.looks[i];
        const float len = std::sqrt(look.x*look.x + look.y*look.y) + 1e-6f;
        // Rotate sprite so its "up" in texture aligns with look direction: apply -90 deg offset
        const float cos_phi = look.x / len;
        const float sin_phi = look.y / len; // no Y flip in WASM world space
        const float cosv = sin_phi;    // cos(phi - pi/2) = sin(phi)
        const float sinv = -cos_phi;   // sin(phi - pi/2) = -cos(phi)
        // find or create batch
        int batchIndex = -1;
        for (size_t b = 0; b < batches.size(); ++b) {
            if (batches[b].fid == (int)frameId) { batchIndex = (int)b; break; }
        }
        if (batchIndex < 0) {
            FrameBatch fb; fb.fid = (int)frameId; fb.instances.reserve(active_agents-i);
            batches.push_back(std::move(fb));
            batchIndex = (int)batches.size() - 1;
        }
        batches[batchIndex].instances.push_back({ p.x, p.y, cosv, sinv, scaleWorld });
    }

    // Draw each batch
    for (const FrameBatch& fb : batches) {
        if (fb.fid < 0 || fb.fid >= g_frameCount) continue;
        const float* uv = &g_frameUVs[(size_t)fb.fid * 4];
        glUniform4fv(u_uv_loc, 1, uv);

        const size_t bytes = fb.instances.size() * sizeof(Instance);
        if (bytes == 0) continue;
        glBindBuffer(GL_ARRAY_BUFFER, g_instance_vbo);
        glBufferData(GL_ARRAY_BUFFER, bytes, nullptr, GL_STREAM_DRAW);
        glBufferSubData(GL_ARRAY_BUFFER, 0, bytes, fb.instances.data());
        glDrawElementsInstanced(GL_TRIANGLES, 6, GL_UNSIGNED_SHORT, (void*)0, (GLsizei)fb.instances.size());
    }
}

} // namespace

extern "C" {

EMSCRIPTEN_KEEPALIVE void sprite_renderer_init(const char* canvas_selector) {
    EmscriptenWebGLContextAttributes attrs;
    emscripten_webgl_init_context_attributes(&attrs);
    attrs.alpha = 1;
    attrs.antialias = 1; // required by spec
    attrs.premultipliedAlpha = 1;
    attrs.majorVersion = 2;
    attrs.minorVersion = 0;
    attrs.enableExtensionsByDefault = 1;

    g_ctx = emscripten_webgl_create_context(canvas_selector, &attrs);
    if (!g_ctx) {
        printf("[WASM-GL] Failed to create WebGL2 context on %s\n", canvas_selector);
        return;
    }
    if (EMSCRIPTEN_RESULT_SUCCESS != emscripten_webgl_make_context_current(g_ctx)) {
        printf("[WASM-GL] Failed to make context current\n");
        return;
    }

    ensurePipeline();
    ensureTexture();

    // Set up static GL state once - these never change
    glUseProgram(g_program);
    glUniform1i(u_atlas_loc, 0);
    
    // Set up blend state once - this never changes
    glEnable(GL_BLEND);
    glBlendFuncSeparate(GL_ONE, GL_ONE_MINUS_SRC_ALPHA, GL_ONE, GL_ONE_MINUS_SRC_ALPHA);
    
    // Bind static rendering state
    glBindVertexArray(g_vao);
    glActiveTexture(GL_TEXTURE0);
    glBindTexture(GL_TEXTURE_2D, g_tex);
}

EMSCRIPTEN_KEEPALIVE void sprite_upload_atlas_rgba(uint8_t* pixels, int width, int height) {
    if (!g_ctx) return;
    emscripten_webgl_make_context_current(g_ctx);
    ensureTexture();
    glActiveTexture(GL_TEXTURE0);
    glBindTexture(GL_TEXTURE_2D, g_tex);
    glTexImage2D(GL_TEXTURE_2D, 0, GL_RGBA, width, height, 0, GL_RGBA, GL_UNSIGNED_BYTE, pixels);
}

EMSCRIPTEN_KEEPALIVE void sprite_upload_frame_table(const float* uv4_array, int frameCount) {
    if (frameCount <= 0) {
        g_frameUVs.clear();
        g_frameCount = 0;
        return;
    }
    g_frameCount = frameCount;
    g_frameUVs.assign(uv4_array, uv4_array + (size_t)frameCount * 4);
}

EMSCRIPTEN_KEEPALIVE void set_renderer_debug(int enable) {
    g_debugOverlay = (enable != 0);
}

EMSCRIPTEN_KEEPALIVE void render(float dt, int active_agents, const float* m3x3, int widthPx, int heightPx, float dpr) {
    (void)dt;
    if (!g_ctx) return;
    emscripten_webgl_make_context_current(g_ctx);

    if (widthPx != g_viewport_w || heightPx != g_viewport_h || dpr != g_dpr) {
        g_viewport_w = widthPx;
        g_viewport_h = heightPx;
        g_dpr = dpr;
        glViewport(0, 0, g_viewport_w, g_viewport_h);
    }

    // Derive pixels-per-world from the matrix parameter: a = 2*s_px/widthPx
    if (m3x3 && widthPx > 0) {
        const float a_row_major = m3x3[0];
        g_pixelsPerWorld = (a_row_major * widthPx) * 0.5f;
        if (!(g_pixelsPerWorld > 0.0f)) g_pixelsPerWorld = 1.0f;
    }

    // Clear screen (blend state already set up in init)
    if (g_debugOverlay) {
        glClearColor(1.0f, 0.0f, 1.0f, 0.25f);
    } else {
        glClearColor(0.0f, 0.0f, 0.0f, 0.0f);
    }
    glClear(GL_COLOR_BUFFER_BIT);

    ensurePipeline();
    ensureTexture();

    renderInstances(m3x3, active_agents);
}

EMSCRIPTEN_KEEPALIVE void sprite_renderer_clear() {
    if (!g_ctx) return;
    emscripten_webgl_make_context_current(g_ctx);
    glViewport(0, 0, g_viewport_w, g_viewport_h);
    glClearColor(0.0f, 0.0f, 0.0f, 0.0f);
    glClear(GL_COLOR_BUFFER_BIT | GL_DEPTH_BUFFER_BIT | GL_STENCIL_BUFFER_BIT);
}

} // extern "C" 