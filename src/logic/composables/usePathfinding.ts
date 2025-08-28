import type { GameState } from '../GameState';
import type { SceneState } from '../drawing/SceneState';
import { findCorners } from '../navmesh/pathCorners';
import { getTriangleFromPoint } from '../navmesh/NavUtils';
import { Wasm } from '../Wasm';
import { findCorridor } from '../navmesh/pathCorridor';

function calculateCorridorLength(navmesh: any, corridor: number[], startPoint: any, endPoint: any): number {
    if (corridor.length === 0) return 0;
    if (corridor.length === 1) {
        const dx = endPoint.x - startPoint.x;
        const dy = endPoint.y - startPoint.y;
        return Math.sqrt(dx * dx + dy * dy);
    }

    let totalLength = 0;
    
    // Distance from start to first polygon centroid
    const firstCentroidX = navmesh.poly_centroids[corridor[0] * 2];
    const firstCentroidY = navmesh.poly_centroids[corridor[0] * 2 + 1];
    let dx = firstCentroidX - startPoint.x;
    let dy = firstCentroidY - startPoint.y;
    totalLength += Math.sqrt(dx * dx + dy * dy);
    
    // Distance between polygon centroids
    for (let i = 0; i < corridor.length - 1; i++) {
        const curr = corridor[i];
        const next = corridor[i + 1];
        const currX = navmesh.poly_centroids[curr * 2];
        const currY = navmesh.poly_centroids[curr * 2 + 1];
        const nextX = navmesh.poly_centroids[next * 2];
        const nextY = navmesh.poly_centroids[next * 2 + 1];
        dx = nextX - currX;
        dy = nextY - currY;
        totalLength += Math.sqrt(dx * dx + dy * dy);
    }
    
    // Distance from last polygon centroid to end
    const lastCentroidX = navmesh.poly_centroids[corridor[corridor.length - 1] * 2];
    const lastCentroidY = navmesh.poly_centroids[corridor[corridor.length - 1] * 2 + 1];
    dx = endPoint.x - lastCentroidX;
    dy = endPoint.y - lastCentroidY;
    totalLength += Math.sqrt(dx * dx + dy * dy);
    
    return totalLength;
}

function calculatePathLength(corners: any[]): number {
    if (corners.length < 2) return 0;
    
    let totalLength = 0;
    for (let i = 0; i < corners.length - 1; i++) {
        const dx = corners[i + 1].x - corners[i].x;
        const dy = corners[i + 1].y - corners[i].y;
        totalLength += Math.sqrt(dx * dx + dy * dy);
    }
    return totalLength;
}

