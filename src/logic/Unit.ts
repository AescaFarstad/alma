import { GameState, Unit } from "./GameState";

export class UnitLogic {
    public static createUnit(gs: GameState, unitData: Partial<Unit>): Unit {
        const id = `unit-${Object.keys(gs.unitsById).length}`;
        const unit: Unit = {
            id,
            pos: { x: 0, y: 0 },
            team: 0,
            occupies: '',
            profession: 'none',
            ...unitData,
        };
        gs.unitsById[id] = unit;
        return unit;
    }
} 