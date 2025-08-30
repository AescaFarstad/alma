import { Navmesh } from "./Navmesh";
import { Point2, cross, add, subtract, scale, length_sq, normalize, set_, set, normalize_, add_, subtract_, scale_ } from "../core/math";
import { GameState } from "../GameState";
import { SpatialIndex } from "./SpatialIndex";
import { getTriangleFromPolyPoint, testPointInsideTriangle, getTriangleFromPoint, getTriangleFromPolyVertex, getTriangleFromVertex } from "./NavUtils";

export type Corner = {
  point: Point2;
  tri: number;
};

export interface DualCorner {
  corner1: Point2;
  tri1: number;
  vIdx1: number;  // Vertex index for corner1, -1 if not a navmesh vertex
  corner2: Point2;
  tri2: number;
  vIdx2: number;  // Vertex index for corner2, -1 if not a navmesh vertex
  numValid: 0 | 1 | 2;
}

const tempV_offset = {x: 0, y: 0};

function _calculateCornerMiterVector(navmesh: Navmesh, cornerPoint: Point2, cornerVIdx: number, polyIdx: number): Point2 | null {
  const polyVertsStart = navmesh.polygons[polyIdx];
  const polyVertsEnd = navmesh.polygons[polyIdx + 1];

  for (let i = polyVertsStart; i < polyVertsEnd; i++) {
    if (navmesh.poly_verts[i] === cornerVIdx) {
      const B = cornerPoint;

      const prevIndex = (i === polyVertsStart) ? polyVertsEnd - 1 : i - 1;
      const nextIndex = (i === polyVertsEnd - 1) ? polyVertsStart : i + 1;

      const A: Point2 = { 
        x: navmesh.vertices[navmesh.poly_verts[prevIndex] * 2], 
        y: navmesh.vertices[navmesh.poly_verts[prevIndex] * 2 + 1] 
      };
      const C: Point2 = { 
        x: navmesh.vertices[navmesh.poly_verts[nextIndex] * 2], 
        y: navmesh.vertices[navmesh.poly_verts[nextIndex] * 2 + 1] 
      };

      set_(tempV_offset, B);
      subtract_(tempV_offset, A);
      normalize_(tempV_offset);
      
      let vec_CB = subtract(B, C);
      normalize_(vec_CB);
      
      add_(tempV_offset, vec_CB);
      return { x: tempV_offset.x, y: tempV_offset.y };
    }
  }
  return null; // vidx not found in polygon
}

export function offsetCorner(
  navmesh: Navmesh,
  cornerPoint: Point2,
  cornerVIdx: number,
  polyIdx: number,
  offset: number
): Point2 | null {
  const miterVector = _calculateCornerMiterVector(navmesh, cornerPoint, cornerVIdx, polyIdx);

  if (miterVector) {
    if (length_sq(miterVector) > 1e-6) {
      normalize_(miterVector);
      scale_(miterVector, offset);
      const newPoint = { x: cornerPoint.x, y: cornerPoint.y };
      add_(newPoint, miterVector);
      return newPoint;
    }
    return null; // cannot offset
  }
  
  console.warn(`offsetCorner: FAILURE - Could not find matching vertex for corner in polygon. VIdx: ${cornerVIdx}, PolyIdx: ${polyIdx}`);
  return null; // vidx not found in polygon
}

interface Portal {
  left: Point2;
  right: Point2;
  leftVIdx: number;   // -1 if not a navmesh vertex
  rightVIdx: number;  // -1 if not a navmesh vertex
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
    result.vIdx1 = -1;
    set_(result.corner2, endPoint);
    result.tri2 = -1;
    result.vIdx2 = -1;
    result.numValid = 1;
    return;
  }

  // Special case: single polygon corridor - just go directly to the end point
  if (corridor.length === 1) {
    set_(result.corner1, endPoint);
    result.tri1 = findTriangleForPortalPoint(navmesh, endPoint, -1, corridor[0], "endPoint (single poly)");
    result.vIdx1 = -1;
    set_(result.corner2, endPoint);
    result.tri2 = findTriangleForPortalPoint(navmesh, endPoint, -1, corridor[0], "endPoint (single poly)");
    result.vIdx2 = -1;
    result.numValid = 1;
    return;
  }

  const portals = getPolygonPortals(navmesh, corridor, startPoint, endPoint);
  funnel_dual(portals, corridor, result, navmesh);
  

  if (result.numValid === 0) {
    set_(result.corner1, endPoint);
    result.tri1 = -1;
    result.vIdx1 = -1;
    set_(result.corner2, endPoint);
    result.tri2 = -1;
    result.vIdx2 = -1;
    result.numValid = 1;
    return;
  }  

  if (result.numValid === 1) {
    // Add the final destination as the second corner
    set_(result.corner2, endPoint);
    result.tri2 = -1; // Triangle will be determined if needed
    result.vIdx2 = -1;
    result.numValid = 2;
  }

  // Apply offset to both corners (modifies in place)
  if (result.numValid === 2) {
    applyOffsetToCorner(result, 1, endPoint, offset, navmesh);
    applyOffsetToCorner(result, 2, endPoint, offset, navmesh);
  }
}

