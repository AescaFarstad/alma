import { Navmesh, SPATIAL_INDEX_CELL_SIZE } from "../navmesh/Navmesh";
import { WasmFacade } from "../WasmFacade";

const SIMD_ALIGNMENT = 16; // 16-byte alignment for SIMD

function alignTo(size: number, alignment: number): number {
    return Math.ceil(size / alignment) * alignment;
}

export function calculateNavmeshMemory(navmeshBin: ArrayBuffer): number {
    // Parse header structure (after BBOX: now 8 floats = 32 bytes for both real and buffered bbox)
    const headerView = new DataView(navmeshBin, 32, 14 * 4);
    
    const trianglesLen = headerView.getInt32(4, true);
    const buildingsLen = headerView.getInt32(32, true);
    const blobBuildingsLen = headerView.getInt32(40, true);
    const walkableTriangleCount = headerView.getInt32(44, true);
    const walkablePolygonCount = headerView.getInt32(48, true);
    
    // Parse both bboxes
    const bboxView = new DataView(navmeshBin, 0, 32);
    const realMinX = bboxView.getFloat32(0, true);
    const realMinY = bboxView.getFloat32(4, true);
    const realMaxX = bboxView.getFloat32(8, true);
    const realMaxY = bboxView.getFloat32(12, true);
    const bufferedMinX = bboxView.getFloat32(16, true);
    const bufferedMinY = bboxView.getFloat32(20, true);
    const bufferedMaxX = bboxView.getFloat32(24, true);
    const bufferedMaxY = bboxView.getFloat32(28, true);
    
    // Use buffered bbox + additional inflation for spatial index calculations (matches C++ behavior)
    const spatialIndexInflation = 50;
    const spatialMinX = bufferedMinX - spatialIndexInflation;
    const spatialMinY = bufferedMinY - spatialIndexInflation;
    const spatialMaxX = bufferedMaxX + spatialIndexInflation;
    const spatialMaxY = bufferedMaxY + spatialIndexInflation;
    
    const cellSize = SPATIAL_INDEX_CELL_SIZE;
    const spatialWidth = spatialMaxX - spatialMinX;
    const spatialHeight = spatialMaxY - spatialMinY;
    const gridWidth = Math.ceil(spatialWidth / cellSize);
    const gridHeight = Math.ceil(spatialHeight / cellSize);
    const totalCells = gridWidth * gridHeight;

    console.log(`[TS NavmeshInit] Real bbox=(minX: ${realMinX.toFixed(2)}, minY: ${realMinY.toFixed(2)}, maxX: ${realMaxX.toFixed(2)}, maxY: ${realMaxY.toFixed(2)})`);
    console.log(`[TS NavmeshInit] Buffered bbox=(minX: ${bufferedMinX.toFixed(2)}, minY: ${bufferedMinY.toFixed(2)}, maxX: ${bufferedMaxX.toFixed(2)}, maxY: ${bufferedMaxY.toFixed(2)})`);
    console.log(`[TS NavmeshInit] Spatial index bbox=(minX: ${spatialMinX.toFixed(2)}, minY: ${spatialMinY.toFixed(2)}, maxX: ${spatialMaxX.toFixed(2)}, maxY: ${spatialMaxY.toFixed(2)}) (buffered + ${spatialIndexInflation})`);
    console.log(`[TS NavmeshInit] Using spatial index bbox: width=${spatialWidth.toFixed(2)}, height=${spatialHeight.toFixed(2)}, cellSize=${cellSize}`);
    console.log(`[TS NavmeshInit] gridWidth=${gridWidth}, gridHeight=${gridHeight}, totalCells=${totalCells}`);
    
    let totalMemory = 0;
    
    // 1. Raw binary data from file
    totalMemory += alignTo(navmeshBin.byteLength, SIMD_ALIGNMENT);
    
    // 2. Auxiliary structures computed in C++
    totalMemory += alignTo(walkableTriangleCount * 2 * 4, SIMD_ALIGNMENT); // triangle_centroids (Point2)
    totalMemory += alignTo((trianglesLen / 3) * 4, SIMD_ALIGNMENT); // triangle_to_polygon 
    totalMemory += alignTo(buildingsLen * 4, SIMD_ALIGNMENT); // building_to_blob
    
    // 3. Spatial indices (using 2x average for triangles/buildings, 3x for polygons)
    // Triangle spatial index
    totalMemory += alignTo((totalCells + 1) * 4, SIMD_ALIGNMENT); // tri_cell_offsets
    totalMemory += alignTo(walkableTriangleCount * 2 * 4, SIMD_ALIGNMENT); // tri_cell_triangles (2x average)
    
    // Polygon spatial index
    if (walkablePolygonCount > 0) {
        totalMemory += alignTo((totalCells + 1) * 4, SIMD_ALIGNMENT); // poly_cell_offsets
        totalMemory += alignTo(walkablePolygonCount * 3 * 4, SIMD_ALIGNMENT); // poly_cell_items (3x average)
    }
    
    // Building spatial index
    const totalBuildings = buildingsLen > 0 ? buildingsLen - 1 : 0; // buildings array has +1 for indexing
    if (totalBuildings > 0) {
        totalMemory += alignTo((totalCells + 1) * 4, SIMD_ALIGNMENT); // building_cell_offsets
        totalMemory += alignTo(totalBuildings * 2 * 4, SIMD_ALIGNMENT); // building_cell_items (2x average)
    }
    
    // Blob spatial index  
    if (blobBuildingsLen > 0) {
        totalMemory += alignTo((totalCells + 1) * 4, SIMD_ALIGNMENT); // blob_cell_offsets
        totalMemory += alignTo(blobBuildingsLen * 2 * 4, SIMD_ALIGNMENT); // blob_cell_items (2x average)
    }
    
    return totalMemory;
}

