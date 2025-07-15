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
import { Building, BuildingSlot, GameState, Player } from "./GameState";
import { Stats } from "./core/Stats";
import { ConnectionType, Parameter } from "./core/Stat";
import { BuildingModule } from "./lib/BuildingModuleLib";
import { mapInstance } from "../map_instance";
import { C } from "./lib/C";

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
    // TODO: Re-implement feature querying with OpenLayers
    return null;
}

/*
function generateSlotsForBuilding(buildingType: string, levels: number): BuildingSlot[] {
    const slots: BuildingSlot[] = [];
    let slotCount: number;
    
    // Base slots based on floors, but sometimes add extra slots randomly
    if (buildingType === 'residential') {
        slotCount = levels; 
    } else if (buildingType === 'commercial' || buildingType === 'office') {
        slotCount = Math.floor(levels / 2);
    } else if (buildingType === 'industrial') {
        slotCount = Math.floor(levels / 3);
    } else {
        slotCount = Math.floor(levels / 5);
    }
    
    // 20% chance to add an extra slot
    if (Math.random() < 0.2) {
        slotCount++;
    }

    const primarySlotType = 
        buildingType === 'residential' ? BuildingSlotType.Residential :
        buildingType === 'commercial' ? BuildingSlotType.Commercial :
        buildingType === 'industrial' ? BuildingSlotType.Industrial :
        buildingType === 'office' ? BuildingSlotType.Office :
        BuildingSlotType.Any;

    for (let i = 0; i < slotCount; i++) {
        const isCompound = Math.random() < 0.1; // 10% chance for a compound slot
        const slotType = isCompound ? generateCompoundSlotType(primarySlotType) : primarySlotType;
        slots.push({
            type: slotType,
            content: '',
            occupant: ''
        });
    }

    return slots;
}

function generateCompoundSlotType(primaryType: BuildingSlotType): number {
    let secondaryType: BuildingSlotType;
    const availableTypes = [
        BuildingSlotType.Residential,
        BuildingSlotType.Commercial,
        BuildingSlotType.Industrial,
        BuildingSlotType.Office
    ].filter(t => t !== primaryType);

    secondaryType = availableTypes[Math.floor(Math.random() * availableTypes.length)];
    
    return primaryType | secondaryType;
}
*/

/**
 * @param coordinates The coordinates of the polygon, in the format [[[x1, y1], ...]].
 * @returns The center point.
 */
/*
export function calculatePolygonCenter(coordinates: any[]): Point2 {
    let totalX = 0;
    let totalY = 0;
    let pointCount = 0;

    const processRing = (ring: any[]) => {
        for (const point of ring) {
            totalX += point[0];
            totalY += point[1];
            pointCount++;
        }
    };

    if (Array.isArray(coordinates[0][0][0])) { // MultiPolygon
        for (const polygon of coordinates) {
            processRing(polygon[0]);
        }
    } else if (Array.isArray(coordinates[0][0])) { // Polygon
        processRing(coordinates[0]);
    } else { // LineString
        processRing(coordinates);
    }

    return { x: totalX / pointCount, y: totalY / pointCount };
}

function calculateBoundingRadius(center: Point2, coordinates: any[]): number {
    let maxDistSq = 0;

    const processRing = (ring: any[]) => {
        for (const point of ring) {
            const dx = point[0] - center.x;
            const dy = point[1] - center.y;
            const distSq = dx * dx + dy * dy;
            if (distSq > maxDistSq) {
                maxDistSq = distSq;
            }
        }
    };

    if (Array.isArray(coordinates[0][0][0])) { // MultiPolygon
        for (const polygon of coordinates) {
            processRing(polygon[0]);
        }
    } else if (Array.isArray(coordinates[0][0])) { // Polygon
        processRing(coordinates[0]);
    } else { // LineString
        processRing(coordinates);
    }

    return Math.sqrt(maxDistSq);
}

function calculatePolygonArea(coordinates: any[]): number {
    let area = 0;

    const processRing = (ring: any[]) => {
        let j = ring.length - 1;
        for (let i = 0; i < ring.length; i++) {
            area += (ring[j][0] + ring[i][0]) * (ring[j][1] - ring[i][1]);
            j = i;
        }
    };

    if (Array.isArray(coordinates[0][0][0])) { // MultiPolygon
        for (const polygon of coordinates) {
            processRing(polygon[0]);
        }
    } else if (Array.isArray(coordinates[0][0])) { // Polygon
        processRing(coordinates[0]);
    } else { // LineString - Area is 0
        return 0;
    }

    return Math.abs(area / 2);
}
*/