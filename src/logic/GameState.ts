import { HypotheticalState } from "./core/Hypothetical";
import { Connections } from "./core/Stat";
import { Invoker } from "./core/behTree/Invoker";
import { Lib } from "./lib/Lib";
import RBush from "rbush";

export class GameState { // This is a POD class. No functions allowed.
    public lib : Lib;
    public invoker: Invoker;
    public gameTime: number;
    public nextEventId: number;
    public uiState: {
        lastProcessedEventId: number;
    };
    public buildingSpatialIndex: RBush<any>;

    public connections: Connections;

    public buildingsById: Record<string, any>;

    public hypothetical: HypotheticalState | null = null;

    constructor() {
        this.lib = new Lib();
        this.invoker = new Invoker();
        this.gameTime = 0;
        this.nextEventId = 0;
        this.uiState = {
            lastProcessedEventId: -1,
        };
        this.buildingSpatialIndex = new RBush();
        this.connections = new Connections();
        this.buildingsById = {};
    }
}