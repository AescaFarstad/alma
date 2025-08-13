import type { Navmesh } from "./Navmesh";
import { Point2, triangleAABBIntersectionWithBounds, isPointInTriangle } from "../core/math";
import { seededRandom } from "../core/mathUtils";
import { getWasmModule } from "../../WasmModule";

export class NavTriIndex {
    private cellOffsets: Uint32Array = new Uint32Array(0);
    private cellTriangles: Int32Array = new Int32Array(0);
    private cellSize: number = 128; // Default grid cell size
    private gridWidth: number = 0;
    private gridHeight: number = 0;
    private minX: number = 0;
    private minY: number = 0;
    private maxX: number = 0;
    private maxY: number = 0;

    constructor(navmesh: Navmesh) {
        const wasm = getWasmModule();
        let navTriIndexDataPtr = 0;

        if (wasm) {
            try {
                const getter = (wasm.cwrap && (wasm.cwrap("get_nav_tri_index_data_ptr", "number", [] as any))) as undefined | (() => number);
                if (getter) {
                    navTriIndexDataPtr = getter();
                } else if ((wasm as any)._g_navTriIndexData) {
                    navTriIndexDataPtr = (wasm as any)._g_navTriIndexData as number;
                }
            } catch {}
        }

        const hasValidWasmIndex = !!(
            wasm &&
            navTriIndexDataPtr > 0 &&
            (wasm as any).HEAP32 &&
            (wasm as any).HEAPF32 &&
            (wasm as any).HEAPU8
        );

        if (!hasValidWasmIndex) {
            // this.buildIndex(navmesh);
            console.error("!hasValidWasmIndex")
            return;
        }

        try {
            const HEAP32 = (wasm as any).HEAP32 as Int32Array;
            const HEAPF32 = (wasm as any).HEAPF32 as Float32Array;
            const HEAPU8 = (wasm as any).HEAPU8 as Uint8Array;
            
            const cellOffsetsPtr = HEAP32[navTriIndexDataPtr / 4 + 0];
            const cellTrianglesPtr = HEAP32[navTriIndexDataPtr / 4 + 1];
            this.gridWidth = HEAP32[navTriIndexDataPtr / 4 + 2];
            this.gridHeight = HEAP32[navTriIndexDataPtr / 4 + 3];
            this.cellSize = HEAPF32[navTriIndexDataPtr / 4 + 4];
            this.minX = HEAPF32[navTriIndexDataPtr / 4 + 5];
            this.minY = HEAPF32[navTriIndexDataPtr / 4 + 6];
            this.maxX = HEAPF32[navTriIndexDataPtr / 4 + 7];
            this.maxY = HEAPF32[navTriIndexDataPtr / 4 + 8];
            const cellOffsetsCount = HEAP32[navTriIndexDataPtr / 4 + 9];
            const cellTrianglesCount = HEAP32[navTriIndexDataPtr / 4 + 10];

            this.cellOffsets = new Uint32Array(HEAPU8.buffer, cellOffsetsPtr, cellOffsetsCount);
            this.cellTriangles = new Int32Array(HEAPU8.buffer, cellTrianglesPtr, cellTrianglesCount);

            
        } catch (e) {
            console.error("Error initializing NavTriIndex from WASM, falling back to JS", e);
            this.buildIndex(navmesh);
        }
    }

    private buildIndex(navmesh: Navmesh): void {
        if (!navmesh.bbox) {
            throw new Error("Invalid navmesh bbox");
        }
        
        [this.minX, this.minY, this.maxX, this.maxY] = navmesh.bbox;

        const width = this.maxX - this.minX;
        const height = this.maxY - this.minY;

        // Ensure non-zero cell size
        if (!Number.isFinite(this.cellSize) || this.cellSize <= 0) {
            this.cellSize = 256;
        }

        // Guard against degenerate bbox
        if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
            this.gridWidth = 1;
            this.gridHeight = 1;
        } else {
            this.gridWidth = Math.max(1, Math.ceil(width / this.cellSize));
            this.gridHeight = Math.max(1, Math.ceil(height / this.cellSize));
        }
        
        const { points, triangles } = navmesh;
        const numTriangles = triangles.length / 3;

        const gridCellCount = this.gridWidth * this.gridHeight;
        const tempGrid: number[][] = Array.from({ length: gridCellCount }, () => []);

