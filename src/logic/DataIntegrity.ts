import { GameState } from './GameState';
import { mapInstance, DEG_PER_METER_LNG, DEG_PER_METER_LAT } from '../map_instance';
import { calculatePolygonCenter } from './Buildings';

export function verifyBuildings(gs: GameState, center: { lng: number, lat: number }) {
    if (!mapInstance.map) {
        console.warn(`[DataIntegrity] verifyBuildings: mapInstance is not available.`);
        return;
    }

    const searchRadiusKm = 1;
    const searchRadiusLng = searchRadiusKm * 1000 * DEG_PER_METER_LNG;
    const searchRadiusLat = searchRadiusKm * 1000 * DEG_PER_METER_LAT;
    const boundaryThreshold = 0.9; // 900m

    const searchBox = {
        minX: center.lng - searchRadiusLng,
        minY: center.lat - searchRadiusLat,
        maxX: center.lng + searchRadiusLng,
        maxY: center.lat + searchRadiusLat,
    };

    // 1. Query spatial index and verify against visual map
    const logicalResults = gs.buildingSpatialIndex.search(searchBox);
    const logicalBuildingIds = new Set(logicalResults.map(b => b.feature.id));

    // Get all visual features in the current view.
    // querySourceFeatures will return features from tiles in the current viewport.
    const allVisualFeaturesInView = mapInstance.map.querySourceFeatures('almaty-tiles', {
        sourceLayer: 'building'
    });
    
    const visualIdsInView = new Set(allVisualFeaturesInView.map(f => f.id));

    console.log(`[DataIntegrity] Verifying data. Logical buildings in area: ${logicalResults.length}. Visual buildings in view: ${allVisualFeaturesInView.length}`);

    // Check 1: Logical buildings that are not on the visual map
    for (const logical of logicalResults) {
        if (!visualIdsInView.has(logical.feature.id)) {
            const distInMeters = Math.sqrt(
                Math.pow((logical.x - center.lng) / DEG_PER_METER_LNG, 2) +
                Math.pow((logical.y - center.lat) / DEG_PER_METER_LAT, 2)
            );
            if (distInMeters < searchRadiusKm * 1000 * boundaryThreshold) {
                console.warn(`[DataIntegrity] Mismatch: Logical building ${logical.feature.id} not found in visual map.`);
            }
        }
    }

    // Check 2: Visual buildings that are not in the logical index
    for (const visualFeature of allVisualFeaturesInView) {
        if (!visualFeature.id) continue;
        if (!logicalBuildingIds.has(visualFeature.id)) {
            const featureCenter = calculatePolygonCenter((visualFeature.geometry as any).coordinates);
            const distInMeters = Math.sqrt(
                Math.pow((featureCenter.x - center.lng) / DEG_PER_METER_LNG, 2) +
                Math.pow((featureCenter.y - center.lat) / DEG_PER_METER_LAT, 2)
            );

            if (distInMeters < searchRadiusKm * 1000 * boundaryThreshold) {
                console.warn(`[DataIntegrity] Mismatch: Visual building ${visualFeature.id} not found in logical spatial index.`);
            }
        }
    }
} 