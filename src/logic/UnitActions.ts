/**
 * This module provides high-level actions related to units, such as hiring new units and handling their removal from the game.
 * It encapsulates the logic for checking costs, finding available housing, and updating game state accordingly.
 */
import { GameState, Unit } from './GameState';
import { C } from './lib/C';
import { Stats } from './core/Stats';
import { findUnitSlot, unassignUnitFromBuilding } from './Buildings';

export function hireUnit(gameState: GameState, playerId: string): void {
    const player = gameState.players[playerId];
    if (!player) {
        console.warn(`hireUnit: Player not found: ${playerId}`);
        return;
    }

    // 1. Check for available housing
    if (player.units.value >= player.housing.value) {
        console.warn('hireUnit: No available housing.');
        return;
    }

    // 2. Check cost
    const cost = C.UNIT_COST;
    const playerResource = player.resources[cost.resource];
    if (!playerResource || playerResource.current.value < cost.amount) {
        console.warn(`hireUnit: Not enough ${cost.resource}. Required ${cost.amount}, has ${playerResource?.current.value ?? 0}.`);
        return;
    }

    // 3. Deduct cost
    Stats.modifyStat(player.resources[cost.resource].current, -cost.amount, gameState.connections);

    // 4. Create unit
    const unitId = `unit-${gameState.nextUnitId++}`;
    const unit: Unit = {
        id: unitId,
        team: player.team,
        pos: { x: 0, y: 0 }, // Position will be set to the housing building's center
        occupies: '',
        profession: 'unemployed',
    };
    gameState.unitsById[unitId] = unit;

    // 5. Update unit count
    Stats.modifyStat(player.units, 1, gameState.connections);
}

export function killUnit(gameState: GameState, unitId: string): void {
    const unit = gameState.unitsById[unitId];
    if (!unit) {
        return; // Already dead
    }
    const player = Object.values(gameState.players).find(p => p.team === unit.team);

    // Unassign from any work or housing slot
    const slotInfo = findUnitSlot(gameState, unitId);
    if (slotInfo) {
        unassignUnitFromBuilding(gameState, unit.id, slotInfo.building.id, slotInfo.slotIndex);
    }

    // Remove from game
    delete gameState.unitsById[unitId];

    // Update unit count
    if (player) {
        Stats.modifyStat(player.units, -1, gameState.connections);
    }
} 