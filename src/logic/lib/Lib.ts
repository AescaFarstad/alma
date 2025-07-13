import { BuildingModuleLib } from './BuildingModuleLib';

/**
 * The Lib class is a container for all the game's static data definitions.
 * It is responsible for loading data and making it accessible.
 */
export class Lib {
    public buildingModules: BuildingModuleLib;
    
    public isLoaded: boolean = false;

    constructor() {
        this.buildingModules = new BuildingModuleLib();
        this.loadAllDefinitions();
    }

    private loadAllDefinitions(): void {
        if (this.isLoaded) {
            return;
        }

        // The constructor of BuildingModuleLib already loads the data.
        // In a larger app, we would initialize other libraries here.

        this.isLoaded = true;
        console.log("Lib loaded.");
    }
} 