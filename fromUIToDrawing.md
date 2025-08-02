# From UI To Drawing: Architecture Overview

This document outlines the data flow and architecture for rendering objects on the map. The architecture is designed to be reactive and efficient, with a central, injectable state object (`SceneState`) that UI components can modify directly. A continuous render loop automatically detects and draws any changes.

## Core Components

### 1. `SceneState.ts`
- **Purpose**: Acts as a self-contained, reactive state manager, primarily for user selections. It is the single source of truth for what should be drawn.
- **Key Properties**:
  - `selectedBuildingIds: Set<number>`: The set of currently selected building IDs.
  - `isDirty: boolean`: A flag that is set to `true` whenever the state changes.
- **Methods**: Provides an API for modifying the state (e.g., `selectBuilding()`, `deselectBuilding()`, `clearSelectedBuildings()`). These methods are responsible for setting the `isDirty` flag.
- **Role**: Injected as a reactive singleton into any UI component that needs to read or write selection data.

### 2. `PrimitiveState.ts`
- **Purpose**: A passive data container for all the geometric primitives that are ready to be drawn. It batches primitives by their style for efficient rendering.
- **Structure**: Contains maps where keys are style objects and values are arrays of geometric data.
- **Role**: This is the direct input for the renderer. It is populated by `DrawScene.ts`.

### 3. `DrawScene.ts`
- **Purpose**: A static utility class that translates the raw data from `SceneState` into drawable primitives in `PrimitiveState`.
- **Method**: `buildPrimitives(primitives: PrimitiveState, sceneState: SceneState, gameState: GameState)`
- **Role**: It acts as the "translator." It reads the IDs from `SceneState`, fetches the full data models from `GameState` (e.g., building geometries), and populates `PrimitiveState` with styled vertices and other drawing commands.

### 4. `DrawPrimitives.ts`
- **Purpose**: A static utility class that performs the actual rendering using PIXI.js.
- **Method**: `draw(graphics, textContainer, primitives, olMap)`
- **Role**: The "renderer." It iterates through `PrimitiveState` and issues low-level PIXI.js draw calls. It contains no game or selection logic.

### 5. `Pixie.ts`
- **Purpose**: The main orchestrator of the rendering pipeline.
- **Role**:
  - It receives the `SceneState` instance via its constructor.
  - It runs a continuous `tick()` loop using `requestAnimationFrame`.
  - On every tick, it checks `sceneState.isDirty`.
  - If `isDirty` is true, it calls `DrawScene.buildPrimitives` to update `PrimitiveState` and then resets `sceneState.isDirty` to `false`.
  - On every tick (regardless of dirtiness), it calls `DrawPrimitives.draw` to render the current `PrimitiveState` to the screen.

### 6. UI Components (`Map.vue`, `SelectedBuildings.vue`)
- **Purpose**: To provide user interaction and display state.
- **Role**:
  - They `inject` the global `SceneState` instance.
  - User actions (like clicking a building in `Map.vue` or the "Clear" button in `SelectedBuildings.vue`) directly call the methods on the `sceneState` object (e.g., `sceneState.selectBuilding(id)`).

## Data Flow

1.  **Initialization**:
    - `main.ts` creates a single, reactive `sceneState` object and `provides` it to the Vue app.
    - `Map.vue` `injects` this `sceneState` and passes it to the `PixiLayer` during its creation.
    - `Pixie.ts` starts its continuous `tick()` loop.

2.  **UI Interaction** (e.g., user clicks a building in `Map.vue`):
    - The `click` handler in `Map.vue` calls the appropriate method directly on the injected `sceneState` object, for instance, `sceneState.selectBuilding(123)`.

3.  **State Update (`SceneState.ts`)**:
    - The `selectBuilding` method in the `SceneState` instance adds the ID to its `selectedBuildingIds` Set and sets its own `isDirty` flag to `true`.

4.  **Render Loop Detection (`Pixie.ts`)**:
    - On its very next animation frame, the `tick()` loop in `Pixie.ts` checks `sceneState.isDirty` and finds it is `true`.

5.  **Scene Rebuilding (`Pixie.ts` & `DrawScene.ts`)**:
    - Because the scene is dirty, `Pixie.ts` calls `DrawScene.buildPrimitives()`.
    - `DrawScene` clears the old data in `PrimitiveState` and repopulates it with fresh geometry based on the current IDs in `sceneState.selectedBuildingIds`.
    - `Pixie.ts` then sets `sceneState.isDirty` back to `false`.

6.  **Rendering (`Pixie.ts` & `DrawPrimitives.ts`)**:
    - In the same `tick`, `DrawPrimitives.draw()` is called, rendering the newly updated primitives to the screen.

This cycle ensures that rendering is decoupled from UI events and happens automatically whenever the scene state is modified. 

## Dynamic Scene Rendering

For highly dynamic objects that change every frame (e.g., player avatars, projectiles, temporary effects), a separate, parallel rendering pipeline is used to optimize performance.

### `DynamicScene.ts`
- **Purpose**: A state manager for transient, per-frame visual data. Unlike `SceneState`, it does not use an `isDirty` flag, as its contents are expected to be cleared and rebuilt on every single game tick.
- **Role**: It holds the state of all dynamic objects, such as their positions, types, and lifetimes.

### Updated Rendering Flow
1.  **Game Loop**: On every `Model.update()`, game logic calculates the new positions and states of dynamic objects and updates `DynamicScene`.
2.  **`Pixie.ts` Tick**: The `tick()` loop in `Pixie.ts` *always* rebuilds the primitives for the dynamic scene by calling a new method, `DrawScene.buildDynamicPrimitives()`.
3.  **Drawing**: `Pixie.ts` uses a separate `PIXI.Graphics` object to draw the dynamic primitives. This layer is cleared and redrawn every frame, independently of the main scene, which only updates when `sceneState.isDirty` is `true`.

This dual-pipeline approach ensures that static geometry is not wastefully redrawn, while dynamic elements can be updated with high frequency without impacting the performance of the main scene rendering.

## Consideration

1. **Coordinates**:
    - Even though this game uses geoJSON and real-world data, the actual coordinates are linear cartesian coordinates where 1 unit = 1 meter.