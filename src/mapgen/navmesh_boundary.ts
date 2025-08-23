import { MyPoint, MyPolygon } from './navmesh_struct';

export interface BoundaryData {
    outerBoundary: MyPolygon;
    boundaryBlobs: MyPolygon[];
    boundaryTriangles: MyPolygon[];
    fakeBuildingsData: any[];
}

/**
 * Generate boundary geometry and triangulation as described in section 1.2
 * Creates two boundary blobs (East and West) with explicit triangulation
 */
export function generateBoundary(processingBbox: readonly [number, number, number, number], inflation: number): BoundaryData {
    console.log('Generating boundary geometry...');
    
    // Step 1: Define outer bounding box with inflation
    const minX = processingBbox[0] - inflation;
    const minY = processingBbox[1] - inflation;
    const maxX = processingBbox[2] + inflation;
    const maxY = processingBbox[3] + inflation;
    
    // Define the four corner vertices of the bounding box
    const x1: MyPoint = [minX, maxY]; // top-left
    const x2: MyPoint = [maxX, maxY]; // top-right
    const x3: MyPoint = [maxX, minY]; // bottom-right
    const x4: MyPoint = [minX, minY]; // bottom-left
    
    // Step 2: Project outward points from edge midpoints
    const horizontalEdgeLength = maxX - minX;
    const verticalEdgeLength = maxY - minY;
    
    // Project outwards by the length of the adjacent edge
    const N: MyPoint = [(minX + maxX) / 2, maxY + horizontalEdgeLength]; // North (adjacent to horizontal edge)
    const E: MyPoint = [maxX + verticalEdgeLength, (minY + maxY) / 2];   // East (adjacent to vertical edge)  
    const S: MyPoint = [(minX + maxX) / 2, minY - horizontalEdgeLength]; // South (adjacent to horizontal edge)
    const W: MyPoint = [minX - verticalEdgeLength, (minY + maxY) / 2];   // West (adjacent to vertical edge)
    
    // console.log(`Boundary vertices:
    // x1 (top-left): [${x1[0]}, ${x1[1]}]
    // x2 (top-right): [${x2[0]}, ${x2[1]}]  
    // x3 (bottom-right): [${x3[0]}, ${x3[1]}]
    // x4 (bottom-left): [${x4[0]}, ${x4[1]}]
    // N (north): [${N[0]}, ${N[1]}]
    // E (east): [${E[0]}, ${E[1]}]
    // S (south): [${S[0]}, ${S[1]}]
    // W (west): [${W[0]}, ${W[1]}]`);
    
    // Step 3: Define the two boundary blobs
    // Blob 1 (East): 6-vertex polygon (x1, N, E, S, x3, x2)
    const blob1: MyPolygon = [x1, N, E, S, x3, x2];
    
    // Blob 2 (West): 6-vertex polygon (x3, S, W, N, x1, x4)  
    const blob2: MyPolygon = [x3, S, W, N, x1, x4];
    
    // Step 4: Explicit triangulation (8 triangles total, 4 per blob)
    // All triangles follow counter-clockwise (CCW) winding order
    const blob1Triangles: MyPolygon[] = [
        [x1, x2, N],    // Triangle 1
        [x2, x3, E],    // Triangle 2  
        [N, x2, E],     // Triangle 3
        [E, x3, S]      // Triangle 4
    ];
    
    const blob2Triangles: MyPolygon[] = [
        [x3, x4, S],    // Triangle 5
        [x4, x1, W],    // Triangle 6
        [S, x4, W],     // Triangle 7
        [W, x1, N]      // Triangle 8
    ];
    
    const allBoundaryTriangles = [...blob1Triangles, ...blob2Triangles];
    
    // Step 5: Create fake building entries in a format compatible with real buildings
    const fakeBuildingsData: any[] = [
        {
            type: "Feature",
            geometry: {
                type: "Polygon",
                coordinates: [blob1]
            },
            properties: {
                osm_id: "outside1",
                building: 'outside'
            }
        },
        {
            type: "Feature",
            geometry: {
                type: "Polygon",
                coordinates: [blob2]
            },
            properties: {
                osm_id: 'outside2',
                building: 'outside'
            }
        }
    ];
    
    // The outer boundary for triangulation is the original bounding box
    const outerBoundary: MyPolygon = [x1, x2, x3, x4];
    
    // console.log(`Generated boundary with:
    // - 2 boundary blobs (${blob1.length} and ${blob2.length} vertices each)
    // - 8 explicit triangles (4 per blob)
    // - 2 fake building entries`);
    
    return {
        outerBoundary,
        boundaryBlobs: [blob1, blob2],
        boundaryTriangles: allBoundaryTriangles,
        fakeBuildingsData
    };
}

/**
 * Validate that boundary triangles follow CCW winding order
 */
function validateTriangleWinding(triangle: MyPolygon): boolean {
    if (triangle.length !== 3) return false;
    
    const [p1, p2, p3] = triangle;
    // Calculate the signed area using the cross product
    // Positive area indicates CCW winding
    const signedArea = (p2[0] - p1[0]) * (p3[1] - p1[1]) - (p3[0] - p1[0]) * (p2[1] - p1[1]);
    return signedArea > 0;
}

/**
 * Validate all boundary triangles have correct winding
 */
export function validateBoundaryTriangulation(boundaryData: BoundaryData): boolean {
    let allValid = true;
    boundaryData.boundaryTriangles.forEach((triangle, index) => {
        const isValid = validateTriangleWinding(triangle);
        if (!isValid) {
            console.error(`Triangle ${index} has incorrect winding order:`, triangle);
            allValid = false;
        }
    });
    
    if (allValid) {
        console.log('✓ All boundary triangles have correct CCW winding');
    }
    
    return allValid;
} 