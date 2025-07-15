<template>
  <div id="map" ref="mapElement"></div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, defineEmits, inject, ref } from 'vue';
import 'ol/ol.css';
import { Map as OlMap } from 'ol';
import View from 'ol/View';
import VectorSource from 'ol/source/Vector';
import GeoJSON from 'ol/format/GeoJSON';
import { Projection } from 'ol/proj';
import { mapInstance } from '../../map_instance';
import { GameState } from '../../logic/GameState';
import { initNewGame } from '../../logic/StartGame';
import { loadGeoJsonData } from '../../GeoJsonLoader';
import { Style, Fill, Stroke } from 'ol/style';
import VectorTileLayer from 'ol/layer/VectorTile';
import VectorTileSource from 'ol/source/VectorTile';
import { createXYZ } from 'ol/tilegrid';
import TileGrid from 'ol/tilegrid/TileGrid';
import VectorTile from 'ol/VectorTile';
import MVT from 'ol/format/MVT';

const emit = defineEmits(['map-event']);
const gameState = inject<GameState>('gameState');
const mapElement = ref<HTMLDivElement | null>(null);
const USE_STATIC_TILES = false; // Set this to false to use the dynamic approach

const buildingStyle = new Style({
    fill: new Fill({
        color: '#e3e3e3'
    }),
    stroke: new Stroke({
        color: 'rgba(0, 0, 0, 0.1)',
        width: 1
    })
});

function getBuildingStyle(_feature: any, resolution: number) {
    // console.log(`getBuildingStyle called with resolution: ${resolution}`);
    if (resolution > 20) {
        return;
    }
    return buildingStyle;
}

const roadStyle = new Style({
    stroke: new Stroke({
        color: '#aaaaaa',
        width: 2
    })
});

function getRoadStyle(_feature: any, resolution: number) {
    // console.log(`getRoadStyle called with resolution: ${resolution}`);
    if (resolution > 40) {
        return;
    }
    return roadStyle;
}

