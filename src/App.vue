<template>
  <div id="map-container" tabindex="0">
    <Map ref="mapComponent" @map-event="handleMapEvent" :layer-visibility="layerVisibility" />
    <Overlay
      @map-event="handleMapEvent"
      :mouse-coordinates="mouseCoordinates"
      :map-bounds="mapBounds"
      :selected-feature-info="selectedFeatureInfo"
      :map-center="mapCenter"
      :measurement-distance="measurementDistance"
      :zoom-level="zoomLevel"
      :avatar="avatar"
      :agent-count="agentCount"
    />
    <ContextMenu
      :visible="contextMenu.visible"
      :x="contextMenu.x"
      :y="contextMenu.y"
      :coordinate="contextMenu.coordinate"
      @hide="hideContextMenu"
    />
    <SelectedPointMarks />
  </div>
</template>

<script setup lang="ts">
import { ref, provide, inject, reactive, type Ref } from 'vue';
import Map from './components/ui/Map.vue';
import Overlay from './components/ui/Overlay.vue';
import ContextMenu from './components/ui/ContextMenu.vue';
import SelectedPointMarks from './components/ui/SelectedPointMarks.vue';
import { globalInputQueue } from './logic/Model';
import type { MouseCoordinates } from './types.ts';
import type { CmdInput } from './logic/input/InputCommands';
import { mapInstance } from './map_instance';
import VectorTileLayer from 'ol/layer/VectorTile';
import type { GameState } from './logic/GameState';
import type { FPSMetrics } from './logic/FPSCounter';
import Feature from 'ol/Feature';
import { PixiLayer } from './logic/Pixie';
import { SceneState } from './logic/drawing/SceneState';
import { usePathfinding } from './logic/composables/usePathfinding';
import { useNavmeshDebug } from './logic/composables/useNavmeshDebug';
import { useNavmeshGridDebug } from './logic/composables/useNavmeshGridDebug';
import { useMeasurement } from './logic/composables/useMeasurement';
import { usePointMarks } from './logic/composables/usePointMarks';
import { useAvatarState } from './logic/composables/useAvatarState';
import { useNavmeshTrianglesDebug } from './logic/composables/useNavmeshTrianglesDebug';
import { WasmFacade } from './logic/WasmFacade.ts';

const agentCount = inject<Ref<number>>('agentCount');
const gameState = inject<GameState>('gameState');
const fpsMetrics = inject<FPSMetrics>('fpsMetrics');
const sceneState = inject<SceneState>('sceneState');

const wasmRenderEnabled = inject<Ref<boolean>>('wasmRenderEnabled');

const contextMenu = reactive({
  visible: false,
  x: 0,
  y: 0,
  coordinate: { lng: 0, lat: 0 },
});

const mapComponent = ref<{ pixieLayer: { value: PixiLayer | null } } | null>(null);
const mapReady = ref(false);
const pixieLayerRef = ref<PixiLayer | null>(null);
const mapCenter = ref<{ lng: number, lat: number } | null>(null);

const mouseCoordinates = ref<MouseCoordinates>({ lng: 0, lat: 0 });
const mapBounds = ref('');
const selectedFeatureInfo = ref<any>(null);
const zoomLevel = ref<number | null>(null);
const lastRedrawZoomLevel = ref<number | null>(null);

const layerVisibility = reactive({
  buildings: true,
  roads: false,
  footpaths: false,
});

const { findCorridors, buildPath } = usePathfinding(gameState, sceneState);
const { drawNavmesh } = useNavmeshDebug(gameState, sceneState);
const { drawNavGrid } = useNavmeshGridDebug(gameState, sceneState);
const { measurementDistance, updateMeasurementLine } = useMeasurement(sceneState, mouseCoordinates);
usePointMarks(gameState, sceneState, contextMenu);
const { avatar } = useAvatarState();
const { drawTriangles: drawDebugTriangles } = useNavmeshTrianglesDebug(gameState, sceneState);

