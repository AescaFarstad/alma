import { computed } from 'vue';
import type { GameState } from '../GameState';
import type { SceneState } from '../drawing/SceneState';

export function usePointMarks(
  gameState: GameState | undefined,
  sceneState: SceneState | undefined,
  contextMenu?: { coordinate: { lng: number; lat: number }; visible: boolean }
) {
  const addPointMark = () => {
  if (gameState && sceneState && contextMenu) {
    const newPointMark = {
    id: gameState.nextPointMarkId++,
    x: contextMenu.coordinate.lng,
    y: contextMenu.coordinate.lat,
    selected: true,
    };
    gameState.pointMarks.push(newPointMark);
    contextMenu.visible = false;
    sceneState.isDirty = true;
  }
  };

  const moveNearestPointMark = () => {
  if (gameState && sceneState && contextMenu && gameState.pointMarks.length > 0) {
    const { lng, lat } = contextMenu.coordinate;
    let nearestPointMark = null;
    let minDistance = Infinity;

    for (const pointMark of gameState.pointMarks) {
    const distance = Math.sqrt(
      Math.pow(pointMark.x - lng, 2) + Math.pow(pointMark.y - lat, 2)
    );
    if (distance < minDistance) {
      minDistance = distance;
      nearestPointMark = pointMark;
    }
    }

    if (nearestPointMark) {
    nearestPointMark.x = lng;
    nearestPointMark.y = lat;
    sceneState.isDirty = true;
    }
    contextMenu.visible = false;
  }
  };

  const selectAllPointMarks = () => {
  if (gameState && sceneState) {
    for (const pointMark of gameState.pointMarks) {
    if (!pointMark.selected) {
      pointMark.selected = true;
    }
    }
    sceneState.isDirty = true;
  }
  };

  const deleteSelectedPointMarks = () => {
  if (gameState && sceneState) {
    gameState.pointMarks = gameState.pointMarks.filter(
    (mark) => !mark.selected
    );
    sceneState.isDirty = true;
  }
  };

  const deleteAllPointMarks = () => {
  if (gameState && sceneState) {
    gameState.pointMarks = [];
    sceneState.isDirty = true;
  }
  };

  const selectedPointMarks = computed(() => {
  if (gameState) {
    return gameState.pointMarks.filter(mark => mark.selected).map(mark => mark.id);
  }
  return [];
  });

  return { addPointMark, moveNearestPointMark, selectAllPointMarks, deleteSelectedPointMarks, deleteAllPointMarks, selectedPointMarks };
} 