export async function initializeNavmesh(wasm: WasmFacade, buffer: ArrayBuffer, offset: number, navmeshBin: ArrayBuffer, navmesh: Navmesh, availableMemory: number): Promise<number> {
    // Copy binary data to WASM buffer at offset
    const targetView = new Uint8Array(buffer, offset, navmeshBin.byteLength);
    targetView.set(new Uint8Array(navmeshBin));
    
    // Call WASM function to initialize navmesh - pass centralized cell size
    const actualMemoryUsed = wasm._init_navmesh_from_bin(offset, navmeshBin.byteLength, availableMemory, SPATIAL_INDEX_CELL_SIZE);
    if (actualMemoryUsed === 0) {
        throw new Error("Failed to initialize navmesh in WASM");
    }

    initializeNavmeshViews(navmesh, wasm);

    initializeSpatialIndices(navmesh, wasm);
    
    // Load building properties after navmesh data is initialized
    await loadBuildingProperties(navmesh);
    
    // Return actual bytes used (as reported by C++)
    return actualMemoryUsed;
}

async function loadBuildingProperties(navmesh: Navmesh): Promise<void> {
    try {
        const response = await fetch('/data/building_properties.json');
        if (!response.ok) {
            console.warn(`Failed to fetch building properties: ${response.statusText}`);
            return;
        }
        
        const buildingProperties = await response.json();
        if (!Array.isArray(buildingProperties)) {
            console.warn('Building properties JSON is not an array');
            return;
        }
        
        // Load properties into navmesh.building_properties with proper indexing
        navmesh.building_properties = buildingProperties;
        
        console.log(`Loaded ${buildingProperties.length} building properties`);
    } catch (error) {
        console.warn('Failed to load building properties:', error);
    }
}

