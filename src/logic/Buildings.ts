/**
 * This module contains functions for managing buildings in the game state.
 * It handles creation, module installation, and unit assignment,
 * including the logic for applying and reversing resource effects from building modules.
 * 
 * DATA QUIRKS:
 * - Building geometries can be LineString, Polygon, or MultiPolygon
 * - LineString: coordinates = [[x1,y1], [x2,y2], ...] (direct array of coordinate pairs)
 * - Polygon: coordinates = [[[x1,y1], [x2,y2], ...]] (array containing outer ring)
 * - MultiPolygon: coordinates = [[[[x1,y1], [x2,y2], ...]], ...] (array of polygons)
 * - All coordinate calculations must handle these three different structures
 */
import { Building, BuildingSlot, BuildingSlotType, GameState, Player } from "./GameState";
import { Stats } from "./core/Stats";
import { ConnectionType, Parameter } from "./core/Stat";
import { BuildingModule } from "./lib/BuildingModuleLib";
import { mapInstance } from "../map_instance";
import { Point2 } from "./core/math";
import { C } from "./lib/C";
import { DEG_PER_METER_LAT, DEG_PER_METER_LNG } from "../map_instance";

let nextBuildingId = 0;

export function setBuildingOwner(gs: GameState, building: Building, team: number) {
    if (building.team === team) {
        return;
    }
    console.log(`[Buildings] Setting team for building mapId: ${building.mapId} (orig: ${building.originalMapId}) to ${team}. Coords: ${JSON.stringify(building.center)}. Pushing event.`);
    building.team = team;
    gs.eventLog.push({
        id: gs.nextEventId++,
        event: {
            type: 'building:ownership',
            payload: { mapId: building.mapId, team: team }
        }
    });
}

export function createBuilding(gs: GameState, buildingData: Partial<Building>): Building {
    const id = `building-${Object.keys(gs.buildingsById).length}`;
    const building: Building = {
        id,
        mapId: 0,
        team: 0,
        center: { x: 0, y: 0 },
        boundingRadius: 0,
        floors: 1,
        floorSize: 1,
        slots: [],
        outputs: [],
        disabledUntil: 0,
        ...buildingData,
    };
    gs.buildingsById[id] = building;
    if (building.mapId) {
        gs.buildingsByMapId[building.mapId] = building;
    }
    return building;
}

export function installModule(
    gameState: GameState,
    playerId: string,
    buildingId: string,
    slotIndex: number,
    module: BuildingModule
): void {
    const player = gameState.players[playerId];
    const building = gameState.buildingsById[buildingId];
    const slot = building.slots[slotIndex];

    for (const cost of module.cost) {
        Stats.modifyStat(player.resources[cost.resource].current, -cost.amount, gameState.connections);
    }

    slot.content = module.id;

    if (module.operatorless) {
        applyResourceEffects(gameState, player, building, module, 1);
    }
}

export function unassignUnitFromBuilding(
    gameState: GameState,
    unitId: string,
    buildingId: string,
    slotIndex: number
): void {
    const building = gameState.buildingsById[buildingId];
    if (!building) return;

    const slot = building.slots[slotIndex];
    if (slot.occupant !== unitId) return;

    const module = slot.content ? gameState.lib.buildingModules.items.get(slot.content) : null;
    const player = gameState.players[Object.keys(gameState.players).find(p => gameState.players[p].team === building.team)!];

    if (module && !module.operatorless && player) {
        applyResourceEffects(gameState, player, building, module, -1);
    }
    slot.occupant = '';
    
    const unit = gameState.unitsById[unitId];
    if (unit) {
        unit.profession = 'unemployed';
    }
}

export function assignUnitToBuilding(
    gameState: GameState,
    playerId: string,
    unitId: string,
    buildingId: string,
    slotIndex: number
): void {
    const player = gameState.players[playerId];
    const unit = gameState.unitsById[unitId];
    const building = gameState.buildingsById[buildingId];
    const slot = building.slots[slotIndex];
    const module = gameState.lib.buildingModules.items.get(slot.content)!;

    // --- Unassign from previous job ---
    const oldSlotInfo = findUnitSlot(gameState, unitId);
    if (oldSlotInfo) {
        unassignUnitFromBuilding(gameState, unitId, oldSlotInfo.building.id, oldSlotInfo.slotIndex);
    }

    // Assign to new job
    slot.occupant = unit.id;
    unit.profession = module.profession;

    // Apply resource effects for modules that require an operator
    if (!module.operatorless && building.disabledUntil === 0) {
        applyResourceEffects(gameState, player, building, module, 1);
    }
}

