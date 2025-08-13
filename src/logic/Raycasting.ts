import type { Navmesh } from './navmesh/Navmesh';
import { Point2, isPointInTriangle, isToRight } from './core/math';
import { getTriangleFromPoint } from './navmesh/pathCorridor';

export type RaycastWithCorridorResult = {
    hitP1: Point2 | null;
    hitP2: Point2 | null;
    corridor: number[];
};

export type RaycastHitOnlyResult = {
    hitP1: Point2 | null;
    hitP2: Point2 | null;
};

const triPoints: [Point2, Point2, Point2] = [{x:0, y:0}, {x:0, y:0}, {x:0, y:0}];
// Global temporary variable to store the hit edge index to avoid allocation and intersection calculations
let hitEdgeIndex = -1;

/**
 * Raycast with corridor tracking - returns both hit information and the corridor of triangles traversed
 * @param endTriIdx - If provided, we trust this as the target triangle and avoid point-in-triangle checks
 * @returns {RaycastWithCorridorResult} - The edge of collision and the corridor. If there's a clear line of sight, hitP1/hitP2 are null.
 */
export function raycastCorridor(
    navmesh: Navmesh,
    startPoint: Point2,
    endPoint: Point2,
    startTriIdx?: number,
    endTriIdx?: number,
): RaycastWithCorridorResult {
    hitEdgeIndex = -1;
    
    const corridor = traceStraightCorridor(navmesh, startPoint, endPoint, startTriIdx, endTriIdx);

    if (corridor === null) {
        return {hitP1: startPoint, hitP2: startPoint, corridor: []};
    }

    const lastTriIdx = corridor[corridor.length-1];
    
    // If endTriIdx is provided, trust it - no need for point-in-triangle check
    if (endTriIdx !== undefined) {
        if (lastTriIdx === endTriIdx) {
            return { hitP1: null, hitP2: null, corridor };
        }
    } else {
        // Fallback to point-in-triangle check when endTriIdx is not provided
        getTrianglePoints(navmesh, lastTriIdx, triPoints);
        if(isPointInTriangle(endPoint.x, endPoint.y, triPoints[0].x, triPoints[0].y, triPoints[1].x, triPoints[1].y, triPoints[2].x, triPoints[2].y)) {
            return { hitP1: null, hitP2: null, corridor };
        }
    }
    
    // If we hit a wall, return the hit edge
    if (hitEdgeIndex !== -1) {
        getTrianglePoints(navmesh, lastTriIdx, triPoints);
        const p1 = triPoints[hitEdgeIndex];
        const p2 = triPoints[(hitEdgeIndex + 1) % 3];
        return {hitP1: p1, hitP2: p2, corridor};
    }

    return { hitP1: null, hitP2: null, corridor }; // Fallback
}

/**
 * Optimized raycast that only returns hit information without corridor tracking
 * @param endTriIdx - If provided, we trust this as the target triangle and avoid point-in-triangle checks  
 * @returns {RaycastHitOnlyResult} - The edge of collision. If there's a clear line of sight, hitP1/hitP2 are null.
 */
export function raycastPoint(
    navmesh: Navmesh,
    startPoint: Point2,
    endPoint: Point2,
    startTriIdx?: number,
    endTriIdx?: number,
): RaycastHitOnlyResult {
    hitEdgeIndex = -1;
    
    const lastTriIdx = traceStraightCorridorHitOnly(navmesh, startPoint, endPoint, startTriIdx, endTriIdx);

    if (lastTriIdx === null) {
        return {hitP1: startPoint, hitP2: startPoint};
    }

    // If endTriIdx is provided, trust it - no need for point-in-triangle check
    if (endTriIdx !== undefined) {
        if (lastTriIdx === endTriIdx) {
            return { hitP1: null, hitP2: null };
        }
    } else {
        // Fallback to point-in-triangle check when endTriIdx is not provided
        getTrianglePoints(navmesh, lastTriIdx, triPoints);
        if(isPointInTriangle(endPoint.x, endPoint.y, triPoints[0].x, triPoints[0].y, triPoints[1].x, triPoints[1].y, triPoints[2].x, triPoints[2].y)) {
            return { hitP1: null, hitP2: null };
        }
    }
    
    // If we hit a wall, return the hit edge
    if (hitEdgeIndex !== -1) {
        getTrianglePoints(navmesh, lastTriIdx, triPoints);
        const p1 = triPoints[hitEdgeIndex];
        const p2 = triPoints[(hitEdgeIndex + 1) % 3];
        return {hitP1: p1, hitP2: p2};
    }

    return { hitP1: null, hitP2: null }; // Fallback
}