function initializeNavmeshViews(navmesh: Navmesh, wasm: WasmFacade): void {
    if (!wasm._get_g_navmesh_ptr) {
        throw new Error("get_g_navmesh_ptr function not available");
    }

    const navmeshDataPtr = wasm._get_g_navmesh_ptr();
    if (navmeshDataPtr === 0) {
        throw new Error("WASM navmesh data pointer is null");
    }

    const HEAP32 = wasm.HEAP32;
    const HEAPU32 = wasm.HEAPU32;
    const HEAPF32 = wasm.HEAPF32;

    // Read NavmeshData structure from WASM memory
    let offset = navmeshDataPtr / 4;
    
    if (offset >= HEAPU32.length) {
        throw new Error(`WASM navmesh data offset ${offset} is beyond HEAPU32 array bounds (length: ${HEAPU32.length})`);
    }

    // Read pointers
    const verticesPtr = HEAPU32[offset++];
    const trianglesPtr = HEAPU32[offset++];
    const neighborsPtr = HEAPU32[offset++];
    const polygonsPtr = HEAPU32[offset++];
    const polyCentroidsPtr = HEAPU32[offset++];
    const polyVertsPtr = HEAPU32[offset++];
    const polyTrisPtr = HEAPU32[offset++];
    const polyNeighborsPtr = HEAPU32[offset++];
    const buildingsPtr = HEAPU32[offset++];
    const buildingVertsPtr = HEAPU32[offset++];
    const blobBuildingsPtr = HEAPU32[offset++];

    // Read counts
    navmesh.walkable_triangle_count = HEAP32[offset++];
    navmesh.walkable_polygon_count = HEAP32[offset++];
    const totalVertices = HEAP32[offset++];
    const totalTriangles = HEAP32[offset++];
    const totalPolygons = HEAP32[offset++];
    const totalBuildings = HEAP32[offset++];

    // Get auxiliary pointers
    const triangleToPolygonPtr = HEAPU32[offset++];
    const buildingToBlobPtr = HEAPU32[offset++];

    // Get triangle_centroids pointer
    const triangleCentroidsPtr = HEAPU32[offset++];

    // Create typed array views
    navmesh.vertices = new Float32Array(HEAPF32.buffer, verticesPtr, totalVertices * 2);
    navmesh.triangles = new Int32Array(HEAP32.buffer, trianglesPtr, totalTriangles * 3);
    navmesh.neighbors = new Int32Array(HEAP32.buffer, neighborsPtr, totalTriangles * 3);

    if (totalPolygons > 0) {
        navmesh.polygons = new Int32Array(HEAP32.buffer, polygonsPtr, totalPolygons + 1);
        navmesh.poly_centroids = new Float32Array(HEAPF32.buffer, polyCentroidsPtr, totalPolygons * 2);
        navmesh.poly_verts = new Int32Array(HEAP32.buffer, polyVertsPtr);
        navmesh.poly_tris = new Int32Array(HEAP32.buffer, polyTrisPtr, totalPolygons + 1);
        navmesh.poly_neighbors = new Int32Array(HEAP32.buffer, polyNeighborsPtr);
    }

    if (totalBuildings > 0) {
        navmesh.buildings = new Int32Array(HEAP32.buffer, buildingsPtr, totalBuildings + 1);
        navmesh.building_verts = new Int32Array(HEAP32.buffer, buildingVertsPtr);
        navmesh.blob_buildings = new Int32Array(HEAP32.buffer, blobBuildingsPtr);
    }

    if (triangleCentroidsPtr !== 0) {
        navmesh.triangle_centroids = new Float32Array(HEAPF32.buffer, triangleCentroidsPtr, totalTriangles * 2);
    }

    // Initialize auxiliary structures
    if (triangleToPolygonPtr !== 0) {
        navmesh.triangle_to_polygon = new Int32Array(HEAP32.buffer, triangleToPolygonPtr, totalTriangles);
    }

    if (buildingToBlobPtr !== 0 && totalBuildings > 0) {
        navmesh.building_to_blob = new Int32Array(HEAP32.buffer, buildingToBlobPtr, totalBuildings);
    }

    // Parse BBOX from original binary (first 16 bytes)
    if (wasm._get_navmesh_bbox_ptr) {
        const bboxPtr = wasm._get_navmesh_bbox_ptr();
        if (bboxPtr !== 0) {
            // Now reads 8 floats: real bbox (4) + buffered bbox (4)
            const allBboxData = new Float32Array(HEAPF32.buffer, bboxPtr, 8);
            navmesh.bbox = new Float32Array(allBboxData.buffer, bboxPtr, 4); // Real bbox
            navmesh.buffered_bbox = new Float32Array(allBboxData.buffer, bboxPtr + 16, 4); // Buffered bbox (offset by 4 floats * 4 bytes = 16)
            
            console.log(`[TS NavmeshInit] Read real bbox: [${Array.from(navmesh.bbox).join(', ')}]`);
            console.log(`[TS NavmeshInit] Read buffered bbox: [${Array.from(navmesh.buffered_bbox).join(', ')}]`);
        }
    }
}