export function findUnitSlot(gameState: GameState, unitId: string): { building: Building, slot: BuildingSlot, slotIndex: number } | null {
    for (const building of Object.values(gameState.buildingsById)) {
        const slotIndex = building.slots.findIndex(s => s.occupant === unitId);
        if (slotIndex !== -1) {
            return { building, slot: building.slots[slotIndex], slotIndex };
        }
    }
    return null;
}

export function setBuildingDisabled(gameState: GameState, player: Player, building: Building, isDisabled: boolean, disabledUntil: number) {
    building.disabledUntil = disabledUntil;
    const modifier = isDisabled ? -1 : 1;

    for (const slot of building.slots) {
        if (!slot.content) continue;
        const module = gameState.lib.buildingModules.items.get(slot.content)!;
        
        const isManned = slot.occupant !== '';
        if (isManned && !module.operatorless) {
            applyResourceEffects(gameState, player, building, module, modifier);
        }
        
        if (module.operatorless) {
            applyResourceEffects(gameState, player, building, module, modifier);
        }
    }
}

export function getBuildingResourceConsumption(building: Building, resource: string): number {
    let consumption = 0;
    for (const output of building.outputs) {
        if (output.resource === resource && !output.isStorage && output.income.value < 0) {
            consumption += Math.abs(output.income.value);
        }
    }
    return consumption;
}

// --- Private Helper Functions ---

/**
 * Finds or creates a GameStat on a building for a specific resource, and modifies it.
 */
function updateBuildingResourceStat(
    gameState: GameState,
    player: Player,
    building: Building,
    resource: string,
    isStorage: boolean,
    amount: number
) {
    let gameStat = building.outputs.find(o => o.resource === resource && o.isStorage === isStorage);

    if (!gameStat) {
        // Stat does not exist on this building yet, so create it.
        const statName = `${building.id}.${resource}${isStorage ? '.max' : ''}`;
        const newStat = Stats.createStat(statName, 0, gameState.connections);
        
        gameStat = { resource, income: newStat, isStorage };
        building.outputs.push(gameStat);

        // Connect the new building stat to the player's global stat.
        const playerStatName = resource === C.HOUSING ? `${player.name}.${C.HOUSING}.max` : (isStorage ? `${player.name}.${resource}.max` : `${player.name}.${resource}.income`);
        const playerStat = gameState.connections.connectablesByName.get(playerStatName);
        if (playerStat) {
            Stats.connectStat(newStat, playerStat as Parameter, ConnectionType.ADD, gameState.connections);
        }
    }

    Stats.modifyStat(gameStat.income, amount, gameState.connections);
}

export function applyResourceEffects(
    gameState: GameState,
    player: Player,
    building: Building,
    module: BuildingModule,
    modifier: 1 | -1
) {
    for (const item of module.produces) {
        updateBuildingResourceStat(gameState, player, building, item.resource, item.resource === C.HOUSING, item.amount * modifier);
    }
    for (const item of module.consumes) {
        updateBuildingResourceStat(gameState, player, building, item.resource, false, -item.amount * modifier);
    }
    for (const item of module.storage) {
        updateBuildingResourceStat(gameState, player, building, item.resource, true, item.amount * modifier);
    }
}

/**
 * Retrieves a building from the game state if it has been initialized.
 * If not, it initializes the building from the map data source, adds it to the game state, and then returns it.
 * This function is the cornerstone of the "on-demand" building loading system.
 * @param gs The current game state.
 * @param mapId The map feature ID of the building to get or initialize.
 * @returns The Building object, or null if it could not be found or created.
 */
export function getOrInitBuilding(gs: GameState, mapId: number): Building | null {
    // If the building is already in the game state, return it immediately.
    // This implies it has already been verified and initialized.
    if (gs.buildingsByMapId[mapId]) {
        return gs.buildingsByMapId[mapId];
    }

    // --- Step 1: Query the visual map data (first source of truth) ---
    if (!mapInstance.map) {
        console.warn(`[Buildings] getOrInitBuilding: mapInstance is not available.`);
        return null;
    }
    const visualFeatures = mapInstance.map.querySourceFeatures('almaty-tiles', {
        sourceLayer: 'building',
        filter: ['==', ['id'], mapId]
    });

    if (!visualFeatures || visualFeatures.length === 0) {
        console.warn(`[Buildings] getOrInitBuilding: No visual feature found for mapId ${mapId}.`);
        return null;
    }
    const visualFeature = visualFeatures[0];

    // --- Step 2: Verify against the logical data (second source of truth) ---
    const center = calculatePolygonCenter((visualFeature.geometry as any).coordinates);
    const searchRadius = 0.00001; // Tiny search box around the center
    const searchResult = gs.buildingSpatialIndex.search({
        minX: center.x - searchRadius, minY: center.y - searchRadius,
        maxX: center.x + searchRadius, maxY: center.y + searchRadius,
    });

    const logicalFeature = searchResult.find(r => r.feature.id === mapId);

    if (!logicalFeature) {
        console.error(`[Buildings] Data inconsistency: A visual feature for mapId ${mapId} was found, but it does not exist in the logical buildingSpatialIndex. This building cannot be created.`);
        return null;
    }
    
    // --- Step 3: Create building only if both sources agree ---
    // We use the logical feature as the definitive source for properties.
    const newBuilding = createBuildingFromFeature(mapId, logicalFeature.feature);

    // Add the new, verified building to the game state.
    gs.buildingsById[newBuilding.id] = newBuilding;
    gs.buildingsByMapId[newBuilding.mapId] = newBuilding;
    
    return newBuilding;
}

