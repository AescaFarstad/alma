import { GameState } from "./GameState";
import type { CmdInput } from './input/InputCommands';
import { Stats } from "./core/Stats";
import { processInputs } from "./input/InputProcessor";
import { sync as syncUIState } from "./UIStateManager";
import { dynamicScene } from "./drawing/DynamicScene";
import { raycastCorridor } from "./Raycasting";
import { getLineSegmentIntersectionPoint } from "./core/math";
import { updateAvatar } from "./Avatar";
import { updateAgentPhys } from "./agents/AgentMovePhys";
import { updateAgentNavigation } from "./agents/AgentNavigation";
import { updateSpawners } from "./agents/AgentSpawner";
import { updateWAgentSpawners } from "./WAgentSpawner";
import { updateWAgentGridSpawners } from "./WAgentGridSpawner";
import { updateAgentStatistic } from "./agents/AgentStatistic";
import { updateAgentCollisions } from "./agents/AgentCollision";
import { WasmFacade } from "./WasmFacade";
import { handleEvents } from "./agents/EventHandler";

/**
 * A global queue for commands. Components or other systems can push commands here.
 * The InputProcessor will process them on each game tick.
 */
export const globalInputQueue: CmdInput[] = [];

/**
 * The main update loop for the game logic.
 * @param gs The game state.
 * @param deltaTime The time elapsed since the last frame, in seconds.
 */
export function update(gs: GameState, deltaTime: number): void {
  let effectiveDeltaTime: number;
  if (gs.timeScale.current === 0 && gs.allowedUpdates > 0) {
    gs.allowedUpdates--;
    effectiveDeltaTime = deltaTime; // A "tick" uses the real delta time
  } else if (gs.timeScale.current === 0) {
    processInputs(gs); // still process inputs to allow unpausing
    return; // Game is paused, no tick requested
  } else {
    effectiveDeltaTime = deltaTime * gs.timeScale.current;
  }
  gs.gameTime += effectiveDeltaTime;

  processInputs(gs);
  Stats.processEventDispatcherQueue(gs.connections, gs);

  gs.invoker.update(effectiveDeltaTime, gs);

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
    if (raycastResult.hitV1_idx !== -1) {
      const hitP1 = { x: gs.navmesh.vertices[raycastResult.hitV1_idx * 2], y: gs.navmesh.vertices[raycastResult.hitV1_idx * 2 + 1] };
      const hitP2 = { x: gs.navmesh.vertices[raycastResult.hitV2_idx * 2], y: gs.navmesh.vertices[raycastResult.hitV2_idx * 2 + 1] };
      const intersection = getLineSegmentIntersectionPoint(startPoint, endPoint, hitP1, hitP2);
      if (intersection) {
        finalEndPoint = intersection;
      }
    }

    gs.laserBlasts.push({
      id: gs.nextLaserBlastId++,
      start: startPoint,
      end: finalEndPoint,
      creationTime: gs.gameTime,
      corridor: [...raycastResult.corridor],
    });
  }
  
  if (deltaTime > 0) {
    handleEvents(gs);
    gs.wasm_agents.events.beginFrame();

    updateAvatar(gs.avatar, effectiveDeltaTime, gs.navmesh);

    updateSpawners(gs, effectiveDeltaTime);
    updateWAgentSpawners(gs.wAgentSpawners, effectiveDeltaTime, gs);
    updateWAgentGridSpawners(gs.wAgentGridSpawners, effectiveDeltaTime, gs);

    // ts agents
    for (const agent of gs.agents) {
      updateAgentNavigation(agent, gs, effectiveDeltaTime);
    }
    for (const agent of gs.agents) {
      updateAgentPhys(agent, effectiveDeltaTime, gs);
    }
    for (const agent of gs.agents) {
      updateAgentStatistic(agent, gs, effectiveDeltaTime);
    }
    gs.agentGrid.clearAndReindex(gs.agents);
    if (gs.agents.length > 1) {
      updateAgentCollisions(gs.agents, gs.agentGrid);
    }

    // wasm agents
    for (const agent of gs.wagents) {
      agent.brain.stack[agent.brain.stack.length - 1].update(gs, agent, effectiveDeltaTime);
    }
    gs.wasm_agents.events.commitFrame();
    WasmFacade._update_simulation(effectiveDeltaTime, gs.wagents.length);

  }

  dynamicScene.avatar = gs.avatar;

  // --- Laser Blast Lifetime Management ---
  const now = gs.gameTime;
  gs.laserBlasts = gs.laserBlasts.filter(blast => now - blast.creationTime <= 15);

  dynamicScene.laserBlasts = gs.laserBlasts;
  dynamicScene.agents = gs.agents;


  syncUIState(gs);
}
