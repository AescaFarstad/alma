import type { Navmesh } from './navmesh/Navmesh';
import { Point2, isPointInTriangle, getLineSegmentIntersectionPoint, isToRight } from './core/math';
import { getTriangleFromPoint } from './navmesh/pathfinding';

export type RaycastHit = {
    p1: Point2;
    p2: Point2;
    intersectionPoint: Point2;
};

export type RaycastResult = {
    hit: RaycastHit | null;
    corridor: number[] | null;
};

const triPoints: [Point2, Point2, Point2] = [{x:0, y:0}, {x:0, y:0}, {x:0, y:0}];
/**
 * Given starting position and end position return the edge (v1, v2) the ray collides with (if any)
 * @returns {RaycastResult} - The edge of collision, and the corridor. If there's a clear line of sight, hit is null.
 */
export function raycast(
    navmesh: Navmesh,
    startPoint: Point2,
    endPoint: Point2,
    startTriIdx?: number,
): RaycastResult {
    const corridor = findPathCorridor(navmesh, startPoint, endPoint, startTriIdx);

    if (corridor === null) {
        return {hit: {p1:startPoint, p2:startPoint, intersectionPoint:startPoint}, corridor:null};
    }

    const lastTriIdx = corridor[corridor.length-1];
    getTrianglePoints(navmesh, lastTriIdx, triPoints);
    if(isPointInTriangle(endPoint, triPoints[0], triPoints[1], triPoints[2])) {
        return { hit: null, corridor };
    }
    
    // If corridor was found, but endpoint is not in last triangle, it means we hit a wall.
    // We need to find which wall we hit. We can check all edges of the last triangle in the corridor.
    for (let i = 0; i < 3; i++) {
        const p1 = triPoints[i];
        const p2 = triPoints[(i+1)%3];
        const intersectionPoint = getLineSegmentIntersectionPoint(startPoint, endPoint, p1, p2);
        if (intersectionPoint) {
            const neighbor = navmesh.neighbors[lastTriIdx * 3 + i];
            if (neighbor === -1) {
                return {hit: {p1, p2, intersectionPoint}, corridor};
            }
        }
    }

    // Fallback, should not be reached with correct logic in findPathCorridor
    return { hit: null, corridor }; 
}


/**
 * Given starting position and end position return bool
 */
export function hasLineOfSight(
    navmesh: Navmesh,
    startPoint: Point2,
    endPoint: Point2,
    startTriIdx?: number,
): boolean {
    return raycast(navmesh, startPoint, endPoint, startTriIdx).hit === null;
}

/**
 * Given starting position and end position return the corridor of triangles that we successfully passed
 */
export function findPathCorridor(
    navmesh: Navmesh,
    startPoint: Point2,
    endPoint: Point2,
    startTriIdx?: number,
): number[] | null {
    let currentTriIdx = startTriIdx ?? getTriangleFromPoint(navmesh, startPoint);

    if (currentTriIdx === -1) {
        return null; // Start point is not on navmesh
    }

    const corridor: number[] = [currentTriIdx];
    const MAX_ITERATIONS = 5000; // Safety break
    let previousTriIdx = -1;

    for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
        getTrianglePoints(navmesh, currentTriIdx, triPoints);

        if (isPointInTriangle(endPoint, triPoints[0], triPoints[1], triPoints[2])) {
            return corridor; // Success
        }

        let nextTriIdx = -1;
        
        if (previousTriIdx === -1) {
            // For the first triangle, we find the exit portal by identifying which
            // side of the ray each of the triangle's vertices lies on. The ray will
            // exit through the edge that is opposite the "odd-one-out" vertex.
            
            // Use original endpoint for orientation tests - normalization can distort geometry
            const c0 = isToRight(startPoint, endPoint, triPoints[0]);
            const c1 = isToRight(startPoint, endPoint, triPoints[1]);
            const c2 = isToRight(startPoint, endPoint, triPoints[2]);

            let exitEdgeIdx = -1;
            // The vertex that is on its own side of the ray is the "odd one out".
            // Based on whether it's left or right of the ray, we determine the exit edge.
            if (c0 !== c1 && c0 !== c2) { // triPoints[0] is the odd one out
                // If odd one out is to the right, exit is between it and next vertex.
                // If to the left, exit is between it and previous vertex.
                exitEdgeIdx = c0 ? 0 : 2;
            } else if (c1 !== c0 && c1 !== c2) { // triPoints[1] is the odd one out
                exitEdgeIdx = c1 ? 1 : 0;
            } else { // triPoints[2] is the odd one out (or all are same)
                exitEdgeIdx = c2 ? 2 : 1;
            }
            
            nextTriIdx = navmesh.neighbors[currentTriIdx * 3 + exitEdgeIdx];
            
            if (nextTriIdx === -1) {
                return corridor; // Hit a wall
            }
        } else {
            // After the first triangle, we can use a faster method.
            // We know the entry edge; the exit edge must be one of the other two.
            let entryEdgeIdx = -1;
            for (let i = 0; i < 3; i++) {
                if (navmesh.neighbors[currentTriIdx * 3 + i] === previousTriIdx) {
                    entryEdgeIdx = i;
                    break;
                }
            }

            if (entryEdgeIdx !== -1) {
                const p_entry2 = triPoints[(entryEdgeIdx + 1) % 3];
                const p_apex = triPoints[(entryEdgeIdx + 2) % 3];
                
                let exitEdgeIdx;
                // A simple orientation check (cross product) tells us which of the two
                // non-entry edges the ray will cross. This is much faster than
                // a full line segment intersection test.
                if (isToRight(startPoint, endPoint, p_apex) !== isToRight(startPoint, endPoint, p_entry2)) {
                    // Ray crosses the edge between p_entry2 and p_apex.
                    exitEdgeIdx = (entryEdgeIdx + 1) % 3;
                } else {
                    // Otherwise, it crosses the other edge (between p_apex and p_entry1).
                    exitEdgeIdx = (entryEdgeIdx + 2) % 3;
                }
                nextTriIdx = navmesh.neighbors[currentTriIdx * 3 + exitEdgeIdx];

                if (nextTriIdx === -1) {
                    return corridor; // Hit a wall
                }
            }
            // If entryEdgeIdx is -1, something is wrong, nextTriIdx remains -1 and we'll exit below.
        }

        if (nextTriIdx !== -1) {
            previousTriIdx = currentTriIdx;
            currentTriIdx = nextTriIdx;
            corridor.push(currentTriIdx);
        } else {
            // No valid exit found, e.g. ray ends in the middle of a triangle, but not at endPoint.
            return corridor;
        }
    }

    return corridor; // Exceeded max iterations
}


function getTrianglePoints(navmesh: Navmesh, triIdx: number, outPoints: [Point2, Point2, Point2]) {
    const triVertexStartIndex = triIdx * 3;
    const p1Index = navmesh.triangles[triVertexStartIndex];
    const p2Index = navmesh.triangles[triVertexStartIndex + 1];
    const p3Index = navmesh.triangles[triVertexStartIndex + 2];

    outPoints[0].x = navmesh.points[p1Index * 2];
    outPoints[0].y = navmesh.points[p1Index * 2 + 1];
    outPoints[1].x = navmesh.points[p2Index * 2];
    outPoints[1].y = navmesh.points[p2Index * 2 + 1];
    outPoints[2].x = navmesh.points[p3Index * 2];
    outPoints[2].y = navmesh.points[p3Index * 2 + 1];
} 