function createBuildingFromFeature(mapId: number, feature: any): Building {
    const buildingType = feature.properties.building;
    const levels = parseInt(feature.properties["building:levels"] || '1', 10);
    const slots = generateSlotsForBuilding(buildingType, levels);
    const center = calculatePolygonCenter(feature.geometry.coordinates);
    const boundingRadius = calculateBoundingRadius(center, feature.geometry.coordinates);
    const floorSize = calculatePolygonArea(feature.geometry.coordinates);

    return {
        id: `bld_${nextBuildingId++}`,
        mapId: mapId,
        originalMapId: feature.properties.original_osm_id,
        team: 0, // Belongs to Neutral team by default
        center: center,
        boundingRadius: boundingRadius,
        floors: levels,
        floorSize: floorSize,
        slots: slots,
        outputs: [],
        disabledUntil: 0,
    };
}

function generateSlotsForBuilding(buildingType: string, levels: number): BuildingSlot[] {
    const slots: BuildingSlot[] = [];
    
    // Base slots based on floors, but sometimes add extra slots randomly
    let baseSlots = Math.max(1, levels);
    const shouldAddExtraSlots = Math.random() < 0.3; // 30% chance
    if (shouldAddExtraSlots) {
        baseSlots += Math.floor(Math.random() * 3) + 1; // Add 1-3 extra slots
    }
    
    // Cap at maximum slots
    const totalSlots = Math.min(baseSlots, C.MAX_BUILDING_SLOTS);

    // Determine primary slot type based on building type
    let primarySlotType: BuildingSlotType;
    switch (buildingType) {
        case 'residential':
        case 'house':
        case 'apartments':
        case 'dormitory':
        case 'yes': // 'yes' is a common generic building tag
            primarySlotType = BuildingSlotType.housing;
            break;
        case 'industrial':
        case 'commercial':
        case 'retail':
        case 'office':
            primarySlotType = BuildingSlotType.production;
            break;
        case 'university':
        case 'college':
        case 'school':
            primarySlotType = BuildingSlotType.science;
            break;
        default:
            primarySlotType = BuildingSlotType.housing; // Default to housing
            break;
    }
    
    // Generate slots with compound types
    for (let i = 0; i < totalSlots; i++) {
        let slotType: number = primarySlotType;
        
        // 40% chance to create compound slot types
        if (Math.random() < 0.4) {
            slotType = generateCompoundSlotType(primarySlotType);
        }
        
        slots.push({ type: slotType, occupant: '', content: '' });
    }

    // Add a storage slot to larger non-residential buildings
    if (primarySlotType !== BuildingSlotType.housing && levels > 3) {
        slots.push({ type: BuildingSlotType.storage, occupant: '', content: '' });
    }

    return slots;
}

function generateCompoundSlotType(primaryType: BuildingSlotType): number {
    // Housing doesn't bode well with production, but the rest are possible
    const availableTypes = [BuildingSlotType.production, BuildingSlotType.science, BuildingSlotType.storage];
    
    if (primaryType === BuildingSlotType.housing) {
        // For housing, combine with science or storage, but not production
        const compatibleTypes = [BuildingSlotType.science, BuildingSlotType.storage];
        const secondaryType = compatibleTypes[Math.floor(Math.random() * compatibleTypes.length)];
        return primaryType | secondaryType;
    } else {
        // For non-housing, can combine with any other type
        const otherTypes = availableTypes.filter(type => type !== primaryType);
        if (otherTypes.length > 0) {
            const secondaryType = otherTypes[Math.floor(Math.random() * otherTypes.length)];
            return primaryType | secondaryType;
        }
    }
    
    return primaryType;
}