export function usePathfinding(
  gameState: GameState | undefined,
  sceneState: SceneState | undefined
) {
  const findCorridors = () => {
    if (!gameState || !sceneState) {
      console.log(
        'Missing gameState or sceneState:',
        { gameState: !!gameState, sceneState: !!sceneState }
      );
      return;
    }

    const navmesh = gameState.navmesh;
    if (!navmesh) {
      console.log('No navmesh available in gameState');
      return;
    }

    const selectedPointMarks = gameState.pointMarks.filter(mark => mark.selected);

    if (selectedPointMarks.length < 2) {
      console.log(
        'Not enough selected point marks (need at least 2):',
        selectedPointMarks.length
      );
      sceneState.clearCorridors();
      sceneState.clearPaths();
      return;
    }

    sceneState.clearCorridors();
    sceneState.clearPaths();

    let corridorCount = 0;
    const pathLengths: number[] = [];

    for (let i = 0; i < selectedPointMarks.length; i++) {
      for (let j = i + 1; j < selectedPointMarks.length; j++) {
        const mark1 = selectedPointMarks[i];
        const mark2 = selectedPointMarks[j];

        const startPoint = { x: mark1.x, y: mark1.y };
        const endPoint = { x: mark2.x, y: mark2.y };

        const startTri = getTriangleFromPoint(navmesh, startPoint);
        const endTri = getTriangleFromPoint(navmesh, endPoint);

        if (startTri === -1 || endTri === -1) {
          console.log(
            'Could not find start or end triangle. One of the points is likely outside the navmesh.'
          );
          continue;
        }

        const startPoly = navmesh.triangle_to_polygon[startTri];
        const endPoly = navmesh.triangle_to_polygon[endTri];

        // Test TypeScript implementation
        console.log('\n--- TypeScript Implementation ---');
        const time = performance.now();
        let tsCorridor = findCorridor(navmesh, 80, 3, startPoint, endPoint, startPoly, endPoly);
        // for (let i = 0; i < 250; i++) {
        //   const tsCorridor2 = findCorridor(navmesh, 80, 3, startPoint, endPoint, startPoly, endPoly);
        // }
        const time2 = performance.now();
        console.log(`[TS] findCorridor2: ${time2 - time}ms`);

        // Test WASM implementation
        console.log('\n--- WASM Implementation ---');
        const wasmResult = Wasm.testFindCorridor(startPoint, endPoint, 80, 3);

        // Visualize TypeScript result
        if (tsCorridor) {
          const corners = findCorners(navmesh, tsCorridor, startPoint, endPoint);
          const cornerPoints = corners.map(c => c.point);

          let pathLength = 0;
          for (let k = 0; k < cornerPoints.length - 1; k++) {
            const dx = cornerPoints[k + 1].x - cornerPoints[k].x;
            const dy = cornerPoints[k + 1].y - cornerPoints[k].y;
            pathLength += Math.sqrt(dx * dx + dy * dy);
          }
          pathLengths.push(Math.round(pathLength));

          const triangleCorridor: number[] = [];
          for (const polyId of tsCorridor) {
              const triStart = navmesh.poly_tris[polyId];
              const triEnd = navmesh.poly_tris[polyId + 1];
              for (let i = triStart; i < triEnd; i++) {
                  triangleCorridor.push(i);
              }
          }

          const corridorId = `ts-${mark1.id}-${mark2.id}`;
          sceneState.addCorridor(corridorId, triangleCorridor, startPoint, endPoint);
          sceneState.addPath(corridorId, cornerPoints, startPoint, endPoint);
          corridorCount++;
        }

        // Visualize WASM result  
        if (wasmResult && wasmResult.corridor.length > 0) {
          const wasmCorners = findCorners(navmesh, wasmResult.corridor, startPoint, endPoint);
          const wasmCornerPoints = wasmCorners.map(c => c.point);

          // Calculate WASM path length
          let wasmPathLength = 0;
          for (let k = 0; k < wasmCornerPoints.length - 1; k++) {
            const dx = wasmCornerPoints[k + 1].x - wasmCornerPoints[k].x;
            const dy = wasmCornerPoints[k + 1].y - wasmCornerPoints[k].y;
            wasmPathLength += Math.sqrt(dx * dx + dy * dy);
          }
          
          // Calculate WASM corridor length
          const wasmCorridorLength = calculateCorridorLength(navmesh, wasmResult.corridor, startPoint, endPoint);
          
          console.log(`[WA] testFindCorridor: Corridor length: ${wasmCorridorLength.toFixed(2)}, Path length: ${wasmPathLength.toFixed(2)}`);
          pathLengths.push(Math.round(wasmPathLength));
          const wasmTriangleCorridor: number[] = [];
          for (const polyId of wasmResult.corridor) {
              const triStart = navmesh.poly_tris[polyId];
              const triEnd = navmesh.poly_tris[polyId + 1];
              for (let i = triStart; i < triEnd; i++) {
                  wasmTriangleCorridor.push(i);
              }
          }

          const wasmCorridorId = `wasm-${mark1.id}-${mark2.id}`;
          sceneState.addCorridor(wasmCorridorId, wasmTriangleCorridor, startPoint, endPoint);
          sceneState.addPath(wasmCorridorId, wasmCornerPoints, startPoint, endPoint);
        }

        if (!tsCorridor && !wasmResult) {
          console.log(`No corridor found between marks ${mark1.id} and ${mark2.id}`);
        }
      }
    }

    if (pathLengths.length > 0) {
      console.log('Path lengths (meters):', pathLengths.join(', '));
    }

    console.log('\n=== PATHFINDING COMPARISON COMPLETE ===\n');
  };

  const buildPath = () => {
    if (!gameState || !sceneState) {
      console.log(
        'Missing gameState or sceneState:',
        { gameState: !!gameState, sceneState: !!sceneState }
      );
      return;
    }

    if (gameState.pointMarks.length < 2) {
      console.log(
        'Not enough point marks (need at least 2):',
        gameState.pointMarks.length
      );
      return;
    }

    sceneState.clearPaths();

    const sortedPointMarks = [...gameState.pointMarks].sort((a, b) => a.id - b.id);
    const corners = sortedPointMarks.map((mark) => ({ x: mark.x, y: mark.y }));

    const pathId = `path-${Date.now()}`;
    const startPoint = corners[0];
    const endPoint = corners[corners.length - 1];

    sceneState.addPath(pathId, corners, startPoint, endPoint);

    const addedPath = sceneState.getPath(pathId);
    const calculatedLength = addedPath ? addedPath.totalLength : 0;

    console.log(
      `Built path with ${corners.length} waypoints, total length: ${Math.round(
        calculatedLength
      )}m`
    );
  };

  return { findCorridors, buildPath };
} 