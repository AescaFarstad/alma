import { type Point2, cross } from '../core/math';

/**
 * Calculates the convex hull of a set of points using the Monotone Chain algorithm.
 * @param points An array of points, where each point is an object with `x` and `y` properties.
 * @returns A flat array of coordinates representing the convex hull, ordered clockwise.
 */
export function getConvexHull(points: Point2[]): Point2[] {
    if (points.length <= 3) {
        if (points.length > 0) {
            points.push(points[0]);
        }
        return points;
    }

    // Sort points lexicographically (first by x, then by y)
    points.sort((a, b) => a.x - b.x || a.y - b.y);

    const crossProduct = (o: Point2, a: Point2, b: Point2): number => {
        return cross({ x: a.x - o.x, y: a.y - o.y }, { x: b.x - o.x, y: b.y - o.y });
    };

    const lowerHull: Point2[] = [];
    for (const p of points) {
        while (lowerHull.length >= 2 && crossProduct(lowerHull[lowerHull.length - 2], lowerHull[lowerHull.length - 1], p) <= 0) {
            lowerHull.pop();
        }
        lowerHull.push(p);
    }

    const upperHull: Point2[] = [];
    for (let i = points.length - 1; i >= 0; i--) {
        const p = points[i];
        while (upperHull.length >= 2 && crossProduct(upperHull[upperHull.length - 2], upperHull[upperHull.length - 1], p) <= 0) {
            upperHull.pop();
        }
        upperHull.push(p);
    }

    // Remove the last point of each hull because it's the same as the first point of the other
    lowerHull.pop();
    upperHull.pop();

    const hullPoints = lowerHull.concat(upperHull);
    // Close the polygon
    if (hullPoints.length > 0) {
        hullPoints.push(hullPoints[0]);
    }

    return hullPoints;
} 