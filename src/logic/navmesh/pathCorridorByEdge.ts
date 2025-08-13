import { Navmesh } from "./Navmesh";
import { Point2 } from "../core/math";
// Remove aStar import since we're inlining it
import { GameState } from "../GameState";
import { getTriangleFromPoint } from "./pathCorridor";
// import { arePointsSuspiciouslyClose } from "../debug/AgentDebugUtils";
// import { ACINDIGO, sceneState } from "../drawing/SceneState";


// Simple priority queue for inlined A*
class PriorityQueue<T> {
    private elements: { element: T; priority: number }[] = [];

    enqueue(element: T, priority: number): void {
        this.elements.push({ element, priority });
        this.elements.sort((a, b) => a.priority - b.priority);
    }

    dequeue(): T | undefined {
        return this.elements.shift()?.element;
    }

    isEmpty(): boolean {
        return this.elements.length === 0;
    }

    clear(): void {
        this.elements.length = 0;
    }
}

// Helper to get midpoint of a shared edge between two triangles
function getSharedEdgeMidpoint(navmesh: Navmesh, tri1: number, tri2: number): Point2 | null {
    for (let i = 0; i < 3; i++) {
        if (navmesh.neighbors[tri1 * 3 + i] === tri2) {
            const p1Index = navmesh.triangles[tri1 * 3 + ((i + 1) % 3)];
            const p2Index = navmesh.triangles[tri1 * 3 + ((i + 2) % 3)];
            const p1 = { x: navmesh.points[p1Index * 2], y: navmesh.points[p1Index * 2 + 1] };
            const p2 = { x: navmesh.points[p2Index * 2], y: navmesh.points[p2Index * 2 + 1] };
            return { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
        }
    }
    return null; // Should not happen for adjacent triangles
}

export function findCorridorByEdge(
    navmesh: Navmesh,
    startPoint: Point2,
    endPoint: Point2,
    startTriHint?: number,
    endTriHint?: number,
    existingCorridor?: number[]
): number[] | null {
    const startTri = startTriHint !== undefined ? startTriHint : getTriangleFromPoint(navmesh, startPoint);
    const endTri = endTriHint !== undefined ? endTriHint : getTriangleFromPoint(navmesh, endPoint);

    if (startTri === -1 || endTri === -1) {
        return null;
    }

    if (startTri === endTri) {
        return [startTri];
    }
    
    // The nodes in our search are now pairs of triangles (from, to), representing an edge crossing.
    // We use a string representation "from-to" for map keys.
    const openSet = new PriorityQueue<string>();
    const cameFrom = new Map<string, string>(); // Stores the path of edge crossings
    const gScore = new Map<string, number>();

    // Initial step: from the virtual "start point" into the start triangle
    gScore.set(`-1-${startTri}`, 0);

    // To start the search, we add all edges of the start triangle to the open set
    for (let i = 0; i < 3; i++) {
        const neighbor = navmesh.neighbors[startTri * 3 + i];
        if (neighbor !== -1) {
            const edgeMidpoint = getSharedEdgeMidpoint(navmesh, startTri, neighbor);
            if (!edgeMidpoint) continue;

            const key = `${startTri}-${neighbor}`;
            const cost = Math.hypot(edgeMidpoint.x - startPoint.x, edgeMidpoint.y - startPoint.y);
            gScore.set(key, cost);

            const endCentroid = { x: navmesh.centroids[endTri * 2], y: navmesh.centroids[endTri * 2 + 1] };
            const heuristic = Math.hypot(endCentroid.x - edgeMidpoint.x, endCentroid.y - edgeMidpoint.y);
            
            openSet.enqueue(key, cost + heuristic);
            cameFrom.set(key, `-1-${startTri}`);
        }
    }

    while (!openSet.isEmpty()) {
        const currentKey = openSet.dequeue();
        if (currentKey === undefined) break;

        const [fromTriStr, currentTriStr] = currentKey.split('-');
        const fromTri = parseInt(fromTriStr, 10);
        const currentTri = parseInt(currentTriStr, 10);
        
        // Goal check
        if (currentTri === endTri) {
            // Reconstruct the path of triangles from the edge path
            const path: number[] = [endTri];
            let tempKey: string | undefined = currentKey;
            while (tempKey && cameFrom.has(tempKey)) {
                const [prevFrom, prevTo] = tempKey.split('-').map(Number);
                if (prevFrom !== -1 && !path.includes(prevFrom)) {
                    path.unshift(prevFrom);
                }
                tempKey = cameFrom.get(tempKey)!;
                 if (tempKey === `-1-${startTri}`) {
                    if (!path.includes(startTri)){
                        path.unshift(startTri);
                    }
                    break;
                }
            }
            return path;
        }

        const entryMidpoint = getSharedEdgeMidpoint(navmesh, fromTri, currentTri);
        if (!entryMidpoint) continue;

        // Explore neighbors
        for (let i = 0; i < 3; i++) {
            const neighbor = navmesh.neighbors[currentTri * 3 + i];
            // Don't go back to the triangle we just came from
            if (neighbor === -1 || neighbor === fromTri) {
                continue;
            }

            const exitMidpoint = getSharedEdgeMidpoint(navmesh, currentTri, neighbor);
            if (!exitMidpoint) continue;
            
            const cost = Math.hypot(exitMidpoint.x - entryMidpoint.x, exitMidpoint.y - entryMidpoint.y);
            const tentativeGScore = gScore.get(currentKey)! + cost;

            const neighborKey = `${currentTri}-${neighbor}`;
            if (!gScore.has(neighborKey) || tentativeGScore < gScore.get(neighborKey)!) {
                cameFrom.set(neighborKey, currentKey);
                gScore.set(neighborKey, tentativeGScore);
                
                // Heuristic from the exit edge to the end point for fScore
                 const endCentroid = { x: navmesh.centroids[endTri * 2], y: navmesh.centroids[endTri * 2 + 1] };
                const heuristic = Math.hypot(endCentroid.x - exitMidpoint.x, endCentroid.y - exitMidpoint.y);

                const fScoreValue = tentativeGScore + heuristic;
                openSet.enqueue(neighborKey, fScoreValue);
            }
        }
    }

    return null; // Path not found
}
