### Goal
Verify that WASM agent logic behaves identically to TS logic (no behavioral differences). Allowed: memory layout/low-level impl differences.

### Plan
1) Scope & mapping
- Inventory TS behavior modules (navigation, physics, statistics, collisions, grid, navmesh helpers) and map to C++/WASM counterparts.

2) Canonical constants & formulas
- Extract all parameters/constants/equations used in behavior (speeds, radii, accelerations, clamps, thresholds) from TS and C++.
- Build a side-by-side matrix to ensure equality.

3) Static semantics comparison
- Compare function-by-function (update navigation, physics, statistics, collisions, grid updates) for algorithmic equivalence.
- Note any deviations and classify as allowed/not allowed.

4) Deterministic sim diff
- Construct minimal deterministic scenarios (single agent move-to, two-agent avoidance, wall/raycast/corridor, dense cluster) on same navmesh.
- Step TS and WASM for N frames with fixed dt; log positions/velocities/state; compare within tight tolerance.

5) Edge cases
- Zero dt, pause/step behavior, boundary conditions, corridor rebuilds, degenerate geometry cases.

6) Outcome & fixes
- Summarize findings, list any not-allowed diffs, propose precise edits to reconcile.

### Progress
- Step 1 (Plan): Drafted — awaiting your approval to proceed.
- Step 2 (Mapping): In progress
- Step 3 (Semantics): Pending
- Step 4 (Sim diff): Pending
- Step 5 (Edge cases): Pending
- Step 6 (Outcome): Pending

### Step 2 — Scope & mapping (TS ↔ WASM)
- Navigation: `src/logic/AgentNavigation.ts` ↔ `src/wasm/agent_navigation.{cpp,h}` + `path_corridor.{cpp,h}`, `path_corners.{cpp,h}`, `raycasting.{cpp,h}`, `nav_tri_index.{h}`
- Physics: `src/logic/AgentMovePhys.ts` ↔ `src/wasm/agent_move_phys.{cpp,h}`
- Collisions: `src/logic/AgentCollision.ts` ↔ `src/wasm/agent_collision.{cpp,h}`
- Spatial grid: `src/logic/AgentGrid.ts` ↔ `src/wasm/agent_grid.{cpp,h}`
- Statistics: `src/logic/AgentStatistic.ts` ↔ `src/wasm/agent_statistic.{cpp,h}`
- Raycast: `src/logic/Raycasting.ts` ↔ `src/wasm/raycasting.{cpp,h}`
- Path corridor/corners: `src/logic/navmesh/pathCorridor.ts`, `pathCorners.ts` ↔ `src/wasm/path_corridor.{cpp,h}`, `path_corners.{cpp,h}`
- Math: `src/logic/core/math.ts`, `triMath.ts` ↔ `src/wasm/math_utils.{cpp,h}`
- Agent struct/consts: `src/logic/Agent.ts` ↔ `src/wasm/data_structures.h`

Initial parity notes
- Constants: STUCK_* and PATH_LOG_RATE match (Agent.ts ↔ data_structures.h). CORNER_OFFSET = 2.2 matches in WASM.
- Physics: accel/resistance/slowdown/turn-alignment and wall normal response match.
- Grid: CELL_SIZE/world bounds/Halton offset match.
- Raycast: Algorithm structure matches; return shape differs (TS nulls vs WASM hasHit), semantics align in call sites.

Potential discrepancies to validate (may affect behavior)
- Destination selection scope: TS uses `navmesh.triIndex.getRandomTriangleInArea(navmesh, 0, 0, 15)`; WASM uses `get_random_triangle()` (no area constraint).
- Stuck reset on full repath: TS calls `resetAgentStuck(...)` after repath; WASM only zeroes `stuck_ratings` and `sight_ratings` (does not call `reset_agent_stuck`).
- Corridor patch on clear LOS: TS replaces up to target with raycast corridor sequence; WASM sets corridor to `[currentPoly,(targetPoly?)]` only. This can change corridor length used by stats.
- Path frustration reset on new corridor: TS resets `pathFrustration` inside `findPathToDestination`; WASM `find_path_to_destination_wasm` does not explicitly reset `path_frustrations`.

Corridor indexing vs slicing — confirmation
- Using a start index (`corridor_indices`) instead of slicing arrays is behaviorally identical for progression and corner finding, provided the underlying corridor contents are equivalent. Current WASM LOS patch changes corridor contents (2 entries) vs TS (full straight-line corridor), which can alter funnel cornering and statistics. If WASM replaces contents with the full LOS corridor (and preserves suffix), index-tracking remains identical to TS slicing.

### Step 3 — Static semantics comparison (in progress)
- Navigation
  - States/guards match (Standing/Traveling/Escaping; off-mesh handling; demarkation line crossing; arrival check).
  - Stuck thresholds/logic match; WASM does not call full `reset_agent_stuck` on full repath (TS does), only zeros two fields.
  - LOS raycast patch: TS splices full corridor to target; WASM sets `[current,(target)]`.
  - Progress on path: TS slices front; WASM advances `corridor_indices` — equivalent.
- Physics
  - Desired speed, slowdown near corner with turn-alignment, intelligence blend, accel clamp, resistance, wall normal projection — match.
- Collisions
  - Radius, forces, escaping weights, grid pairwise resolution — match.
- Grid
  - Cell size/bounds, Halton offset, indexing — match.
- Statistics
  - Passive increase, distance/corridor-based decreases, decay, clamps — match; behavior depends on corridor length deltas (see LOS patch note).

Awaiting your confirmation to proceed to Step 3 (static semantics comparison) focusing on the items above and any others uncovered.

