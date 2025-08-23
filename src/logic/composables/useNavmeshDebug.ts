import type { GameState } from '../GameState';
import type { SceneState } from '../drawing/SceneState';
import { mapInstance } from '../../map_instance';

export function useNavmeshDebug(
  gameState: GameState | undefined,
  sceneState: SceneState | undefined
) {
  const drawNavmesh = () => {
    if (!gameState || !sceneState) return;

    const navmesh = gameState.navmesh;
    const points = navmesh.vertices;
    const triangles = navmesh.triangles;
    const map = mapInstance.map;
    if (!map) return;

    const extent = map.getView().calculateExtent(map.getSize()!);
    const visibleRect = {
      minX: extent[0],
      minY: extent[1],
      maxX: extent[2],
      maxY: extent[3],
    };

    // sceneState.clearDebugVisuals();
    const drawnEdges = new Set<string>();

    for (let i = 0; i < triangles.length; i += 3) {
      const p1Index = triangles[i];
      const p2Index = triangles[i + 1];
      const p3Index = triangles[i + 2];

      const p1 = { x: points[p1Index * 2], y: points[p1Index * 2 + 1] };
      const p2 = { x: points[p2Index * 2], y: points[p2Index * 2 + 1] };
      const p3 = { x: points[p3Index * 2], y: points[p3Index * 2 + 1] };

      let inView = false;
      if (
        p1.x >= visibleRect.minX &&
        p1.x <= visibleRect.maxX &&
        p1.y >= visibleRect.minY &&
        p1.y <= visibleRect.maxY
      )
        inView = true;
      if (
        !inView &&
        p2.x >= visibleRect.minX &&
        p2.x <= visibleRect.maxX &&
        p2.y >= visibleRect.minY &&
        p2.y <= visibleRect.maxY
      )
        inView = true;
      if (
        !inView &&
        p3.x >= visibleRect.minX &&
        p3.x <= visibleRect.maxX &&
        p3.y >= visibleRect.minY &&
        p3.y <= visibleRect.maxY
      )
        inView = true;

      if (!inView) continue;

      const edges = [
        { p1, p2, idx1: p1Index, idx2: p2Index },
        { p1: p2, p2: p3, idx1: p2Index, idx2: p3Index },
        { p1: p3, p2: p1, idx1: p3Index, idx2: p1Index },
      ];
      for (const edge of edges) {
        const edgeKey = `${Math.min(edge.idx1, edge.idx2)}-${Math.max(
          edge.idx1,
          edge.idx2
        )}`;
        if (!drawnEdges.has(edgeKey)) {
          sceneState.addDebugLine(edge.p1, edge.p2, 'orange');
          drawnEdges.add(edgeKey);
        }
      }
    }
  };

  return { drawNavmesh };
} 