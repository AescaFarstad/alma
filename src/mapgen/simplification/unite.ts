import type { Point2 } from "../../logic/core/math";
import { clipperProvider } from "../../logic/ClipperProvider";
import * as clipperLib from 'js-angusj-clipper';
import { Path } from "js-angusj-clipper";
// import { sceneState } from "../drawing/SceneState";
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

    const result = offsetPaths ? offsetPaths.map((path: Path) => fromClipperPath(path, scale)) : [];
    return result;
}

async function unionPolygons(polygons: Point2[][], scale: number): Promise<Point2[][]> {
    if (polygons.length === 0) return [];

    const clipperLibInstance = await clipperProvider.getClipper();
    const scaledPolygons = polygons.map(p => toClipperPath(p, scale));

    const clipParams = {
        clipType: clipperLib.ClipType.Union,
        subjectInputs: scaledPolygons.map(p => ({ data: p, closed: true })),
        subjectFillType: clipperLib.PolyFillType.NonZero,
    };

    // Try clipToPaths first, fallback to clipToPolyTree for ANY environment that encounters open paths error
    try {
        const result = clipperLibInstance.clipToPaths(clipParams);
        return result ? result.map((path: Path) => fromClipperPath(path, scale)) : [];
    } catch (error: any) {
        if (error.message?.includes('open paths')) {
            try {
                // Use clipToPolyTree which handles open paths - works in BOTH environments
                const polyTreeResult = clipperLibInstance.clipToPolyTree(clipParams);
                
                if (polyTreeResult && polyTreeResult.polygons) {
                    // Convert PolyTree result back to paths
                    const paths: Point2[][] = [];
                    for (const polygon of polyTreeResult.polygons) {
                        if (polygon.contour && polygon.contour.length > 0) {
                            paths.push(fromClipperPath(polygon.contour, scale));
                        }
                    }
                    return paths;
                }
                
                return [];
            } catch (polyTreeError: any) {
                throw error; // Re-throw original error
            }
        } else {
            throw error; // Re-throw for different errors
        }
    }
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
    if (buildingsToUnite.length === 0) {
        return [];
    }

    const allPolygons: Point2[][] = [];
    
    for (const building of buildingsToUnite) {
        if (!building.polygon) {
            continue;
        }
        
        const inflated = await offsetPolygon(building.polygon, inflate, 1e7);
        if(inflated.length > 0) {
            allPolygons.push(...inflated);
        }
    }
    
    if (allPolygons.length === 0) {
        return [];
    }

    let unitedPolygons: Point2[][];
    try {
        unitedPolygons = await unionPolygons(allPolygons, 1e7);
    } catch (unionError) {
        throw unionError;
    }
    
    if (unitedPolygons.length === 0) {
        return [];
    }

    const allDeflatedPolygons: Point2[][] = [];
    for (const polygon of unitedPolygons) {
        const deflatedPolygons = await offsetPolygon(polygon, -inflate, 1e7);
        allDeflatedPolygons.push(...deflatedPolygons);
    }

    if (allDeflatedPolygons.length === 0 && unitedPolygons.length > 0) {
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

    return result;
} 