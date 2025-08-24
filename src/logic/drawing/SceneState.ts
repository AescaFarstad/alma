import { reactive } from "vue";
import { Point2 } from "../core/math";
import { MouseCoordinates } from "../../types";
import { CircleStyle, LineStyle, PolyStyle } from "./PrimitiveState";

export const ACRED = 'red';
export const ACGREEN = 'green';
export const ACBLUE = 'blue';
export const ACYELLOW = 'yellow';
export const ACMAGENTA = 'magenta';
export const ACCYAN = 'cyan';
export const ACORANGE = 'orange';
export const ACPURPLE = 'purple';
export const ACBROWN = 'brown';
export const ACBLACK = 'black';
export const ACWHITE = 'white';
export const ACGRAY = 'gray';
export const ACEMERALD = 'emerald';
export const ACINDIGO = 'indigo';
export const ACPINK = 'pink';

export const DEBUG_COLORS = [ACRED, ACGREEN, ACBLUE, ACYELLOW, ACMAGENTA, ACCYAN, ACORANGE,
    ACPURPLE, ACBROWN, ACBLACK, ACWHITE, ACGRAY, ACEMERALD, ACINDIGO, ACPINK];

const colorMap: Record<string, number> = {
    [ACRED]: 0xFF0000,
    [ACGREEN]: 0x00FF00,
    [ACBLUE]: 0x3333FF,
    [ACYELLOW]: 0xFFFF00,
    [ACMAGENTA]: 0xFF00FF,
    [ACCYAN]: 0x00FFFF,
    [ACORANGE]: 0xFF9900,
    [ACPURPLE]: 0x800080,
    [ACBROWN]: 0x994400,
    [ACBLACK]: 0x000000,
    [ACWHITE]: 0xFFFFFF,
    [ACGRAY]: 0x808080,
    [ACEMERALD]: 0x50C878,
    [ACINDIGO]: 0x000088,
    [ACPINK]: 0xFFC0CB,
};

export const debugFillStyles: Record<string, CircleStyle> = {} as any;
export const debugStrokeStyles: Record<string, LineStyle> = {} as any;
export const debugTransparentStyles: Record<string, PolyStyle> = {} as any;

for (const color of DEBUG_COLORS) {
    const hexColor = colorMap[color];
    if (hexColor !== undefined) {
        debugFillStyles[color] = { fillStyle: { color: hexColor, alpha: 1 } };
        debugStrokeStyles[color] = { color: hexColor, alpha: 1, width: 0.25 };
        debugTransparentStyles[color] = { fillStyle: { color: hexColor, alpha: 0.3 } };
    }
}


export class SceneState {
    public selectedBuildingIds: Set<number> = new Set();
    public selectedPointMarkIds: Set<number> = new Set();
    public simplifiedGeometries: Map<number, Point2[]> = new Map();
    public measurementLine: { start: MouseCoordinates, end: MouseCoordinates } | null = null;
    public corridors: Map<string, Corridor> = new Map();
    public paths: Map<string, Path> = new Map();
    public isDirty = true;

    public debugPolygons: Point2[][] = [];
    public debugPoints: Record<string, Point2[]> = makeDebugColorRecord(() => []);
    public debugLines: Record<string, DebugLine[]> = makeDebugColorRecord(() => []);
    public debugCircles: Record<string, DebugCircle[]> = makeDebugColorRecord(() => []);
    public debugXs: Record<string, DebugX[]> = makeDebugColorRecord(() => []);
    public debugArrows: Record<string, DebugArrow[]> = makeDebugColorRecord(() => []);
    public debugAreas: Record<string, Point2[][]> = makeDebugColorRecord(() => []);
    public debugTexts: Record<string, DebugText[]> = makeDebugColorRecord(() => []);
    public debugNavmeshTriangles: Record<string, DebugNavmeshTriangle[]> = makeDebugColorRecord(() => []);

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

    public selectBuilding(id: number) {
        if (!this.selectedBuildingIds.has(id)) {
            this.selectedBuildingIds.add(id);
            this.isDirty = true;
        }
    }

    public deselectBuilding(id: number) {
        if (this.selectedBuildingIds.delete(id)) {
            this.simplifiedGeometries.delete(id);
            this.isDirty = true;
        }
    }

    public isBuildingSelected(id: number): boolean {
        return this.selectedBuildingIds.has(id);
    }

    public selectPointMark(id: number) {
        if (!this.selectedPointMarkIds.has(id)) {
            this.selectedPointMarkIds.add(id);
            this.isDirty = true;
        }
    }

    public deselectPointMark(id: number) {
        if (this.selectedPointMarkIds.delete(id)) {
            this.isDirty = true;
        }
    }

    public isPointMarkSelected(id: number): boolean {
        return this.selectedPointMarkIds.has(id);
    }

    public clearSelectedPointMarks() {
        if (this.selectedPointMarkIds.size > 0) {
            this.selectedPointMarkIds.clear();
            this.isDirty = true;
        }
    }

    public clearSelectedBuildings() {
        if (this.selectedBuildingIds.size > 0) {
            this.selectedBuildingIds.clear();
            this.simplifiedGeometries.clear();
            this.isDirty = true;
        }
        this.clearSelectedPointMarks();
    }

    public setSelectedBuildings(ids: number[]) {
        this.selectedBuildingIds.clear();
        this.simplifiedGeometries.clear();
        for (const id of ids) {
            this.selectedBuildingIds.add(id);
        }
        this.isDirty = true;
    }

