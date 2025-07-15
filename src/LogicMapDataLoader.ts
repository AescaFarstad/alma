import { GameState } from './logic/GameState';
import { loadGeoJsonData } from './GeoJsonLoader';

export async function loadBuildingData(gameState: GameState): Promise<any> {
    const geojsonData = await loadGeoJsonData('buildings');
    
    console.log(`[LogicMapDataLoader] Loaded ${geojsonData.features.length} building features.`);

    for (const feature of geojsonData.features) {
        if (feature.id) {
            feature.properties.id = String(feature.id);
        }
    }
    
    const buildingBBoxes = geojsonData.features.flatMap((feature: any) => {
        if (!feature.geometry || !feature.geometry.coordinates) {
            return [];
        }

        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

        const processRing = (ring: number[][]) => {
            if (!ring || ring.length === 0) {
                return false;
            }
            for (const [lng, lat] of ring) {
                if (lng < minX) minX = lng;
                if (lat < minY) minY = lat;
                if (lng > maxX) maxX = lng;
                if (lat > maxY) maxY = lat;
            }
            return minX !== Infinity;
        };

        let ringsProcessed = 0;
        if (feature.geometry.type === 'Polygon') {
            if (processRing(feature.geometry.coordinates[0])) {
                ringsProcessed++;
            }
        } else if (feature.geometry.type === 'MultiPolygon') {
            for (const polygon of feature.geometry.coordinates) {
                if (processRing(polygon[0])) {
                    ringsProcessed++;
                }
            }
        } else if (feature.geometry.type === 'LineString') {
            if (processRing(feature.geometry.coordinates)) {
                ringsProcessed++;
            }
        } else {
            return [];
        }

        if (ringsProcessed === 0) {
            return [];
        }

        return [{ minX, minY, maxX, maxY, feature }];
    });

    gameState.buildingSpatialIndex.load(buildingBBoxes);

    return geojsonData;
} 