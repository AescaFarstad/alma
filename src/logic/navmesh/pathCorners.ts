import { Navmesh } from "./Navmesh";
import { Point2, cross, add, subtract, scale, length_sq, normalize, set_, set, normalize_, add_, subtract_, scale_ } from "../core/math";
import { GameState } from "../GameState";
// import { arePointsSuspiciouslyClose } from "../debug/AgentDebugUtils";
// import { ACINDIGO, sceneState } from "../drawing/SceneState";

export type Corner = {
    point: Point2;
    tri: number;
};

export interface DualCorner {
    corner1: Point2;
    tri1: number;
    corner2: Point2;
    tri2: number;
    numValid: 0 | 1 | 2;
}

// Reusable objects to avoid allocations
const reusableSearchBox = {
    minX: 0,
    minY: 0,
    maxX: 0,
    maxY: 0
};
const tempV = {x: 0, y: 0};

export function findCorners(navmesh: Navmesh, corridor: number[], startPoint: Point2, endPoint: Point2): Corner[] {
    const portals = getPortals(navmesh, corridor, startPoint, endPoint);
    const corners = funnel(portals, corridor, navmesh);
    return corners;
}

export function findNextCorner(navmesh: Navmesh, gs: GameState, corridor: number[], startPoint: Point2, endPoint: Point2, offset: number, result: DualCorner): void {
    if (corridor.length === 0) {
        set_(result.corner1, endPoint);
        result.tri1 = -1;
        set_(result.corner2, endPoint);
        result.tri2 = -1;
        result.numValid = 1;
        return;
    }

    // Special case: single triangle corridor - just go directly to the end point
    if (corridor.length === 1) {
        set_(result.corner1, endPoint);
        result.tri1 = corridor[0];
        set_(result.corner2, endPoint);
        result.tri2 = corridor[0];
        result.numValid = 1;
        return;
    }

    const portals = getPortals(navmesh, corridor, startPoint, endPoint);
    funnel_dual(portals, corridor, result);
    

    if (result.numValid === 0) {
        set_(result.corner1, endPoint);
        result.tri1 = -1;
        set_(result.corner2, endPoint);
        result.tri2 = -1;
        result.numValid = 1;
        return;
    }

    // Apply offset to a corner point (modifies in place)
    const applyOffsetToPoint = (point: Point2, tri: number): void => {
        if (tri !== -1 && offset > 0) {
            const isEndPoint = point.x === endPoint.x && point.y === endPoint.y;

            if (!isEndPoint) {
                reusableSearchBox.minX = point.x - 0.1;
                reusableSearchBox.minY = point.y - 0.1;
                reusableSearchBox.maxX = point.x + 0.1;
                reusableSearchBox.maxY = point.y + 0.1;

                const nearbyBlobs = gs.blobSpatialIndex.search(reusableSearchBox);
                let foundBlob = false;

                for (const blobInfo of nearbyBlobs) {
                    const blob = gs.blobsById[blobInfo.id];
                    if (!blob || !blob.geometry || blob.geometry.length === 0) {
                        continue;
                    }

                    const points = blob.geometry[0];
                    for (let i = 0; i < points.length; i++) {
                        const p: Point2 = { x: points[i][0], y: points[i][1] };
                        
                        if (isPointsEqual(p, point, 0.015)) {
                            const B = point;
                            
                            // Find adjacent vertices
                            let prev_i = (i + points.length - 1) % points.length;
                            let A: Point2 = { x: points[prev_i][0], y: points[prev_i][1] };
                            
                            let next_i = (i + 1) % points.length;
                            let C: Point2 = { x: points[next_i][0], y: points[next_i][1] };

                            set_(tempV, B);
                            subtract_(tempV, A);
                            normalize_(tempV);
                            
                            let vec_CB = subtract(B, C);
                            normalize_(vec_CB);
                            
                            add_(tempV, vec_CB);

                            if (length_sq(tempV) > 1e-6) {
                                normalize_(tempV);
                                scale_(tempV, offset);
                                add_(point, tempV);
                            }
                            
                            foundBlob = true;
                            break;
                        }
                    }
                    if(foundBlob) break;
                }

                if (!foundBlob) {
                    if (!gs.navmesh.triIndex.isGridCorner(point)) {
                        console.warn("Could not find matching blob for corner, not applying offset.", point);
                    }
                }
            }
        }
    };

    if (result.numValid === 1) {
        // Single corner is already set by funnel_dual, no offset needed for endpoints
        return;
    }

    // Apply offset to both corners (modifies in place)
    applyOffsetToPoint(result.corner1, result.tri1);
    applyOffsetToPoint(result.corner2, result.tri2);
}

