import { loadGeoJsonData } from '../GeoJsonLoader';
import GeoJSON from 'ol/format/GeoJSON';
import Feature from 'ol/Feature';

// Feature flag to control which building data format to use for OpenLayers map
const USE_S6_BUILDINGS = true; // Set to false to use old buildings.geojson

const geoJsonData: Record<string, any> = {
    buildings: null,
    roads: null,
};

const rawFeaturesById: {
    buildings: Record<string, any>,
    roads: Record<string, any>
} = {
    buildings: {},
    roads: {}
};

const olFeaturesById: {
    buildings: Record<string, Feature>,
    roads: Record<string, Feature>
} = {
    buildings: {},
    roads: {}
};

let loadingPromise: Promise<void> | null = null;

async function loadAndProcessData() {    
    const [buildings, roads] = await Promise.all([
        USE_S6_BUILDINGS ? loadS6Buildings() : loadGeoJsonData('buildings'),
        loadGeoJsonData('roads')
    ]);

    geoJsonData.buildings = buildings;
    geoJsonData.roads = roads;

    for (const feature of buildings.features) {
        if (feature.id) {
            rawFeaturesById.buildings[feature.id] = feature;
        }
    }

    for (const feature of roads.features) {
        if (feature.id) {
            rawFeaturesById.roads[feature.id] = feature;
        }
    }
    
    const buildingSource = USE_S6_BUILDINGS ? 'S6 simplified' : 'original';
    // console.log(`[GeoJsonStore] Loaded ${Object.keys(rawFeaturesById.buildings).length} buildings (${buildingSource}) and ${Object.keys(rawFeaturesById.roads).length} roads.`);
}

/**
 * Load S6 simplified buildings from buildings_simplified.geojson
 */
async function loadS6Buildings(): Promise<any> {
    const response = await fetch('/data/buildings_simplified.geojson');
    const geojsonData = await response.json();

    for (const feature of geojsonData.features) {
        if (feature.id && !feature.properties.id) {
            feature.properties.id = String(feature.id);
        }
    }

    return geojsonData;
}

/**
 * Returns the raw, unprocessed GeoJSON object for the given dataset.
 * Throws an error if the data has not been loaded yet.
 * @param name The name of the dataset ('buildings' or 'roads').
 */
export function getRawGeoJson(name: 'buildings' | 'roads'): any {
    if (!geoJsonData[name]) {
        throw new Error(`GeoJSON data for "${name}" has not been loaded yet. Call ensureDataLoaded() first.`);
    }
    return geoJsonData[name];
}

export function getRawFeatureById(type: 'buildings' | 'roads', id: string): any | undefined {
    return rawFeaturesById[type][id];
}

export function getBuildingById(id: string): any | undefined {
    return rawFeaturesById['buildings'][id];
}

export function getOlFeatureById(type: 'buildings' | 'roads', id: string): Feature | undefined {
    if (olFeaturesById[type][id]) {
        return olFeaturesById[type][id];
    }

    const rawFeature = getRawFeatureById(type, id);
    if (!rawFeature) {
        return undefined;
    }

    // This is where the feature is converted to an OpenLayers feature.
    // It's created once and then cached.
    const olFeature = new GeoJSON().readFeature(rawFeature);
    olFeaturesById[type][id] = olFeature;

    return olFeature;
}

/**
 * Ensures that all GeoJSON data has been loaded and processed into features.
 * Can be called multiple times; the loading process will only run once.
 * @returns A promise that resolves when the data is ready.
 */
export function ensureDataLoaded(): Promise<void> {
    if (!loadingPromise) {
        loadingPromise = loadAndProcessData();
    }
    return loadingPromise;
} 