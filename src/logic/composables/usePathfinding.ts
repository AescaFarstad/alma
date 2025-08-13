import type { GameState } from '../GameState';
import type { SceneState } from '../drawing/SceneState';
import { findCorners } from '../navmesh/pathCorners';
import { findCorridor, getTriangleFromPoint } from '../navmesh/pathCorridor';

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

    const selectedPointMarkIds = Array.from(sceneState.selectedPointMarkIds);

    if (selectedPointMarkIds.length < 2) {
      console.log(
        'Not enough selected point marks (need at least 2):',
        selectedPointMarkIds.length
      );
      sceneState.clearCorridors();
      sceneState.clearPaths();
      return;
    }

    sceneState.clearCorridors();
    sceneState.clearPaths();

    let corridorCount = 0;
    const pathLengths: number[] = [];

    for (let i = 0; i < selectedPointMarkIds.length; i++) {
      for (let j = i + 1; j < selectedPointMarkIds.length; j++) {
        const mark1Id = selectedPointMarkIds[i];
        const mark2Id = selectedPointMarkIds[j];

        const mark1 = gameState.pointMarks.find((m) => m.id === mark1Id);
        const mark2 = gameState.pointMarks.find((m) => m.id === mark2Id);

        if (mark1 && mark2) {
          const startPoint = { x: mark1.x, y: mark1.y };
          const endPoint = { x: mark2.x, y: mark2.y };

          const startTri = getTriangleFromPoint(navmesh, startPoint);
          const endTri = getTriangleFromPoint(navmesh, endPoint);

          const corridor = findCorridor(navmesh, startPoint, endPoint, startTri, endTri);

          if (corridor) {
            const corners = findCorners(navmesh, corridor, startPoint, endPoint);
            const cornerPoints = corners.map(c => c.point);

            let pathLength = 0;
            for (let k = 0; k < cornerPoints.length - 1; k++) {
              const dx = cornerPoints[k + 1].x - cornerPoints[k].x;
              const dy = cornerPoints[k + 1].y - cornerPoints[k].y;
              pathLength += Math.sqrt(dx * dx + dy * dy);
            }
            pathLengths.push(Math.round(pathLength));

            const corridorId = `${mark1Id}-${mark2Id}`;
            sceneState.addCorridor(corridorId, corridor, startPoint, endPoint);
            sceneState.addPath(corridorId, cornerPoints, startPoint, endPoint);
            corridorCount++;
          } else {
            console.log(`No corridor found between marks ${mark1Id} and ${mark2Id}`);
          }
        } else {
          console.log(`Could not find point marks in gameState for IDs ${mark1Id}, ${mark2Id}`);
        }
      }
    }

    if (pathLengths.length > 0) {
      console.log('Path lengths (meters):', pathLengths.join(', '));
    }
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