function initializeSpatialIndices(navmesh: Navmesh, wasm: WasmFacade): void {
    if (!wasm._get_spatial_index_data) {
        return;
    }

    const spatialIndexDataPtr = wasm._get_spatial_index_data();
    if (spatialIndexDataPtr === 0) {
        return;
    }

    const HEAP32 = (wasm as any).HEAP32 as Int32Array;
    const HEAPU32 = (wasm as any).HEAPU32 as Uint32Array;
    const HEAPF32 = (wasm as any).HEAPF32 as Float32Array;
    
    // Read the SpatialIndexData structure
    let offset = spatialIndexDataPtr / 4;
    
    // Triangle spatial index
    const triCellOffsetsPtr = HEAPU32[offset++];
    const triCellTrianglesPtr = HEAPU32[offset++];
    const triGridWidth = HEAP32[offset++];
    const triGridHeight = HEAP32[offset++];
    const triCellSize = HEAPF32[offset++];
    const triMinX = HEAPF32[offset++];
    const triMinY = HEAPF32[offset++];
    const triMaxX = HEAPF32[offset++];
    const triMaxY = HEAPF32[offset++];
    const triCellOffsetsCount = HEAPU32[offset++];
    const triCellTrianglesCount = HEAPU32[offset++];

    console.log(`[TS NavmeshInit] From WASM: gridWidth=${triGridWidth}, gridHeight=${triGridHeight}, cellSize=${triCellSize}`);
    
    // Skip auxiliary lookup maps (already handled)
    offset += 4; // triangle_to_polygon, building_to_blob, total_triangles, total_buildings
    
    // Polygon spatial index
    const polyCellOffsetsPtr = HEAPU32[offset++];
    const polyCellItemsPtr = HEAPU32[offset++];
    const polyCellOffsetsCount = HEAPU32[offset++];
    const polyCellItemsCount = HEAPU32[offset++];
    
    // Blob spatial index
    const blobCellOffsetsPtr = HEAPU32[offset++];
    const blobCellItemsPtr = HEAPU32[offset++];
    const blobCellOffsetsCount = HEAPU32[offset++];
    const blobCellItemsCount = HEAPU32[offset++];
    
    // Building spatial index
    const buildingCellOffsetsPtr = HEAPU32[offset++];
    const buildingCellItemsPtr = HEAPU32[offset++];
    const buildingCellOffsetsCount = HEAPU32[offset++];
    const buildingCellItemsCount = HEAPU32[offset++];

    // Initialize triangle spatial index
    navmesh.triangleIndex.initializeFromWasm(
        triCellOffsetsPtr, triCellTrianglesPtr, 
        triCellOffsetsCount, triCellTrianglesCount,
        triGridWidth, triGridHeight, triCellSize,
        triMinX, triMinY, triMaxX, triMaxY,
        wasm.HEAPU8.buffer as ArrayBuffer
    );

    // Initialize polygon spatial index (if available)
    if (polyCellOffsetsPtr !== 0 && polyCellOffsetsCount > 0) {
        navmesh.polygonIndex.initializeFromWasm(
            polyCellOffsetsPtr, polyCellItemsPtr,
            polyCellOffsetsCount, polyCellItemsCount,
            triGridWidth, triGridHeight, triCellSize, // Use same grid params
            triMinX, triMinY, triMaxX, triMaxY,
            wasm.HEAPU8.buffer as ArrayBuffer
        );
    }

    // Initialize building spatial index (if available)
    if (buildingCellOffsetsPtr !== 0 && buildingCellOffsetsCount > 0) {
        navmesh.buildingIndex.initializeFromWasm(
            buildingCellOffsetsPtr, buildingCellItemsPtr,
            buildingCellOffsetsCount, buildingCellItemsCount,
            triGridWidth, triGridHeight, triCellSize, // Use same grid params
            triMinX, triMinY, triMaxX, triMaxY,
            wasm.HEAPU8.buffer as ArrayBuffer
        );
    }

    // Initialize blob spatial index (if available)
    if (blobCellOffsetsPtr !== 0 && blobCellOffsetsCount > 0) {
        navmesh.blobIndex.initializeFromWasm(
            blobCellOffsetsPtr, blobCellItemsPtr,
            blobCellOffsetsCount, blobCellItemsCount,
            triGridWidth, triGridHeight, triCellSize, // Use same grid params
            triMinX, triMinY, triMaxX, triMaxY,
            wasm.HEAPU8.buffer as ArrayBuffer
        );
    }
}