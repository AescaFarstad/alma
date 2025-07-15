export async function loadGeoJsonData(layer: 'buildings' | 'roads'): Promise<any> {
    const response = await fetch(`/data/${layer}.geojson`);
    const geojsonData = await response.json();

    for (const feature of geojsonData.features) {
        if (feature.id && !feature.properties.id) {
            feature.properties.id = String(feature.id);
        }
    }

    return geojsonData;
} 