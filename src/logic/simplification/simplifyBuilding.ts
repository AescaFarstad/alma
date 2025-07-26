import simplify from 'simplify-js';
import type { Point2 } from '../core/math';

/**
 * Simplifies a building's geometry using the Visvalingam-Whyatt algorithm.
 * 
 * @param geometry The building geometry, expected to be an array of coordinate rings.
 * @param tolerance The tolerance for simplification in meters (a larger value means more simplification).
 * @returns The simplified geometry as a flat array of coordinates.
 */
export function simplifyBuildingGeometry(geometry: number[][][], tolerance: number = 0.5): Point2[] {
    if (!geometry || geometry.length === 0) {
        return [];
    }
    
    // 1. Extract the coordinate ring. The data can have an extra nesting level.
    const outerShell = geometry[0];
    let coordinateRing: number[][];

    // The geometry can be nested, e.g., [[[[lon, lat], ...]]].
    if (outerShell.length === 1 && Array.isArray(outerShell[0]) && Array.isArray(outerShell[0][0])) {
        // Nested structure: geometry[0][0] is the ring
        coordinateRing = outerShell[0] as unknown as number[][];
    } else {
        // Flat structure: geometry[0] is the ring
        coordinateRing = outerShell as number[][];
    }
    
    if (!coordinateRing || coordinateRing.length < 3) {
        return []; // Not a valid polygon to simplify
    }
    
    console.log(`[Simplify] Original geometry has ${coordinateRing.length} points.`);
    console.log(`[Simplify] Using tolerance: ${tolerance}m`);

    // Convert to the format expected by simplify-js: [{x: number, y: number}, ...]
    const points: Point2[] = coordinateRing.map(coord => ({ x: coord[0], y: coord[1] }));

    // 2. Use Visvalingam-Whyatt Algorithm (highQuality = true)
    const simplifiedPoints = simplify(points, tolerance, true);

    console.log(`[Simplify] Simplified to ${simplifiedPoints.length} points`);

    // 3. Ensure the polygon is closed
    if (simplifiedPoints.length < 3) {
        console.warn(`[Simplify] Simplification resulted in fewer than 3 points, returning empty array.`);
        return [];
    }
    
    const firstPoint = simplifiedPoints[0];
    const lastPoint = simplifiedPoints[simplifiedPoints.length - 1];
    if (firstPoint.x !== lastPoint.x || firstPoint.y !== lastPoint.y) {
        simplifiedPoints.push({ x: firstPoint.x, y: firstPoint.y });
    }

    return simplifiedPoints;
}

/**
 * Alternative simplification with a percentage-based approach
 */
export function simplifyBuildingGeometryByPercentage(geometry: number[][][], keepPercentage: number = 0.5): Point2[] {
    if (!geometry || geometry.length === 0) {
        return [];
    }

    const outerShell = geometry[0];
    const targetPoints = Math.max(4, Math.floor(outerShell.length * keepPercentage));
    
    return simplifyBuildingGeometry(geometry, targetPoints);
} 