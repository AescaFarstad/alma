# Makefile

# Emscripten compiler
EMCC = emcc
CXX = em++
CXXFLAGS = -std=c++17 -O3 -msimd128 -flto -fno-exceptions -fno-rtti -ffast-math -fno-signed-zeros -fno-trapping-math -freciprocal-math -ffinite-math-only -MMD -MP

SRCS = main.cpp \
       math_utils.cpp \
       nav_tri_index.cpp \
       raycasting.cpp \
       path_utils.cpp \
       fast_priority_queue.cpp \
       path_corridor.cpp \
       path_corners.cpp \
       agent_move_phys.cpp \
       agent_navigation.cpp \
       agent_grid.cpp \
       agent_collision.cpp \
       agent_statistic.cpp \
       agent_init.cpp \
       blob_spatial_index.cpp \
       sprite_renderer.cpp

OBJDIR = ../../temp
# Build all object files into OBJDIR to keep paths consistent
OBJS = $(SRCS:%.cpp=$(OBJDIR)/%.o)
DEPS = $(OBJS:.o=.d)

TARGET = ../../public/wasm_module.js
WASM_MODULE = ../../public/wasm_module.mjs

# Compiler flags
EMCC_FLAGS = \
  -O3 -msimd128 -flto -ffast-math \
  -fno-signed-zeros -fno-trapping-math -freciprocal-math -ffinite-math-only \
  --closure 1 \
  -s WASM=1 \
  -s ENVIRONMENT=web \
  -s FILESYSTEM=0 \
  -s ASSERTIONS=0 \
  -s SAFE_HEAP=0 \
  -s MALLOC=dlmalloc \
  -s INITIAL_MEMORY=268435456 \
  -s MAXIMUM_MEMORY=2147483648 \
  -s ALLOW_MEMORY_GROWTH=1 \
  -s AGGRESSIVE_VARIABLE_ELIMINATION=1 \
  -s ELIMINATE_DUPLICATE_FUNCTIONS=1 \
  -s SINGLE_FILE=0 \
  -s DISABLE_EXCEPTION_THROWING=0 \
  -s DISABLE_EXCEPTION_CATCHING=1 \
  -s USE_WEBGL2=1 -s MIN_WEBGL_VERSION=2 -s MAX_WEBGL_VERSION=2 \
  -s "EXPORTED_FUNCTIONS=['_init', '_add_agent', '_update', '_load_blob_data', '_clear_blob_data', '_get_blob_count', '_wasm_alloc', '_wasm_free', '_set_rng_seed', '_set_rng_seed_js', '_set_constants_buffer', '_sprite_renderer_init', '_sprite_upload_atlas_rgba', '_sprite_upload_frame_table', '_update_rt', '_get_nav_tri_index_data_ptr', '_g_navTriIndexPackedHeader', '_set_renderer_debug']" \
  -s "EXPORTED_RUNTIME_METHODS=['ccall', 'cwrap', 'HEAPU8', 'HEAP32', 'HEAPF32']" \
  -s MODULARIZE=1 \
  -s EXPORT_ES6=0 \
  -s EXPORT_NAME='createWasmModule'

.PHONY: all clean rebuild

all: $(TARGET)

# Link target from object files in OBJDIR
# Re-link when Makefile changes or flags potentially change
$(TARGET): $(OBJS) Makefile
	@echo "Linking..."
	$(CXX) $(CXXFLAGS) $(OBJS) -o $@ $(EMCC_FLAGS)

# Compile each .cpp into OBJDIR/%.o and emit dependency files alongside
$(OBJDIR)/%.o: %.cpp
	@mkdir -p $(dir $@)
	@echo "Compiling $<..."
	$(CXX) $(CXXFLAGS) -c $< -o $@

-include $(DEPS)

clean:
	@echo "Cleaning up..."
	rm -rf $(OBJDIR)
	rm -f $(TARGET) $(WASM_MODULE) 

# Convenience: force full rebuild
rebuild: clean all 