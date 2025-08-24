import { Navmesh } from "./Navmesh";
import { Point2, cross, add, subtract, scale, length_sq, normalize, set_, set, normalize_, add_, subtract_, scale_ } from "../core/math";
import { GameState } from "../GameState";
import { SpatialIndex } from "./SpatialIndex";
import { getTriangleFromPolyPoint } from "./NavUtils";

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
const tempV = {x: 0, y: 0};

export function findCorners(navmesh: Navmesh, corridor: number[], startPoint: Point2, endPoint: Point2): Corner[] {
    const portals = getPolygonPortals(navmesh, corridor, startPoint, endPoint);
    const corners = funnel(portals, corridor, navmesh);
    return corners;
}

export function findNextCorner(navmesh: Navmesh, corridor: number[], startPoint: Point2, endPoint: Point2, offset: number, result: DualCorner): void {
    if (corridor.length === 0) {
        set_(result.corner1, endPoint);
        result.tri1 = -1;
        set_(result.corner2, endPoint);
        result.tri2 = -1;
        result.numValid = 1;
        return;
    }

    // Special case: single polygon corridor - just go directly to the end point
    if (corridor.length === 1) {
        set_(result.corner1, endPoint);
        result.tri1 = corridor[0];
        set_(result.corner2, endPoint);
        result.tri2 = corridor[0];
        result.numValid = 1;
        return;
    }

    const portals = getPolygonPortals(navmesh, corridor, startPoint, endPoint);
    funnel_dual(portals, corridor, result, navmesh);
    

    if (result.numValid === 0) {
        set_(result.corner1, endPoint);
        result.tri1 = -1;
        set_(result.corner2, endPoint);
        result.tri2 = -1;
        result.numValid = 1;
        return;
    }    

    if (result.numValid === 1) {
        // Single corner is already set by funnel_dual, no offset needed for endpoints
        return;
    }

    // Apply offset to both corners (modifies in place)
    applyOffsetToPoint(result.corner1, result.tri1, endPoint, offset, navmesh);
    applyOffsetToPoint(result.corner2, result.tri2, endPoint, offset, navmesh);
}