    public addSimplifiedBuilding(id: number, geometry: Point2[]) {
        if (!geometry || !Array.isArray(geometry)) {
            console.warn(`[SceneState] Attempted to add simplified building ${id} with invalid geometry (not an array).`, geometry);
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
            console.warn(`[SceneState] Attempted to add simplified building ${id} with invalid points. Original geometry:`, JSON.parse(JSON.stringify(geometry)));
            const validGeometry = geometry.filter(p => 
                p && 
                typeof p.x === 'number' && 
                typeof p.y === 'number' && 
                !isNaN(p.x) && 
                !isNaN(p.y)
            );
            this.simplifiedGeometries.set(id, validGeometry);
        } else {
            this.simplifiedGeometries.set(id, geometry);
        }
        this.isDirty = true;
    }

    public clearSimplifiedGeometries() {
        if (this.simplifiedGeometries.size > 0) {
            this.simplifiedGeometries.clear();
            this.isDirty = true;
        }
    }

    public addCorridor(id: string, triangleIndices: number[], startPoint: Point2, endPoint: Point2) {
        this.corridors.set(id, { id, triangleIndices, startPoint, endPoint });
        this.isDirty = true;
    }

    public removeCorridor(id: string) {
        if (this.corridors.delete(id)) {
            this.isDirty = true;
        }
    }

    public clearCorridors() {
        if (this.corridors.size > 0) {
            this.corridors.clear();
            this.isDirty = true;
        }
    }

    public getCorridor(id: string): Corridor | undefined {
        return this.corridors.get(id);
    }

    public getAllCorridors(): Corridor[] {
        return Array.from(this.corridors.values());
    }

    public addPath(id: string, corners: Point2[], startPoint: Point2, endPoint: Point2) {
        // Calculate total path length from corners
        let totalLength = 0;
        for (let i = 0; i < corners.length - 1; i++) {
            const dx = corners[i + 1].x - corners[i].x;
            const dy = corners[i + 1].y - corners[i].y;
            totalLength += Math.sqrt(dx * dx + dy * dy);
        }
        
        this.paths.set(id, { id, corners, startPoint, endPoint, totalLength });
        this.isDirty = true;
    }

    public removePath(id: string) {
        if (this.paths.delete(id)) {
            this.isDirty = true;
        }
    }

    public clearPaths() {
        if (this.paths.size > 0) {
            this.paths.clear();
            this.isDirty = true;
        }
    }

    public getPath(id: string): Path | undefined {
        return this.paths.get(id);
    }

    public getAllPaths(): Path[] {
        return Array.from(this.paths.values());
    }

    public addDebugPolygon(polygon: Point2[]) {
        this.debugPolygons.push(polygon);
        this.isDirty = true;
    }

    public addDebugPoint(point: Point2, color: string) {
        this.debugPoints[color].push(point);
        this.isDirty = true;
    }

    public addDebugLine(start: Point2, end: Point2, color: string) {
        this.debugLines[color].push({ start, end });
        this.isDirty = true;
    }

    public addDebugCircle(center: Point2, color: string) {
        this.debugCircles[color].push({ center });
        this.isDirty = true;
    }

    public addDebugX(center: Point2, color: string) {
        this.debugXs[color].push({ center });
        this.isDirty = true;
    }

    public addDebugArrow(start: Point2, end: Point2, color: string) {
        this.debugArrows[color].push({ start, end });
        this.isDirty = true;
    }

    public addDebugArea(polygon: Point2[], color: string) {
        this.debugAreas[color].push(polygon);
        this.isDirty = true;
    }

    public addDebugText(position: Point2, text: string, color: string) {
        this.debugTexts[color].push({ position, text });
        this.isDirty = true;
    }

    public addDebugNavmeshTriangle(index: number, color: string, text?: string) {
        this.debugNavmeshTriangles[color].push({ index, text });
        this.isDirty = true;
    }

    public clearDebugVisuals() {
        console.log("clear debug")
        const needsClear = this.debugPolygons.length > 0 ||
            Object.values(this.debugPoints).some(arr => arr.length > 0) ||
            Object.values(this.debugLines).some(arr => arr.length > 0) ||
            Object.values(this.debugCircles).some(arr => arr.length > 0) ||
            Object.values(this.debugXs).some(arr => arr.length > 0) ||
            Object.values(this.debugArrows).some(arr => arr.length > 0) ||
            Object.values(this.debugAreas).some(arr => arr.length > 0) ||
            Object.values(this.debugTexts).some(arr => arr.length > 0) ||
            Object.values(this.debugNavmeshTriangles).some(arr => arr.length > 0);

        if (needsClear) {
            this.debugPolygons = [];
            this.debugPoints = makeDebugColorRecord(() => []);
            this.debugLines = makeDebugColorRecord(() => []);
            this.debugCircles = makeDebugColorRecord(() => []);
            this.debugXs = makeDebugColorRecord(() => []);
            this.debugArrows = makeDebugColorRecord(() => []);
            this.debugAreas = makeDebugColorRecord(() => []);
            this.debugTexts = makeDebugColorRecord(() => []);
            this.debugNavmeshTriangles = makeDebugColorRecord(() => []);
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



export type DebugLine = { start: Point2, end: Point2 };
export type DebugCircle = { center: Point2 };
export type DebugX = { center: Point2 };
export type DebugArrow = { start: Point2, end: Point2 };
export type DebugText = { position: Point2, text: string };
export type DebugNavmeshTriangle = { index: number, text?: string };

export type Corridor = {
    id: string;
    triangleIndices: number[];
    startPoint: Point2;
    endPoint: Point2;
};

export type Path = {
    id: string;
    corners: Point2[];
    startPoint: Point2;
    endPoint: Point2;
    totalLength: number;
};

function makeDebugColorRecord<T>(valueFactory: () => T): Record<string, T> {
    const record: Record<string, T> = {};
    for (const color of DEBUG_COLORS) {
        record[color] = valueFactory();
    }
    return record;
}