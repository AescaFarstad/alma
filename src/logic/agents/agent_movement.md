This is an outline of the design for agents for a 2d web game based on real life city geometry
Thousands of agents will navigate around buildings in a 5x5km urban area
The navmesh consists of around 100k triangles.
Obstacles are not triangulated and are impassible. Briefly staying inside them is okay for an agent, but the unit cannot act vulanterily until it gets back into a walkable area.
Triangles are indexed in a grid where each cell contains all triangles that overlap it even partially.

See /navmesh.md for more info.

At Stage 1 I need to have them simply  walking around the map randomly.

I've implemented corridor finding and funneling for corner identification.
I also have navmesh raycast which can be used for visibility or collision checks against static obstacles.

Requirements: fast, few memory allocations, pooling as much as possible.

This is a pseudo code of the plan:

Navigation data structure for each agent:
corridor = triangleIndexes[]
currentPoly = triangle index
nextCorner = Point2
nextCornerPoly = triangle index
lastValidPosition = Point2
lastValidPoly = triangle index
endTarget = Point2
lookDir = Point2
pathFrustration = number
state = 
    escaping (we're out of passible area, must return)
    traveling to static target
    standing

Common data:
accel = number
resistance = number
maxFrustration = number


Main logical blocks (work like ECS ES updates, processing all agents before moving to the next block):

Block 1 Navigation updates.
    The goal is to set the correct next corner and update relevant structures
    Algo:
        Validate we are inside the same currentPoly
        if not, check next poly in corridor, check immediate neighbours, check further polies in corridor (up to 5)
            if yes -> advance corridor if it's a corridor poly, recalculate corner
            if not -> use spatial index to identify our new poly
                if we're outside of passible area -> add corner = (last valid point, lastValidPoly), set state 'escaping'
                else
                    set state 'traveling'
                    if this poly is in our corridor -> advance corridor, recalculate corner
                    if not
                        increase pathFrustration by distance to [lastValidPosition, nextCorner] segment
                        if pathFrustration > 10 -> rebuild path
                        else -> cast ray towards nextCorner up to the nextCornerPoly
                            if success -> replace corridor polies with ray cast results up to nextCornerPoly
                            else -> rebuilt path
    frustration resets whenever corner changes
    if corridor empty, 
        if endTarget within 1 meter -> set state 'standing'
        else -> rebuilt path, recalculate corner
    
Block 2 Action updates
    if standing -> set new endTarget, apply accel to deaccelerate
    if escaping or traveling -> add accel in the direction of the next corner
    In the future much more gameplay logic will happen here

Block 3 Movement
    Actually apply the velocity and change their coordinate
    Raycast towards the resulting coordinate
    If we hit a wall - subtract normal velocity and start sliding along it with the rest of the velocity
    Apply the resistance

Block 4 Indexation block:
    Spatial index (grid) for agents is cleared
    A new offset is applied to the index following a Halton sequence. The goal is to never have a problematic border split around any same agent two frames in a row.
    All agents are re-added according to their positions

Block 5 Collision block
    All agents collide with immediate neigbors and are pushed according to their weight.
    Only agents within the same block are considered as possible neighbours.
    If agents are too close -> move them away from each other proportionally to their weights and depth of penetration ('escaping' units have 10x the weight). 'move them away' add to their velocities

Target aquisition: select a new random triangle by chosing a random cell in NavTriIndex.ts and pickign a random triangle (chance proportional to triangle area)


Avatar.ts can be used as a reference, with a few caviates:
Agents aren't controlled by the player.
Agents look towards the next corner.
The check `const newTriangle = navmesh.triIndex.isPointInNavmesh(avatar.coordinate, navmesh, avatar.lastTriangle);` verifying the coodinate the unit ends up in after the move is not needed, since agents are allowed to clip into obstacles by design.

The overshooting during checks and overcompensating velocity which is present in the avatar logic must be implemented too.

Display:
    Agents are drawn as sprites that are moved to proper coordinates each frame.
    Their appearance is similar to avatar but smaller in size.
    They are normally black, but becoem red when 'escaping'. This is achieved via swapping pre-generated textures.

Population:
    Hardcoded spawners are created in pre-defined coordinates. They produce a new agent every X seconds.

Files:
    Agents are stores in GameState as AoS.
    Their logic is implemented in several files so that the files remain focused and small.
    The update calls are made from Model.ts update.
    The existing logic like invoker, event dispatch, avatar, lasers etc should stay where it is.

## Design and Implementation Notes

A few key decisions and clarifications based on early planning:

*   **Data Structure (AoS vs SoA):** Agents are stored as an Array of Structs (AoS), e.g., `agents: Agent[]`. While a Structure of Arrays (SoA) layout (e.g., separate arrays for positions, velocities) could offer better cache performance for the ECS-style updates, AoS was chosen for simplicity and easier integration with existing code that uses `Point2` objects. This is a potential future optimization (`WASM`, `Float32Array` buffers) but the logic will be developed and benchmarked first with the simpler AoS approach.

*   **Movement Physics and "Overshooting":** The movement physics will be similar to the player `Avatar`. This includes a technique of "overshooting" to handle floating point imprecision and ensure robust collision response. For example, when raycasting, the ray is cast slightly past the target destination. When resolving a wall collision, slightly more than the opposing normal velocity is subtracted to "overcompensate" and prevent getting stuck.

*   **Performance and `isPointInNavmesh`:** For performance reasons, the costly `navmesh.triIndex.isPointInNavmesh()` check will not be performed for agents on every frame after they move. Agents are expected to stay on the navmesh through correct physics and pathing logic. They are allowed to temporarily clip into obstacles, and the `escaping` state is designed to handle cases where they are pushed outside the walkable area.

## Implementation plan
    1.  **Create and Draw Agent:** (DONE)
        -   Logic: `GameState.ts`, `DrawDynamicScene.ts`, `Model.ts`, `Agent.ts`
        -   Add `agents: Agent[]` in `GameState.ts`.
        -   Create a single, static agent in the `GameState` constructor for testing.
        -   Render all agents from `gameState.agents` in `DrawDynamicScene.ts`.
        -   *Goal:* Verify the agent data structure and rendering pipeline.
        -   *Observable Behavior:* A static agent appears on the map.

    2.  **Implement Wandering Movement:** (DONE)
        -   Logic: `Agent.ts`, `Model.ts`
        -   Create a new `AgentMovePhys.ts` to house agent-specific logic.
        -   Implement an `updateAgentPhys` function that implements basic physics (acceleration, velocity, resistance) similar to the Avatar.

        -   The function finds the agent's current triangle and picks a random neighbor.
        -   The agent accelerates towards the center of the chosen neighboring triangle.
        -   *Goal:* Test the core agent update loop and basic movement.
        -   *Observable Behavior:* The agent moves around randomly, jittering between adjacent triangles.

    3.  **Implement Wall Sliding Physics:** (DONE)
        -   Logic: `AgentMovePhys.ts`
        -   In `updateAgentPhys`, before applying movement, use `raycast` from `Raycasting.ts` to check the agent's intended move for collisions with navmesh edges.
        -   If a wall is detected, adjust the agent's velocity to slide along the wall surface.

        -   The agent's direction now changes gradually and randomly using logic like `dir = normalize(oldDir * 9 + rndDir)`. It accelerates in this direction.
        -   *Goal:* Prevent agents from getting stuck on navmesh edges.
        -   *Observable Behavior:* When a wandering agent hits a wall, most of the time it slides along the surface smoothly instead of stopping or clipping through.

    4.  **Implement Pathfinding & Basic Corridor Following:** (DONE)
        -   Logic: `NavTriIndex.ts`, `Agent.ts`, `GameState.ts`
        -   Implement `getRandomTriangle` in `NavTriIndex.ts`. It should pick a random coordinate within the navmesh bounds and find the triangle there. If it fails after 10 attempts (e.g., hits an obstacle), it should fall back to picking a random triangle index by number.
        -   Change the agent logic: when idle, it gets a random destination, uses `findCorridor` to get a path, and `findCorners` to get a list of turning points. It then accelerates towards the first corner, detects reaching it, detects path end and chooses next target. This is a new file `AgentNavigation.ts`
        - Draw the agents path and the final target
        -   *Goal:* Verify pathfinding and basic path following.
        -   *Observable Behavior:* An agent successfully navigates to a random destination.

    5.  **Implement Single-Corner Pathing with Offset:** (DONE)
        -   Logic: `pathfinding.ts`
        -   Implement a new version of `findCorners` (alongside of the existing one) which stops after finding the first corner and returns only that.
        -   This function should also offset the found corner slightly away from the boundary, towards the center of the triangle it belongs to.
        -   Update `AgentNavigation.ts` to use this new optimized function.
        - the agent should look at the next corner if any
        -   *Goal:* Optimize path calculation and improve movement behavior.
        -   *Observable Behavior:* Agents navigate more smoothly and stay further from walls when turning corners.

    6.  **Implement Path Correction & 'Escaping' State:** (DONE)
        -   For testing, introduce a mechanism in `updateAgents` to occasionally apply a random impulse force to agents, pushing them off their paths.
        -   Implement `pathFrustration` logic to detect when an agent has strayed. Use raycasting for local path patching.
        -   If an agent is outside the navmesh, set its state to `escaping` (e.g., turn red) and have it navigate back to its `lastValidPosition`. Log that event.
        -   *Goal:* Make navigation robust.
        -   *Observable Behavior:* An agent that gets pushed will correct its course. An agent pushed outside the navmesh turns red and tries to return.
        -   (DONE)

    7.  **Implement Spawners:** (DONE)
        -   Logic: `AgentSpawner.ts`
        -   The system should add new agents to the `GameState` at a regular interval from predefined hardcoded locations.
        -   *Goal:* Populate the world.
        -   *Observable Behavior:* Agents continuously appear on the map at specific points.
        -   (DONE)

    8.  **Implement Agent-Agent Collision (Brute-Force):** (DONE)
        -   Logic: `AgentCollision.ts`, `Model.ts`
        -   Create `AgentCollision.ts`. Implement logic to iterate through all agent pairs, check for overlap, and apply a push-away force.
        -   Call this from `Model.ts`.
        -   *Goal:* Prevent agents from overlapping.
        -   *Observable Behavior:* Agents no longer pass through each other. Performance will degrade with many agents.

    9.  **Implement Agent Spatial Grid:**
        -   Logic: `AgentGrid.ts`, `Model.ts`, `AgentCollision.ts`
        -   **Grid Design:** Grid uses minimal memory allocation. It stores agent index in a typed array.
        -   **Halton Offset:** Apply 2D Halton sequence offset each frame to prevent persistent grid border issues.
        -   **Implementation Details:**
            -   `AgentGrid.ts`: Focused grid implementation with cell indexing, coordinate conversion, and Halton offset generation.
            -   Replace brute-force O(n²) collision in `AgentCollision.ts` with grid-based O(n) same-cell lookup.
            -   `Model.ts`: Trigger re-indexing all agents each frame.
            -   Only check collisions within same grid cell (no neighboring cell checks).
            -   Use pooled data structures to minimize per-frame allocations.
        -   **Memory Strategy:** Reuse existing agent arrays, minimal temporary allocations.
        -   **Future:** This grid approach is temporary - will be replaced with quadtree for large-scale optimization.
        -   *Goal:* Optimize agent collision from O(n²) to O(n × agents_per_cell).
        -   *Observable Behavior:* Identical collision physics, dramatically improved performance with thousands of agents.


## Implementation progress:
1. **Create and Draw Agent:** (DONE)
2. **Implement Wandering Movement:** (DONE)
3. **Implement Wall Sliding Physics:** (DONE)
4. **Implement Pathfinding & Basic Corridor Following:** (DONE)
5. **Implement Single-Corner Pathing with Offset:** (DONE)
6. **Implement Path Correction & 'Escaping' State:** (DONE)
7. **Implement Spawners:** (DONE)
8. **Implement Agent-Agent Collision (Brute-Force):** (DONE)