const applyOffsetToPoint = (point: Point2, tri: number, endPoint: Point2, offset: number, navmesh: Navmesh): void => {
    if (tri !== -1 && offset > 0) {
        const isEndPoint = point.x === endPoint.x && point.y === endPoint.y;

        if (!isEndPoint) {
            const nearbyBlobIds = navmesh.blobIndex.query(point.x, point.y);
            let foundBlob = false;

            for (let j = 0; j < nearbyBlobIds.length; j++) {
                const blobId = nearbyBlobIds[j];
                const polyVertsStart = navmesh.polygons[blobId];
                const polyVertsEnd = navmesh.polygons[blobId + 1];
                const points_length = polyVertsEnd - polyVertsStart;

                for (let i = 0; i < points_length; i++) {
                    const vertIndex = navmesh.poly_verts[polyVertsStart + i];
                    const p_x = navmesh.vertices[vertIndex * 2];
                    const p_y = navmesh.vertices[vertIndex * 2 + 1];
                    
                    if (Math.abs(p_x - point.x) < 0.015 && Math.abs(p_y - point.y) < 0.015) {
                        const B = point;
                        
                        // Find adjacent vertices
                        const prev_i = (i + points_length - 1) % points_length;
                        const prev_vertIndex = navmesh.poly_verts[polyVertsStart + prev_i];
                        const A: Point2 = { x: navmesh.vertices[prev_vertIndex * 2], y: navmesh.vertices[prev_vertIndex * 2 + 1] };
                        
                        const next_i = (i + 1) % points_length;
                        const next_vertIndex = navmesh.poly_verts[polyVertsStart + next_i];
                        const C: Point2 = { x: navmesh.vertices[next_vertIndex * 2], y: navmesh.vertices[next_vertIndex * 2 + 1] };

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
                console.warn("Could not find matching blob for corner, not applying offset.", point);
            }
        }
    }
};

function getPolygonPortals(navmesh: Navmesh, corridor: number[], startPoint: Point2, endPoint: Point2): { left: Point2, right: Point2 }[] {
    const portals: { left: Point2, right: Point2 }[] = [];
    // Create copies to avoid reference issues
    portals.push({ 
        left: { x: startPoint.x, y: startPoint.y }, 
        right: { x: startPoint.x, y: startPoint.y } 
    });

    for (let i = 0; i < corridor.length - 1; i++) {
        const poly1Idx = corridor[i];
        const poly2Idx = corridor[i + 1];

        const portalPoints = getPolygonPortalPoints(navmesh, poly1Idx, poly2Idx);
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

function getPolygonPortalPoints(navmesh: Navmesh, poly1Idx: number, poly2Idx: number): { left: Point2, right: Point2 } | null {
    // Find the shared edge between two adjacent polygons
    const poly1VertStart = navmesh.polygons[poly1Idx];
    const poly1VertEnd = navmesh.polygons[poly1Idx + 1];
    const poly1VertCount = poly1VertEnd - poly1VertStart;

    // Look through poly1's neighbors to find the edge that connects to poly2
    for (let i = 0; i < poly1VertCount; i++) {
        const neighborIdx = poly1VertStart + i;
        const neighbor = navmesh.poly_neighbors[neighborIdx];
        
        if (neighbor === poly2Idx) {
            // Found the edge! Get the two vertices that form this edge
            const v1Idx = navmesh.poly_verts[poly1VertStart + i];
            const v2Idx = navmesh.poly_verts[poly1VertStart + ((i + 1) % poly1VertCount)];
            
            const p1 = { x: navmesh.vertices[v1Idx * 2], y: navmesh.vertices[v1Idx * 2 + 1] };
            const p2 = { x: navmesh.vertices[v2Idx * 2], y: navmesh.vertices[v2Idx * 2 + 1] };
            
            // Get polygon centroids to determine travel direction
            const c1x = navmesh.poly_centroids[poly1Idx * 2];
            const c1y = navmesh.poly_centroids[poly1Idx * 2 + 1];
            const c2x = navmesh.poly_centroids[poly2Idx * 2];
            const c2y = navmesh.poly_centroids[poly2Idx * 2 + 1];
            
            // Direction vector from poly1 to poly2
            const travelDir = { x: c2x - c1x, y: c2y - c1y };
            
            // Edge vector from p1 to p2 
            const edgeDir = { x: p2.x - p1.x, y: p2.y - p1.y };
            
            // Use cross product to determine orientation
            // If cross product is positive, p2 is to the left of travel direction
            const crossProduct = cross(travelDir, edgeDir);
            
            if (crossProduct > 0) {
                // p2 is to the left of travel direction
                return { left: p2, right: p1 };
            } else {
                // p1 is to the left of travel direction
                return { left: p1, right: p2 };
            }
        }
    }

    return null;
}

function funnel_dual(portals: { left: Point2, right: Point2 }[], corridor: number[], result: DualCorner, navmesh: Navmesh): void {
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
        const poly = corridor[0] ?? -1;
        const tri = poly !== -1 ? getTriangleFromPolyPoint(navmesh, corner, poly) : -1;
        set_(result.corner1, corner);
        result.tri1 = tri;
        set_(result.corner2, corner);
        result.tri2 = tri;
        result.numValid = 1;
        return;
    }

    let portalApex = portals[0].left;
    let portalLeft = portals[0].left;
    let portalRight = portals[0].left;
    let apexIndex = 0;
    let leftIndex = 0;
    let rightIndex = 0;
    let cornersFound = 0;

    for (let i = 1; i < portals.length; i++) {
        const left = portals[i].left;
        const right = portals[i].right;

        // Update right vertex
        const rightTriArea2 = triarea2(portalApex, portalRight, right);

        if (rightTriArea2 <= 0.0) {
            const apexRightEqual = isPointsEqual(portalApex, portalRight);
            const leftTriArea2 = apexRightEqual ? 1.0 : triarea2(portalApex, portalLeft, right);

            if (apexRightEqual || leftTriArea2 > 0.0) {
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
                        const poly = corridor[leftIndex];
                        result.tri1 = getTriangleFromPolyPoint(navmesh, portalLeft, poly);
                        cornersFound = 1;
                    }
                } else {
                    const corner1EqualsLeft = isPointsEqual(result.corner1, portalLeft);
                    if (!corner1EqualsLeft) {
                        set_(result.corner2, portalLeft);
                        const poly = corridor[leftIndex];
                        result.tri2 = getTriangleFromPolyPoint(navmesh, portalLeft, poly);
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
                        const poly = corridor[rightIndex];
                        result.tri1 = getTriangleFromPolyPoint(navmesh, portalRight, poly);
                        cornersFound = 1;
                    }
                } else {
                    const corner1EqualsRight = isPointsEqual(result.corner1, portalRight);
                    if (!corner1EqualsRight) {
                        set_(result.corner2, portalRight);
                        const poly = corridor[rightIndex];
                        result.tri2 = getTriangleFromPolyPoint(navmesh, portalRight, poly);
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

    // If we only found one corner, set it
    if (cornersFound === 1) {
        result.numValid = 1;
    } else {
        // No corners found, use the end point
        const endPoint = portals[portals.length - 1].left;
        set_(result.corner1, endPoint);
        const poly = corridor[corridor.length - 1];
        result.tri1 = getTriangleFromPolyPoint(navmesh, endPoint, poly);
        result.numValid = 1;
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
