import type { LibItem } from './definitions/LibDefinitions';

/**
 * The Lib class is a container for all the game's static data definitions.
 * It is responsible for loading data and making it accessible.
 * In this basic implementation, it's mostly a placeholder.
 */
export class Lib {
    public items: Map<string, LibItem> = new Map<string, LibItem>();
    
    public isLoaded: boolean = false;

    constructor() {
        this.loadAllDefinitions();
    }

    private loadAllDefinitions(): void {
        if (this.isLoaded) {
            return;
        }

        // In a real game, you would load data from files here.
        // For example:
        // import itemsData from '../data/items';
        // this.items = this._processDataDefinitions<LibItem>(itemsData);

        this.isLoaded = true;
        console.log("Lib loaded.");
    }

    private _processDataDefinitions<T extends LibItem>(data: Record<string, any>): Map<string, T> {
        const items = new Map<string, T>();
        for (const key in data) {
            if (Object.prototype.hasOwnProperty.call(data, key)) {
                const itemData = data[key];
                const item: T = { ...itemData, id: key } as T;
                items.set(key, item);
            }
        }
        return items;
    }
} 