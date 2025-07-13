/**
 * This module manages the game's economic simulation.
 * It runs every tick to update player resources based on income,
 * and handles periodic checks for consumption (e.g., food for units) and applies penalties for deficits.
 */
import { GameState, Player, Resource } from "./GameState";
import { C } from "./lib/C";
import { Stats } from "./core/Stats";
import * as UnitActions from "./UnitActions";
import * as Buildings from "./Buildings";
import { Connections } from "./core/Stat";

export function updateEconomy(gs: GameState, deltaTime: number): void {
    // 1. Update resource storage based on income
    for (const player of Object.values(gs.players)) {
        for (const resource of Object.values(player.resources)) {
            const change = resource.income.value * deltaTime;
            const currentValue = resource.current.value;
            const newTotal = currentValue + change;
            
            let finalValue = Math.min(newTotal, resource.max.value);
            if (resource.name !== C.FOOD && resource.name !== C.ENERGY) {
                finalValue = Math.max(0, finalValue);
            }
            
            const delta = finalValue - currentValue;
            if (Math.abs(delta) > 0) {
                Stats.modifyStat(resource.current, delta, gs.connections);
            }
        }
    }

    // 2. Perform periodic checks
    // Food check fires on the whole second
    if (Math.floor(gs.gameTime) > Math.floor(gs.gameTime - deltaTime)) {
        for (const player of Object.values(gs.players)) {
            handleFoodDeficit(gs, player);
        }
    }
    
    // Energy check fires on the half-second
    if (Math.floor(gs.gameTime + 0.5) > Math.floor(gs.gameTime - deltaTime + 0.5)) {
        for (const player of Object.values(gs.players)) {
            handleEnergyDeficit(gs, player);
        }
    }
}

function handleFoodDeficit(gs: GameState, player: Player): void {
    const foodResource = player.resources[C.FOOD];
    if (foodResource && foodResource.current.value < 0) {
        console.warn(`${player.name} is out of food! A unit will perish.`);
        const playerUnits = Object.values(gs.unitsById).filter(u => u.team === player.team);
        let unitToKill = playerUnits.find(u => u.profession !== 'soldier' && u.profession !== 'farmer');
        if (!unitToKill) {
            unitToKill = playerUnits[Math.floor(Math.random() * playerUnits.length)];
        }
        
        if (unitToKill) {
            // This is a stub for the killUnit action, which should be implemented in UnitActions
            console.log(`Unit ${unitToKill.id} would be killed.`);
            UnitActions.killUnit(gs, unitToKill.id);
        }
    }
}

function handleEnergyDeficit(gs: GameState, player: Player): void {
    // Re-enable any buildings whose disable time has passed
    for (const building of Object.values(gs.buildingsById)) {
        if (building.team === player.team && building.disabledUntil > 0 && building.disabledUntil < gs.gameTime) {
            Buildings.setBuildingDisabled(gs, player, building, false, 0);
        }
    }

    const energyResource = player.resources[C.ENERGY];
    if (energyResource && energyResource.current.value < 0) {
        // Find active, energy-consuming buildings that are not already disabled
        const activeBuildings = Object.values(gs.buildingsById).filter(b => 
            b.team === player.team &&
            b.disabledUntil === 0 &&
            Buildings.getBuildingResourceConsumption(b, C.ENERGY) > 0
        );

        if (activeBuildings.length > 0) {
            const buildingToDisable = activeBuildings[Math.floor(Math.random() * activeBuildings.length)];
            console.warn(`${player.name} has an energy deficit! Disabling building ${buildingToDisable.id} for 60 seconds.`);
            const disabledDuration = 60;
            Buildings.setBuildingDisabled(gs, player, buildingToDisable, true, gs.gameTime + disabledDuration);
        }
    }
} 

export function addResource(ownerName: string, resourceName: string, connections: Connections, initialValue: number, initialMax: number): Resource {
    const current = Stats.createStat(`${ownerName}.${resourceName}.current`, initialValue, connections);
    const income = Stats.createParameter(`${ownerName}.${resourceName}.income`, connections);
    const max = Stats.createParameter(`${ownerName}.${resourceName}.max`, connections);
    
    Stats.modifyParameterADD(max, initialMax, connections);

    return {
        name: resourceName,
        current: current,
        income: income,
        max: max,
    };
}