export function calculatePolygonCenter(coordinates: any[]): Point2 {
    // Handle LineString, Polygon, and MultiPolygon geometries
    let ring: any[];
    
    // Check for MultiPolygon: coordinates[0][0] should be array of coordinate pairs
    if (coordinates && coordinates[0] && Array.isArray(coordinates[0][0]) && Array.isArray(coordinates[0][0][0])) {
        // MultiPolygon: coordinates[0][0] is the outer ring
        ring = coordinates[0][0];
    } else if (coordinates && coordinates[0] && Array.isArray(coordinates[0][0]) && typeof coordinates[0][0][0] === 'number') {
        // Polygon: coordinates[0] is the outer ring, coordinates[0][0] is first coordinate pair
        ring = coordinates[0];
    } else if (coordinates && Array.isArray(coordinates[0]) && typeof coordinates[0][0] === 'number') {
        // LineString: coordinates is directly an array of [x, y] points
        ring = coordinates;
    } else {
        return { x: 0, y: 0 };
    }
    
    if (!ring || ring.length === 0) {
        return { x: 0, y: 0 };
    }

    let sumX = 0;
    let sumY = 0;
    let pointCount = 0;
    
    // Average over all coordinates, ensuring we handle all valid points
    for (const point of ring) {
        if (Array.isArray(point) && point.length >= 2 && 
            typeof point[0] === 'number' && typeof point[1] === 'number') {
            sumX += point[0];
            sumY += point[1];
            pointCount++;
        }
    }

    if (pointCount === 0) {
        return { x: 0, y: 0 };
    }

    return {
        x: sumX / pointCount,
        y: sumY / pointCount
    };
}

function calculateBoundingRadius(center: Point2, coordinates: any[]): number {
    // Handle LineString, Polygon, and MultiPolygon geometries
    let ring: any[];
    
    // Check for MultiPolygon: coordinates[0][0] should be array of coordinate pairs
    if (coordinates && coordinates[0] && Array.isArray(coordinates[0][0]) && Array.isArray(coordinates[0][0][0])) {
        // MultiPolygon: coordinates[0][0] is the outer ring
        ring = coordinates[0][0];
    } else if (coordinates && coordinates[0] && Array.isArray(coordinates[0][0]) && typeof coordinates[0][0][0] === 'number') {
        // Polygon: coordinates[0] is the outer ring, coordinates[0][0] is first coordinate pair
        ring = coordinates[0];
    } else if (coordinates && Array.isArray(coordinates[0]) && typeof coordinates[0][0] === 'number') {
        // LineString: coordinates is directly an array of [x, y] points
        ring = coordinates;
    } else {
        return 30; // Default fallback
    }
    
    if (!ring || ring.length === 0) {
        return 30; // Default fallback
    }

    let maxDistance = 0;
    
    for (const point of ring) {
        if (Array.isArray(point) && point.length >= 2 && 
            typeof point[0] === 'number' && typeof point[1] === 'number') {
            const dx = point[0] - center.x;
            const dy = point[1] - center.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            maxDistance = Math.max(maxDistance, distance);
        }
    }

    return maxDistance || 30; // Fallback to 30 if no valid points found
}

function calculatePolygonArea(coordinates: any[]): number {
    // Handle LineString, Polygon, and MultiPolygon geometries
    let ring: any[];
    
    // Check for MultiPolygon: coordinates[0][0] should be array of coordinate pairs
    if (coordinates && coordinates[0] && Array.isArray(coordinates[0][0]) && Array.isArray(coordinates[0][0][0])) {
        // MultiPolygon: coordinates[0][0] is the outer ring
        ring = coordinates[0][0];
    } else if (coordinates && coordinates[0] && Array.isArray(coordinates[0][0]) && typeof coordinates[0][0][0] === 'number') {
        // Polygon: coordinates[0] is the outer ring, coordinates[0][0] is first coordinate pair
        ring = coordinates[0];
    } else if (coordinates && Array.isArray(coordinates[0]) && typeof coordinates[0][0] === 'number') {
        // LineString: coordinates is directly an array of [x, y] points
        ring = coordinates;
    } else {
        return 100; // Default fallback
    }
    
    if (!ring || ring.length < 3) {
        return 100; // Default fallback for polygons with less than 3 vertices
    }

    // Convert coordinates from degrees to meters for accurate area calculation.
    const ringInMeters = ring
        .map(point => {
            if (Array.isArray(point) && point.length >= 2 && typeof point[0] === 'number' && typeof point[1] === 'number') {
                return [point[0] / DEG_PER_METER_LNG, point[1] / DEG_PER_METER_LAT];
            }
            return null;
        })
        .filter((p): p is [number, number] => p !== null);

    if (ringInMeters.length < 3) {
        return 100; // Not enough valid points after filtering
    }
    
    // Use the shoelace formula to calculate polygon area.
    // This formula works for both convex and non-convex simple polygons (polygons that don't self-intersect).
    let area = 0;
    const n = ringInMeters.length;
    
    for (let i = 0; i < n; i++) {
        const current = ringInMeters[i];
        const next = ringInMeters[(i + 1) % n];
        area += current[0] * next[1] - next[0] * current[1];
    }
    
    area = Math.abs(area) / 2;
    return area || 100; // Fallback to 100 if calculation fails
}