const hideContextMenu = () => {
  contextMenu.visible = false;
};

const handleMapEvent = (event: { type: string, payload: any }) => {
  // Handle map-ready event
  if (event.type === 'map-ready') {
    mapReady.value = true;
  }
  
  // Handle pixie layer ready event
  if (event.type === 'pixie-layer-ready') {
    pixieLayerRef.value = event.payload.pixieLayer;
  }
  const eventHandlers: Record<string, (payload: any) => void> = {
    'show-context-menu': (payload) => {
      contextMenu.visible = true;
      contextMenu.x = payload.x;
      contextMenu.y = payload.y;
      contextMenu.coordinate = payload.coordinate;
    },
    'map-clicked': () => {
      contextMenu.visible = false;
    },
    'bounds-updated': (payload) => {
      const sw = payload._sw;
      const ne = payload._ne;
      mapBounds.value = `${sw.lng.toFixed()}, ${sw.lat.toFixed()} | ${ne.lng.toFixed()}, ${ne.lat.toFixed()}`;
    },
    'feature-selected': (payload) => {
      selectedFeatureInfo.value = payload;
    },
    'mouse-moved': (payload) => {
      mouseCoordinates.value = payload;
      updateMeasurementLine();
    },
    'command': (payload) => {
      globalInputQueue.push(payload as CmdInput);
    },
    'map-ready': () => {
      mapReady.value = true;
    },
    'center-updated': (payload) => {
      mapCenter.value = payload;
    },
    'zoom-updated': (newZoom) => {
      zoomLevel.value = newZoom;
      if (lastRedrawZoomLevel.value === null) {
        lastRedrawZoomLevel.value = newZoom;
        if (sceneState) {
          sceneState.isDirty = true;
        }
      } else {
        if (sceneState && Math.abs(newZoom - lastRedrawZoomLevel.value) > 0.5) {
          sceneState.isDirty = true;
          lastRedrawZoomLevel.value = newZoom;
        }
      }
    },
    'draw-navmesh': drawNavmesh,
    'find-corridors': findCorridors,
    'build-path': buildPath,
    'draw-nav-grid': (payload) => {
      if (sceneState) {
        drawNavGrid(payload.pattern)
      }
    },
    'toggle-layer': (payload) => {
      const layerId = payload.layerId as 'buildings' | 'roads' | 'footpaths';
      layerVisibility[layerId] = !layerVisibility[layerId];
      const combinedLayer = mapInstance.map?.getLayers().getArray().find(layer => layer.get('name') === 'combined') as VectorTileLayer<Feature>;
      if (combinedLayer) {
        combinedLayer.getSource()?.refresh();
      }
    },
    'set-agent-render-mode': (payload) => {
        if (mapComponent.value?.pixieLayer?.value) {
            mapComponent.value.pixieLayer.value.setAgentRenderingMode(payload.mode);
        }
    },
    'toggle-agents': (payload) => {
        if (pixieLayerRef.value) {
            pixieLayerRef.value.setAgentRenderingEnabled(payload.enabled);
        }
    },
    'toggle-wasm-render': (payload) => {
        if (wasmRenderEnabled) {
          wasmRenderEnabled.value = payload.enabled;
        }
        if (!payload.enabled && WasmFacade._sprite_renderer_clear) {
          WasmFacade._sprite_renderer_clear();
        }
    }
  };

  const handler = eventHandlers[event.type];
  if (handler) {
    handler(event.payload);
  }
};

provide('gameState', gameState);
provide('fpsMetrics', fpsMetrics);
provide('pixieLayer', mapComponent.value?.pixieLayer);
if (wasmRenderEnabled) provide('wasmRenderEnabled', wasmRenderEnabled);
provide('sceneState', sceneState);
</script>

<style>
#map-container {
  position: relative;
  width: 100vw;
  height: 100vh;
  outline: none;
}
</style> 