function getPortals(navmesh: Navmesh, corridor: number[], startPoint: Point2, endPoint: Point2): { left: Point2, right: Point2 }[] {
    const portals: { left: Point2, right: Point2 }[] = [];
    // Create copies to avoid reference issues
    portals.push({ 
        left: { x: startPoint.x, y: startPoint.y }, 
        right: { x: startPoint.x, y: startPoint.y } 
    });

    for (let i = 0; i < corridor.length - 1; i++) {
        const tri1Idx = corridor[i];
        const tri2Idx = corridor[i + 1];

        const portalPoints = getPortalPoints(navmesh, tri1Idx, tri2Idx);
        if (portalPoints) {
            portals.push(portalPoints);
        }
    }

    // Create copies to avoid reference issues
    portals.push({ 
        left: { x: endPoint.x, y: endPoint.y }, 
        right: { x: endPoint.x, y: endPoint.y } 
    });
    return portals;
}

function getPortalPoints(navmesh: Navmesh, tri1Idx: number, tri2Idx: number): { left: Point2, right: Point2 } | null {
    const tri1Verts = [
        navmesh.triangles[tri1Idx * 3],
        navmesh.triangles[tri1Idx * 3 + 1],
        navmesh.triangles[tri1Idx * 3 + 2]
    ];

    const tri2Verts = [
        navmesh.triangles[tri2Idx * 3],
        navmesh.triangles[tri2Idx * 3 + 1],
        navmesh.triangles[tri2Idx * 3 + 2]
    ];

    const sharedVerts = tri1Verts.filter(v => tri2Verts.includes(v));

    if (sharedVerts.length !== 2) {
        return null;
    }

    const p1 = { x: navmesh.points[sharedVerts[0] * 2], y: navmesh.points[sharedVerts[0] * 2 + 1] };
    const p2 = { x: navmesh.points[sharedVerts[1] * 2], y: navmesh.points[sharedVerts[1] * 2 + 1] };
    
    // Get triangle centroids to determine travel direction
    const c1x = navmesh.centroids[tri1Idx * 2];
    const c1y = navmesh.centroids[tri1Idx * 2 + 1];
    const c2x = navmesh.centroids[tri2Idx * 2];
    const c2y = navmesh.centroids[tri2Idx * 2 + 1];
    
    // Direction vector from tri1 to tri2
    const travelDir = { x: c2x - c1x, y: c2y - c1y };
    
    // Edge vector from p1 to p2
    const edgeDir = { x: p2.x - p1.x, y: p2.y - p1.y };
    
    // Use cross product to determine orientation
    // If cross product is positive, p2 is to the left of travel direction
    const crossProduct = cross(travelDir, edgeDir);
    
    let result;
    if (crossProduct > 0) {
        // p2 is to the left of travel direction
        result = { left: p2, right: p1 };
    } else {
        // p1 is to the left of travel direction
        result = { left: p1, right: p2 };
    }
    
    return result;
}

function funnel_dual(portals: { left: Point2, right: Point2 }[], corridor: number[], result: DualCorner): void {
    if (portals.length === 0) {
        // This shouldn't happen, but handle it gracefully
        set(result.corner1, 0, 0);
        set(result.corner2, 0, 0);
        result.tri1 = -1;
        result.tri2 = -1;
        result.numValid = 0;
        return;
    }
    if (portals.length === 1) {
        const corner = portals[0].left;
        const tri = corridor[0] ?? -1;
        set_(result.corner1, corner);
        result.tri1 = tri;
        set_(result.corner2, corner);
        result.tri2 = tri;
        result.numValid = 1;
        return;
    }

    let cornersFound = 0;

    let portalApex = portals[0].left;
    let portalLeft = portals[0].left;
    let portalRight = portals[0].right;
    let apexIndex = 0;
    let leftIndex = 0;
    let rightIndex = 0;

    for (let i = 1; i < portals.length; i++) {
        const left = portals[i].left;
        const right = portals[i].right;

        // Update right vertex
        const rightTriArea = triarea2(portalApex, portalRight, right);

        if (rightTriArea <= 0.0) {
            const apexRightEqual = isPointsEqual(portalApex, portalRight);
            const leftTriArea = apexRightEqual ? 1.0 : triarea2(portalApex, portalLeft, right);

            if (apexRightEqual || leftTriArea > 0.0) {
                portalRight = right;
                rightIndex = i;
            } else {
                // Right over left, we have a corner
                const startPoint = portals[0].left;
                const leftEqualsStart = isPointsEqual(portalLeft, startPoint);

                if (cornersFound === 0) {
                    // Check if this corner is actually the start point (agent's current position)
                    if (!leftEqualsStart) {
                        set_(result.corner1, portalLeft);
                        result.tri1 = corridor[leftIndex];
                        cornersFound = 1;
                    }
                } else {
                    const corner1EqualsLeft = isPointsEqual(result.corner1, portalLeft);
                    if (!corner1EqualsLeft) {
                        set_(result.corner2, portalLeft);
                        result.tri2 = corridor[leftIndex];
                        result.numValid = 2;
                        return;
                    }
                }
                
                // Restart from the corner
                portalApex = portalLeft;
                apexIndex = leftIndex;
                portalLeft = portalApex;
                portalRight = portalApex;
                leftIndex = apexIndex;
                rightIndex = apexIndex;
                i = apexIndex;
                continue;
            }
        }

        // Update left vertex
        const leftTriArea2 = triarea2(portalApex, portalLeft, left);

        if (leftTriArea2 >= 0.0) {
            const apexLeftEqual = isPointsEqual(portalApex, portalLeft);
            const rightTriArea2 = apexLeftEqual ? -1.0 : triarea2(portalApex, portalRight, left);

            if (apexLeftEqual || rightTriArea2 < 0.0) {
                portalLeft = left;
                leftIndex = i;
            } else {
                // Left over right, we have a corner
                const startPoint = portals[0].left;
                const rightEqualsStart = isPointsEqual(portalRight, startPoint);

                if (cornersFound === 0) {
                    // Check if this corner is actually the start point (agent's current position)  
                    if (!rightEqualsStart) {
                        set_(result.corner1, portalRight);
                        result.tri1 = corridor[rightIndex];
                        cornersFound = 1;
                    }
                } else {
                    const corner1EqualsRight = isPointsEqual(result.corner1, portalRight);
                    if (!corner1EqualsRight) {
                        set_(result.corner2, portalRight);
                        result.tri2 = corridor[rightIndex];
                        result.numValid = 2;
                        return;
                    }
                }
                
                // Restart from the corner
                portalApex = portalRight;
                apexIndex = rightIndex;
                portalLeft = portalApex;
                portalRight = portalApex;
                leftIndex = apexIndex;
                rightIndex = apexIndex;
                i = apexIndex;
                continue;
            }
        }
    }

    // Add the final point if we haven't found 2 corners yet
    const lastPortal = portals[portals.length - 1];
    const endPoint = lastPortal.left;
    const endTri = corridor[corridor.length - 1];

    if (cornersFound === 0) {
        set_(result.corner1, endPoint);
        result.tri1 = endTri;
        set_(result.corner2, endPoint);
        result.tri2 = endTri;
        result.numValid = 1;
    } else {
        // First corner already set, just add the endpoint as second corner
        const corner1EqualsEnd = isPointsEqual(result.corner1, endPoint);
        if (corner1EqualsEnd) {
            result.numValid = 1;
        } else {
            set_(result.corner2, endPoint);
            result.tri2 = endTri;
            result.numValid = 2;
        }
    }
}