### Step 3 — Static semantics comparison (findings)
- Not-allowed behavior diffs found:
  - Destination selection: TS uses `getRandomTriangleInArea(navmesh, 0, 0, 15)`; WASM uses `get_random_triangle()` (global). Affects target distribution and paths.
  - Full repath stuck reset: TS calls `resetAgentStuck(agent)`; WASM only zeroes `stuck_ratings` and `sight_ratings`. Leaves `min_corridor_lengths`, `lastDistanceToNextCorner`, `lastNextCornerPoly`, `lastEndTarget` stale.
  - LOS corridor patch contents: TS splices with full `raycastCorridor(...).corridor` (and preserves suffix after target poly). WASM uses `raycastPoint` and replaces with `[currentPoly,(targetPoly)]`. Changes funnel corners and stats based on corridor length.
  - Path frustration reset: TS resets `pathFrustration = 0` when adopting a new corridor. WASM does not reset `path_frustrations` in `find_path_to_destination_wasm`.
- Likely OK/allowed differences:
  - Corridor front-slicing vs `corridor_indices` (indexing) — equivalent, confirmed.
  - Return shapes (nulls vs flags) — OK.
  - Minor math implementation details (inline vs helpers) — equivalent.

Required alignments for parity
- Navigation
  - Replace `get_random_triangle()` with area-limited selection equivalent to TS (`get_random_triangle_in_area(0,0,15)`) or pass center/extent params.
  - On full repath, call `reset_agent_stuck(i)` (or replicate all fields) after `find_path_to_destination_wasm` succeeds.
  - For LOS patching, use `raycastCorridor(...)` to obtain a direct corridor and splice like TS: `[...raycastCorridor.corridor, ...existing.slice(targetPolyIndex+1)]`; maintain `corridor_indices = 0`.
  - Reset `path_frustrations[i] = 0` when a new corridor is adopted in `find_path_to_destination_wasm`.
- Statistics
  - Ensure `min_corridor_lengths[i]` and related fields reset on repath to match TS behavior.

NavTriIndex fixes applied
- C++ `build_nav_tri_index`: switched to `math::triangleAABBIntersectionWithBounds(...)` with precomputed tri bounds for triangle-cell intersection parity with TS.
- C++ `is_point_in_navmesh`: added neighbor-first check (after last-tri) to mirror TS optimization and behavior.
- Header: declared `get_nav_tri_index_data_ptr` to reflect exported symbol used by TS.

Step 3 status
- NavTriIndex discrepancies corrected (intersection + neighbor-first). Other alignments remain pending (destination scope, repath resets, LOS splice, path frustration reset).

Alignments applied in navigation
- Destination selection now uses area-limited random (`get_random_triangle_in_area(0,0,15)`) with fallback.
- Full stuck reset now calls `reset_agent_stuck(i)` after full repath.
- LOS corridor patch now splices full raycast corridor and preserves suffix; resets index and frustration.
- New corridor adoption resets `path_frustrations[i]`.

Files changed
- `src/wasm/nav_tri_index.h/.cpp`: added area-limited random; improved intersections; neighbor-first; exported pointer getter.
- `src/wasm/agent_navigation.cpp`: applied destination scope, repath reset, LOS splice, path frustration reset.

Ready to proceed to Step 4 (deterministic scenarios & expected logs) unless you want further adjustments.

### Step 3 — NavTriIndex parity (C++ nav_tri_index.cpp ↔ TS NavTriIndex.ts)
- Shared memory interface
  - Packed descriptor layout (11 int32 slots) matches TS reading: pointers [0..1], grid dims [2..3], floats [4..8], counts [9..10]. OK.
  - TS maps `cellOffsets` (Uint32Array) and `cellTriangles` (Int32Array) directly onto WASM HEAP using provided pointers and counts. OK.
  - Export `get_nav_tri_index_data_ptr` present; TS fallback to `_g_navTriIndexData` would be incorrect (different struct), but primary path is OK.
- Index building
  - TS uses detailed `triangleAABBIntersectionWithBounds` (exact-ish). C++ uses simple triangle AABB vs cell AABB overlap. Behavior: same candidates filtered by point-in-triangle later; performance may differ.
- Query/lookup
  - TS `isPointInNavmesh`: checks last triangle, then neighbors, then queries cell. C++ `is_point_in_navmesh`: checks last triangle, then queries cell (no neighbor shortcut). Behavior: should remain identical; TS path is an optimization.
- Random selection
  - TS provides `getRandomTriangleInArea(...)` and `getRandomTriangle(...)` (seeded). C++ only exposes `get_random_triangle()` using `rand() % numTriangles`. Behavior difference if used for destinations (scope + distribution). Recommend adding area-limited and seeded equivalent in C++ if parity desired.
- Misc
  - Cell size/bbox/grid dims calculation align (256m cells). OK.
  - Pointer lifetimes: arrays allocated via `new` live on HEAP; JS views remain valid. OK.

Alignments applied for timing, rendering, and dual spawners
- Unified delta time: WASM now updated with the same scaled dt (respects `timeScale` and pause) from `Model.update`.
- Rendering: TS agents rendered via `TsAgentSpritePool`; WASM agents rendered via `WasmAgentSpritePool`. Both active concurrently.
- Dual spawners: Enabled TS `updateSpawners`; both TS and WASM spawners share same coordinates and timers, so they spawn simultaneously at the same location.

Files changed
- `src/logic/Model.ts`: re-enabled TS spawners, routed WASM update through scaled dt, ensured only one update path.
- `src/main.ts`: removed duplicate WASM update call; `Model.update` owns timing.

