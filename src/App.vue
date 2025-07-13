<template>
  <div id="map-container">
    <Map ref="mapComponent" @map-event="handleMapEvent" />
    <Overlay
      :mouse-coordinates="mouseCoordinates"
      :map-bounds="mapBounds"
      :selected-feature-info="selectedFeatureInfo"
      @toggle-layer="handleToggleLayer"
      @toggle-fill="handleToggleFill"
    />
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import Map from './components/map/Map.vue';
import Overlay from './components/ui/Overlay.vue';

const mapComponent = ref<InstanceType<typeof Map> | null>(null);

const mouseCoordinates = ref({ lng: 0, lat: 0 });
const mapBounds = ref('');
const selectedFeatureInfo = ref<any>(null);

const handleMapEvent = (event: { type: string, payload: any }) => {
  if (event.type === 'bounds-updated') {
    const bounds = event.payload;
    mapBounds.value = `SW(${bounds.getSouthWest().lng.toFixed(4)}, ${bounds.getSouthWest().lat.toFixed(4)}), NE(${bounds.getNorthEast().lng.toFixed(4)}, ${bounds.getNorthEast().lat.toFixed(4)})`;
  } else if (event.type === 'feature-selected') {
    selectedFeatureInfo.value = event.payload;
  } else if (event.type === 'mouse-moved') {
    mouseCoordinates.value = event.payload;
  }
};

const handleToggleLayer = ({ layerId, visible }: { layerId: 'footways' | 'steps', visible: boolean }) => {
  mapComponent.value?.toggleLayer(layerId, visible);
};

const handleToggleFill = ({ layerId, visible }: { layerId: 'buildings', visible: boolean }) => {
  mapComponent.value?.toggleFill(layerId, visible);
};

</script>

<style>
#map-container {
  position: relative;
  width: 100vw;
  height: 100vh;
}
</style> 