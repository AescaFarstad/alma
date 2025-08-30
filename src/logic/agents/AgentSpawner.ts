import { agentsLimit, GameState } from "../GameState";
import { copy, Point2 } from "../core/math";
import { getTriangleFromPoint } from "../navmesh/NavUtils";
import { Agent } from "./Agent";
import { AgentConfigs, type AgentConfig } from "./AgentConfigs";

export interface Spawner {
  config : AgentConfig;
  coordinate: { x: number, y: number };
  spawnCooldown: number;
  spawnTimer: number;
  spawnCount: number;
}

// Create an Agent instance from a plain object, computing maxSpeed if needed
export function createAgentWithConfig(config: Partial<Agent>): Agent {
  const agent = new Agent();
  Object.assign(agent, config);
  if (agent.resistance >= 1) agent.maxSpeed = 0;
  else if (agent.resistance <= 0) agent.maxSpeed = Infinity;
  else agent.maxSpeed = agent.accel / -Math.log(1 - agent.resistance);
  return agent;
}

export function updateSpawners(gs: GameState, dt: number) {
  if (!gs.spawners || gs.agents.length > agentsLimit) {
    return;
  }
  for (const spawner of gs.spawners) {
    spawner.spawnTimer -= dt;
    if (spawner.spawnTimer <= 0) {
      spawner.spawnTimer += spawner.spawnCooldown;
      spawner.spawnCount++;

      let currentTri = getTriangleFromPoint(gs.navmesh, spawner.coordinate);

      const baseConfig: AgentConfig = (spawner.spawnCount % 2 === 0)
        ? AgentConfigs.benchmarkerStupid
        : AgentConfigs.benchmarkerSmart;

      const newAgent = createAgentWithConfig({
        ...baseConfig,
        coordinate: copy(spawner.coordinate),
        currentTri: currentTri,
        display: "character_blonde_green",
      });
      
      newAgent.lastValidTri = newAgent.currentTri;
      newAgent.debug = false;
      // newAgent.endTarget = { "x": 344.8666687011719, "y": 208.2133331298828 };
      // newAgent.endTargetTri = 2852;
      // findPathToDestination(gs.navmesh, gs, newAgent, newAgent.currentTri, newAgent.endTargetTri, "hardcoded")
      // newAgent.state = AgentState.Traveling
      
      gs.agents.push(newAgent);
    }
  }
} 
