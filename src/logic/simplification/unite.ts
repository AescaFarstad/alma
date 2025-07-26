import type { Point2 } from "../core/math";
import { clipperProvider } from "../ClipperProvider";
import * as clipperLib from 'js-angusj-clipper';
import { Path } from "js-angusj-clipper";
import { sceneState } from "../drawing/SceneState";
import { fromClipperPath, isBuildingMostlyInsideBlob, toClipperPath } from "./geometryUtils";

async function offsetPolygon(polygon: Point2[], offset: number, scale: number): Promise<Point2[][]> {
    const clipper = await clipperProvider.getClipper();
    const scaledPolygon = toClipperPath(polygon, scale);

    const offsetPaths = clipper.offsetToPaths({
        delta: offset * scale,
        offsetInputs: [{
            data: scaledPolygon,
            joinType: clipperLib.JoinType.Square,
            endType: clipperLib.EndType.ClosedPolygon
        }]
    });

    return offsetPaths ? offsetPaths.map((path: Path) => fromClipperPath(path, scale)) : [];
}

async function unionPolygons(polygons: Point2[][], scale: number): Promise<Point2[][]> {
    if (polygons.length === 0) return [];

    const clipperLibInstance = await clipperProvider.getClipper();
    const scaledPolygons = polygons.map(p => toClipperPath(p, scale));

    const result = clipperLibInstance.clipToPaths({
        clipType: clipperLib.ClipType.Union,
        subjectInputs: scaledPolygons.map(p => ({ data: p })),
        subjectFillType: clipperLib.PolyFillType.NonZero,
    });

    return result ? result.map((path: Path) => fromClipperPath(path, scale)) : [];
}

export interface BuildingWithPolygon {
    id: string;
    polygon: Point2[];
}

export interface UnitedGroup {
    buildings: string[];
    geom: Point2[];
}

export async function uniteGeometries(buildingsToUnite: BuildingWithPolygon[], inflate: number): Promise<UnitedGroup[]> {
    sceneState.clearDebugVisuals();

    if (buildingsToUnite.length === 0) {
        return [];
    }

    const allPolygons: Point2[][] = [];
    
    for (const building of buildingsToUnite) {
        if (!building.polygon) {
            console.log(`[Unite] Skipping building ${building.id} due to no geometry.`);
            continue;
        }
        
        const inflated = await offsetPolygon(building.polygon, inflate, 1e7);
        if(inflated.length > 0) {
            allPolygons.push(...inflated);
        } else {
            console.log(`[Unite] Building ${building.id} failed to inflate.`);
            sceneState.addDebugPolygon(building.polygon);
        }
    }
    
    if (allPolygons.length === 0) {
        console.log(`[Unite] No polygons to union after inflation.`);
        return [];
    }

    const unitedPolygons = await unionPolygons(allPolygons, 1e7);
    if (unitedPolygons.length === 0) {
        console.log(`[Unite] Union resulted in 0 polygons.`);
        for (const p of allPolygons) {
            sceneState.addDebugPolygon(p);
        }
        return [];
    }
    
    const allDeflatedPolygons: Point2[][] = [];
    for (const polygon of unitedPolygons) {
        const deflatedPolygons = await offsetPolygon(polygon, -inflate, 1e7);
        allDeflatedPolygons.push(...deflatedPolygons);
    }

    if (allDeflatedPolygons.length === 0 && unitedPolygons.length > 0) {
        console.log(`[Unite] Deflation resulted in 0 polygons.`);
        for (const p of unitedPolygons) {
            sceneState.addDebugPolygon(p);
        }
        return [];
    }

    const clipper = await clipperProvider.getClipper();
    const result: UnitedGroup[] = [];
    const assignedBuildingIds = new Set<string>();

    for (const deflated of allDeflatedPolygons) {
        const cleanedDeflated = deflated.filter(p => p && p.x != null && p.y != null && !isNaN(p.x) && !isNaN(p.y));
        if (cleanedDeflated.length < 3) continue;

        const group: UnitedGroup = {
            geom: cleanedDeflated,
            buildings: []
        };
        const scaledPolygon = toClipperPath(cleanedDeflated, 1e7);
        
        for (const building of buildingsToUnite) {
            if (building.polygon && building.polygon.length > 0) {
                if (assignedBuildingIds.has(building.id)) continue;
                
                if (isBuildingMostlyInsideBlob(building.polygon, scaledPolygon, clipper, 1e7)) {
                    group.buildings.push(building.id);
                    assignedBuildingIds.add(building.id);
                }
            }
        }
        
        if(group.buildings.length > 0){
            result.push(group);
        }
    }

    const unassignedBuildings = buildingsToUnite.filter(b => !assignedBuildingIds.has(b.id));
    if (unassignedBuildings.length > 0) {
        console.warn(`[Unite] ${unassignedBuildings.length} buildings could not be matched to any blob.`);
        for (const building of unassignedBuildings) {
            console.warn(`  - Unmatched building ID: ${building.id}`);
        }
    }

    return result;
} 