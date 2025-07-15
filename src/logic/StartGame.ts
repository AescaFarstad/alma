import { BuildingSlot, GameState, Player } from "./GameState";
import { DEG_PER_METER_LAT, DEG_PER_METER_LNG, START_COORDS } from "../map_instance";
import * as Buildings from './Buildings';
import { Stats } from './core/Stats';
import { C } from "./lib/C";
import { addResource } from "./Economy";
import { BuildingModule } from "./lib/BuildingModuleLib";
import { ConnectionType } from "./core/Stat";
import { initializeUIState } from "./UIStateManager";

const startGameConfig = {
    searchRadiusMeters: 100,
    numberOfStartingBuildings: 5,
    modules: [
        { moduleId: 'shelter-s', count: 2 },
        { moduleId: 'accumulator-s', count: 1 },
        { moduleId: 'geothermal-s', count: 1 },
        { moduleId: 'greenhouse-s', count: 1 },
        { moduleId: 'mine-s', count: 1 },
        { moduleId: 'pit-s', count: 1 }
    ],
};

/**
 * Initializes a new game, setting up the player, starting resources, and initial buildings.
 * This is intended to be called once at the beginning of a game session.
 * @param gs The game state to initialize.
 */
export function initNewGame(gs: GameState): void {
    // 1. Create Player
    const player = createPlayer(gs, 'Player 1', 1);
    gs.players[player.name] = player;

    // 2. Find starting buildings
    const startingBuildingFeatures = findStartingBuildings(gs);
    if (startingBuildingFeatures.length === 0) {
        console.error("Could not find any starting buildings. Aborting game setup.");
        return;
    }
    
    // 3. Determine required modules from config
    const requiredModules = getRequiredModules(gs, startGameConfig.modules);

    // 4. Initialize buildings and install modules
    distributeAndInstallModules(gs, player, startingBuildingFeatures, requiredModules);

    // 5. Initialize UI state
    initializeUIState(gs, player.name);

    console.log("New game initialized successfully.");
}

function findStartingBuildings(gs: GameState): any[] {
    const radius = startGameConfig.searchRadiusMeters;
    const lat = START_COORDS[1];
    const lng = START_COORDS[0];
    
    const halfSideLat = radius * DEG_PER_METER_LAT;
    const halfSideLng = radius * DEG_PER_METER_LNG;

    const searchBox = {
        minX: lng - halfSideLng,
        minY: lat - halfSideLat,
        maxX: lng + halfSideLng,
        maxY: lat + halfSideLat,
    };

    const results = gs.buildingSpatialIndex.search(searchBox);
    const features = results.map(r => r.feature);

    if (features.length < startGameConfig.numberOfStartingBuildings) {
        //console.warn(`Found only ${features.length} buildings, need ${startGameConfig.numberOfStartingBuildings}. Using all found.`);
        return features;
    }

    // Return N random buildings from the features found
    return features.sort(() => 0.5 - Math.random()).slice(0, startGameConfig.numberOfStartingBuildings);
}

function getRequiredModules(gs: GameState, moduleConfig: {moduleId: string, count: number}[]): BuildingModule[] {
    const modules: BuildingModule[] = [];
    for (const item of moduleConfig) {
        const moduleDef = gs.lib.buildingModules.items.get(item.moduleId);
        if (moduleDef) {
            for (let i = 0; i < item.count; i++) {
                modules.push(moduleDef);
            }
        } else {
            console.warn(`Module ID "${item.moduleId}" from config not found in library.`);
        }
    }
    return modules;
}

function distributeAndInstallModules(gs: GameState, player: Player, buildingFeatures: any[], modules: BuildingModule[]) {
    const modulesPerBuilding = Math.ceil(modules.length / buildingFeatures.length);

    console.log(`[StartGame] Distributing ${modules.length} modules among ${buildingFeatures.length} buildings.`);

    for (let i = 0; i < buildingFeatures.length; i++) {
        const feature = buildingFeatures[i];
        let mapId = feature.properties?.osm_id || feature.id;
        
        // The ID might have a prefix like 'w' for 'way'. We only need the number.
        if (typeof mapId === 'string') {
            const numericPart = mapId.match(/\d+/);
            if (numericPart) {
                mapId = parseInt(numericPart[0], 10);
            }
        }

        // Get the building, ensuring it's verified against both visual and logical data sources.
        const building = Buildings.getOrInitBuilding(gs, mapId as number);
        
        if (building) {
            console.log(`[StartGame] Setting owner for building ${building.mapId} (orig: ${building.originalMapId}) to team ${player.team}. Coords: ${JSON.stringify(building.center)}`);
            Buildings.setBuildingOwner(gs, building, player.team);

            // Overwrite existing slots
            building.slots = []; 

            const modulesForThisBuilding = modules.slice(i * modulesPerBuilding, (i + 1) * modulesPerBuilding);
            
            for (const moduleToInstall of modulesForThisBuilding) {
                // Create a new slot specifically for this module and install it
                const newSlot: BuildingSlot = {
                    type: moduleToInstall.slotType,
                    occupant: '',
                    content: moduleToInstall.id
                };
                building.slots.push(newSlot);
                Buildings.applyResourceEffects(gs, player, building, moduleToInstall, 1);
            }
        } else {
            //console.warn(`[StartGame] Could not get or init building for feature id ${feature.id} (orig: ${feature.properties.original_osm_id}, using mapId: ${mapId})`);
        }
    }
}

function createPlayer(gs: GameState, name: string, team: number): Player {
    const food = addResource(name, C.FOOD, gs.connections, 500, 1000);
    const energy = addResource(name, C.ENERGY, gs.connections, 500, 1000);
    const iron = addResource(name, C.IRON, gs.connections, 250, 1000);
    const gold = addResource(name, C.GOLD, gs.connections, 100, 1000);
    const ore = addResource(name, C.ORE, gs.connections, 0, 1000);
    const coal = addResource(name, C.COAL, gs.connections, 0, 1000);
    const science = addResource(name, C.SCIENCE, gs.connections, 0, 1000);

    const units = Stats.createStat(`${name}.units.current`, 0, gs.connections);
    const foodConsumption = Stats.createParameter(`${name}.${C.FOOD}.consumption`, gs.connections);
    const foodPerUnit = Stats.createStat(`${name}.${C.FOOD}.per_unit`, C.FOOD_PER_UNIT_PER_SECOND, gs.connections);

    Stats.connectStat(units, foodConsumption, ConnectionType.MULTY, gs.connections);
    Stats.connectStat(foodPerUnit, foodConsumption, ConnectionType.MULTY, gs.connections);
    Stats.connectStat(foodConsumption, food.income, ConnectionType.SUB, gs.connections);

    const player: Player = {
        name,
        team,
        resources: {
            [C.FOOD]: food,
            [C.ENERGY]: energy,
            [C.IRON]: iron,
            [C.GOLD]: gold,
            [C.ORE]: ore,
            [C.COAL]: coal,
            [C.SCIENCE]: science,
        },
        foodConsumption: foodConsumption,
        housing: Stats.createParameter(`${name}.housing.max`, gs.connections),
        units: units,
    };
    return player;
} 