/**
 * Base interface for all input commands.
 * The `name` property is used to identify the command type.
 */
export interface CmdInput {
    name: string;
    playerId: string;
}

export interface CmdInstallModule extends CmdInput {
    name: 'CmdInstallModule';
    buildingId: string;
    slotIndex: number;
    moduleId: string;
}

export interface CmdAssignUnitToModule extends CmdInput {
    name: 'CmdAssignUnitToModule';
    playerId: string;
    unitId: string;
    buildingId: string;
    slotIndex: number;
}

export interface CmdHireUnit extends CmdInput {
    name: 'CmdHireUnit';
    playerId: string;
}

export interface CmdQueryBuilding extends CmdInput {
    name: 'CmdQueryBuilding';
    mapId: number;
} 