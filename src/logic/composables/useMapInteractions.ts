import { ref, type Ref } from 'vue';
import type { Map as OlMap, MapBrowserEvent } from 'ol';
import type { GameState } from '../GameState';
import type { SceneState } from '../drawing/SceneState';
import { DragPan } from 'ol/interaction';
import { PixiLayer } from '../Pixie';
import { getBuildingGeometry } from '../../mapgen/simplification/geometryUtils';
import { Point2 } from '../core/math';
import { globalInputQueue } from "../Model";
import type { CmdTimeScale } from "../input/InputCommands";

const DRAG_THRESHOLD = 5; // pixels

function isPointInPolygon(point: { x: number; y: number }, polygon: Point2[]): boolean {
  let isInside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x,
      yi = polygon[i].y;
    const xj = polygon[j].x,
      yj = polygon[j].y;

    const intersect = yi > point.y !== yj > point.y && point.x < ((xj - xi) * (point.y - yi)) / (yj - yi) + xi;
    if (intersect) isInside = !isInside;
  }
  return isInside;
}

export function useMapInteractions(
  map: OlMap | null,
  gameState: GameState | undefined,
  sceneState: SceneState | undefined,
  pixieLayer: Ref<PixiLayer | null>,
  emit: (event: 'map-event', payload: any) => void
) {
  const draggedPointMarkId = ref<number | null>(null);
  let wasDragging = false;
  let dragStartCoordinate: { x: number; y: number } | null = null;
  let dragPanInteraction: DragPan | undefined;

  const pressedKeys = new Set<string>();

  const handlePointerMove = (evt: MapBrowserEvent<any>) => {
    if (!gameState || !map) return;
    const coords = map.getCoordinateFromPixel(evt.pixel);
    const avatarPos = gameState.avatar.coordinate;
    const lookVector = { x: coords[0] - avatarPos.x, y: coords[1] - avatarPos.y };
    const len = Math.sqrt(lookVector.x * lookVector.x + lookVector.y * lookVector.y);
    if (len > 0) {
      gameState.avatar.lookTarget.x = lookVector.x / len;
      gameState.avatar.lookTarget.y = lookVector.y / len;
    }
  };

  const handleKeyDown = (evt: KeyboardEvent) => {
    if (!gameState) return;

    if (evt.key === ' ' || evt.key === 'Spacebar' || evt.code === 'Space') {
      evt.preventDefault();
      const command: CmdTimeScale = { name: "CmdTimeScale", scale: 0, playerId: "player1" };
      globalInputQueue.push(command);
    }

    pressedKeys.add(evt.key.toLowerCase());
    updateMovementVector();
  };

  const handleKeyUp = (evt: KeyboardEvent) => {
    if (!gameState) return;
    pressedKeys.delete(evt.key.toLowerCase());
    updateMovementVector();
  };

  const updateMovementVector = () => {
    if (!gameState) return;
    let dx = 0;
    let dy = 0;
    if (pressedKeys.has('w')) dy += 1;
    if (pressedKeys.has('s')) dy -= 1;
    if (pressedKeys.has('a')) dx -= 1;
    if (pressedKeys.has('d')) dx += 1;

    const len = Math.sqrt(dx * dx + dy * dy);
    if (len > 0) {
      gameState.avatar.movement.x = dx / len;
      gameState.avatar.movement.y = dy / len;
    } else {
      gameState.avatar.movement.x = 0;
      gameState.avatar.movement.y = 0;
    }
  };

  // const handleClick = (evt: MapBrowserEvent<any>) => {
  //   if (!map) return;
  //   const features = map.getFeaturesAtPixel(evt.pixel);
  //   if (features && features.length > 0) {
  //     const feature = features[0];
  //     const mapId = feature.get('id');
  //     if (mapId && sceneState) {
  //       if (sceneState.isBuildingSelected(mapId)) {
  //         sceneState.deselectBuilding(mapId);
  //       } else {
  //         sceneState.selectBuilding(mapId);
  //       }
  //     }
  //   }
  // };

  const onPointerDown = (e: MapBrowserEvent<any>) => {
    if (!gameState || !sceneState || !map) return;

    const view = map.getView();
    const resolution = view.getResolution() || 1;
    const radiusInPixels = 5;
    const clickRadius = (radiusInPixels + 2) * resolution;
    const clickCoordinate = { x: e.coordinate[0], y: e.coordinate[1] };

    for (const pointMark of gameState.pointMarks) {
      const dx = pointMark.x - clickCoordinate.x;
      const dy = pointMark.y - clickCoordinate.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance <= clickRadius) {
        draggedPointMarkId.value = pointMark.id;
        dragStartCoordinate = { x: e.pixel[0], y: e.pixel[1] };
        wasDragging = false;
        if (dragPanInteraction) {
          dragPanInteraction.setActive(false);
        }
        return;
      }
    }
  };

  const onPointerUp = () => {
    if (draggedPointMarkId.value !== null) {
      draggedPointMarkId.value = null;
      dragStartCoordinate = null;
      if (dragPanInteraction) {
        dragPanInteraction.setActive(true);
      }
      if (wasDragging) {
        setTimeout(() => {
          wasDragging = false;
        }, 0);
      }
    }
  };

  const onPointerMove = (e: MapBrowserEvent<any>) => {
    if (draggedPointMarkId.value !== null) {
      if (dragStartCoordinate && !wasDragging) {
        const dx = e.pixel[0] - dragStartCoordinate.x;
        const dy = e.pixel[1] - dragStartCoordinate.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance > DRAG_THRESHOLD) {
          wasDragging = true;
        }
      }

      if (wasDragging && gameState && sceneState) {
        const pointMark = gameState.pointMarks.find(
          (p) => p.id === draggedPointMarkId.value
        );
        if (pointMark) {
          pointMark.x = e.coordinate[0];
          pointMark.y = e.coordinate[1];
          sceneState.isDirty = true;
        }
      }
    } else {
      if (e.dragging) return;
      emit('map-event', {
        type: 'mouse-moved',
        payload: { lng: e.coordinate[0], lat: e.coordinate[1] },
      });
    }
  };

  const onDoubleClick = (e: MapBrowserEvent<any>) => {
    e.preventDefault();
    emit('map-event', {
      type: 'show-context-menu',
      payload: {
        x: e.pixel[0],
        y: e.pixel[1],
        coordinate: { lng: e.coordinate[0], lat: e.coordinate[1] },
      },
    });
  };

  const onClick = (e: MapBrowserEvent<any>) => {
    if (wasDragging) return;

    emit('map-event', { type: 'map-clicked', payload: null });
    let featureClicked = false;
    map?.forEachFeatureAtPixel(e.pixel, (feature) => {
      featureClicked = true;
      if (pixieLayer.value && sceneState) {
        const mapIdStr = feature.get('id');
        if (mapIdStr && feature.get('type') === 'building' && gameState) {
          const mapId = parseInt(mapIdStr, 10);
          if (!isNaN(mapId)) {
            if (sceneState.isBuildingSelected(mapId)) {
              sceneState.deselectBuilding(mapId);
            } else {
              sceneState.selectBuilding(mapId);
            }
          }
        } else if (feature.get('type') === 'building' && gameState) {
          // Fallback for features without an ID. We should never actually need this.
          const clickCoordinate = { x: e.coordinate[0], y: e.coordinate[1] };
          const candidateIds = gameState.navmesh.buildingIndex.query(clickCoordinate.x, clickCoordinate.y);
          
          for (const buildingId of candidateIds) {
            const polygon = getBuildingGeometry(gameState.navmesh, buildingId);
            if (polygon && isPointInPolygon(clickCoordinate, polygon)) {
              if (sceneState.isBuildingSelected(buildingId)) {
                sceneState.deselectBuilding(buildingId);
              } else {
                sceneState.selectBuilding(buildingId);
              }
              return; // Stop after finding the first match
            }
          }
           console.warn('[Map] Clicked a building feature without an ID, and could not find a matching building geometry.');
        } else {
          console.warn('[Map] Feature has no id property or is not a building');
        }
      } else {
        console.warn('[Map] pixieLayer is not available:', { pixieLayer: !!pixieLayer.value, sceneState: !!sceneState });
      }
    });

    if (featureClicked) {
      return;
    }

    if (gameState && sceneState && map) {
      const view = map.getView();
      const resolution = view.getResolution() || 1;
      const radiusInPixels = 5;
      const clickRadius = (radiusInPixels + 2) * resolution;
      const clickCoordinate = { x: e.coordinate[0], y: e.coordinate[1] };

      let pointMarkClicked = false;
      for (const pointMark of gameState.pointMarks) {
        const dx = pointMark.x - clickCoordinate.x;
        const dy = pointMark.y - clickCoordinate.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance <= clickRadius) {
          pointMarkClicked = true;
          if (pointMark.selected) {
            pointMark.selected = false;
          } else {
            pointMark.selected = true;
          }
          sceneState.isDirty = true;
          return;
        }
      }

      if (!pointMarkClicked) {
        // Clear selection for all point marks
        for (const mark of gameState.pointMarks) {
          mark.selected = false;
        }
        sceneState.isDirty = true;
      }
    }
  };

  const onViewChange = () => {
    if (!map) return;
    const view = map.getView();
    const center = view.getCenter();
    const zoom = view.getZoom();
    if (zoom !== undefined) {
      emit('map-event', { type: 'zoom-updated', payload: zoom });
    }
    if (!center) return;
    emit('map-event', { type: 'center-updated', payload: { lng: center[0], lat: center[1] } });
    const extent = view.calculateExtent(map.getSize()!);
    emit('map-event', { type: 'bounds-updated', payload: {
        _sw: { lng: extent[0], lat: extent[1] },
        _ne: { lng: extent[2], lat: extent[3] }
    }});
  };

  const init = () => {
    if (!map) return;
    dragPanInteraction = map
      .getInteractions()
      .getArray()
      .find((i) => i instanceof DragPan) as DragPan;

    map.on('pointerdown' as any, onPointerDown);
    map.on('pointerup' as any, onPointerUp);
    map.on('pointermove' as any, onPointerMove);
    map.on('dblclick' as any, onDoubleClick);
    map.on('click' as any, onClick);
    map.getView().on('change', onViewChange);
    map.on('pointermove', handlePointerMove);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
  };

  const cleanup = () => {
    if (!map) return;
    map.un('pointerdown' as any, onPointerDown);
    map.un('pointerup' as any, onPointerUp);
    map.un('pointermove' as any, onPointerMove);
    map.un('dblclick' as any, onDoubleClick);
    map.un('click' as any, onClick);
    map.getView().un('change', onViewChange);
    map.un('pointermove', handlePointerMove);
    window.removeEventListener('keydown', handleKeyDown);
    window.removeEventListener('keyup', handleKeyUp);
  };

  return { init, cleanup };
} 