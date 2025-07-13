<template>
  <div id="map"></div>
</template>

<script setup lang="ts">
import { onMounted, defineEmits, defineExpose, inject } from 'vue';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { mapOptions, mapStyle } from './map_config';
import { mapInstance } from '../../map_instance';
import { BuildingOwnershipChange, GameState } from '../../logic/GameState';
import { initNewGame } from '../../logic/StartGame';

const emit = defineEmits(['map-event']);
const gameState = inject<GameState>('gameState');

let originalBuildingFillColor: any;

function setBuildingColors(changes: BuildingOwnershipChange[]) {
  if (!mapInstance.map) return;

  for (const change of changes) {
    mapInstance.map.setFeatureState(
      { source: 'almaty-tiles', sourceLayer: 'building', id: change.mapId },
      { team: change.team }
    );
  }
}

const toggleLayer = (layerId: 'footways' | 'steps', visible: boolean) => {
  if (!mapInstance.map) return;
  mapInstance.map.setLayoutProperty(layerId, 'visibility', visible ? 'visible' : 'none');
};

const toggleFill = (layerId: 'buildings', visible: boolean) => {
    if (!mapInstance.map) return;
    const newFillColor = visible ? originalBuildingFillColor : 'rgba(0,0,0,0)';
    mapInstance.map.setPaintProperty(layerId, 'fill-color', newFillColor);
};

function showCoordinates(coords: { x: number, y: number }) {
  if (!mapInstance.map) return;
  
  const sourceId = 'coord-highlight';
  let source = mapInstance.map.getSource(sourceId) as maplibregl.GeoJSONSource;
  
  if (!source) {
    mapInstance.map.addSource(sourceId, {
      type: 'geojson',
      data: {
        type: 'FeatureCollection',
        features: []
      }
    });
    mapInstance.map.addLayer({
      id: 'coord-highlight-layer',
      type: 'circle',
      source: sourceId,
      paint: {
        'circle-radius': 10,
        'circle-color': '#ff0000',
        'circle-stroke-width': 2,
        'circle-stroke-color': '#ffffff'
      }
    });
    source = mapInstance.map.getSource(sourceId) as maplibregl.GeoJSONSource;
  }
  
  const feature = {
    type: 'Feature' as const,
    geometry: {
      type: 'Point' as const,
      coordinates: [coords.x, coords.y]
    },
    properties: {}
  };
  
  source.setData({
    type: 'FeatureCollection',
    features: [feature]
  });
  
  mapInstance.map.flyTo({ center: [coords.x, coords.y], zoom: 17 });
}

defineExpose({
  toggleLayer,
  toggleFill,
  setBuildingColors,
  showCoordinates,
});

onMounted(() => {
  const buildingsLayer = mapStyle.layers.find(l => l.id === 'buildings') as any;
  if (buildingsLayer) {
    originalBuildingFillColor = buildingsLayer.paint['fill-color'];
  }

  mapInstance.map = new maplibregl.Map(mapOptions);

  mapInstance.map.on('load', () => {
    if (!mapInstance.map) return;

    if (gameState) {
      initNewGame(gameState);
    }

    const bounds = mapInstance.map.getBounds();
    emit('map-event', { type: 'bounds-updated', payload: bounds });
    const center = mapInstance.map.getCenter();
    emit('map-event', { type: 'center-updated', payload: center });
    emit('map-event', { type: 'map-ready', payload: null });

    mapInstance.map.addSource('highlight', {
      type: 'geojson',
      data: {
        type: 'FeatureCollection',
        features: []
      }
    });

    mapInstance.map.addLayer({
      id: 'feature-highlight',
      type: 'line',
      source: 'highlight',
      paint: {
        'line-color': 'blue',
        'line-width': 2
      }
    });

    mapInstance.map.addLayer({
        id: 'highlight-block',
        type: 'fill',
        source: 'highlight',
        paint: {
            'fill-color': 'blue',
            'fill-opacity': 0.3
        }
    });
  });

  mapInstance.map.on('click', (e) => {
    if (!mapInstance.map || !mapInstance.map.isStyleLoaded()) return;
    const highlightSource = mapInstance.map.getSource('highlight') as maplibregl.GeoJSONSource;
    if (highlightSource) {
      highlightSource.setData({ type: 'FeatureCollection', features: [] });
    }

    const features = mapInstance.map.queryRenderedFeatures(e.point, { layers: ['buildings', 'roads', 'footways', 'steps'] });
    
    console.log(`[MapClick] Found ${features.length} features under cursor:`);
    features.forEach((f, index) => {
        console.log(`  [${index}] Layer: ${f.layer.id}, ID: ${f.id}, Properties:`, f.properties);
    });

    if (features.length > 0) {
      const feature = features[0];
      highlightSource.setData({ type: 'FeatureCollection', features: [feature] });
      emit('map-event', { type: 'feature-selected', payload: feature.properties });

      if (feature.layer.id === 'buildings' && feature.id) {
        emit('map-event', { 
          type: 'command', 
          payload: { name: 'CmdQueryBuilding', mapId: feature.id } 
        });
      }

    } else {
      emit('map-event', { type: 'feature-selected', payload: null });
    }
  });

  mapInstance.map.on('mousemove', (e) => {
    if (!mapInstance.map || !mapInstance.map.isStyleLoaded()) return;
    emit('map-event', { type: 'mouse-moved', payload: e.lngLat });
    const features = mapInstance.map.queryRenderedFeatures(e.point, { layers: ['buildings', 'roads'] });
    mapInstance.map.getCanvas().style.cursor = features.length > 0 ? 'pointer' : '';
  });

  mapInstance.map.on('move', () => {
    if (!mapInstance.map) return;
    const bounds = mapInstance.map.getBounds();
    emit('map-event', { type: 'bounds-updated', payload: bounds });
    const center = mapInstance.map.getCenter();
    emit('map-event', { type: 'center-updated', payload: center });
  });
});
</script>

<style>
#map {
  width: 100%;
  height: 100%;
}
</style> 