const applyOffsetToCorner = (result: DualCorner, cornerNum: 1 | 2, endPoint: Point2, offset: number, navmesh: Navmesh): void => {
  const point = cornerNum === 1 ? result.corner1 : result.corner2;
  const vIdx = cornerNum === 1 ? result.vIdx1 : result.vIdx2;
  const tri = cornerNum === 1 ? result.tri1 : result.tri2;
  
  if (vIdx === -1 || tri === -1 || offset <= 0) {
    return;
  }
  
  const isEndPoint = point.x === endPoint.x && point.y === endPoint.y;
  if (isEndPoint) {
    return;
  }
  
  const nearbyBlobIds = navmesh.blobIndex.query(point.x, point.y);
  let foundBlob = false;
  
  for (let j = 0; j < nearbyBlobIds.length; j++) {
    const blobId = nearbyBlobIds[j];
    const miterVector = _calculateCornerMiterVector(navmesh, point, vIdx, blobId);

    if (miterVector) {
      if (length_sq(miterVector) > 1e-6) {
        normalize_(miterVector);
        scale_(miterVector, offset);
        add_(point, miterVector);
      }
      foundBlob = true;
      break;
    }
  }
  
  // Add warning if blob not found (like C++ version)
  if (!foundBlob) {
    console.warn(`applyOffsetToCorner: FAILURE corner${cornerNum} - Could not find matching blob for corner, not applying offset. Point: (${point.x.toFixed(3)}, ${point.y.toFixed(3)}) vIdx=${vIdx}`);
    console.warn("applyOffsetToCorner: Nearby blobs were:", nearbyBlobIds);
  }
  
  // After moving the point, check if it's still in the original triangle
  if (!testPointInsideTriangle(navmesh, point.x, point.y, tri)) {
    const newTri = findNewTriangle(point, tri, vIdx, navmesh);
    if (cornerNum === 1) {
      result.tri1 = newTri;
    } else {
      result.tri2 = newTri;
    }
  }
};

function findNewTriangle(point: Point2, startTri: number, vIdx: number, navmesh: Navmesh): number {
  if (startTri < 0 || vIdx < 0) {
    return startTri;
  }

  // Check immediate neighbors of the starting triangle
  for (let i = 0; i < 3; i++) {
    const neighbor = navmesh.neighbors[startTri * 3 + i];
    if (neighbor !== -1 && neighbor < navmesh.walkable_triangle_count) {
      if (testPointInsideTriangle(navmesh, point.x, point.y, neighbor)) {
        return neighbor;
      }
    }
  }

  // If no immediate neighbor contains the point, use general search
  const ftri = getTriangleFromPoint(navmesh, point);
  return ftri;
}

/**
 * Finds the best triangle for a portal point using multiple lookup strategies
 * @param navmesh - The navigation mesh
 * @param point - The portal point coordinates
 * @param vertexIdx - The vertex index (-1 if not available)
 * @param polygonIdx - The polygon index to search within
 * @param debugName - Name for debug logging (e.g. "corner1", "corner2 (right)")
 * @returns Triangle index, or -1 if all lookup methods fail
 */
function findTriangleForPortalPoint(
  navmesh: Navmesh, 
  point: Point2, 
  vertexIdx: number, 
  polygonIdx: number, 
  debugName: string
): number {
  let triangleIdx = -1;
  
  if (vertexIdx !== -1) {
    triangleIdx = getTriangleFromVertex(navmesh, vertexIdx, point);
  }
  
  if (triangleIdx === -1) {
    triangleIdx = getTriangleFromPolyPoint(navmesh, point, polygonIdx);
  }

  if (triangleIdx === -1) {
    triangleIdx = getTriangleFromPoint(navmesh, point);
  }
  
  if (triangleIdx === -1) {
    console.error(`funnel_dual: FAILED to find triangle for ${debugName}: point=(${point.x.toFixed(2)}, ${point.y.toFixed(2)}) vIdx=${vertexIdx} poly=${polygonIdx}`);
  }
  
  return triangleIdx;
}

function getPolygonPortals(navmesh: Navmesh, corridor: number[], startPoint: Point2, endPoint: Point2): Portal[] {
  const portals: Portal[] = [];
  // Create copies to avoid reference issues
  portals.push({ 
    left: { x: startPoint.x, y: startPoint.y }, 
    right: { x: startPoint.x, y: startPoint.y },
    leftVIdx: -1,
    rightVIdx: -1
  });

  for (let i = corridor.length - 1; i > 0; i--) {
    const poly1Idx = corridor[i];
    const poly2Idx = corridor[i-1];

    const portalPoints = getPolygonPortalPoints(navmesh, poly1Idx, poly2Idx);
    if (portalPoints) {
      portals.push(portalPoints);
    }
  }

  // Create copies to avoid reference issues
  portals.push({ 
    left: { x: endPoint.x, y: endPoint.y }, 
    right: { x: endPoint.x, y: endPoint.y },
    leftVIdx: -1,
    rightVIdx: -1
  });
  return portals;
}

