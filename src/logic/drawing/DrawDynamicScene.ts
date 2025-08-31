import { PrimitiveState, PolyStyle, LineStyle } from './PrimitiveState';
import { DynamicScene } from './DynamicScene';
import { GameState } from '../GameState';
import { Map as OlMap } from 'ol';
import { AgentState } from '../agents/Agent';
import { findCorners } from '../navmesh/pathCorners';

const laserBlastLineStyle: LineStyle = {
  width: 2,
  color: 0xFF00FF, // Pink
  alpha: 0.9,
};

const laserCorridorPolyStyle: PolyStyle = {
  fillStyle: { color: 0x50C878, alpha: 0.3 }, // Emerald
};

// Corridor polygons for selected agent
const lightBlueCorridorPolyStyle: PolyStyle = {
  fillStyle: { color: 0x6666FF, alpha: 0.25 }, // Light blue transparent
};

// Path line/dots for selected agent
const emeraldPathLineStyle: LineStyle = {
  width: 0.5,
  color: 0x50C878, // Emerald
  alpha: 0.5,
};

const emeraldDotStyle: PolyStyle = {
  fillStyle: { color: 0x50C878, alpha: 1.0 },
};

const redDotStyle: PolyStyle = {
  fillStyle: { color: 0xCC0000, alpha: 1.0 },
};

const avatarPolyStyle: PolyStyle = {
  fillStyle: { color: 0x0, alpha: 0.8 }
};

const avatarWallContactPolyStyle: PolyStyle = {
  fillStyle: { color: 0xFF0000, alpha: 0.8 }
}

const avatarOutsideNavmeshPolyStyle: PolyStyle = {
  fillStyle: { color: 0x0000FF, alpha: 0.8 }
}

export class DrawDynamicScene {
  public static buildDynamicPrimitives(primitives: PrimitiveState, dynamicScene: DynamicScene, gameState: GameState, _olMap: OlMap) {
    primitives.clear();

    const selIdx = dynamicScene.selectedWAgentIdx;
    if (typeof selIdx === 'number' && selIdx !== null && gameState.wasm_agents.positions) {
      const agents = gameState.wasm_agents;
      const navmesh = gameState.navmesh;

      const startPoint = { x: agents.positions[selIdx * 2], y: agents.positions[selIdx * 2 + 1] };
      const endPoint = { x: agents.end_targets[selIdx * 2], y: agents.end_targets[selIdx * 2 + 1] };

      const corridor = dynamicScene.selectedWAgentCorridor || [];

      for (const polyIdx of corridor) {
        const pvStart = navmesh.polygons[polyIdx];
        const pvEnd = navmesh.polygons[polyIdx + 1];
        if (pvStart < 0 || pvEnd <= pvStart) continue;

        const verts: number[] = [];
        for (let i = pvStart; i < pvEnd; i++) {
          const vIdx = navmesh.poly_verts[i];
          const vx = navmesh.vertices[vIdx * 2];
          const vy = navmesh.vertices[vIdx * 2 + 1];
          verts.push(vx, -vy);
        }
        primitives.addPolygon(verts, lightBlueCorridorPolyStyle);
      }

      if (corridor.length > 0) {
        const corners = findCorners(navmesh, corridor, startPoint, endPoint);
        if (corners.length > 0) {
          for (const c of corners) {
            primitives.addCircle(c.point.x, -c.point.y, 0.75, { fillStyle: emeraldDotStyle.fillStyle });
          }
          for (let i = 0; i < corners.length - 1; i++) {
            const a = corners[i].point;
            const b = corners[i + 1].point;
            primitives.addLine([a.x, -a.y, b.x, -b.y], emeraldPathLineStyle);
          }
        }
      }

      const nValid = agents.num_valid_corners[selIdx] | 0;
      if (nValid >= 1) {
        const nx = agents.next_corners[selIdx * 2];
        const ny = agents.next_corners[selIdx * 2 + 1];
        primitives.addCircle(nx, -ny, 1.2, { fillStyle: redDotStyle.fillStyle });
      }
      if (nValid >= 2) {
        const nx2 = agents.next_corners2[selIdx * 2];
        const ny2 = agents.next_corners2[selIdx * 2 + 1];
        primitives.addCircle(nx2, -ny2, 1.2, { fillStyle: redDotStyle.fillStyle });
      }
    }

    // Render laser blasts
    for (const blast of dynamicScene.laserBlasts) {
      primitives.addLine([blast.start.x, -blast.start.y, blast.end.x, -blast.end.y], laserBlastLineStyle);
      
      // Render corridor
      if (blast.corridor) {
        for (const triIdx of blast.corridor) {
          const p1Index = gameState.navmesh.triangles[triIdx * 3];
          const p2Index = gameState.navmesh.triangles[triIdx * 3 + 1];
          const p3Index = gameState.navmesh.triangles[triIdx * 3 + 2];

          const p1 = { x: gameState.navmesh.vertices[p1Index * 2], y: gameState.navmesh.vertices[p1Index * 2 + 1] };
          const p2 = { x: gameState.navmesh.vertices[p2Index * 2], y: gameState.navmesh.vertices[p2Index * 2 + 1] };
          const p3 = { x: gameState.navmesh.vertices[p3Index * 2], y: gameState.navmesh.vertices[p3Index * 2 + 1] };

          const flattenedTriangle = [p1.x, -p1.y, p2.x, -p2.y, p3.x, -p3.y];
          primitives.addPolygon(flattenedTriangle, laserCorridorPolyStyle);
        }
      }
    }

    // Render avatar
    if (dynamicScene.avatar) {
      const avatar = dynamicScene.avatar;
      const pos = avatar.coordinate;
      const look = avatar.look;
      const size = 8; // meters

      const angle = Math.atan2(look.y, look.x);
      
      // Create a triangle pointing in the 'look' direction
      const p1 = { x: pos.x + Math.cos(angle) * size, y: pos.y + Math.sin(angle) * size };
      const p2 = { x: pos.x + Math.cos(angle - 1.9) * size * 0.5, y: pos.y + Math.sin(angle - 1.9) * size * 0.5 };
      const p3 = { x: pos.x + Math.cos(angle + 1.9) * size * 0.5, y: pos.y + Math.sin(angle + 1.9) * size * 0.5 };

      const flattenedTriangle = [p1.x, -p1.y, p2.x, -p2.y, p3.x, -p3.y];
      primitives.addPolygon(flattenedTriangle, avatar.isOutsideNavmesh ? avatarOutsideNavmeshPolyStyle : (avatar.wallContact ? avatarWallContactPolyStyle : avatarPolyStyle));
      primitives.addCircle(pos.x, -pos.y, 0.1, { fillStyle: { color: 0xffffff, alpha: 1.0 } });
    }
  }
} 
