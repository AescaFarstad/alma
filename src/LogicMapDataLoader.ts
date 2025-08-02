import { GameState } from './logic/GameState';
import { getRawGeoJson } from './logic/GeoJsonStore';
import { loadS7Buildings, type S7Building } from './S7BuildingsLoader';
import { loadBlobs, type Blob } from './BlobsLoader';
import { loadNavmeshData } from './logic/navmesh/NavmeshLoader';

// Feature flag to control which building data format to use
const USE_S7_BUILDINGS = false; // Set to false to use old GeoJSON format

export async function loadBuildingData(gameState: GameState): Promise<any> {
    if (USE_S7_BUILDINGS) {
        return await loadBuildingDataS7(gameState);
    } else {
        return await loadBuildingDataOld(gameState);
    }
}

/**
 * Load building data from S7 format (buildings_s7.txt)
 */
async function loadBuildingDataS7(gameState: GameState): Promise<any> {
    const s7Buildings = await loadS7Buildings();
    
    // console.log(`[LogicMapDataLoader] Loaded ${s7Buildings.length} building features from S7 format.`);

    // Convert S7 buildings to game state format
    for (const building of s7Buildings) {
        // Convert flat coordinate array to GeoJSON-style coordinate array
        // S7: [x1, y1, x2, y2, ...] -> GeoJSON: [[x1, y1], [x2, y2], ...]
        const coordinatePairs: number[][] = [];
        for (let i = 0; i < building.coordinates.length; i += 2) {
            coordinatePairs.push([building.coordinates[i], building.coordinates[i + 1]]);
        }
        
        // Close the polygon if not already closed (add first point at the end)
        if (coordinatePairs.length > 0) {
            const firstPoint = coordinatePairs[0];
            const lastPoint = coordinatePairs[coordinatePairs.length - 1];
            if (firstPoint[0] !== lastPoint[0] || firstPoint[1] !== lastPoint[1]) {
                coordinatePairs.push([firstPoint[0], firstPoint[1]]);
            }
        }

        // Store in game state format
        building.properties.id = building.id;
        gameState.buildingsById[building.id] = {
            id: building.id,
            stats: building.properties,
            geometry: [coordinatePairs], // Polygon format: [exteriorRing]
        };
    }
    
    // Generate bounding boxes for spatial index
    const buildingBBoxes = s7Buildings.flatMap((building: S7Building) => {
        if (!building.coordinates || building.coordinates.length < 6) {
            return [];
        }

        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

        // Process flat coordinate array
        for (let i = 0; i < building.coordinates.length; i += 2) {
            const x = building.coordinates[i];
            const y = building.coordinates[i + 1];
            
            if (x < minX) minX = x;
            if (y < minY) minY = y;
            if (x > maxX) maxX = x;
            if (y > maxY) maxY = y;
        }

        if (minX === Infinity) {
            return [];
        }

        return [{ minX, minY, maxX, maxY, id: building.id, feature: building }];
    });

    gameState.buildingSpatialIndex.load(buildingBBoxes);

    // console.log(`[LogicMapDataLoader] Loaded ${buildingBBoxes.length} buildings into spatial index (S7 format)`);
    
    // Return a GeoJSON-like structure for compatibility
    return {
        type: 'FeatureCollection',
        features: s7Buildings.map(building => ({
            type: 'Feature',
            id: building.id,
            properties: building.properties,
            geometry: {
                type: 'Polygon',
                coordinates: [building.coordinates.reduce((pairs: number[][], _, i) => {
                    if (i % 2 === 0) {
                        pairs.push([building.coordinates[i], building.coordinates[i + 1]]);
                    }
                    return pairs;
                }, [])]
            }
        }))
    };
}

/**
 * Load building data from old GeoJSON format (buildings.geojson) - FALLBACK
 */
async function loadBuildingDataOld(gameState: GameState): Promise<any> {
    const geojsonData = getRawGeoJson('buildings');
    
    // The data is already loaded, so we can just use it.
    // console.log(`[LogicMapDataLoader] Loaded ${geojsonData.features.length} building features (old format).`);

    for (const feature of geojsonData.features) {
        const id = String(feature.id);
        feature.properties.id = id;
        gameState.buildingsById[id] = {
            id: id,
            stats: feature.properties,
            geometry: feature.geometry.coordinates,
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

        return [{ minX, minY, maxX, maxY, id: String(feature.id), feature }];
    });

    gameState.buildingSpatialIndex.load(buildingBBoxes);

    return geojsonData;
} 

export async function loadAndProcessNavmesh(gameState: GameState): Promise<void> {
    await loadNavmeshData(gameState.navmesh);
}

export async function loadBlobData(gameState: GameState): Promise<void> {
    const blobs = await loadBlobs();
    
    for (const blob of blobs) {
        const coordinatePairs: number[][] = [];
        for (let i = 0; i < blob.coordinates.length; i += 2) {
            coordinatePairs.push([blob.coordinates[i], blob.coordinates[i + 1]]);
        }

        gameState.blobsById[blob.id] = {
            id: blob.id,
            buildingIds: blob.buildingIds,
            geometry: [coordinatePairs],
        };
    }
    
    const blobBBoxes = blobs.flatMap((blob: Blob) => {
        if (!blob.coordinates || blob.coordinates.length < 6) {
            return [];
        }

        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

        for (let i = 0; i < blob.coordinates.length; i += 2) {
            const x = blob.coordinates[i];
            const y = blob.coordinates[i + 1];
            
            if (x < minX) minX = x;
            if (y < minY) minY = y;
            if (x > maxX) maxX = x;
            if (y > maxY) maxY = y;
        }

        if (minX === Infinity) {
            return [];
        }

        return [{ minX, minY, maxX, maxY, id: blob.id, feature: blob }];
    });

    gameState.blobSpatialIndex.load(blobBBoxes);
} 