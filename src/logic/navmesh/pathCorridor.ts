import { Navmesh } from "./Navmesh";
import { Point2 } from "../core/math";
import { getPolygonFromPoint, testPointInsidePolygon } from "./NavUtils";
import { GameState } from "../GameState";
import { PriorityQueue } from "./priorityQueue";
import { sceneState, ACRED } from "../drawing/SceneState";

// Reusable priority queue instance with persistent pool
const sharedOpenSet = new PriorityQueue();

export function findCorridor(
    navmesh: Navmesh, 
    startPoint: Point2, 
    endPoint: Point2, 
    startPolyHint?: number, 
    endPolyHint?: number
): number[] | null {
    const startPoly = startPolyHint !== undefined ? startPolyHint : getPolygonFromPoint(navmesh, startPoint);
    const endPoly = endPolyHint !== undefined ? endPolyHint : getPolygonFromPoint(navmesh, endPoint);

    if (startPoly === -1 || endPoly === -1) {
        return null;
    }

    // If start and end are in the same polygon, return single-polygon corridor
    if (startPoly === endPoly) {
        return [startPoly];
    }

    // A* algorithm with polygon-specific calculations
    const openSet = sharedOpenSet; // Use the shared instance
    openSet.clear(); // Clear any previous state while preserving the pool
    const cameFrom = new Map<number, number>();
    const gScore = new Map<number, number>();
    const fScore = new Map<number, number>();

    openSet.enqueue(startPoly, 0);
    gScore.set(startPoly, 0);
    
    // Inline heuristic calculation for start polygon
    const startHeuristicDx = navmesh.poly_centroids[startPoly * 2] - navmesh.poly_centroids[endPoly * 2];
    const startHeuristicDy = navmesh.poly_centroids[startPoly * 2 + 1] - navmesh.poly_centroids[endPoly * 2 + 1];
    const startHeuristic = Math.sqrt(startHeuristicDx * startHeuristicDx + startHeuristicDy * startHeuristicDy);
    fScore.set(startPoly, startHeuristic);

    let iterations = 0;
    while (!openSet.isEmpty()) {
        iterations++;
        if (iterations > 100000) { // Safety break for performance
            return null;
        }
        const current = openSet.dequeue();

        if (current === undefined) {
            break;
        }

        if (fScore.get(current) === Infinity) {
            continue;
        }

        // const polygonVertices: Point2[] = [];
        // const polyVertsStart = navmesh.polygons[current];
        // const polyVertsEnd = navmesh.polygons[current + 1];
        // for (let i = polyVertsStart; i < polyVertsEnd; i++) {
        //     const vertIndex = navmesh.poly_verts[i];
        //     polygonVertices.push({
        //         x: navmesh.vertices[vertIndex * 2],
        //         y: navmesh.vertices[vertIndex * 2 + 1],
        //     });
        // }
        // sceneState.addDebugArea(polygonVertices, ACRED);



        // Check if we reached the end polygon
        if (current === endPoly) {
            const path: number[] = [current];
            let temp = current;
            while (cameFrom.has(temp)) {
                temp = cameFrom.get(temp)!;
                path.push(temp);
            }
            return path.reverse();
        }

        fScore.set(current, Infinity);

        // Get neighbors of current polygon
        const polyVertStart = navmesh.polygons[current];
        const polyVertEnd = navmesh.polygons[current + 1];
        const polyVertCount = polyVertEnd - polyVertStart;

        for (let i = 0; i < polyVertCount; i++) {
            const neighborIdx = polyVertStart + i;
            const neighbor = navmesh.poly_neighbors[neighborIdx];
            
            // Skip invalid neighbors or non-walkable polygons.
            // The end polygon must always be a valid destination.
            if (neighbor === -1 || (neighbor !== endPoly && neighbor >= navmesh.walkable_polygon_count)) {
                continue;
            }

            // Inline getCost calculation using polygon centroids
            const costDx = navmesh.poly_centroids[current * 2] - navmesh.poly_centroids[neighbor * 2];
            const costDy = navmesh.poly_centroids[current * 2 + 1] - navmesh.poly_centroids[neighbor * 2 + 1];
            const cost = Math.sqrt(costDx * costDx + costDy * costDy);
            
            const tentativeGScore = gScore.get(current)! + cost;

            if (!gScore.has(neighbor) || tentativeGScore < gScore.get(neighbor)!) {
                cameFrom.set(neighbor, current);
                gScore.set(neighbor, tentativeGScore);
                
                // Inline heuristic calculation
                const heuristicDx = navmesh.poly_centroids[neighbor * 2] - navmesh.poly_centroids[endPoly * 2];
                const heuristicDy = navmesh.poly_centroids[neighbor * 2 + 1] - navmesh.poly_centroids[endPoly * 2 + 1];
                const heuristic = Math.sqrt(heuristicDx * heuristicDx + heuristicDy * heuristicDy);
                
                const fScoreValue = tentativeGScore + heuristic;
                fScore.set(neighbor, fScoreValue);
                openSet.enqueue(neighbor, fScoreValue);
            }
        }
    }

    return null;
}
