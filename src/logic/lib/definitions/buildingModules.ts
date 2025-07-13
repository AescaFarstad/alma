import { BuildingSlotType } from '../../game-objects/BuildingSlotType';
import type { BuildingModule } from '../BuildingModuleLib';

// This is raw data. The library will process it.
export const buildingModulesData: Record<string, Omit<BuildingModule, 'id'>> = {
    // Housing
    'shelter-s': {
        name: 'Small Shelter',
        cost: [{ resource: 'iron', amount: 50 }],
        slotType: BuildingSlotType.housing,
        profession: 'resident',
        produces: [{ resource: 'housing', amount: 2 }],
        consumes: [],
        storage: []
    },
    'shelter': {
        name: 'Medium Shelter',
        cost: [{ resource: 'iron', amount: 100 }],
        slotType: BuildingSlotType.housing,
        profession: 'resident',
        produces: [{ resource: 'housing', amount: 5 }],
        consumes: [],
        storage: []
    },
    'shelter-l': {
        name: 'Large Shelter',
        cost: [{ resource: 'iron', amount: 200 }],
        slotType: BuildingSlotType.housing,
        profession: 'resident',
        produces: [{ resource: 'housing', amount: 10 }],
        consumes: [],
        storage: []
    },

    // Food Production
    'greenhouse-s': {
        name: 'Small Greenhouse',
        cost: [{ resource: 'iron', amount: 100 }],
        slotType: BuildingSlotType.production,
        profession: 'farmer',
        produces: [{ resource: 'food', amount: 1 }],
        consumes: [{ resource: 'energy', amount: 0.5 }],
        storage: []
    },
    'greenhouse': {
        name: 'Greenhouse',
        cost: [{ resource: 'iron', amount: 200 }],
        slotType: BuildingSlotType.production,
        profession: 'farmer',
        produces: [{ resource: 'food', amount: 2.5 }],
        consumes: [{ resource: 'energy', amount: 1 }],
        storage: []
    },
    'greenhouse-l': {
        name: 'Large Greenhouse',
        cost: [{ resource: 'iron', amount: 400 }],
        slotType: BuildingSlotType.production,
        profession: 'farmer',
        produces: [{ resource: 'food', amount: 6 }],
        consumes: [{ resource: 'energy', amount: 2 }],
        storage: []
    },

    // Food Storage
    'silo-s': {
        name: 'Small Silo',
        cost: [{ resource: 'iron', amount: 80 }],
        slotType: BuildingSlotType.storage,
        profession: 'logistician',
        produces: [],
        consumes: [],
        storage: [{ resource: 'food', amount: 1000 }],
        operatorless: true
    },
    'silo': {
        name: 'Silo',
        cost: [{ resource: 'iron', amount: 160 }],
        slotType: BuildingSlotType.storage,
        profession: 'logistician',
        produces: [],
        consumes: [],
        storage: [{ resource: 'food', amount: 2500 }],
        operatorless: true
    },
    'silo-l': {
        name: 'Large Silo',
        cost: [{ resource: 'iron', amount: 320 }],
        slotType: BuildingSlotType.storage,
        profession: 'logistician',
        produces: [],
        consumes: [],
        storage: [{ resource: 'food', amount: 6000 }],
        operatorless: true
    },

    // Energy Production (Geothermal)
    'geothermal-s': {
        name: 'Small Geothermal Plant',
        cost: [{ resource: 'iron', amount: 150 }],
        slotType: BuildingSlotType.production,
        profession: 'technician',
        produces: [{ resource: 'energy', amount: 2 }],
        consumes: [],
        storage: []
    },
    'geothermal': {
        name: 'Geothermal Plant',
        cost: [{ resource: 'iron', amount: 300 }],
        slotType: BuildingSlotType.production,
        profession: 'technician',
        produces: [{ resource: 'energy', amount: 5 }],
        consumes: [],
        storage: []
    },
    'geothermal-l': {
        name: 'Large Geothermal Plant',
        cost: [{ resource: 'iron', amount: 600 }],
        slotType: BuildingSlotType.production,
        profession: 'technician',
        produces: [{ resource: 'energy', amount: 12 }],
        consumes: [],
        storage: []
    },

    // Energy Storage
    'accumulator-s': {
        name: 'Small Accumulator',
        cost: [{ resource: 'iron', amount: 100 }],
        slotType: BuildingSlotType.storage,
        profession: 'technician',
        produces: [],
        consumes: [],
        storage: [{ resource: 'energy', amount: 1000 }],
        operatorless: true
    },
    'accumulator': {
        name: 'Accumulator',
        cost: [{ resource: 'iron', amount: 200 }],
        slotType: BuildingSlotType.storage,
        profession: 'technician',
        produces: [],
        consumes: [],
        storage: [{ resource: 'energy', amount: 2500 }],
        operatorless: true
    },
    'accumulator-l': {
        name: 'Large Accumulator',
        cost: [{ resource: 'iron', amount: 400 }],
        slotType: BuildingSlotType.storage,
        profession: 'technician',
        produces: [],
        consumes: [],
        storage: [{ resource: 'energy', amount: 6000 }],
        operatorless: true
    },
    
    // Ore and Iron
    'mine-s': {
        name: 'Small Mine',
        cost: [{ resource: 'iron', amount: 120 }],
        slotType: BuildingSlotType.production,
        profession: 'miner',
        produces: [{ resource: 'ore', amount: 1 }],
        consumes: [{ resource: 'energy', amount: 1 }],
        storage: []
    },
    'mine': {
        name: 'Mine',
        cost: [{ resource: 'iron', amount: 250 }],
        slotType: BuildingSlotType.production,
        profession: 'miner',
        produces: [{ resource: 'ore', amount: 2.5 }],
        consumes: [{ resource: 'energy', amount: 2 }],
        storage: []
    },
    'mine-l': {
        name: 'Large Mine',
        cost: [{ resource: 'iron', amount: 500 }],
        slotType: BuildingSlotType.production,
        profession: 'miner',
        produces: [{ resource: 'ore', amount: 6 }],
        consumes: [{ resource: 'energy', amount: 4 }],
        storage: []
    },
    'smelter-s': {
        name: 'Small Smelter',
        cost: [{ resource: 'iron', amount: 180 }],
        slotType: BuildingSlotType.production,
        profession: 'refiner',
        produces: [{ resource: 'iron', amount: 0.5 }],
        consumes: [{ resource: 'ore', amount: 1 }, { resource: 'energy', amount: 1.5 }],
        storage: []
    },
    'smelter': {
        name: 'Smelter',
        cost: [{ resource: 'iron', amount: 360 }],
        slotType: BuildingSlotType.production,
        profession: 'refiner',
        produces: [{ resource: 'iron', amount: 1.2 }],
        consumes: [{ resource: 'ore', amount: 2.5 }, { resource: 'energy', amount: 3 }],
        storage: []
    },
    'smelter-l': {
        name: 'Large Smelter',
        cost: [{ resource: 'iron', amount: 720 }],
        slotType: BuildingSlotType.production,
        profession: 'refiner',
        produces: [{ resource: 'iron', amount: 3 }],
        consumes: [{ resource: 'ore', amount: 6 }, { resource: 'energy', amount: 6 }],
        storage: []
    },
    'warehouse-s': {
        name: 'Small Warehouse',
        cost: [{ resource: 'iron', amount: 120 }],
        slotType: BuildingSlotType.storage,
        profession: 'logistician',
        produces: [],
        consumes: [],
        storage: [{ resource: 'ore', amount: 500 }, { resource: 'iron', amount: 500 }, { resource: 'ammo', amount: 500 }],
        operatorless: true
    },
    'warehouse': {
        name: 'Warehouse',
        cost: [{ resource: 'iron', amount: 240 }],
        slotType: BuildingSlotType.storage,
        profession: 'logistician',
        produces: [],
        consumes: [],
        storage: [{ resource: 'ore', amount: 1200 }, { resource: 'iron', amount: 1200 }, { resource: 'ammo', amount: 1200 }],
        operatorless: true
    },
    'warehouse-l': {
        name: 'Large Warehouse',
        cost: [{ resource: 'iron', amount: 480 }],
        slotType: BuildingSlotType.storage,
        profession: 'logistician',
        produces: [],
        consumes: [],
        storage: [{ resource: 'ore', amount: 3000 }, { resource: 'iron', amount: 3000 }, { resource: 'ammo', amount: 3000 }],
        operatorless: true
    },
    
    // Science
    'lab-s': {
        name: 'Small Lab',
        cost: [{ resource: 'iron', amount: 200 }],
        slotType: BuildingSlotType.science,
        profession: 'scientist',
        consumes: [{ resource: 'energy', amount: 1.5 }],
        produces: [{ resource: 'science', amount: 1 }],
        storage: []
    },
    'lab': {
        name: 'Lab',
        cost: [{ resource: 'iron', amount: 400 }],
        slotType: BuildingSlotType.science,
        profession: 'scientist',
        consumes: [{ resource: 'energy', amount: 3 }],
        produces: [{ resource: 'science', amount: 2.5 }],
        storage: []
    },
    'lab-l': {
        name: 'Large Lab',
        cost: [{ resource: 'iron', amount: 800 }],
        slotType: BuildingSlotType.science,
        profession: 'scientist',
        consumes: [{ resource: 'energy', amount: 6 }],
        produces: [{ resource: 'science', amount: 6 }],
        storage: []
    },
    'archive-s': {
        name: 'Small Archive',
        cost: [{ resource: 'iron', amount: 150 }],
        slotType: BuildingSlotType.storage,
        profession: 'archivist',
        produces: [],
        consumes: [],
        storage: [{ resource: 'science', amount: 500 }],
        operatorless: true
    },
    'archive': {
        name: 'Archive',
        cost: [{ resource: 'iron', amount: 300 }],
        slotType: BuildingSlotType.storage,
        profession: 'archivist',
        produces: [],
        consumes: [],
        storage: [{ resource: 'science', amount: 1200 }],
        operatorless: true
    },
    'archive-l': {
        name: 'Large Archive',
        cost: [{ resource: 'iron', amount: 600 }],
        slotType: BuildingSlotType.storage,
        profession: 'archivist',
        produces: [],
        consumes: [],
        storage: [{ resource: 'science', amount: 3000 }],
        operatorless: true
    },

    // Gold
    'vault-s': {
        name: 'Small Vault',
        cost: [{ resource: 'iron', amount: 150 }],
        slotType: BuildingSlotType.storage,
        profession: 'logistician',
        produces: [],
        consumes: [],
        storage: [{ resource: 'gold', amount: 5000 }],
        operatorless: true
    },
    'vault': {
        name: 'Vault',
        cost: [{ resource: 'iron', amount: 300 }],
        slotType: BuildingSlotType.storage,
        profession: 'logistician',
        produces: [],
        consumes: [],
        storage: [{ resource: 'gold', amount: 12000 }],
        operatorless: true
    },
    'vault-l': {
        name: 'Large Vault',
        cost: [{ resource: 'iron', amount: 600 }],
        slotType: BuildingSlotType.storage,
        profession: 'logistician',
        produces: [],
        consumes: [],
        storage: [{ resource: 'gold', amount: 30000 }],
        operatorless: true
    },
    
    // Coal & Power
    'pit-s': {
        name: 'Small Coal Pit',
        cost: [{ resource: 'iron', amount: 100 }],
        slotType: BuildingSlotType.production,
        profession: 'miner',
        produces: [{ resource: 'coal', amount: 1 }],
        consumes: [{ resource: 'energy', amount: 0.5 }],
        storage: []
    },
    'pit': {
        name: 'Coal Pit',
        cost: [{ resource: 'iron', amount: 200 }],
        slotType: BuildingSlotType.production,
        profession: 'miner',
        produces: [{ resource: 'coal', amount: 2.5 }],
        consumes: [{ resource: 'energy', amount: 1 }],
        storage: []
    },
    'pit-l': {
        name: 'Large Coal Pit',
        cost: [{ resource: 'iron', amount: 400 }],
        slotType: BuildingSlotType.production,
        profession: 'miner',
        produces: [{ resource: 'coal', amount: 6 }],
        consumes: [{ resource: 'energy', amount: 2 }],
        storage: []
    },
    'power-plant-s': {
        name: 'Small Power Plant',
        cost: [{ resource: 'iron', amount: 180 }],
        slotType: BuildingSlotType.production,
        profession: 'technician',
        produces: [{ resource: 'energy', amount: 3 }],
        consumes: [{ resource: 'coal', amount: 1 }],
        storage: []
    },
    'power-plant': {
        name: 'Power Plant',
        cost: [{ resource: 'iron', amount: 360 }],
        slotType: BuildingSlotType.production,
        profession: 'technician',
        produces: [{ resource: 'energy', amount: 7 }],
        consumes: [{ resource: 'coal', amount: 2 }],
        storage: []
    },
    'power-plant-l': {
        name: 'Large Power Plant',
        cost: [{ resource: 'iron', amount: 720 }],
        slotType: BuildingSlotType.production,
        profession: 'technician',
        produces: [{ resource: 'energy', amount: 16 }],
        consumes: [{ resource: 'coal', amount: 4 }],
        storage: []
    },
}; 