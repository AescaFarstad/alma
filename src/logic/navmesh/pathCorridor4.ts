import { Navmesh } from "./Navmesh";
import { distance, distance_sq, dot, normalize_, Point2, set, isToRight } from "../core/math";
import { getPolygonFromPoint, testPointInsidePolygon, getTriangleFromPoint, testPointInsideTriangle } from "./NavUtils";
import { GameState } from "../GameState";
import { PriorityQueue } from "./priorityQueue";
import { sceneState, ACRED, ACBLUE } from "../drawing/SceneState";
import { findCorners } from "./pathCorners";
import { findCorridor } from "./pathCorridor";

const sharedpQueue = new PriorityQueue();

/*
The output of this algorithm is a sequence of corners (Point2), not a corridor.

Phase 1:
Routine:
    we are at point A. (at start the starting point is pointA)
    raycast to the endPoint
    if a wall is hit, place a corner CORNER_OFFSET before it, mark this corner as extra
    chose the vertex nearest to the endPoint and offset it like in path patching
    this is the new point A, start over until the endpoint is visible
Phase 2:
try to cut the temporary corner:
    raycast from the corner before temporary one (call is fromCorner) to to corner after it (call is afterCorner)
    if visible -> cut the corner
    if not, we have a wall.
        Choose the vertex closest to the afterCorner, 
        offset it, 
        add it to the path, 
        this is our new fromCorner, start over
*/

let v = Point2(0, 0);
let startToEnd = Point2(0, 0);
/*
export function findPath(
    navmesh: Navmesh,
    FREE_WIDTH :number,
    STRAY_MULT: number,
    startPoint: Point2, 
    endPoint: Point2, 
    startPolyHint?: number, 
    endPolyHint?: number
): Point2[] | null {
    const startTri = getTriangleFromPoint(navmesh, startPoint);
    const endTri = getTriangleFromPoint(navmesh, endPoint);

    if (startTri === -1 || endTri === -1) {
        console.error(`findCorridor3: FAILED - invalid start or end triangle`);
        return null;
    }

    const startPoly = navmesh.triangle_to_polygon[startTri];
    const endPoly = navmesh.triangle_to_polygon[endTri];

    if (startPoly === -1 || endPoly === -1) {
        console.error(`findCorridor3: FAILED - invalid polygons`);
        return null;
    }
    
    if (startPoly === endPoly) {
        if (startPoly >= navmesh.walkable_polygon_count) return null;
        return [startPoly];
    }
}
*/