import { Projection } from 'ol/proj';
import VectorSource from 'ol/source/Vector';
import GeoJSON from 'ol/format/GeoJSON';
import { createXYZ } from 'ol/tilegrid';
import VectorTileLayer from 'ol/layer/VectorTile';
import VectorTileSource from 'ol/source/VectorTile';
import VectorTile from 'ol/VectorTile';
import { getRawGeoJson } from '../logic/GeoJsonStore';
import { getBuildingStyle, getRoadStyle } from './styles';
import { mapInstance } from '../map_instance';

/**
 * Creates separate dynamic layers for buildings and roads.
 * Each layer has its own VectorSource and VectorTileSource.
 * This is the "dynamic_separate" mode.
 */
export function createDynamicLayers(projection: Projection) {
    const buildings = getRawGeoJson('buildings');
    const roads = getRawGeoJson('roads');

    const geojsonFormat = new GeoJSON({
    featureProjection: projection
    });
    
    const buildingsSource = new VectorSource({
        features: geojsonFormat.readFeatures(buildings),
        useSpatialIndex: true
    });

    const roadsSource = new VectorSource({
        features: geojsonFormat.readFeatures(roads),
        useSpatialIndex: true
    });

    const tileGrid = createXYZ({
        maxZoom: 18,
    });

    const buildingsTileSource = new VectorTileSource({
        format: new GeoJSON() as any,
        projection: projection,
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
        projection: projection,
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
        properties: { name: 'buildings' },
    });

    const roadsLayer = new VectorTileLayer({
        source: roadsTileSource,
        style: getRoadStyle,
        declutter: false,
        renderBuffer: 256,
        properties: { name: 'roads' },
    });

    mapInstance.map!.addLayer(buildingsLayer);
    mapInstance.map!.addLayer(roadsLayer);
}
