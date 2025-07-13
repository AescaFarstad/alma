import { HypotheticalState } from "./core/Hypothetical";
import { IndependentStat, Parameter, Connections } from "./core/Stat";
import { Invoker } from "./core/behTree/Invoker";
import { Point2 } from "./core/math";
import { Lib } from "./lib/Lib";
import RBush from "rbush";
import type { UIBuildingInfo, UIPlayerInfo } from "./UIStateManager";

export class GameState { // This is a POD class. No functions allowed.
    public lib : Lib;
    public invoker: Invoker;
    public gameTime: number;
    public nextUnitId: number;
    public nextEventId: number;
    public uiState: {
        currentPlayerId: string | null;
        selectedBuildingId: string | null;
        selectedBuilding: UIBuildingInfo | null;
        currentPlayer: UIPlayerInfo | null;
        lastProcessedEventId: number;
        mapBuildingColorChanges: BuildingOwnershipChange[];
    };
    public buildingSpatialIndex: RBush<any>;

    public connections: Connections;

    public buildingsById: Record<string, Building>;
    public buildingsByMapId: Record<number, Building>;

    public unitsById: Record<string, Unit>;

    public players: Record<string, Player>;
    public assaults: Record<string, Assault>;
    public hypothetical: HypotheticalState | null = null;
    public eventLog: { id: number; event: GameEvent }[];

    constructor() {
        this.lib = new Lib();
        this.invoker = new Invoker();
        this.gameTime = 0;
        this.nextUnitId = 0;
        this.nextEventId = 0;
        this.uiState = {
            currentPlayerId: null,
            selectedBuildingId: null,
            selectedBuilding: null,
            currentPlayer: null,
            lastProcessedEventId: -1,
            mapBuildingColorChanges: [],
        };
        this.buildingSpatialIndex = new RBush();
        this.connections = new Connections();
        this.buildingsById = {};
        this.buildingsByMapId = {};
        this.unitsById = {};
        this.players = {};
        this.assaults = {};
        this.eventLog = [];
    }
} 


export type BuildingOwnershipChange = {
    mapId: number;
    team: number;
};

export type GameEvent = {
    type: 'building:ownership';
    payload: BuildingOwnershipChange;
};

export type Cost = { resource: string, amount: number };

export enum BuildingSlotType {
    housing = 1,
    production = 2,
    science = 4,
    storage = 8
}

export interface Player {
    name: string;
    team: number;
    resources: Record<string, Resource>; // Keyed by resource name
    foodConsumption: Parameter;
    housing: Parameter;
    units: IndependentStat;
}

export interface Resource {
    name: string;
    current: IndependentStat;
    income: Parameter;
    max: Parameter;
}

export interface Building {
    id: string; // Unique game ID
    mapId: number; // Same as map feature ID
    originalMapId?: string; // Original ID from the GeoJSON, e.g., "w12345"
    team: number;
    center: Point2;
    boundingRadius: number;
    floors: number;
    floorSize: number;
    slots: Array<BuildingSlot>;
    outputs: Array<GameStat>;
    disabledUntil: number;
}

export interface BuildingSlot {
    type: number;
    occupant: string; // Unit ID
    content: string;  // BuildingModule ID
}

export interface Unit {
    id: string; // Unique game ID
    pos: Point2;
    team: number;
    occupies: string; // Building ID if garrisoned for defense, else -1
    profession: string;
}

export interface Soldier extends Unit {
    profession: 'soldier';
    hp: number;
    maxHp: number;
    armor: number;
    attackAt: number;
    damage: number;
    attackSpeed: number;
    range: number;
}

export interface Assault {
    buildingId: string;
    defenders: Array<string>; // Unit IDs
    attackers: Array<string>; // Unit IDs
}

export interface GameStat {
    resource: string; // The resource name (e.g., 'food', 'energy')
    income: IndependentStat; // A live stat object representing the building's total output for this resource.
    isStorage: boolean; // If true, this stat affects the resource's max capacity, not its income.
}