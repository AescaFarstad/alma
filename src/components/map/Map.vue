<template>
  <div id="map"></div>
</template>

<script setup lang="ts">
import { onMounted, defineEmits, defineExpose } from 'vue';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { mapOptions, mapStyle } from './map-config';

const emit = defineEmits(['map-event']);

let map: maplibregl.Map;
let originalBuildingFillColor: any;

const toggleLayer = (layerId: 'footways' | 'steps', visible: boolean) => {
  map.setLayoutProperty(layerId, 'visibility', visible ? 'visible' : 'none');
};

const toggleFill = (layerId: 'buildings', visible: boolean) => {
    const newFillColor = visible ? originalBuildingFillColor : 'rgba(0,0,0,0)';
    map.setPaintProperty(layerId, 'fill-color', newFillColor);
};

defineExpose({
  toggleLayer,
  toggleFill
});

onMounted(() => {
  const buildingsLayer = mapStyle.layers.find(l => l.id === 'buildings') as any;
  if (buildingsLayer) {
    originalBuildingFillColor = buildingsLayer.paint['fill-color'];
  }

  map = new maplibregl.Map(mapOptions);

  map.on('load', () => {
    const bounds = map.getBounds();
    emit('map-event', { type: 'bounds-updated', payload: bounds });

    map.addSource('highlight', {
      type: 'geojson',
      data: {
        type: 'FeatureCollection',
        features: []
      }
    });

    map.addLayer({
      id: 'feature-highlight',
      type: 'line',
      source: 'highlight',
      paint: {
        'line-color': 'blue',
        'line-width': 2
      }
    });

    map.addLayer({
        id: 'highlight-block',
        type: 'fill',
        source: 'highlight',
        paint: {
            'fill-color': 'blue',
            'fill-opacity': 0.3
        }
    });
  });

  map.on('click', (e) => {
    const highlightSource = map.getSource('highlight') as maplibregl.GeoJSONSource;
    if (highlightSource) {
      highlightSource.setData({ type: 'FeatureCollection', features: [] });
    }

    const features = map.queryRenderedFeatures(e.point, { layers: ['buildings', 'roads', 'footways', 'steps'] });
    if (features.length > 0) {
      highlightSource.setData({ type: 'FeatureCollection', features: [features[0]] });
      emit('map-event', { type: 'feature-selected', payload: features[0].properties });
    } else {
      emit('map-event', { type: 'feature-selected', payload: null });
    }
  });

  map.on('mousemove', (e) => {
    emit('map-event', { type: 'mouse-moved', payload: e.lngLat });
    const features = map.queryRenderedFeatures(e.point, { layers: ['buildings', 'roads'] });
    map.getCanvas().style.cursor = features.length > 0 ? 'pointer' : '';
  });

  map.on('move', () => {
    const bounds = map.getBounds();
    emit('map-event', { type: 'bounds-updated', payload: bounds });
  });
});
</script>

<style>
#map {
  width: 100%;
  height: 100%;
}
</style> 