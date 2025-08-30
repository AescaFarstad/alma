import Feature from 'ol/Feature';

// Feature flag to control which building data format to use for OpenLayers map
const USE_S6_BUILDINGS = false; // Set to false to use buildings.geojson

const geoJsonData: Record<string, any> = {
  buildings: null,
  roads: null,
};

let loadingPromise: Promise<void> | null = null;

async function loadAndProcessData() {  
  const [buildings, roads] = await Promise.all([
    USE_S6_BUILDINGS ? loadS6Buildings() : loadGeoJsonData('buildings'),
    loadGeoJsonData('roads')
  ]);
  
  geoJsonData.buildings = buildings;
  geoJsonData.roads = roads;
}

/**
 * Load GeoJSON data from the specified file
 */
async function loadGeoJsonData(name: 'buildings' | 'roads'): Promise<any> {
  const response = await fetch(`/data/map_render_${name}.geojson`);
  const geojsonData = await response.json();

  // Ensure all features have an id property
  for (const feature of geojsonData.features) {
    if (feature.id !== undefined && feature.id !== null && !feature.properties.id) {
      feature.properties.id = String(feature.id);
    }
  }

  return geojsonData;
}

/**
 * Load S6 simplified buildings from buildings_simplified.geojson
 */
async function loadS6Buildings(): Promise<any> {
  const response = await fetch('/data/buildings_simplified.geojson');
  const geojsonData = await response.json();

  for (const feature of geojsonData.features) {
    if (feature.id !== undefined && feature.id !== null && !feature.properties.id) {
      feature.properties.id = String(feature.id);
    }
  }

  return geojsonData;
}

/**
 * Ensures that GeoJSON data is loaded. If not already loaded, initiates loading.
 * Returns a promise that resolves when all data is loaded.
 */
export function ensureDataLoaded(): Promise<void> {
  if (!loadingPromise) {
    loadingPromise = loadAndProcessData();
  }
  return loadingPromise;
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