function getPolygonPortalPoints(navmesh: Navmesh, poly1Idx: number, poly2Idx: number): Portal | null {
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
        return { left: p2, right: p1, leftVIdx: v2Idx, rightVIdx: v1Idx };
      } else {
        // p1 is to the left of travel direction
        return { left: p1, right: p2, leftVIdx: v1Idx, rightVIdx: v2Idx };
      }
    }
  }

  return null;
}

function funnel_dual(portals: Portal[], corridor: number[], result: DualCorner, navmesh: Navmesh): void {
  if (portals.length === 0) {
    // This shouldn't happen, but handle it gracefully
    set(result.corner1, 0, 0);
    set(result.corner2, 0, 0);
    result.tri1 = -1;
    result.tri2 = -1;
    result.vIdx1 = -1;
    result.vIdx2 = -1;
    result.numValid = 0;
    return;
  }
  if (portals.length === 1) {
    const corner = portals[0].left;
    const poly = corridor[0] ?? -1;
    const tri = poly !== -1 ? getTriangleFromPolyPoint(navmesh, corner, poly) : -1;
    set_(result.corner1, corner);
    result.tri1 = tri;
    result.vIdx1 = portals[0].leftVIdx;
    set_(result.corner2, corner);
    result.tri2 = tri;
    result.vIdx2 = portals[0].leftVIdx;
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
            // Map portal index to corridor index: portal 0 = start, portal i (i>0) = between corridor[i-1] and corridor[i]
            // (this whole indexing thing might be totaly wrong)
            const corridorIdx = leftIndex > 0 ? corridor.length - leftIndex : corridor.length - 1;
            const leftVIdx = (leftIndex > 0 && leftIndex < portals.length) ? portals[leftIndex].leftVIdx : -1;
            
            result.tri1 = findTriangleForPortalPoint(navmesh, portalLeft, leftVIdx, corridor[corridorIdx], "corner1");
            result.vIdx1 = leftVIdx;
            cornersFound = 1;
          }
        } else {
          const corner1EqualsLeft = isPointsEqual(result.corner1, portalLeft);
          if (!corner1EqualsLeft) {
            set_(result.corner2, portalLeft);
            const corridorIdx = leftIndex > 0 ? corridor.length - leftIndex : corridor.length - 1;
            const leftVIdx = (leftIndex > 0 && leftIndex < portals.length) ? portals[leftIndex].leftVIdx : -1;
            
            result.tri2 = findTriangleForPortalPoint(navmesh, portalLeft, leftVIdx, corridor[corridorIdx], "corner2");
            result.vIdx2 = leftVIdx;
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
            const corridorIdx = rightIndex > 0 ? corridor.length - rightIndex : corridor.length - 1;
            const rightVIdx = (rightIndex > 0 && rightIndex < portals.length) ? portals[rightIndex].rightVIdx : -1;
            
            result.tri1 = findTriangleForPortalPoint(navmesh, portalRight, rightVIdx, corridor[corridorIdx], "corner1 (right)");
            result.vIdx1 = rightVIdx;
            cornersFound = 1;
          }
        } else {
          const corner1EqualsRight = isPointsEqual(result.corner1, portalRight);
          if (!corner1EqualsRight) {
            set_(result.corner2, portalRight);
            const corridorIdx = rightIndex > 0 ? corridor.length - rightIndex : corridor.length - 1;
            const rightVIdx = (rightIndex > 0 && rightIndex < portals.length) ? portals[rightIndex].rightVIdx : -1;
            
            result.tri2 = findTriangleForPortalPoint(navmesh, portalRight, rightVIdx, corridor[corridorIdx], "corner2 (right)");
            result.vIdx2 = rightVIdx;
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
    result.vIdx1 = -1;
    result.numValid = 1;
  }
}

function funnel(portals: Portal[], corridor: number[], _navmesh: Navmesh): Corner[] {
  if (portals.length < 2) {
    return [{ point: portals[0]?.left || { x: 0, y: 0 }, tri: corridor[corridor.length-1] ?? -1 }];
  }

  const path: Corner[] = [];
  path.push({ point: portals[0].left, tri: corridor[corridor.length - 1] });

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
        const corridorIdx = leftIndex > 0 ? corridor.length - leftIndex : corridor.length - 1;
        path.push({ point: portalLeft, tri: corridor[corridorIdx] });
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
        const corridorIdx = rightIndex > 0 ? corridor.length - rightIndex : corridor.length - 1;
        path.push({ point: portalRight, tri: corridor[corridorIdx] });
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
    path.push({ point: lastPortal.left, tri: corridor[0] });
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
