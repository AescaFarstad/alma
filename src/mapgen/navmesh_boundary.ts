import { MyPoint, MyPolygon } from './navmesh_struct';

export interface BoundaryData {
  outerBoundary: MyPolygon;     // Dynamic saw-tooth outer polygon for triangulation
  boundaryBlobs: MyPolygon[];   // Two outside blobs (East/West), with saw-shaped inner edges
  fakeBuildingsData: any[];     // Fake buildings covering the outside blobs
}

// Saw-tooth parameters (as requested)
const SAW_TOOTH_COUNT_X = 12; // top/bottom edges
const SAW_TOOTH_COUNT_Y = 8; // left/right edges
const SAW_TOOTH_DEPTH = 50;  // inward offset

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function generateHorizontalSaw(
  start: MyPoint, // [x1, y]
  end: MyPoint,   // [x2, y]
  segments: number,
  inwardSignY: number // +1 to move up, -1 to move down
): MyPolygon {
  const [xA, y] = start;
  const [xB] = end;
  const pts: MyPolygon = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const x = lerp(xA, xB, t);
    const isOdd = i % 2 === 1;
    const yOffset = isOdd ? SAW_TOOTH_DEPTH * inwardSignY : 0;
    pts.push([x, y + yOffset]);
  }
  return pts;
}

function generateVerticalSaw(
  start: MyPoint, // [x, y1]
  end: MyPoint,   // [x, y2]
  segments: number,
  inwardSignX: number // +1 to move right, -1 to move left
): MyPolygon {
  const [x, yA] = start;
  const [, yB] = end;
  const pts: MyPolygon = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const y = lerp(yA, yB, t);
    const isOdd = i % 2 === 1;
    const xOffset = isOdd ? SAW_TOOTH_DEPTH * inwardSignX : 0;
    pts.push([x + xOffset, y]);
  }
  return pts;
}

/**
 * Generate boundary geometry using two outside blobs with saw-shaped inner edges,
 * and a dynamic outer boundary polygon (built from those saw edges) for triangulation.
 */
export function generateBoundary(processingBbox: readonly [number, number, number, number], inflation: number): BoundaryData {
  console.log('Generating boundary geometry with saw-tooth edges...');

  // Step 1: Define inflated bounding box
  const minX = processingBbox[0] - inflation;
  const minY = processingBbox[1] - inflation;
  const maxX = processingBbox[2] + inflation;
  const maxY = processingBbox[3] + inflation;

  // Corners
  const x1: MyPoint = [minX, maxY]; // top-left
  const x2: MyPoint = [maxX, maxY]; // top-right
  const x3: MyPoint = [maxX, minY]; // bottom-right
  const x4: MyPoint = [minX, minY]; // bottom-left

  // Step 2: Far outside points (unchanged geometry for blobs)
  const horizontalEdgeLength = maxX - minX;
  const verticalEdgeLength = maxY - minY;

  const N: MyPoint = [(minX + maxX) / 2, maxY + horizontalEdgeLength];
  const E: MyPoint = [maxX + verticalEdgeLength, (minY + maxY) / 2];
  const S: MyPoint = [(minX + maxX) / 2, minY - horizontalEdgeLength];
  const W: MyPoint = [minX - verticalEdgeLength, (minY + maxY) / 2];

  // Step 3: Build saw-tooth polylines for inner edges
  // Top (x1 -> x2): inward is downwards (-y)
  const sawTop_LtoR = generateHorizontalSaw(x1, x2, SAW_TOOTH_COUNT_X, -1);
  // Right (x2 -> x3): inward is leftwards (-x)
  const sawRight_TtoB = generateVerticalSaw(x2, x3, SAW_TOOTH_COUNT_Y, -1);
  // Bottom (x3 -> x4): inward is upwards (+y)
  const sawBottom_RtoL = generateHorizontalSaw(x3, x4, SAW_TOOTH_COUNT_X, +1);
  // Left (x4 -> x1): inward is rightwards (+x)
  const sawLeft_BtoT = generateVerticalSaw(x4, x1, SAW_TOOTH_COUNT_Y, +1);

  // For blob construction, we sometimes need reversed orders to match CCW vertex order.
  const sawRight_BtoT = [...sawRight_TtoB].reverse();
  const sawTop_RtoL = [...sawTop_LtoR].reverse();
  const sawLeft_TtoB = [...sawLeft_BtoT].reverse();
  const sawBottom_LtoR = [...sawBottom_RtoL].reverse();

  // Step 4: Build boundary blobs with saw-shaped inner surfaces
  // East blob original order: [x1, N, E, S, x3, x2]
  // Replace inner edges x3->x2 and x2->x1 with sawRight_BtoT and sawTop_RtoL respectively
  // Avoid duplicating shared endpoints when concatenating
  const eastInnerVertical = sawRight_BtoT; // x3 -> ... -> x2
  // Drop x2 (first) and x1 (last) to avoid duplicated corner with polygon start
  const eastInnerTop = sawTop_RtoL.slice(1, -1); // goes x2->...->x1 but without endpoints
  const blobEast: MyPolygon = [
    x1, N, E, S,
    ...eastInnerVertical,
    ...eastInnerTop
  ];

  // West blob original order: [x3, S, W, N, x1, x4]
  // Replace inner edges x1->x4 and x4->x3 with sawLeft_TtoB and sawBottom_LtoR
  const westInnerVertical = sawLeft_TtoB; // x1 -> ... -> x4
  // Drop x4 (first) and x3 (last) to avoid duplicated corner with polygon start
  const westInnerBottom = sawBottom_LtoR.slice(1, -1); // goes x4->...->x3 but without endpoints
  const blobWest: MyPolygon = [
    x3, S, W, N,
    ...westInnerVertical,
    ...westInnerBottom
  ];

  // Step 5: Build dynamic outer boundary polygon (CCW), using only the saw-tooth edges
  // Order: top (x1->x2), right (x2->x3), bottom (x3->x4), left (x4->x1)
  const outerBoundary: MyPolygon = [
    ...sawTop_LtoR,
    ...sawRight_TtoB.slice(1),
    ...sawBottom_RtoL.slice(1),
    // Drop both endpoints on the final edge to avoid duplicating x4 (already in bottom) and x1 (first vertex)
    ...sawLeft_BtoT.slice(1, -1)
  ];

  // Step 6: Fake buildings covering the outside blobs (unchanged)
  const fakeBuildingsData: any[] = [
    {
      type: 'Feature',
      geometry: { type: 'Polygon', coordinates: [blobEast] },
      properties: { osm_id: 'outside1', building: 'outside' }
    },
    {
      type: 'Feature',
      geometry: { type: 'Polygon', coordinates: [blobWest] },
      properties: { osm_id: 'outside2', building: 'outside' }
    }
  ];

  return {
    outerBoundary,
    boundaryBlobs: [blobEast, blobWest],
    fakeBuildingsData
  };
}
