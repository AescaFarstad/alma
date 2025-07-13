import { GameState } from './logic/GameState';

export async function loadBuildingData(gameState: GameState) {
    const response = await fetch('/data/buildings.min.geojson');
    const geojsonData = await response.json();

    // --- Deduplication & ID Encoding ---
    // Osmium can create two features for one building (a way 'w' and an area 'a' from that way).
    // Planetiler uses the way's ID for the vector tile feature.
    // We must prefer the 'a' feature for its polygon geometry, but assign it the 'w' feature's ID.
    const uniqueFeaturesByKey = new Map<number, any>();

    for (const feature of geojsonData.features) {
        if (typeof feature.id !== 'string') continue;

        const idString = feature.id;
        const typePrefix = idString.charAt(0);
        const numericPart = idString.match(/-?\d+/);
        if (!numericPart) continue;

        const rawId = parseInt(numericPart[0], 10);
        
        // Osmium creates area IDs by doubling the way ID. We use the original way ID as the key.
        const uniqueKey = (typePrefix === 'a') ? Math.floor(rawId / 2) : rawId;

        // Always prefer the area ('a') feature over the way ('w') because it has the full polygon.
        if (typePrefix === 'a' || !uniqueFeaturesByKey.has(uniqueKey)) {
            uniqueFeaturesByKey.set(uniqueKey, feature);
        }
    }
    
    const finalFeatures = [];
    for (const [uniqueKey, feature] of uniqueFeaturesByKey.entries()) {
        const originalIdString: string = feature.id;
        const typePrefix = originalIdString.charAt(0);
        
        let suffix;
        if (typePrefix === 'a') {
            const osmiumAreaId = parseInt(originalIdString.match(/-?\d+/)![0], 10);
            // Even ID means the area came from a way, odd means it came from a relation.
            suffix = (osmiumAreaId % 2 === 0) ? 2 : 3;
        } else {
            switch (typePrefix) {
                case 'n': suffix = 1; break;
                case 'w': suffix = 2; break;
                case 'r': suffix = 3; break;
                default: continue; // Skip unknown types
            }
        }

        // The final ID is the unique key (the original way/node/relation ID) encoded Planetiler-style.
        feature.id = uniqueKey * 10 + suffix; 
        feature.properties.original_osm_id = originalIdString;
        finalFeatures.push(feature);
    }

    geojsonData.features = finalFeatures;
    console.log(`[LogicMapDataLoader] Processed to ${geojsonData.features.length} unique building features.`);
    
    // The rest of the logic remains the same, but operates on the corrected features.
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
} 