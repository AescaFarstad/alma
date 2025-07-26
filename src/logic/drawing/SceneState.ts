import { reactive } from "vue";
import { Point2 } from "../core/math";
import { MouseCoordinates } from "../../types";

export const DEBUG_COLORS = [
    'red', 
    'green', 
    'blue', 
    'yellow', 
    'magenta', 
    'cyan', 
    'orange', 
    // 'purple', 
    'brown', 
    'black', 
    'white', 
    'gray',
    'emerald',
    'indigo',
    'pink'
];

export type DebugColor = typeof DEBUG_COLORS[number];

export const ACRED = 'red';
export const ACGREEN = 'green';
export const ACBLUE = 'blue';
export const ACYELLOW = 'yellow';
export const ACMAGENTA = 'magenta';
export const ACCYAN = 'cyan';
export const ACORANGE = 'orange';
export const ACBROWN = 'brown';
export const ACBLACK = 'black';
export const ACWHITE = 'white';
export const ACGRAY = 'gray';
export const ACEMERALD = 'emerald';
export const ACINDIGO = 'indigo';
export const ACPINK = 'pink';

export type DebugLine = { start: Point2, end: Point2 };
export type DebugCircle = { center: Point2 };
export type DebugX = { center: Point2 };
export type DebugArrow = { start: Point2, end: Point2 };

function makeDebugColorRecord<T>(valueFactory: () => T): Record<DebugColor, T> {
    const record: Record<string, T> = {};
    for (const color of DEBUG_COLORS) {
        record[color] = valueFactory();
    }
    return record as Record<DebugColor, T>;
}


export class SceneState {
    public selectedBuildingIds: Set<string> = new Set();
    public simplifiedGeometries: Map<string, Point2[]> = new Map();
    public measurementLine: { start: MouseCoordinates, end: MouseCoordinates } | null = null;
    public isDirty = true;

    public debugPolygons: Point2[][] = [];
    public debugPoints: Record<DebugColor, Point2[]> = makeDebugColorRecord(() => []);
    public debugLines: Record<DebugColor, DebugLine[]> = makeDebugColorRecord(() => []);
    public debugCircles: Record<DebugColor, DebugCircle[]> = makeDebugColorRecord(() => []);
    public debugXs: Record<DebugColor, DebugX[]> = makeDebugColorRecord(() => []);
    public debugArrows: Record<DebugColor, DebugArrow[]> = makeDebugColorRecord(() => []);

    public setMeasurementLine(start: MouseCoordinates, end: MouseCoordinates) {
        this.measurementLine = { start, end };
        this.isDirty = true;
    }

    public clearMeasurementLine() {
        if (this.measurementLine) {
            this.measurementLine = null;
            this.isDirty = true;
        }
    }

    public selectBuilding(mapId: string) {
        if (!this.selectedBuildingIds.has(mapId)) {
            this.selectedBuildingIds.add(mapId);
            this.isDirty = true;
        }
    }

    public deselectBuilding(mapId: string) {
        if (this.selectedBuildingIds.delete(mapId)) {
            this.simplifiedGeometries.delete(mapId);
            this.isDirty = true;
        }
    }

    public isBuildingSelected(mapId: string): boolean {
        return this.selectedBuildingIds.has(mapId);
    }

    public clearSelectedBuildings() {
        if (this.selectedBuildingIds.size > 0) {
            this.selectedBuildingIds.clear();
            this.simplifiedGeometries.clear();
            this.isDirty = true;
        }
    }

    public setSelectedBuildings(mapIds: string[]) {
        this.selectedBuildingIds.clear();
        this.simplifiedGeometries.clear();
        for (const mapId of mapIds) {
            this.selectedBuildingIds.add(mapId);
        }
        this.isDirty = true;
    }

    public addSimplifiedBuilding(mapId: string, geometry: Point2[]) {
        if (!geometry || !Array.isArray(geometry)) {
            console.warn(`[SceneState] Attempted to add simplified building ${mapId} with invalid geometry (not an array).`, geometry);
            return;
        }

        const hasInvalidPoint = geometry.some(p => 
            !p || 
            typeof p.x !== 'number' || 
            typeof p.y !== 'number' || 
            isNaN(p.x) || 
            isNaN(p.y)
        );

        if (hasInvalidPoint) {
            console.warn(`[SceneState] Attempted to add simplified building ${mapId} with invalid points. Original geometry:`, JSON.parse(JSON.stringify(geometry)));
            const validGeometry = geometry.filter(p => 
                p && 
                typeof p.x === 'number' && 
                typeof p.y === 'number' && 
                !isNaN(p.x) && 
                !isNaN(p.y)
            );
            this.simplifiedGeometries.set(mapId, validGeometry);
        } else {
            this.simplifiedGeometries.set(mapId, geometry);
        }
        this.isDirty = true;
    }

    public clearSimplifiedGeometries() {
        if (this.simplifiedGeometries.size > 0) {
            this.simplifiedGeometries.clear();
            this.isDirty = true;
        }
    }

    public addDebugPolygon(polygon: Point2[]) {
        this.debugPolygons.push(polygon);
        this.isDirty = true;
    }

    public addDebugPoint(point: Point2, color: DebugColor) {
        this.debugPoints[color].push(point);
        this.isDirty = true;
    }

    public addDebugLine(start: Point2, end: Point2, color: DebugColor) {
        this.debugLines[color].push({ start, end });
        this.isDirty = true;
    }

    public addDebugCircle(center: Point2, color: DebugColor) {
        this.debugCircles[color].push({ center });
        this.isDirty = true;
    }

    public addDebugX(center: Point2, color: DebugColor) {
        this.debugXs[color].push({ center });
        this.isDirty = true;
    }

    public addDebugArrow(start: Point2, end: Point2, color: DebugColor) {
        this.debugArrows[color].push({ start, end });
        this.isDirty = true;
    }

    public clearDebugVisuals() {
        console.log("clear debug")
        const needsClear = this.debugPolygons.length > 0 ||
            Object.values(this.debugPoints).some(arr => arr.length > 0) ||
            Object.values(this.debugLines).some(arr => arr.length > 0) ||
            Object.values(this.debugCircles).some(arr => arr.length > 0) ||
            Object.values(this.debugXs).some(arr => arr.length > 0) ||
            Object.values(this.debugArrows).some(arr => arr.length > 0);

        if (needsClear) {
            this.debugPolygons = [];
            this.debugPoints = makeDebugColorRecord(() => []);
            this.debugLines = makeDebugColorRecord(() => []);
            this.debugCircles = makeDebugColorRecord(() => []);
            this.debugXs = makeDebugColorRecord(() => []);
            this.debugArrows = makeDebugColorRecord(() => []);
            this.isDirty = true;
        }
    }
}

/**
 * A global singleton instance of SceneState.
 * IMPORTANT: This is intended for temporary, ad-hoc debugging purposes only.
 * Core application logic should not rely on this. Instead, SceneState should be
 * passed through proper dependency injection channels where needed.
 */
export const sceneState = reactive(new SceneState()); 