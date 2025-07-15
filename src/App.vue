<template>
  <div id="map-container">
    <Map ref="mapComponent" @map-event="handleMapEvent" />
    <Overlay
      :mouse-coordinates="mouseCoordinates"
      :map-bounds="mapBounds"
      :selected-feature-info="selectedFeatureInfo"
      :map-center="mapCenter"
    />
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import Map from './components/map/Map.vue';
import Overlay from './components/ui/Overlay.vue';
import { globalInputQueue } from './logic/Model';
import type { CmdInput } from './logic/input/InputCommands';

const mapComponent = ref<InstanceType<typeof Map> | null>(null);
const mapReady = ref(false);
const mapCenter = ref<{ lng: number, lat: number } | null>(null);

const mouseCoordinates = ref({ lng: 0, lat: 0 });
const mapBounds = ref('');
const selectedFeatureInfo = ref<any>(null);

const handleMapEvent = (event: { type: string, payload: any }) => {
  if (event.type === 'bounds-updated') {
    const sw = event.payload._sw;
    const ne = event.payload._ne;
    mapBounds.value = `SW(${sw.lng.toFixed(4)}, ${sw.lat.toFixed(4)}), NE(${ne.lng.toFixed(4)}, ${ne.lat.toFixed(4)})`;
  } else if (event.type === 'feature-selected') {
    selectedFeatureInfo.value = event.payload;
  } else if (event.type === 'mouse-moved') {
    mouseCoordinates.value = event.payload;
  } else if (event.type === 'command') {
    globalInputQueue.push(event.payload as CmdInput);
  } else if (event.type === 'map-ready') {
    mapReady.value = true;
  } else if (event.type === 'center-updated') {
    mapCenter.value = event.payload;
  }
};
</script>

<style>
#map-container {
  position: relative;
  width: 100vw;
  height: 100vh;
}
</style> 