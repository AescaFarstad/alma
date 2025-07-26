import { Projection } from 'ol/proj';
import VectorSource from 'ol/source/Vector';
import GeoJSON from 'ol/format/GeoJSON';
import { createXYZ } from 'ol/tilegrid';
import VectorTileLayer from 'ol/layer/VectorTile';
import VectorTileSource from 'ol/source/VectorTile';
import VectorTile from 'ol/VectorTile';
import { getBuildingStyle, getRoadStyle } from './styles';
import { mapInstance } from '../map_instance';
import Style from 'ol/style/Style';
import { getRawGeoJson } from '../logic/GeoJsonStore';

interface LayerVisibility {
  buildings: boolean;
  roads: boolean;
  footpaths: boolean;
}

/**
 * Creates a combined dynamic layer that merges all features (buildings and roads)
 * into a single dataset and delivers them to a single layer.
 * This is the "dynamic_combined" mode.
 */
export function createDynamicCombinedLayers(projection: Projection, layerVisibility: LayerVisibility) {
    const buildings = getRawGeoJson('buildings');
    const roads = getRawGeoJson('roads');

    const geojsonFormat = new GeoJSON({
        featureProjection: projection
    });
    
    const buildingFeatures = geojsonFormat.readFeatures(buildings);

    buildingFeatures.forEach(f => {
        f.set('type', 'building');
    });

    const roadFeatures = geojsonFormat.readFeatures(roads);
    roadFeatures.forEach(f => {
        f.set('type', 'road');
    });

    // Create a combined source with all features
    const combinedSource = new VectorSource({
        features: [
            ...buildingFeatures,
            ...roadFeatures
        ],
        useSpatialIndex: true
    });

    const tileGrid = createXYZ({
        maxZoom: 18,
    });

    // Create a single vector tile source for all features
    const combinedTileSource = new VectorTileSource({
        format: new GeoJSON() as any,
        projection: projection,
        tileGrid: tileGrid,
        cacheSize: 4096,
        url: 'local://combined/{z}/{x}/{y}',
        tileLoadFunction: (tile, _url) => {
            const tileCoord = tile.getTileCoord();
            const tileExtent = tileGrid.getTileCoordExtent(tileCoord);
            const features = combinedSource.getFeaturesInExtent(tileExtent);
            (tile as VectorTile).setFeatures(features);
        }
    });

    // Create a single layer that handles both buildings and roads
    const combinedLayer = new VectorTileLayer({
        source: combinedTileSource,
        style: (feature, resolution): Style | Style[] | void => {
            const featureType = feature.get('type');
            
            if (featureType === 'building') {
                if (!layerVisibility.buildings) return;
                return getBuildingStyle(feature, resolution);
            } else if (featureType === 'road') {
                const highway = feature.get('highway');
                if (highway === 'footway') {
                    if (!layerVisibility.footpaths) return;
                } else {
                    if (!layerVisibility.roads) return;
                }
                return getRoadStyle(feature, resolution);
            }
        },
        declutter: false,
        renderBuffer: 256,
        properties: { name: 'combined' },
    });

    mapInstance.map!.addLayer(combinedLayer);
}
