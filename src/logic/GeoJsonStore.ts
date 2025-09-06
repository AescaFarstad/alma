const geoJsonData: Record<string, any> = {
  buildings: null,
  roads: null,
};

let loadingPromise: Promise<void> | null = null;

async function loadAndProcessData() {  
  const [buildings, roads] = await Promise.all([
    loadGeoJsonData('buildings'),
    loadGeoJsonData('roads')
  ]);
  
  geoJsonData.buildings = buildings;
  geoJsonData.roads = roads;
}

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

export function ensureDataLoaded(): Promise<void> {
  if (!loadingPromise) {
    loadingPromise = loadAndProcessData();
  }
  return loadingPromise;
}

export function getRawGeoJson(name: 'buildings' | 'roads'): any {
  if (!geoJsonData[name]) {
    throw new Error(`GeoJSON data for "${name}" has not been loaded yet. Call ensureDataLoaded() first.`);
  }
  return geoJsonData[name];
}

// Dev/debug helper: load an arbitrary GeoJSON file from public folder
// and ensure features have an `id` on properties for consistency.
export async function loadGeoJsonAtPath(path: string): Promise<any> {
  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(`Failed to load GeoJSON at ${path}: ${response.status} ${response.statusText}`);
  }
  const geojsonData = await response.json();

  if (geojsonData && Array.isArray(geojsonData.features)) {
    for (const feature of geojsonData.features) {
      if (feature.id !== undefined && feature.id !== null && feature.properties && !feature.properties.id) {
        feature.properties.id = String(feature.id);
      }
    }
  }
  return geojsonData;
}
