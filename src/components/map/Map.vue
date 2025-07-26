<template>
  <div id="map" ref="mapElement"></div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, defineEmits, inject, ref, defineExpose } from 'vue';
import 'ol/ol.css';
import { Map as OlMap } from 'ol';
import View from 'ol/View';
import { Projection } from 'ol/proj';
import { mapInstance } from '../../map_instance';
import { GameState } from '../../logic/GameState';
import { initNewGame } from '../../logic/StartGame';
import TileGrid from 'ol/tilegrid/TileGrid';
import { createDynamicLayers } from '../../map/dynamicLayers';
import { createStaticLayers } from '../../map/staticLayers';
import { createDynamicCombinedLayers } from '../../map/dynamicCombinedLayers';
import { PixiLayer } from '../../logic/Pixie';
import { SceneState } from '../../logic/drawing/SceneState';

const props = defineProps({
  layerVisibility: {
    type: Object,
    required: true,
  },
});

const emit = defineEmits(['map-event']);
const gameState = inject<GameState>('gameState');
const sceneState = inject<SceneState>('sceneState');
const mapElement = ref<HTMLDivElement | null>(null);
let pixieLayer: PixiLayer | null = null;

type TileMode = 'static' | 'dynamic_separate' | 'dynamic_combined';
const TILE_MODE: TileMode = 'dynamic_combined' as TileMode; // Change this to switch between modes

onMounted(async () => {
  const cartesianProjection = new Projection({
    code: 'xkcd-map',
    units: 'm',
    extent: [-10000, -10000, 10000, 10000],
  });

  let view;
  let customTileGrid: TileGrid | undefined;

  if (TILE_MODE === 'static') {
    const resolutions = [
      20000 / 512,
      10000 / 512,
      5000 / 512,
      2500 / 512,
      1250 / 512,
      625 / 512,
      312.5 / 512
    ];

    customTileGrid = new TileGrid({
        extent: [-10000, -10000, 10000, 10000],
        resolutions: resolutions,
        tileSize: 512
    });
    
    view = new View({
      projection: cartesianProjection,
      center: [0, 0],
      zoom: 2,
      resolutions: resolutions,
      constrainResolution: true,
    });

  } else {
    view = new View({
      projection: cartesianProjection,
      center: [0, 0],
      zoom: 5,
      minZoom: 0,
      maxZoom: 18,
      constrainResolution: false,
      smoothResolutionConstraint: true,
      enableRotation: false,
    });
  }
  
  mapInstance.map = new OlMap({
    target: mapElement.value!,
    layers: [],
    view: view,
  });

  if (TILE_MODE === 'static') {
    console.log('Map created with STATIC tiles. View details:', {
        zoom: mapInstance.map.getView().getZoom(),
        resolution: mapInstance.map.getView().getResolution(),
        resolutions: mapInstance.map.getView().getResolutions(),
    });
  }

  if (gameState && sceneState) {
    pixieLayer = new PixiLayer(mapInstance.map, gameState, sceneState);
    await pixieLayer.init();
    initNewGame(gameState);
  }

  switch (TILE_MODE) {
    case 'static':
      createStaticLayers(cartesianProjection, customTileGrid!);
      break;
    case 'dynamic_separate':
      createDynamicLayers(cartesianProjection);
      break;
    case 'dynamic_combined':
      createDynamicCombinedLayers(cartesianProjection, props.layerVisibility as any);
      break;
  }

  emit('map-event', { type: 'map-ready', payload: null });
  
  mapInstance.map.on('pointermove', (e) => {
    if (e.dragging) return;
    emit('map-event', { type: 'mouse-moved', payload: { lng: e.coordinate[0], lat: e.coordinate[1] } });
    // const hit = mapInstance.map?.hasFeatureAtPixel(e.pixel);
    // mapInstance.map!.getTargetElement().style.cursor = hit ? 'pointer' : '';
  });

  mapInstance.map.on('click', (e) => {
    let featureCount = 0;
    mapInstance.map?.forEachFeatureAtPixel(e.pixel, (feature) => {
      featureCount++;
      if (pixieLayer && sceneState) {
        const mapId = feature.get('id');
        if (mapId && feature.get('type') === 'building' && gameState) {
          if (sceneState.isBuildingSelected(mapId)) {
            sceneState.deselectBuilding(mapId);
          } else {
            sceneState.selectBuilding(mapId);
          }
        } else {
          console.warn('[Map] Feature has no id property or is not a building');
        }
      } else {
        console.warn('[Map] pixieLayer is not available');
      }
    });
  });

  mapInstance.map.getView().on('change', () => {
      if (!mapInstance.map) return;
      const view = mapInstance.map.getView();
      const center = view.getCenter();
      const zoom = view.getZoom();
      if (zoom !== undefined) {
        emit('map-event', { type: 'zoom-updated', payload: zoom });
      }
      if (!center) return;
      emit('map-event', { type: 'center-updated', payload: { lng: center[0], lat: center[1] }});
      const extent = view.calculateExtent(mapInstance.map!.getSize()!);
      emit('map-event', { type: 'bounds-updated', payload: {
          _sw: { lng: extent[0], lat: extent[1] },
          _ne: { lng: extent[2], lat: extent[3] }
      }});
  });
});

onUnmounted(() => {
    if (pixieLayer) {
      pixieLayer.stop();
      pixieLayer.destroy();
      pixieLayer = null;
    }
    if (mapInstance.map) {
        mapInstance.map.setTarget(undefined);
        mapInstance.map = null;
    }
});

defineExpose({
  pixieLayer,
});
</script>

<style>
#map {
  width: 100%;
  height: 100%;
  background-color: #f8f4f0;
}
</style>