        for (let i = 0; i < numTriangles; i++) {
            const triVertexStartIndex = i * 3;
            const p1Index = triangles[triVertexStartIndex];
            const p2Index = triangles[triVertexStartIndex + 1];
            const p3Index = triangles[triVertexStartIndex + 2];
            const triPoints: Point2[] = [
                { x: points[p1Index * 2], y: points[p1Index * 2 + 1] },
                { x: points[p2Index * 2], y: points[p2Index * 2 + 1] },
                { x: points[p3Index * 2], y: points[p3Index * 2 + 1] },
            ];
            let triMinX = Infinity, triMinY = Infinity, triMaxX = -Infinity, triMaxY = -Infinity;
            for (const p of triPoints) {
                if (p.x < triMinX) triMinX = p.x;
                if (p.y < triMinY) triMinY = p.y;
                if (p.x > triMaxX) triMaxX = p.x;
                if (p.y > triMaxY) triMaxY = p.y;
            }
            
            const startX = Math.max(0, Math.floor((triMinX - this.minX) / this.cellSize));
            const endX = Math.min(this.gridWidth - 1, Math.floor((triMaxX - this.minX) / this.cellSize));
            const startY = Math.max(0, Math.floor((triMinY - this.minY) / this.cellSize));
            const endY = Math.min(this.gridHeight - 1, Math.floor((triMaxY - this.minY) / this.cellSize));
            for (let cx = startX; cx <= endX; cx++) {
                for (let cy = startY; cy <= endY; cy++) {
                    const cellMin: Point2 = {
                        x: this.minX + cx * this.cellSize,
                        y: this.minY + cy * this.cellSize,
                    };
                    const cellMax: Point2 = {
                        x: this.minX + (cx + 1) * this.cellSize,
                        y: this.minY + (cy + 1) * this.cellSize,
                    };

                    if (triangleAABBIntersectionWithBounds(
                        triPoints, 
                        { x: triMinX, y: triMinY }, 
                        { x: triMaxX, y: triMaxY }, 
                        cellMin, 
                        cellMax
                    )) {
                        const cellIndex = cx + cy * this.gridWidth;
                        tempGrid[cellIndex].push(i);
                    }
                }
            }
        }
        
        this.cellOffsets = new Uint32Array(gridCellCount + 1);
        let totalTriangles = 0;
        for (let i = 0; i < gridCellCount; i++) {
            this.cellOffsets[i] = totalTriangles;
            totalTriangles += tempGrid[i].length;
        }
        this.cellOffsets[gridCellCount] = totalTriangles;

