import type { Cost } from '../GameState';
import { BuildingSlotType } from '../GameState';
import { buildingModulesData } from './definitions/buildingModules';

export interface ResourceModifier {
    resource: string;
    amount: number;
}

export class BuildingModule {
    id: string = '';
    name: string = '';
    cost: Cost[] = [];
    slotType: BuildingSlotType = BuildingSlotType.production;
    profession: string = '';
    produces: ResourceModifier[] = [];
    consumes: ResourceModifier[] = [];
    storage: ResourceModifier[] = [];
    operatorless?: boolean;
}

export class BuildingModuleLib {
    public items = new Map<string, BuildingModule>();

    constructor() {
        this.loadBuildingModules();
    }

    private loadBuildingModules(): void {
        for (const id in buildingModulesData) {
            let data = buildingModulesData[id] as BuildingModule;
            data.id = id;
            this.items.set(id, data);
        }
    }
} 