/**
 * Given starting position and end position return the corridor of triangles that we successfully passed
 */
function traceStraightCorridor(
    navmesh: Navmesh,
    startPoint: Point2,
    endPoint: Point2,
    startTriIdx?: number,
    endTriIdx?: number,
): number[] | null {
    let currentTriIdx = startTriIdx ?? getTriangleFromPoint(navmesh, startPoint);

    if (currentTriIdx === -1) {
        return null; // Start point is not on navmesh
    }

    const corridor: number[] = [currentTriIdx];
    const MAX_ITERATIONS = 5000; // Safety break
    let previousTriIdx = -1;

    for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
        // If endTriIdx is provided, trust it and check if we've reached the target triangle
        if (endTriIdx !== undefined && currentTriIdx === endTriIdx) {
            return corridor; // Success - reached the target triangle
        }

        getTrianglePoints(navmesh, currentTriIdx, triPoints);

        // Fallback to point-in-triangle check if endTriIdx is not provided
        if (endTriIdx === undefined && isPointInTriangle(endPoint.x, endPoint.y, triPoints[0].x, triPoints[0].y, triPoints[1].x, triPoints[1].y, triPoints[2].x, triPoints[2].y)) {
            return corridor; // Success
        }

        let nextTriIdx = -1;
        let exitEdgeIdx = -1;
        
        if (previousTriIdx === -1) {
            // For the first triangle, we find the exit portal by identifying which
            // side of the ray each of the triangle's vertices lies on. The ray will
            // exit through the edge that is opposite the "odd-one-out" vertex.
            
            // Use original endpoint for orientation tests - normalization can distort geometry
            const c0 = isToRight(startPoint, endPoint, triPoints[0]);
            const c1 = isToRight(startPoint, endPoint, triPoints[1]);
            const c2 = isToRight(startPoint, endPoint, triPoints[2]);

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
                hitEdgeIndex = exitEdgeIdx; // Store the hit edge index
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
                    hitEdgeIndex = exitEdgeIdx; // Store the hit edge index
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

/**
 * Optimized version that only tracks the last triangle index, avoiding array allocations
 */
function traceStraightCorridorHitOnly(
    navmesh: Navmesh,
    startPoint: Point2,
    endPoint: Point2,
    startTriIdx?: number,
    endTriIdx?: number,
): number | null {
    let currentTriIdx = startTriIdx ?? getTriangleFromPoint(navmesh, startPoint);

    if (currentTriIdx === -1) {
        return null; // Start point is not on navmesh
    }

    const MAX_ITERATIONS = 5000; // Safety break
    let previousTriIdx = -1;

    for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
        // If endTriIdx is provided, trust it and check if we've reached the target triangle
        if (endTriIdx !== undefined && currentTriIdx === endTriIdx) {
            return currentTriIdx; // Success - reached the target triangle
        }

        getTrianglePoints(navmesh, currentTriIdx, triPoints);

        // Fallback to point-in-triangle check if endTriIdx is not provided
        if (endTriIdx === undefined && isPointInTriangle(endPoint.x, endPoint.y, triPoints[0].x, triPoints[0].y, triPoints[1].x, triPoints[1].y, triPoints[2].x, triPoints[2].y)) {
            return currentTriIdx; // Success
        }

        let nextTriIdx = -1;
        let exitEdgeIdx = -1;
        
        if (previousTriIdx === -1) {
            // For the first triangle, we find the exit portal by identifying which
            // side of the ray each of the triangle's vertices lies on. The ray will
            // exit through the edge that is opposite the "odd-one-out" vertex.
            
            // Use original endpoint for orientation tests - normalization can distort geometry
            const c0 = isToRight(startPoint, endPoint, triPoints[0]);
            const c1 = isToRight(startPoint, endPoint, triPoints[1]);
            const c2 = isToRight(startPoint, endPoint, triPoints[2]);

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
                hitEdgeIndex = exitEdgeIdx; // Store the hit edge index
                return currentTriIdx; // Hit a wall
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
                    hitEdgeIndex = exitEdgeIdx; // Store the hit edge index
                    return currentTriIdx; // Hit a wall
                }
            }
            // If entryEdgeIdx is -1, something is wrong, nextTriIdx remains -1 and we'll exit below.
        }

        if (nextTriIdx !== -1) {
            previousTriIdx = currentTriIdx;
            currentTriIdx = nextTriIdx;
        } else {
            // No valid exit found, e.g. ray ends in the middle of a triangle, but not at endPoint.
            return currentTriIdx;
        }
    }

    return currentTriIdx; // Exceeded max iterations
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