# WASM Troubleshooting Guide

## Overview

This guide documents common issues and solutions when working with the WASM agent system integration. It covers the complete pipeline from WASM compilation to agent rendering.

---

## 1. WASM Module Export Issues

### Problem: Functions or memory not accessible from JavaScript

**Symptoms:**
- `TypeError: Cannot read properties of undefined`
- Missing functions like `wasm_alloc`, `wasm_free`
- Missing heap arrays like `HEAPU8`, `HEAP32`, `HEAPF32`

**Root Cause:**
Functions and runtime methods not properly exported in Makefile.

**Solution:**
Update `src/wasm/Makefile` to include all needed exports:

```makefile
EMCC_FLAGS = -O3 -s WASM=1 \
  -s "EXPORTED_FUNCTIONS=['_init', '_add_agent', '_update', '_wasm_alloc', '_wasm_free', ...]" \
  -s "EXPORTED_RUNTIME_METHODS=['ccall', 'cwrap', 'HEAPU8', 'HEAP32', 'HEAPF32']" \
  -s MODULARIZE=1 -s EXPORT_ES6=1
```

**Check:**
```typescript
console.log("WASM module keys:", Object.keys(wasmModule));
console.log("Has HEAPU8:", typeof wasmModule.HEAPU8); // Should be 'object'
```

---

## 2. Shared Memory Layout Mismatch

### Problem: TypeScript and WASM using different memory layouts

**Symptoms:**
- Agents showing as `isAlive: 0` when they should be alive
- Agent positions at `(0, 0)` instead of actual coordinates
- Data appears correct in WASM but wrong in TypeScript views

**Root Cause:**
TypeScript `createAgentDataViews()` layout doesn't match WASM `initialize_shared_buffer_layout()`.

**Critical Rule:** 
Memory layouts MUST match exactly between:
- `WasmAgentSystem.createAgentDataViews()` (TypeScript)
- `initialize_shared_buffer_layout()` (C++ in `agent_init.cpp`)

**Solution:**
```typescript
// Must match agent_init.cpp layout exactly:
// positions -> last_coordinates -> velocities -> looks -> states -> is_alive -> ...
this.agentDataViews['positions'] = new Float32Array(wasmHeap.buffer, offset, maxAgents * 2);
offset += maxAgents * 2 * 4; // sizeof(Point2) = 8 bytes
this.agentDataViews['last_coordinates'] = new Float32Array(wasmHeap.buffer, offset, maxAgents * 2);
offset += maxAgents * 2 * 4;
// ... continue for all fields in exact order
```

**Check:**
```typescript
console.log("Agent #0:", {
    position: [positions[0], positions[1]],
    isAlive: isAlive[0],
    expected: "Should match WASM data"
});
```

---

## 3. Memory Pointer Issues

### Problem: Data views pointing to wrong memory space

**Symptoms:**
- Successful buffer allocation but no data sharing
- TypeScript reads (0, 0) while WASM has correct data

**Root Cause:**
Creating TypeScript views from JavaScript `SharedArrayBuffer` instead of WASM heap memory.

**Wrong:**
```typescript
// DON'T DO THIS - points to JavaScript memory
this.agentDataViews['positions'] = new Float32Array(this.sharedBuffer, offset, maxAgents * 2);
```

**Correct:**
```typescript
// DO THIS - points to WASM heap memory
const wasmHeap = this.wasm.HEAPU8;
this.agentDataViews['positions'] = new Float32Array(wasmHeap.buffer, this.sharedBufferPtr + offset, maxAgents * 2);
```

**Check:**
Verify both TypeScript and WASM are reading the same memory:
```typescript
// After creating an agent, both should show the same position
console.log("TS view:", positions[agentIndex * 2], positions[agentIndex * 2 + 1]);
console.log("Should match WASM agent position");
```

---

## 4. Initialization Order Issues

### Problem: Data copied at wrong time or buffers not ready

**Symptoms:**
- WASM reports 0 triangles despite data being copied
- Buffer allocation succeeds but WASM doesn't use the data

**Root Cause:**
Wrong order of operations during initialization.

**Correct Order:**
```typescript
1. allocateMemoryOnly()          // Get WASM pointers
2. prepareNavmeshBufferData()    // Prepare data
3. copySharedBufferToWasmHeap()  // Copy to WASM heap
4. copyNavmeshDataToWasmHeap()   // Copy to WASM heap  
5. _init(ptrs...)                // Initialize WASM with pointers
6. createAgentDataViews()        // Create views from WASM heap
```

**Critical:** Data must be copied to WASM heap BEFORE calling `_init()` because WASM reads the data during initialization.

---

## 5. Asset Loading and Sprite Rendering Issues

### Problem: Agents exist in data but not visible on screen

**Symptoms:**
- Correct agent positions and data
- "Rendering X WASM agents" logs show valid data
- No sprites visible on map

**Root Cause:**
WasmAgentSpritePool doesn't have access to loaded spritesheet.

**Solution:**
Share spritesheet between pools:
```typescript
// In AgentRenderer.load()
await this.tsSpritePool.load();
this.wasmSpritePool.assetsLoaded = this.tsSpritePool.assetsLoaded;
this.wasmSpritePool.setSheet(this.tsSpritePool.getSheet());
```

