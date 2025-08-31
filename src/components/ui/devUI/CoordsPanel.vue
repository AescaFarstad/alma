<template>
  <div class="coords">
    <div>{{ coords }}</div>
    <div>{{ formattedBounds }}</div>
    <div v-if="zoomLevel !== null">Zoom: {{ zoomLevel.toFixed(2) }}</div>
  </div>
</template>

<script setup lang="ts">
import { computed, defineProps, type PropType } from 'vue';

const props = defineProps({
  mouseCoordinates: { type: Object as PropType<{ lng: number; lat: number } | null>, default: null },
  mapBounds: { type: String, default: '' },
  zoomLevel: { type: Number as PropType<number | null>, default: null },
});

const coords = computed(() => {
  if (!props.mouseCoordinates) return '';
  return `${props.mouseCoordinates.lng.toFixed(1)}, ${props.mouseCoordinates.lat.toFixed(1)}`;
});

const formattedBounds = computed(() => {
  const bounds = props.mapBounds;
  if (!bounds) return '';
  const match = bounds.match(/\[(-?\d+\.?\d*), (-?\d+\.?\d*)\] - \[(-?\d+\.?\d*), (-?\d+\.?\d*)\]/);
  if (!match) return bounds;
  const [, lng1, lat1, lng2, lat2] = match;
  return `[${parseFloat(lng1).toFixed(0)},${parseFloat(lat1).toFixed(0)}]-[${parseFloat(lng2).toFixed(0)},${parseFloat(lat2).toFixed(0)}]`;
});
</script>

<style scoped>
.coords {
  background: rgba(33, 33, 33, 0.9);
  padding: 4px 6px;
  border-radius: 4px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  box-shadow: 0 2px 6px rgba(0,0,0,0.5);
  font-family: monospace;
  font-size: 11px;
  line-height: 1.2;
}
</style>

