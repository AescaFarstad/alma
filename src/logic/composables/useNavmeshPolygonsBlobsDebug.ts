import type { GameState } from '../GameState';
import type { SceneState } from '../drawing/SceneState';
import { DEBUG_COLORS, ACBLACK, ACBROWN } from '../drawing/SceneState';
import { getPolygonVertices } from '../../mapgen/simplification/geometryUtils';

export function useNavmeshPolygonsBlobsDebug(gameState?: GameState, sceneState?: SceneState) {
  const drawAllPolygons = () => {
    if (!gameState || !sceneState) return;
    const navmesh = gameState.navmesh;
    if (!navmesh || !navmesh.polygons || navmesh.polygons.length <= 1) return;

    // Build adjacency list for polygons using poly_neighbors
    const totalPolygons = navmesh.polygons.length - 1;
    const adjacency: number[][] = Array.from({ length: totalPolygons }, () => []);

    for (let poly = 0; poly < totalPolygons; poly++) {
      const start = navmesh.polygons[poly];
      const end = navmesh.polygons[poly + 1];
      for (let ei = start; ei < end; ei++) {
        const neighbor = navmesh.poly_neighbors[ei];
        if (neighbor !== -1 && neighbor < totalPolygons) {
          adjacency[poly].push(neighbor);
        }
      }
    }

    // Greedy graph coloring using available debug colors (skip black to avoid confusion)
    let availableColors = DEBUG_COLORS.filter(c => c !== ACBROWN);
    availableColors = availableColors.reverse();
    const colorOf: string[] = new Array(totalPolygons);

    for (let poly = 0; poly < totalPolygons; poly++) {
      const used = new Set<string>();
      for (const n of adjacency[poly]) {
        const c = colorOf[n];
        if (c) used.add(c);
      }
      const color = availableColors.find(c => !used.has(c)) || availableColors[0];
      colorOf[poly] = color;
    }

    // Draw
    for (let poly = 0; poly < totalPolygons; poly++) {
      const vertices = getPolygonVertices(navmesh, poly);
      if (vertices.length >= 3) {
        sceneState.addDebugArea(vertices, colorOf[poly]);
      }
    }
  };

  const drawAllBlobs = () => {
    if (!gameState || !sceneState) return;
    const navmesh = gameState.navmesh;
    if (!navmesh || !navmesh.polygons || navmesh.polygons.length <= 1) return;

    const totalPolygons = navmesh.polygons.length - 1;
    const startBlob = Math.max(0, navmesh.walkable_polygon_count || 0);
    for (let poly = startBlob; poly < totalPolygons; poly++) {
      const vertices = getPolygonVertices(navmesh, poly);
      if (vertices.length >= 3) {
        sceneState.addDebugArea(vertices, ACBROWN);
      }
    }
  };

  return { drawAllPolygons, drawAllBlobs };
}
