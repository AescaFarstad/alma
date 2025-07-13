import { Cost } from "../GameState";

export class C {
    public static readonly FOOD = 'food';
    public static readonly ENERGY = 'energy';
    public static readonly GOLD = 'gold';
    public static readonly ORE = 'ore';
    public static readonly IRON = 'iron';
    public static readonly AMMO = 'ammo';
    public static readonly COAL = 'coal';
    public static readonly SCIENCE = 'science';
    public static readonly HOUSING = 'housing';

    public static readonly UNIT_COST = { resource: C.GOLD, amount: 50} as Cost
    public static readonly FOOD_PER_UNIT_PER_SECOND = 0.1;

    // === Building Constants ===
    public static readonly MAX_BUILDING_SLOTS = 10;

    // === Debug Constants ===
    public static readonly DEBUG_EFFECTS = false;
    public static readonly BEH_LOG_VERBOSE = false;
};