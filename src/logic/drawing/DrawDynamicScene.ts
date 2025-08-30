import { PrimitiveState, PolyStyle, LineStyle } from './PrimitiveState';
import { DynamicScene } from './DynamicScene';
import { GameState } from '../GameState';
import { Map as OlMap } from 'ol';
import { AgentState } from '../agents/Agent';

const laserBlastLineStyle: LineStyle = {
  width: 2,
  color: 0xFF00FF, // Pink
  alpha: 0.9,
};

const laserCorridorPolyStyle: PolyStyle = {
  fillStyle: { color: 0x50C878, alpha: 0.3 }, // Emerald
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

    // Render agents using pooling system
    // Sync pool with agents from GameState (operates directly on GameState.agents as requested)
    // Note: We no longer use the primitives system for agents - they are managed as PIXI objects directly

    // --- Camera Follow ---
    // if (dynamicScene.avatar && olMap && (dynamicScene.avatar.movement.x !== 0 || dynamicScene.avatar.movement.y !== 0)) {
    //   const view = olMap.getView();
    //   view.setCenter([dynamicScene.avatar.coordinate.x, dynamicScene.avatar.coordinate.y]);
    // }
  }
} 