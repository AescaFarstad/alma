import { ref, onMounted, onUnmounted } from 'vue';
import type { SceneState } from '../drawing/SceneState';
import type { MouseCoordinates } from '../../types';

export function useMeasurement(
  sceneState: SceneState | undefined,
  mouseCoordinates: { value: MouseCoordinates }
) {
  const measurementStartPoint = ref<MouseCoordinates | null>(null);
  const measurementDistance = ref<number | null>(null);

  const handleKeyDown = (event: KeyboardEvent) => {
  if (event.key === 'm' && !measurementStartPoint.value) {
    measurementStartPoint.value = { ...mouseCoordinates.value };
  }
  };

  const handleKeyUp = (event: KeyboardEvent) => {
  if (event.key === 'm') {
    measurementStartPoint.value = null;
    measurementDistance.value = null;
    if (sceneState) {
    sceneState.clearMeasurementLine();
    }
  }
  };

  const updateMeasurementLine = () => {
  if (measurementStartPoint.value) {
    const dx = mouseCoordinates.value.lng - measurementStartPoint.value.lng;
    const dy = mouseCoordinates.value.lat - measurementStartPoint.value.lat;
    measurementDistance.value = Math.sqrt(dx * dx + dy * dy);
    if (sceneState) {
    sceneState.setMeasurementLine(
      measurementStartPoint.value,
      mouseCoordinates.value
    );
    }
  }
  };

  onMounted(() => {
  window.addEventListener('keydown', handleKeyDown);
  window.addEventListener('keyup', handleKeyUp);
  });

  onUnmounted(() => {
  window.removeEventListener('keydown', handleKeyDown);
  window.removeEventListener('keyup', handleKeyUp);
  });

  return {
  measurementStartPoint,
  measurementDistance,
  updateMeasurementLine,
  };
} 