function funnel(portals: { left: Point2, right: Point2 }[], corridor: number[], _navmesh: Navmesh): Corner[] {
    if (portals.length < 2) {
        return [{ point: portals[0]?.left || { x: 0, y: 0 }, tri: corridor[0] ?? -1 }];
    }

    const path: Corner[] = [];
    path.push({ point: portals[0].left, tri: corridor[0] });

    let portalApex = portals[0].left;
    let portalLeft = portals[0].left;
    let portalRight = portals[0].right;

    let apexIndex = 0;
    let leftIndex = 0;
    let rightIndex = 0;

    for (let i = 1; i < portals.length; i++) {
        const left = portals[i].left;
        const right = portals[i].right;

        // Update right vertex
        if (triarea2(portalApex, portalRight, right) <= 0.0) {
            if (isPointsEqual(portalApex, portalRight) || triarea2(portalApex, portalLeft, right) > 0.0) {
                portalRight = right;
                rightIndex = i;
            } else {
                // Right over left, add left to path and restart scan
                path.push({ point: portalLeft, tri: corridor[leftIndex] });
                portalApex = portalLeft;
                apexIndex = leftIndex;
                
                // Make current apex left and right
                portalLeft = portalApex;
                portalRight = portalApex;
                leftIndex = apexIndex;
                rightIndex = apexIndex;
                
                // Restart from apex
                i = apexIndex;
                continue;
            }
        }

        // Update left vertex
        if (triarea2(portalApex, portalLeft, left) >= 0.0) {
            if (isPointsEqual(portalApex, portalLeft) || triarea2(portalApex, portalRight, left) < 0.0) {
                portalLeft = left;
                leftIndex = i;
            } else {
                // Left over right, add right to path and restart scan
                path.push({ point: portalRight, tri: corridor[rightIndex] });
                portalApex = portalRight;
                apexIndex = rightIndex;
                
                // Make current apex left and right
                portalLeft = portalApex;
                portalRight = portalApex;
                leftIndex = apexIndex;
                rightIndex = apexIndex;
                
                // Restart from apex
                i = apexIndex;
                continue;
            }
        }
    }

    // Append last point if not already equal to the last point
    const lastPortal = portals[portals.length - 1];
    const lastCorner = path[path.length - 1];
    if (!isPointsEqual(lastCorner.point, lastPortal.left)) {
        path.push({ point: lastPortal.left, tri: corridor[corridor.length - 1] });
    }

    return path;
}

function triarea2(p1: Point2, p2: Point2, p3: Point2) {
    const ax = p2.x - p1.x;
    const ay = p2.y - p1.y;
    const bx = p3.x - p1.x;
    const by = p3.y - p1.y;
    return bx * ay - ax * by;
}

function isPointsEqual(p1: Point2, p2: Point2, epsilon = 1e-6){
    return Math.abs(p1.x - p2.x) < epsilon && Math.abs(p1.y - p2.y) < epsilon;
}
