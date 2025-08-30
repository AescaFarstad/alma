import { GameState } from "../GameState";
import { SceneState, ACBLUE } from "../drawing/SceneState";
import { Point2 } from "../core/math";

export function useNavmeshTrianglesDebug(gameState: GameState | undefined, sceneState: SceneState | undefined) {
  const drawTriangles = (point: Point2) => {
    if (!gameState || !sceneState) {
      return;
    }

    const navmesh = gameState.navmesh;
    if (!navmesh) {
      return;
    }

    const triangleIds = navmesh.triangleIndex.query(point.x, point.y);

    for (const triId of triangleIds) {
      const triVertexStartIndex = triId * 3;
      const p1Index = navmesh.triangles[triVertexStartIndex];
      const p2Index = navmesh.triangles[triVertexStartIndex + 1];
      const p3Index = navmesh.triangles[triVertexStartIndex + 2];

      const triPoints: Point2[] = [
        { x: navmesh.vertices[p1Index * 2], y: navmesh.vertices[p1Index * 2 + 1] },
        { x: navmesh.vertices[p2Index * 2], y: navmesh.vertices[p2Index * 2 + 1] },
        { x: navmesh.vertices[p3Index * 2], y: navmesh.vertices[p3Index * 2 + 1] },
      ];

      sceneState.addDebugArea(triPoints, ACBLUE);
      const centerX = navmesh.triangle_centroids[triId * 2];
      const centerY = navmesh.triangle_centroids[triId * 2 + 1];
      sceneState.addDebugText({ x: centerX, y: centerY }, triId.toString(), ACBLUE);
    }
  };

  return { drawTriangles };
} 