**Check:**
```typescript
console.log("Assets loaded:", {
    hasSheet: !!spritePool.getSheet(),
    assetsLoaded: spritePool.assetsLoaded,
    availableTextures: spritePool.getSheet()?.textures ? Object.keys(spritePool.getSheet().textures) : []
});
```

---

## 6. Navmesh Integration Issues

### Problem: Agents can't navigate or pathfind

**Symptoms:**
- WASM reports "Navmesh triangles: 0"
- Agents spawn but don't move intelligently
- Navigation system not working

**Root Cause:**
Navmesh data not properly loaded into WASM.

**Check Steps:**
1. **File exists:** `/public/data/navmesh.txt` with valid data
2. **TypeScript loading:** Console shows "Navmesh loaded: X triangles"
3. **Data copying:** Console shows "Navmesh data copied to WASM (X triangles)"
4. **WASM confirmation:** Console shows "WASM module initialized. Navmesh triangles: X"

**Solution:**
Ensure navmesh buffer is copied before `_init()` and follows correct format:
```
[bbox(4*float32), numPoints(int32), numTriangles(int32), points_data, triangles_data, neighbors_data, centroids_data]
```

---

## 7. Performance and Memory Issues

### Problem: Memory leaks or performance degradation

**Symptoms:**
- Growing memory usage over time
- Slowdown with many agents
- Browser crashes

**Best Practices:**
1. **Proper cleanup:** Free allocated WASM memory with `wasm_free()`
2. **Reasonable limits:** Don't exceed `maxAgents` capacity
3. **Efficient updates:** Only update what's necessary
4. **Memory monitoring:** Check `wasmModule.HEAPU8.length` periodically

---

## 8. Debugging Tools and Techniques

### Essential Debug Logs

```typescript
// Memory allocation
console.log(`Allocated: ptr=${ptr}, size=${size}`);

// Data views creation  
console.log(`Views created from WASM heap at pointer ${ptr}`);

// Agent data verification
console.log(`Agent #${id}:`, {
    position: [x, y],
    isAlive: alive,
    requestedPos: [reqX, reqY]
});

// Rendering pipeline
console.log(`Rendering ${count} agents:`, {
    firstPos: [pos[0], pos[1]],
    assetsLoaded: loaded
});
```

### Memory Layout Verification

```typescript
// Check if TypeScript and WASM see the same data
function verifyMemorySync(agentIndex: number) {
    const tsPos = [positions[agentIndex * 2], positions[agentIndex * 2 + 1]];
    const tsAlive = isAlive[agentIndex];
    console.log(`Agent ${agentIndex} - TS view:`, { position: tsPos, alive: tsAlive });
    // Compare with WASM internal state if possible
}
```

### Common Diagnostic Commands

```bash
# Rebuild WASM with debug info
cd src/wasm && make clean && make

# Check file sizes
ls -la public/data/navmesh.txt
ls -la public/wasm_module.*

# Verify exports
grep EXPORTED_FUNCTIONS src/wasm/Makefile
grep EXPORTED_RUNTIME_METHODS src/wasm/Makefile
```

---

## 9. Testing Checklist

Before considering WASM integration complete:

- [ ] WASM module loads without errors
- [ ] All required functions accessible (`_init`, `_add_agent`, etc.)
- [ ] Heap arrays available (`HEAPU8`, `HEAP32`, `HEAPF32`)  
- [ ] Memory allocators working (`wasm_alloc`, `wasm_free`)
- [ ] Navmesh data loads and reports correct triangle count
- [ ] Agents spawn with correct initial positions
- [ ] Agents marked as alive (`isAlive: 1`)
- [ ] TypeScript data views show real-time WASM data
- [ ] Sprite assets load successfully
- [ ] Agents visible and rendered on map
- [ ] Agent movement and navigation working
- [ ] No memory leaks over time

---

## 10. Common Error Messages and Solutions

| Error | Cause | Solution |
|-------|-------|----------|
| `Cannot read properties of undefined (reading 'set')` | HEAPU8 not exported | Add to EXPORTED_RUNTIME_METHODS |
| `_add_agent is not a function` | Function not exported | Add to EXPORTED_FUNCTIONS |
| `isAlive: 0` when should be `1` | Memory layout mismatch | Fix createAgentDataViews() order |
| `firstAgentPos: [0, 0]` | Wrong memory space | Use WASM heap, not SharedArrayBuffer |
| `Navmesh triangles: 0` | Data copied after init | Copy navmesh before _init() |
| `assets not loaded` warning | Spritesheet not shared | Share sheet between sprite pools |

---

## Key Architecture Principles

1. **Single Source of Truth:** WASM memory is authoritative for agent data
2. **Shared Memory:** TypeScript views must point to WASM heap, not separate buffers  
3. **Exact Layout Matching:** Any mismatch breaks data sharing
4. **Proper Initialization Order:** Data → Copy → Init → Views
5. **Asset Sharing:** Multiple pools can share loaded assets

---

This guide should be updated whenever new WASM integration issues are discovered and solved. 