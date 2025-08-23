<template>
  <div id="map" ref="mapElement"></div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, defineEmits, inject, ref, defineExpose, shallowRef } from 'vue';
import 'ol/ol.css';
import { mapInstance } from '../../map_instance';
import type { GameState } from '../../logic/GameState';
import { PixiLayer } from '../../logic/Pixie';
import type { SceneState } from '../../logic/drawing/SceneState';
import { setupMapView } from '../../logic/composables/setupMapView';
import { useMapInteractions } from '../../logic/composables/useMapInteractions';
import { DynamicScene } from '../../logic/drawing/DynamicScene';

const props = defineProps({
  layerVisibility: {
    type: Object,
    required: true,
  },
});

const emit = defineEmits(['map-event']);
const gameState = inject<GameState>('gameState');
const sceneState = inject<SceneState>('sceneState');
const dynamicScene = inject<DynamicScene>('dynamicScene');
const mapElement = ref<HTMLDivElement | null>(null);
const pixieLayer = shallowRef<PixiLayer | null>(null);

type TileMode = 'static' | 'dynamic_separate' | 'dynamic_combined';
const TILE_MODE: TileMode = 'dynamic_combined' as TileMode; // Change this to switch between modes

onMounted(async () => {
  if (!mapElement.value) return;

  const { map } = await setupMapView(
    mapElement.value,
    TILE_MODE,
    props.layerVisibility
  );
  mapInstance.map = map;
  
  const { init } = useMapInteractions(mapInstance.map, gameState, sceneState, pixieLayer, emit);

  if (gameState && sceneState && dynamicScene) {
    const newPixieLayer = new PixiLayer(mapInstance.map, gameState, sceneState, dynamicScene);
    await newPixieLayer.init();
    pixieLayer.value = newPixieLayer;
    
    // Emit the pixieLayer reference to App.vue
    emit('map-event', { type: 'pixie-layer-ready', payload: { pixieLayer: newPixieLayer } });
  }

  // Initialize the interactions after everything is set up
  init();

  emit('map-event', { type: 'map-ready', payload: null });
});

onUnmounted(() => {
    if (pixieLayer.value) {
      pixieLayer.value.stop();
      pixieLayer.value.destroy();
      pixieLayer.value = null;
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
