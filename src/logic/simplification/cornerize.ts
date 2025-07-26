import { Point2, Line, subtract, distance, lineLineIntersection } from "../core/math";
// import { ACBLACK, ACCYAN, ACEMERALD, ACMAGENTA, ACORANGE, ACWHITE, ACYELLOW, SceneState, sceneState } from "../drawing/SceneState";

/**
 * Fixes corners of a simplified polygon by checking for short segments 
 * and replacing them with an intersection point if it's close to a vertex 
 * of the original geometry. This is useful for sharpening corners after 
 * operations like dilation/erosion.
 * 
 * @param simplifiedPoints The points of the simplified polygon.
 * @param originalPoints The points of the original polygon, for reference.
 * @param shortSegmentThreshold The distance threshold to consider a segment "short". (X)
 * @param cornerProximityThreshold The distance threshold to an original point to validate a new corner. (Y)
 * @returns A new array of points for the geometry with improved corners.
 */
export function cornerize(
    simplifiedPoints: Point2[],
    originalPoints: Point2[],
    shortSegmentThreshold: number,
    cornerProximityThreshold: number
): Point2[] {
    // sceneState.clearDebugVisuals();
    let n = simplifiedPoints.length;
    let list = [...simplifiedPoints]
    if (n < 4) {
        return list; // Not enough points to form a pattern of 4
    }
    const minProximity = cornerProximityThreshold * (Math.SQRT2 + 0.01);

    for (let i = 0; i < n; i++) {

        const a_idx = i;
        const b_idx = (i + 1) % n;
        const c_idx = (i + 2) % n;
        const d_idx = (i + 3) % n;

        const pA = list[a_idx];
        const pB = list[b_idx];
        const pC = list[c_idx];
        const pD = list[d_idx];
        
        // If B and C are very close, they might form a "rounded" corner
        // that should be a single sharp point.
        const dst = distance(pB, pC);
        if (dst < shortSegmentThreshold && dst > minProximity) {
            // sceneState.addDebugPoint(pB, ACWHITE);
            // sceneState.addDebugPoint(pC, ACBLACK);
            const lineAB: Line = { point: pA, direction: subtract(pB, pA) };
            const lineDC: Line = { point: pD, direction: subtract(pC, pD) };
            const R = lineLineIntersection(lineAB, lineDC);

            if (R && distance(R, pB) < shortSegmentThreshold + minProximity) {
                // Check if the potential new corner R is close to any vertex
                // of the original shape.
                let closestOriginalPoint: Point2 | null = null;
                let minDistance = cornerProximityThreshold;

                for (const originalPoint of originalPoints) {
                    const d = distance(R, originalPoint);
                    if (d < minDistance && distance(pB, originalPoint) > cornerProximityThreshold && distance(pC, originalPoint) > cornerProximityThreshold) {
                        minDistance = d;
                        closestOriginalPoint = originalPoint;
                    }
                }

                if (closestOriginalPoint) {
                    // console.log(`INC at ${i}`)
                    // A B C D => A R D
                    list.splice(b_idx, 1);
                    list[b_idx] = R;
                    n--;
                    continue;
                }
            }

            const centerBC = { x: (pB.x + pC.x) / 2, y: (pB.y + pC.y) / 2 };
            const vecBC = subtract(pC, pB);
            const vec_rot90 = { x: -vecBC.y, y: vecBC.x };
            const half_vec_rot90 = { x: vec_rot90.x / 2, y: vec_rot90.y / 2 };
            
            const J = { x: centerBC.x - half_vec_rot90.x, y: centerBC.y - half_vec_rot90.y };
            const K = { x: centerBC.x + half_vec_rot90.x, y: centerBC.y + half_vec_rot90.y };

            let closeToJ = false;
            let closeToK = false;

            for (const originalPoint of originalPoints) {
                if (distance(pB, originalPoint) < cornerProximityThreshold || distance(pC, originalPoint) < cornerProximityThreshold)
                    continue;
                if (!closeToJ && distance(J, originalPoint) < cornerProximityThreshold) {
                    closeToJ = true;
                }
                if (!closeToK && distance(K, originalPoint) < cornerProximityThreshold) {
                    closeToK = true;
                }
                if (closeToJ && closeToK) break; 
            }

            if (closeToJ && !closeToK) {
                // console.log(`move at ${i}`)
                list[b_idx] = J;
                continue;
            } else if (!closeToJ && closeToK) {
                // console.log(`move at ${i}`)
                list[c_idx] = K;
                continue;
            }
        }
    }
    return list;
} 