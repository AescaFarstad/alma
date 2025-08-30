import { Agent } from "../agents/Agent";
import { Point2, distance } from "../core/math";
import { sceneState, ACMAGENTA, ACGREEN } from "../drawing/SceneState";

export function drawAgentStuckPath(agent: Agent) {
  let pointCount = 0;
  for (const p of agent.pathLog) {
    if (!isNaN(p.x)) {
      pointCount++;
    }
  }
  if (pointCount === 0) return;

  let lastPoint: Point2 | null = null;

  for (let i = 0; i < agent.pathLog.length; i++) {
    const pointIndex = (agent.pathLogIdx - 1 - i + agent.pathLogMaxLen) % agent.pathLogMaxLen;
    const currentPoint = agent.pathLog[pointIndex];

    if (!currentPoint || isNaN(currentPoint.x)) {
      break;
    }

    if (lastPoint === null) {
      sceneState.addDebugPoint(currentPoint, ACMAGENTA);
    } else {
      if (distance(lastPoint, currentPoint) > 200) {
        break;
      }
      sceneState.addDebugLine(lastPoint, currentPoint, ACGREEN);
      sceneState.addDebugPoint(currentPoint, ACMAGENTA);
    }
    lastPoint = currentPoint;
  }
} 