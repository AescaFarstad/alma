/**
 * This module is responsible for processing the global command queue. It maps command names to handler functions, ensuring that player inputs are translated into game state changes.
 */
import { GameState } from '../GameState';
import { globalInputQueue } from '../Model';
import type { CmdInput, CmdInstallModule, CmdAssignUnitToModule, CmdHireUnit, CmdQueryBuilding, CmdVerifyBuildings } from './InputCommands';
import * as Buildings from '../Buildings';
import * as UnitActions from '../UnitActions';
import { setSelectedBuilding } from '../UIStateManager';
import { verifyBuildings } from '../DataIntegrity';

// Map of command handlers
const handlersByName = new Map<string, (gameState: GameState, command: CmdInput) => void>();
handlersByName.set("CmdInstallModule", handleInstallModule);
handlersByName.set("CmdAssignUnitToModule", handleAssignUnitToModule);
handlersByName.set("CmdHireUnit", handleHireUnit);
handlersByName.set("CmdQueryBuilding", handleQueryBuilding);
handlersByName.set("CmdVerifyBuildings", handleVerifyBuildings);

/**
 * Processes all queued commands.
 * @param gameState The current game state.
 */
export function processInputs(gameState: GameState): void {
    for (const command of globalInputQueue) {
        const handler = handlersByName.get(command.name);
        if (handler) {
            handler(gameState, command);
        } else {
            console.warn(`No handler for command: ${command.name}`);
        }
    }
    // Clear the queue after processing
    globalInputQueue.length = 0;
}


// --- Handlers ---

function handleInstallModule(gameState: GameState, command: CmdInput): void {
    const cmd = command as CmdInstallModule;
    const building = gameState.buildingsById[cmd.buildingId];
    if (!building) {
        console.warn(`InstallModule: Building with id ${cmd.buildingId} not found.`);
        return;
    }

    if (cmd.slotIndex < 0 || cmd.slotIndex >= building.slots.length) {
        console.warn(`InstallModule: Invalid slot index ${cmd.slotIndex}.`);
        return;
    }

    const slot = building.slots[cmd.slotIndex];
    if (slot.content) {
        console.warn(`InstallModule: Slot ${cmd.slotIndex} in building ${cmd.buildingId} is already occupied by ${slot.content}.`);
        return;
    }

    const module = gameState.lib.buildingModules.items.get(cmd.moduleId);
    if (!module) {
        console.warn(`InstallModule: Module with id ${cmd.moduleId} not found.`);
        return;
    }

    if ((slot.type & module.slotType) === 0) {
        console.warn(`InstallModule: Slot type mismatch. Slot is ${slot.type}, module requires ${module.slotType}.`);
        return;
    }
    
    const player = gameState.players[cmd.playerId];
    if (!player) {
        console.warn(`InstallModule: Player with id ${cmd.playerId} not found.`);
        return;
    }

    // Check cost
    for (const cost of module.cost) {
        const playerResource = player.resources[cost.resource];
        if (!playerResource || playerResource.current.value < cost.amount) {
            console.warn(`InstallModule: Not enough ${cost.resource}. Required ${cost.amount}, has ${playerResource?.current.value ?? 0}.`);
            return;
        }
    }

    Buildings.installModule(gameState, cmd.playerId, cmd.buildingId, cmd.slotIndex, module);
}

function handleAssignUnitToModule(gameState: GameState, command: CmdInput): void {
    const cmd = command as CmdAssignUnitToModule;
    const { unitId, buildingId, slotIndex, playerId } = cmd;

    const unit = gameState.unitsById[unitId];
    if (!unit) {
        console.warn(`AssignUnit: Unit with id ${unitId} not found.`);
        return;
    }
    
    const building = gameState.buildingsById[buildingId];
    if (!building) {
        console.warn(`AssignUnit: Building with id ${buildingId} not found.`);
        return;
    }

    if (slotIndex < 0 || slotIndex >= building.slots.length) {
        console.warn(`AssignUnit: Invalid slot index ${slotIndex}.`);
        return;
    }

    const slot = building.slots[slotIndex];
    if (!slot.content) {
        console.warn(`AssignUnit: Slot ${slotIndex} in building ${buildingId} does not have a module installed.`);
        return;
    }
    
    if (slot.occupant) {
        console.warn(`AssignUnit: Slot ${slotIndex} in building ${buildingId} is already occupied by unit ${slot.occupant}.`);
        return;
    }

    Buildings.assignUnitToBuilding(gameState, playerId, unitId, buildingId, slotIndex);
}

function handleHireUnit(gameState: GameState, command: CmdInput): void {
    const cmd = command as CmdHireUnit;
    UnitActions.hireUnit(gameState, cmd.playerId);
}

function handleQueryBuilding(gameState: GameState, command: CmdInput): void {
    const cmd = command as CmdQueryBuilding;
    const building = Buildings.getOrInitBuilding(gameState, cmd.mapId);
    if (building) {
        setSelectedBuilding(gameState, building.id);
    }
}

function handleVerifyBuildings(gameState: GameState, command: CmdInput): void {
    const cmd = command as CmdVerifyBuildings;
    verifyBuildings(gameState, cmd.center);
} 