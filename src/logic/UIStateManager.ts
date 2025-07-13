/**
 * Manages UI state updates from the game state to the reactive UI objects.
 * This system efficiently copies only relevant parts of the game state to the UI,
 * avoiding full state copies and providing reactive updates for Vue components.
 */

import { GameState } from "./GameState";

export interface UIBuildingInfo {
    id: string;
    mapId: number;
    originalMapId?: string;
    team: number;
    center: { x: number; y: number };
    floors: number;
    floorSize: number;
    slots: Array<{
        type: number;
        occupant: string;
        content: string;
        contentName?: string;
    }>;
    outputs: Array<{
        resource: string;
        income: number;
        isStorage: boolean;
    }>;
    disabledUntil: number;
}

export interface UIPlayerInfo {
    name: string;
    team: number;
    resources: Record<string, {
        current: number;
        max: number;
        income: number;
    }>;
    foodConsumption: number;
    housing: number;
    units: number;
}

/**
 * Tracks the currently selected building and manages its UI state.
 */
export function syncSelectedBuilding(gameState: GameState): void {
    const selectedBuildingId = gameState.uiState.selectedBuildingId;
    
    if (!selectedBuildingId) {
        // No building selected, clear the UI data
        if (gameState.uiState.selectedBuilding) {
            gameState.uiState.selectedBuilding = null;
        }
        return;
    }

    const building = gameState.buildingsById[selectedBuildingId];
    if (!building) {
        // Selected building doesn't exist, clear selection
        gameState.uiState.selectedBuildingId = null;
        gameState.uiState.selectedBuilding = null;
        return;
    }

    // Create or update the UI building info
    const uiBuildingInfo: UIBuildingInfo = {
        id: building.id,
        mapId: building.mapId,
        originalMapId: building.originalMapId,
        team: building.team,
        center: { x: building.center.x, y: building.center.y },
        floors: building.floors,
        floorSize: building.floorSize,
        slots: building.slots.map(slot => ({
            type: slot.type,
            occupant: slot.occupant,
            content: slot.content,
            contentName: slot.content ? gameState.lib.buildingModules.items.get(slot.content)?.name : undefined
        })),
        outputs: building.outputs.map(output => ({
            resource: output.resource,
            income: output.income.value,
            isStorage: output.isStorage
        })),
        disabledUntil: building.disabledUntil
    };

    // Update the UI state
    gameState.uiState.selectedBuilding = uiBuildingInfo;
}

/**
 * Syncs the current player information to the UI state.
 */
export function syncCurrentPlayer(gameState: GameState): void {
    const currentPlayerId = gameState.uiState.currentPlayerId;
    if (!currentPlayerId) {
        console.warn("No current player set in UI state");
        return;
    }

    const player = gameState.players[currentPlayerId];
    if (!player) {
        console.warn(`Current player ${currentPlayerId} not found in game state`);
        return;
    }

    // Create or update the UI player info
    const uiPlayerInfo: UIPlayerInfo = {
        name: player.name,
        team: player.team,
        resources: {},
        foodConsumption: player.foodConsumption.value,
        housing: player.housing.value,
        units: player.units.value
    };

    // Copy resource information
    for (const [resourceName, resource] of Object.entries(player.resources)) {
        uiPlayerInfo.resources[resourceName] = {
            current: resource.current.value,
            max: resource.max.value,
            income: resource.income.value
        };
    }

    // Update the UI state
    gameState.uiState.currentPlayer = uiPlayerInfo;
}

/**
 * Sets the selected building ID in the UI state.
 * This is typically called when a building is clicked or queried.
 */
export function setSelectedBuilding(gameState: GameState, buildingId: string | null): void {
    if (gameState.uiState.selectedBuildingId !== buildingId) {
        gameState.uiState.selectedBuildingId = buildingId;
        // The building info will be synced in the next sync cycle
    }
}

/**
 * Processes the game's event log and updates the UI state accordingly.
 * This is the central place for handling events that the UI needs to react to.
 * @param gameState The game state.
 */
function syncEvents(gameState: GameState): void {
    const lastProcessedId = gameState.uiState.lastProcessedEventId;
    const newEvents = gameState.eventLog.filter(e => e.id > lastProcessedId);

    if (newEvents.length === 0) {
        return;
    }

    console.log(`[UIStateManager] Processing ${newEvents.length} new events.`);

    // Clear the previous changes and prepare for new ones
    gameState.uiState.mapBuildingColorChanges = [];

    for (const { event } of newEvents) {
        switch (event.type) {
            case 'building:ownership':
                const building = gameState.buildingsByMapId[event.payload.mapId];
                const coords = building ? building.center : 'not found';
                const origId = building ? building.originalMapId : 'not found';
                console.log(`[UIStateManager] Processing building:ownership event for mapId: ${event.payload.mapId} (orig: ${origId}). Coords: ${JSON.stringify(coords)}`);
                gameState.uiState.mapBuildingColorChanges.push(event.payload);
                break;
            // Other event types can be handled here in the future
        }
    }

    gameState.uiState.lastProcessedEventId = newEvents[newEvents.length - 1].id;
}

/**
 * Initializes the UI state with default values.
 * This should be called once when the game starts.
 */
export function initializeUIState(gameState: GameState, playerName: string): void {
    gameState.uiState.currentPlayerId = playerName;
;

    // Initialize other UI state properties
    gameState.uiState.selectedBuildingId = null;
    gameState.uiState.selectedBuilding = null;
    gameState.uiState.currentPlayer = null;
}

/**
 * Main sync function that updates all UI state from the game state.
 * This should be called every frame to keep the UI in sync.
 */
export function sync(gameState: GameState): void {
    if (!gameState.uiState.currentPlayerId) {
        return;
    }
    syncEvents(gameState);
    syncCurrentPlayer(gameState);
    syncSelectedBuilding(gameState);
} 