        this.cellTriangles = new Int32Array(totalTriangles);
        for (let i = 0; i < gridCellCount; i++) {
            this.cellTriangles.set(tempGrid[i], this.cellOffsets[i]);
        }
    }

    public query(x: number, y: number): Int32Array {
        if (x < this.minX || x > this.maxX || y < this.minY || y > this.maxY) {
            return new Int32Array(0);
        }
        const cx = Math.floor((x - this.minX) / this.cellSize);
        const cy = Math.floor((y - this.minY) / this.cellSize);
        const cellIndex = cx + cy * this.gridWidth;

        const start = this.cellOffsets[cellIndex];
        const end = this.cellOffsets[cellIndex + 1];
        
        return this.cellTriangles.slice(start, end);
    }

    public getTrianglesInCell(cx: number, cy: number): Int32Array {
        const cellIndex = cx + cy * this.gridWidth;
        if (cellIndex < 0 || cellIndex >= this.cellOffsets.length - 1) {
            return new Int32Array(0);
        }
        const start = this.cellOffsets[cellIndex];
        const end = this.cellOffsets[cellIndex + 1];
        return this.cellTriangles.slice(start, end);
    }

    public isPointInNavmesh(point: Point2, navmesh: Navmesh, lastTriangle: number): number {
        const { points, triangles, neighbors } = navmesh;

        const checkTriangle = (triIdx: number) => {
            const triVertexStartIndex = triIdx * 3;
            const p1Index = triangles[triVertexStartIndex];
            const p2Index = triangles[triVertexStartIndex + 1];
            const p3Index = triangles[triVertexStartIndex + 2];
            
            const p1x = points[p1Index * 2];
            const p1y = points[p1Index * 2 + 1];
            const p2x = points[p2Index * 2];
            const p2y = points[p2Index * 2 + 1];
            const p3x = points[p3Index * 2];
            const p3y = points[p3Index * 2 + 1];
            
            return isPointInTriangle(point.x, point.y, p1x, p1y, p2x, p2y, p3x, p3y);
        };

        if (lastTriangle !== -1 && checkTriangle(lastTriangle)) {
            return lastTriangle;
        }

        if (lastTriangle !== -1) {
            const base = lastTriangle * 3;
            for (let i = 0; i < 3; i++) {
                const neighborIdx = neighbors[base + i];
                if (neighborIdx !== -1 && checkTriangle(neighborIdx)) {
                    return neighborIdx;
                }
            }
        }
        
        const candidateTriangles = this.query(point.x, point.y);
        for (const triIdx of candidateTriangles) {
            if (checkTriangle(triIdx)) {
                return triIdx;
            }
        }

        return -1;
    }

    public getCellBounds(point: Point2): { min: Point2; max: Point2 } | null {
        if (point.x < this.minX || point.x > this.maxX || point.y < this.minY || point.y > this.maxY) {
            return null;
        }

        const cx = Math.floor((point.x - this.minX) / this.cellSize);
        const cy = Math.floor((point.y - this.minY) / this.cellSize);

        const minX = this.minX + cx * this.cellSize;
        const maxX = this.minX + (cx + 1) * this.cellSize;
        const minY = this.minY + cy * this.cellSize;
        const maxY = this.minY + (cy + 1) * this.cellSize;

        return {
            min: { x: minX, y: minY },
            max: { x: maxX, y: maxY }
        };
    }

    public isGridCorner(p: Point2): boolean {
        return (p.x === this.minX || p.x === this.maxX) && (p.y === this.minY || p.y === this.maxY);
    }

    public getGridInfo() {
        return {
            gridWidth: this.gridWidth,
            gridHeight: this.gridHeight,
            cellSize: this.cellSize,
            minX: this.minX,
            minY: this.minY,
        };
    }

    public getRandomTriangle(navmesh: Navmesh, seed?: number): number {
        let currentSeed = seed ?? 12345;
        const maxAttempts = 10;
        
        for (let i = 0; i < maxAttempts; i++) {
            const { value: randomX, newSeed: newSeedX } = seededRandom(currentSeed);
            currentSeed = newSeedX;
            const { value: randomY, newSeed: newSeedY } = seededRandom(currentSeed);
            currentSeed = newSeedY;
            
            const x = this.minX + randomX * (this.maxX - this.minX);
            const y = this.minY + randomY * (this.maxY - this.minY);
            const point: Point2 = { x, y };
            const triIndex = this.isPointInNavmesh(point, navmesh, -1);
            if (triIndex !== -1) {
                return triIndex;
            }
        }

        const numTriangles = navmesh.triangles.length / 3;
        const { value } = seededRandom(currentSeed);
        return Math.floor(value * numTriangles);
    }

    public getRandomTriangleInArea(navmesh: Navmesh, centerX: number, centerY: number, numCellExtents: number, seed?: number): number {
        let currentSeed = seed ?? 12345;
        const maxAttempts = 20;
        
        const halfExtent = numCellExtents * this.cellSize;
        const minX = centerX - halfExtent;
        const maxX = centerX + halfExtent;
        const minY = centerY - halfExtent;
        const maxY = centerY + halfExtent;
        
        const clampedMinX = Math.max(minX, this.minX);
        const clampedMaxX = Math.min(maxX, this.maxX);
        const clampedMinY = Math.max(minY, this.minY);
        const clampedMaxY = Math.min(maxY, this.maxY);
        
        for (let i = 0; i < maxAttempts; i++) {
            const { value: randomX, newSeed: newSeedX } = seededRandom(currentSeed);
            currentSeed = newSeedX;
            const { value: randomY, newSeed: newSeedY } = seededRandom(currentSeed);
            currentSeed = newSeedY;
            
            const x = clampedMinX + randomX * (clampedMaxX - clampedMinX);
            const y = clampedMinY + randomY * (clampedMaxY - clampedMinY);
            const point: Point2 = { x, y };
            const triIndex = this.isPointInNavmesh(point, navmesh, -1);
            if (triIndex !== -1) {
                return triIndex;
            }
        }

        const startCellX = Math.max(0, Math.floor((clampedMinX - this.minX) / this.cellSize));
        const endCellX = Math.min(this.gridWidth - 1, Math.floor((clampedMaxX - this.minX) / this.cellSize));
        const startCellY = Math.max(0, Math.floor((clampedMinY - this.minY) / this.cellSize));
        const endCellY = Math.min(this.gridHeight - 1, Math.floor((clampedMaxY - this.minY) / this.cellSize));
        
        const candidateTriangles: number[] = [];
        for (let cx = startCellX; cx <= endCellX; cx++) {
            for (let cy = startCellY; cy <= endCellY; cy++) {
                const cellTriangles = this.getTrianglesInCell(cx, cy);
                for (const triIdx of cellTriangles) {
                    if (!candidateTriangles.includes(triIdx)) {
                        candidateTriangles.push(triIdx);
                    }
                }
            }
        }
        
        if (candidateTriangles.length > 0) {
            const { value } = seededRandom(currentSeed);
            const randomIndex = Math.floor(value * candidateTriangles.length);
            return candidateTriangles[randomIndex];
        }
        
        return this.getRandomTriangle(navmesh, currentSeed);
    }
} 