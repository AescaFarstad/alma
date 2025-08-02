import { computed } from 'vue';
import type { GameState } from '../GameState';
import type { SceneState } from '../drawing/SceneState';

export function usePointMarks(
  gameState: GameState | undefined,
  sceneState: SceneState | undefined,
  contextMenu: { coordinate: { lng: number; lat: number }; visible: boolean }
) {
  const addPointMark = () => {
    if (gameState && sceneState) {
      const newPointMark = {
        id: gameState.nextPointMarkId++,
        x: contextMenu.coordinate.lng,
        y: contextMenu.coordinate.lat,
      };
      gameState.pointMarks.push(newPointMark);
      sceneState.selectPointMark(newPointMark.id);
      contextMenu.visible = false;
      sceneState.isDirty = true;
    }
  };

  const deleteSelectedPointMarks = () => {
    if (gameState && sceneState) {
      const selectedIds = sceneState.selectedPointMarkIds;
      gameState.pointMarks = gameState.pointMarks.filter(
        (mark) => !selectedIds.has(mark.id)
      );
      sceneState.selectedPointMarkIds.clear();
      sceneState.isDirty = true;
    }
  };

  const selectedPointMarks = computed(() => {
    if (sceneState) {
      return Array.from(sceneState.selectedPointMarkIds);
    }
    return [];
  });

  return { addPointMark, deleteSelectedPointMarks, selectedPointMarks };
} 