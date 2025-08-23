import type { Point2 } from '../../logic/core/math';
import { triangleArea, distance, distancePointToSegment, cvt } from '../../logic/core/math';

export function flatten(points: Point2[], area_threshold: number): Point2[] {
    let currentPoints = [...points];
    if (currentPoints.length > 0 && distance(currentPoints[0], currentPoints[currentPoints.length-1]) < 1e-9) {
        currentPoints.pop();
    }
    let totalRemovedPoints = 0;
    let totalRemovedArea = 0;

    while (true) {
        let madeChange = false;
        if (currentPoints.length < 3) break;

        let i = 0;
        while (i < currentPoints.length) {
            const len = currentPoints.length;
            const A = currentPoints[i % len];
            const B = currentPoints[(i + 1) % len];
            const C = currentPoints[(i + 2) % len];

            if (!A || !B || !C) {
                i++;
                continue;
            }

            // Calculate distance from B to line segment AC
            const M = distancePointToSegment(B, A, C);
            
            // Calculate length of AC
            const AC_length = distance(A, C);
            
            // Modify area_threshold based on how far the edge would move
            const threshold_multiplier = cvt(M, 0.1, 0.05 * AC_length, 3, 1);
            const adjusted_threshold = area_threshold * threshold_multiplier;

            const area = triangleArea(A, B, C);
            if (area < adjusted_threshold) {
                // console.log(`[UI] Flattening removed point ${i} with area ${area.toFixed(2)}`);
                currentPoints.splice((i + 1) % len, 1);
                totalRemovedPoints++;
                totalRemovedArea += area;
                madeChange = true;
                // Restart scan
                i = 0;
                continue;
            }
            i++;
        }

        if (!madeChange) {
            break;
        }
    }

    // console.log(`[UI] Flattening removed ${totalRemovedPoints} points and ${totalRemovedArea.toFixed(2)} area`);
    return currentPoints;
} 