onMounted(() => {
  const cartesianProjection = new Projection({
    code: 'xkcd-map',
    units: 'm',
    extent: [-10000, -10000, 10000, 10000],
  });

  let view;
  let customTileGrid: TileGrid | undefined;

  if (USE_STATIC_TILES) {
    // Define a single source of truth for resolutions
    const resolutions = [
      // zoom 9: 1x1 tile (20km x 20km per tile)
      20000 / 512,  // ~39.06 meters/pixel
      // zoom 10: 2x2 tiles (10km x 10km per tile)
      10000 / 512,  // ~19.53 meters/pixel
      // zoom 11: 4x4 tiles (5km x 5km per tile)
      5000 / 512,   // ~9.77 meters/pixel
      // zoom 12: 8x8 tiles (2.5km x 2.5km per tile)
      2500 / 512,   // ~4.88 meters/pixel
      // zoom 13: 16x16 tiles (1.25km x 1.25km per tile)
      1250 / 512,   // ~2.44 meters/pixel
      // zoom 14: 32x32 tiles (625m x 625m per tile)
      625 / 512,    // ~1.22 meters/pixel
      // zoom 15: 64x64 tiles (312.5m x 312.5m per tile)
      312.5 / 512   // ~0.61 meters/pixel
    ];

    // Custom tile grid for our 20km x 20km world
    customTileGrid = new TileGrid({
        extent: [-10000, -10000, 10000, 10000],
        resolutions: resolutions,
        tileSize: 512
    });
    
    view = new View({
      projection: cartesianProjection,
      center: [0, 0],
      zoom: 2, // Corresponds to resolutions[2] -> zoom 11
      resolutions: resolutions,
      constrainResolution: true,
    });

  } else {
    // ORIGINAL BEHAVIOR: Standard view for dynamic tiling
    view = new View({
      projection: cartesianProjection,
      center: [0, 0],
      zoom: 12,
      minZoom: 0,
      maxZoom: 18,
      constrainResolution: true,
    });
  }
  
  mapInstance.map = new OlMap({
    target: mapElement.value!,
    layers: [],
    view: view,
  });

  if (USE_STATIC_TILES) {
    console.log('Map created with STATIC tiles. View details:', {
        zoom: mapInstance.map.getView().getZoom(),
        resolution: mapInstance.map.getView().getResolution(),
        resolutions: mapInstance.map.getView().getResolutions(),
    });
  }

  if (gameState) {
    initNewGame(gameState);
  }

  if (USE_STATIC_TILES) {
    const buildingsSource = new VectorTileSource({
        format: new MVT({ layers: ['buildings'] }),
        projection: cartesianProjection,
        tileGrid: customTileGrid,
        tileUrlFunction: (tileCoord) => {
            const z = tileCoord[0] + 9; // Map index to semantic zoom
            const x = tileCoord[1];
            const y = tileCoord[2];
            return `/tiles/buildings/${z}/${x}/${y}.pbf`;
        },
    });

    const roadsSource = new VectorTileSource({
        format: new MVT({ layers: ['roads'] }),
        projection: cartesianProjection,
        tileGrid: customTileGrid,
        tileUrlFunction: (tileCoord) => {
            const z = tileCoord[0] + 9; // Map index to semantic zoom
            const x = tileCoord[1];
            const y = tileCoord[2];
            return `/tiles/roads/${z}/${x}/${y}.pbf`;
        },
    });

    // Add error handling to debug tile loading issues
    buildingsSource.on('tileloaderror', function(event) {
        if (event.tile && event.tile.getTileCoord()) {
            console.error('Building tile load error:', event.tile.getTileCoord(), event.target.getUrls()[0]);
        } else {
            console.error('Building tile load error on an unknown tile.');
        }
    });

    buildingsSource.on('tileloadend', function(event) {
        const features = (event.tile as VectorTile).getFeatures();
        if (event.tile && event.tile.getTileCoord()) {
            console.log(`Building tile loaded successfully: ${event.tile.getTileCoord()}, Features found: ${features.length}`);
        }
    });

    roadsSource.on('tileloaderror', function(event) {
        if (event.tile && event.tile.getTileCoord()) {
            console.error('Road tile load error:', event.tile.getTileCoord(), event.target.getUrls()[0]);
        } else {
            console.error('Road tile load error on an unknown tile.');
        }
    });

    roadsSource.on('tileloadend', function(event) {
        const features = (event.tile as VectorTile).getFeatures();
        if (event.tile && event.tile.getTileCoord()) {
            console.log(`Road tile loaded successfully: ${event.tile.getTileCoord()}, Features found: ${features.length}`);
        }
    });

    const buildingsLayer = new VectorTileLayer({
        source: buildingsSource,
        style: getBuildingStyle,
        declutter: false,
        renderBuffer: 256,
    });

    const roadsLayer = new VectorTileLayer({
        source: roadsSource,
        style: getRoadStyle,
        declutter: false,
        renderBuffer: 256,
    });

    mapInstance.map!.addLayer(buildingsLayer);
    mapInstance.map!.addLayer(roadsLayer);
  } else {
    Promise.all([
        loadGeoJsonData('buildings'),
        loadGeoJsonData('roads')
    ]).then(([buildings, roads]) => {
      const geojsonFormat = new GeoJSON({
        featureProjection: cartesianProjection
      });
      
      const buildingsSource = new VectorSource({
          features: geojsonFormat.readFeatures(buildings)
      });

      const roadsSource = new VectorSource({
          features: geojsonFormat.readFeatures(roads)
      });

      // ORIGINAL BEHAVIOR: Standard tile grid for dynamic tiling
      const tileGrid = createXYZ({
          maxZoom: 18,
      });

      const buildingsTileSource = new VectorTileSource({
          format: new GeoJSON() as any,
          projection: cartesianProjection,
          tileGrid: tileGrid,
          cacheSize: 4096,
          url: 'local://buildings/{z}/{x}/{y}',
          tileLoadFunction: (tile, _url) => {
              const tileCoord = tile.getTileCoord();
              const tileExtent = tileGrid.getTileCoordExtent(tileCoord);
              const features = buildingsSource.getFeaturesInExtent(tileExtent);
              (tile as VectorTile).setFeatures(features);
          }
      });

      const roadsTileSource = new VectorTileSource({
          format: new GeoJSON() as any,
          projection: cartesianProjection,
          tileGrid: tileGrid,
          cacheSize: 4096,
          url: 'local://roads/{z}/{x}/{y}',
          tileLoadFunction: (tile, _url) => {
              const tileCoord = tile.getTileCoord();
              const tileExtent = tileGrid.getTileCoordExtent(tileCoord);
              const features = roadsSource.getFeaturesInExtent(tileExtent);
              (tile as VectorTile).setFeatures(features);
          }
      });

      const buildingsLayer = new VectorTileLayer({
          source: buildingsTileSource,
          style: getBuildingStyle,
          declutter: false,
          renderBuffer: 256,
      });

      const roadsLayer = new VectorTileLayer({
          source: roadsTileSource,
          style: getRoadStyle,
          declutter: false,
          renderBuffer: 256,
      });

      mapInstance.map!.addLayer(buildingsLayer);
      mapInstance.map!.addLayer(roadsLayer);

    }).catch(error => {
        console.error('Failed to load GeoJSON data:', error);
    });
  }

  emit('map-event', { type: 'map-ready', payload: null });
  
  mapInstance.map.on('pointermove', (e) => {
    if (e.dragging) return;
    emit('map-event', { type: 'mouse-moved', payload: { lng: e.coordinate[0], lat: e.coordinate[1] } });
    // const hit = mapInstance.map?.hasFeatureAtPixel(e.pixel);
    // mapInstance.map!.getTargetElement().style.cursor = hit ? 'pointer' : '';
  });

  mapInstance.map.getView().on('change', () => {
      if (!mapInstance.map) return;
      const view = mapInstance.map.getView();
      const center = view.getCenter();
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
    if (mapInstance.map) {
        mapInstance.map.setTarget(undefined);
        mapInstance.map = null;
    }
});

</script>

<style>
#map {
  width: 100%;
  height: 100%;
  background-color: #f8f4f0;
}
</style> 