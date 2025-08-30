"use strict";
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
  if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
    if (ar || !(i in from)) {
      if (!ar) ar = Array.prototype.slice.call(from, 0, i);
      ar[i] = from[i];
    }
  }
  return to.concat(ar || Array.prototype.slice.call(from));
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateBoundaryTriangulation = exports.generateBoundary = void 0;
/**
 * Generate boundary geometry and triangulation as described in section 1.2
 * Creates two boundary blobs (East and West) with explicit triangulation
 */
function generateBoundary(processingBbox, inflation) {
  if (inflation === void 0) { inflation = 100; }
  console.log('Generating boundary geometry...');
  // Step 1: Define outer bounding box with inflation
  var minX = processingBbox[0] - inflation;
  var minY = processingBbox[1] - inflation;
  var maxX = processingBbox[2] + inflation;
  var maxY = processingBbox[3] + inflation;
  // Define the four corner vertices of the bounding box
  var x1 = [minX, maxY]; // top-left
  var x2 = [maxX, maxY]; // top-right
  var x3 = [maxX, minY]; // bottom-right
  var x4 = [minX, minY]; // bottom-left
  // Step 2: Project outward points from edge midpoints
  var edgeLength = maxX - minX; // Assuming square or similar dimensions
  var verticalEdgeLength = maxY - minY;
  // Project outwards by the length of each edge
  var N = [(minX + maxX) / 2, maxY + verticalEdgeLength]; // North
  var E = [maxX + edgeLength, (minY + maxY) / 2]; // East  
  var S = [(minX + maxX) / 2, minY - verticalEdgeLength]; // South
  var W = [minX - edgeLength, (minY + maxY) / 2]; // West
  console.log("Boundary vertices:\n  x1 (top-left): [".concat(x1[0], ", ").concat(x1[1], "]\n  x2 (top-right): [").concat(x2[0], ", ").concat(x2[1], "]  \n  x3 (bottom-right): [").concat(x3[0], ", ").concat(x3[1], "]\n  x4 (bottom-left): [").concat(x4[0], ", ").concat(x4[1], "]\n  N (north): [").concat(N[0], ", ").concat(N[1], "]\n  E (east): [").concat(E[0], ", ").concat(E[1], "]\n  S (south): [").concat(S[0], ", ").concat(S[1], "]\n  W (west): [").concat(W[0], ", ").concat(W[1], "]"));
  // Step 3: Define the two boundary blobs
  // Blob 1 (East): 6-vertex polygon (x1, N, E, S, x3, x2)
  var blob1 = [x1, N, E, S, x3, x2];
  // Blob 2 (West): 6-vertex polygon (x3, S, W, N, x1, x4)  
  var blob2 = [x3, S, W, N, x1, x4];
  // Step 4: Explicit triangulation (8 triangles total, 4 per blob)
  // All triangles follow counter-clockwise (CCW) winding order
  var blob1Triangles = [
    [x1, N, x2], // Triangle 1
    [x2, E, x3], // Triangle 2  
    [N, E, x2], // Triangle 3
    [E, S, x3] // Triangle 4
  ];
  var blob2Triangles = [
    [x3, S, x4], // Triangle 5
    [x4, W, x1], // Triangle 6
    [S, W, x4], // Triangle 7
    [W, N, x1] // Triangle 8
  ];
  var allBoundaryTriangles = __spreadArray(__spreadArray([], blob1Triangles, true), blob2Triangles, true);
  // Step 5: Create fake building entries
  var fakeBuildingsData = [
    {
      id: -1, // Special ID for boundary blob 1
      vertices: blob1,
      metadata: {
        name: 'outside1',
        type: 'boundary',
        isBoundary: true
      }
    },
    {
      id: -2, // Special ID for boundary blob 2  
      vertices: blob2,
      metadata: {
        name: 'outside2',
        type: 'boundary',
        isBoundary: true
      }
    }
  ];
  // The outer boundary for triangulation is the original bounding box
  var outerBoundary = [x1, x2, x3, x4];
  console.log("Generated boundary with:\n  - 2 boundary blobs (".concat(blob1.length, " and ").concat(blob2.length, " vertices each)\n  - 8 explicit triangles (4 per blob)\n  - 2 fake building entries"));
  return {
    outerBoundary: outerBoundary,
    boundaryBlobs: [blob1, blob2],
    boundaryTriangles: allBoundaryTriangles,
    fakeBuildingsData: fakeBuildingsData
  };
}
exports.generateBoundary = generateBoundary;
/**
 * Validate that boundary triangles follow CCW winding order
 */
function validateTriangleWinding(triangle) {
  if (triangle.length !== 3)
    return false;
  var p1 = triangle[0], p2 = triangle[1], p3 = triangle[2];
  // Calculate the signed area using the cross product
  // Positive area indicates CCW winding
  var signedArea = (p2[0] - p1[0]) * (p3[1] - p1[1]) - (p3[0] - p1[0]) * (p2[1] - p1[1]);
  return signedArea > 0;
}
/**
 * Validate all boundary triangles have correct winding
 */
function validateBoundaryTriangulation(boundaryData) {
  console.log('Validating boundary triangulation...');
  var allValid = true;
  boundaryData.boundaryTriangles.forEach(function (triangle, index) {
    var isValid = validateTriangleWinding(triangle);
    if (!isValid) {
      console.error("Triangle ".concat(index, " has incorrect winding order:"), triangle);
      allValid = false;
    }
  });
  if (allValid) {
    console.log('✓ All boundary triangles have correct CCW winding');
  }
  return allValid;
}
exports.validateBoundaryTriangulation = validateBoundaryTriangulation;
