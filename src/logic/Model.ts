import { GameState } from "./GameState";
import type { CmdInput } from './input/InputCommands';
import { Stats } from "./core/Stats";
import { processInputs } from "./input/InputProcessor";
import { sync as syncUIState } from "./UIStateManager";
import { dynamicScene } from "./drawing/DynamicScene";
import { raycastCorridor } from "./Raycasting";
import { getLineSegmentIntersectionPoint } from "./core/math";
import { updateAvatar } from "./Avatar";
import { updateAgentPhys } from "./AgentMovePhys";
import { updateAgentNavigation } from "./AgentNavigation";
import { updateSpawners } from "./AgentSpawner";
import { updateWAgentSpawners } from "./WAgentSpawner";
import { WasmAgentSystem } from "./WasmAgentSystem";
import { updateAgentStatistic } from "./AgentStatistic";
import { updateAgentCollisions } from "./AgentCollision";
import { AgentGrid } from "./AgentGrid";
import { mapInstance } from "../map_instance";

/**
 * A global queue for commands. Components or other systems can push commands here.
 * The InputProcessor will process them on each game tick.
 */
export const globalInputQueue: CmdInput[] = [];

/**
 * The main update loop for the game logic.
 * @param gs The game state.
 * @param deltaTime The time elapsed since the last frame, in seconds.
 * @param wasmAgentSystem The WASM agent system for WAgent spawning.
 */
export function update(gs: GameState, deltaTime: number, wasmAgentSystem?: WasmAgentSystem): void {
    const scaledDeltaTime = deltaTime * gs.timeScale.current;
    
    if (gs.timeScale.current === 0 && gs.allowedUpdates > 0) {
        gs.allowedUpdates--;
        gs.gameTime += deltaTime;
    } else if (gs.timeScale.current === 0) {
        processInputs(gs); // still process inputs to allow unpausing
        return;
    } else {
        gs.gameTime += scaledDeltaTime;
    }

    processInputs(gs);
    Stats.processEventDispatcherQueue(gs.connections, gs);

    gs.invoker.update(scaledDeltaTime, gs);

    // --- Handle Scheduled Laser Blasts ---
    if (gs.scheduledLaserBlasts > 0) {
        gs.scheduledLaserBlasts--;
        
        const avatar = gs.avatar;
        const startPoint = { ...avatar.coordinate };
        const endPoint = {
            x: startPoint.x + avatar.look.x * 5000, // 5km range
            y: startPoint.y + avatar.look.y * 5000,
        };
        const raycastResult = raycastCorridor(gs.navmesh, startPoint, endPoint);
        
        let finalEndPoint = endPoint;
        if (raycastResult.hitP1 && raycastResult.hitP2) {
            const intersection = getLineSegmentIntersectionPoint(startPoint, endPoint, raycastResult.hitP1, raycastResult.hitP2);
            if (intersection) {
                finalEndPoint = intersection;
            }
        }

        gs.laserBlasts.push({
            id: gs.nextLaserBlastId++,
            start: startPoint,
            end: finalEndPoint,
            creationTime: gs.gameTime,
            corridor: raycastResult.corridor,
        });
    }
    
    if (deltaTime > 0) {
        updateAvatar(gs.avatar, scaledDeltaTime, gs.navmesh);
        // Re-enable regular TS spawner updates to run side-by-side with WASM
        updateSpawners(gs, scaledDeltaTime);
        
        // Update WAgent spawners if wasmAgentSystem is available
        if (wasmAgentSystem) {
            updateWAgentSpawners(gs.wAgentSpawners, wasmAgentSystem, scaledDeltaTime, gs);
            // WASM simulation only - rendering handled separately in main.ts
            wasmAgentSystem.updateSimulation(scaledDeltaTime);
        }
    }
    // --- Update Agents ---
    for (const agent of gs.agents) {
        updateAgentNavigation(agent, gs, scaledDeltaTime);
    }
    for (const agent of gs.agents) {
        updateAgentPhys(agent, scaledDeltaTime, gs);
    }
    for (const agent of gs.agents) {
        updateAgentStatistic(agent, gs, scaledDeltaTime);
    }

    gs.agentGrid.clearAndReindex(gs.agents);

    // --- Agent Collision Detection ---
    if (gs.agents.length > 1) {
        updateAgentCollisions(gs.agents, gs.agentGrid);
    }

    // --- Camera Follow --- is now handled in DrawDynamicScene ---
    
    // Copy avatar state to dynamic scene for rendering
    dynamicScene.avatar = gs.avatar;

    // --- Laser Blast Lifetime Management ---
    const now = gs.gameTime;
    gs.laserBlasts = gs.laserBlasts.filter(blast => now - blast.creationTime <= 15);

    // Copy laser blasts to dynamic scene for rendering
    dynamicScene.laserBlasts = gs.laserBlasts;
    
    // Copy agents to dynamic scene for rendering (TS only; WASM rendered directly)
    dynamicScene.agents = gs.agents;

    // Sync UI state after all game logic updates
    syncUIState(gs);
} 