/**
 * The Lib class is a container for all the game's static data definitions.
 * It is responsible for loading data and making it accessible.
 */
export class Lib {
    public isLoaded: boolean = false;

    constructor() {
        this.loadAllDefinitions();
    }

    private loadAllDefinitions(): void {
        if (this.isLoaded) {
            return;
        }

        // In a larger app, we would initialize other libraries here.

        this.isLoaded = true;
        console.log("Lib loaded.");
    }
} 