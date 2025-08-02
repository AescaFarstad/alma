import type { Navmesh } from "./Navmesh";
import { Point2, triangleAABBIntersectionWithBounds, isPointInTriangle } from "../core/math";

export class NavTriIndex {
    private cellOffsets: Uint32Array;
    private cellTriangles: Int32Array;
    private cellSize = 100; // Size of each cell in meters
    private gridWidth: number; // Number of cells along X axis
    private gridHeight: number; // Number of cells along Y axis
    private minX: number;
    private minY: number;
    private maxX: number;
    private maxY: number;

    constructor(navmesh: Navmesh) {
        if (!navmesh.bbox || navmesh.bbox.length !== 4) {
            throw new Error("Invalid navmesh bbox");
        }
        
        [this.minX, this.minY, this.maxX, this.maxY] = navmesh.bbox;

        const width = this.maxX - this.minX;
        const height = this.maxY - this.minY;
        this.gridWidth = Math.ceil(width / this.cellSize);
        this.gridHeight = Math.ceil(height / this.cellSize);

        this.cellOffsets = new Uint32Array(0);
        this.cellTriangles = new Int32Array(0);
        
        this.buildIndex(navmesh);
    }
    private buildIndex(navmesh: Navmesh): void {
        const { points, triangles } = navmesh;
        const numTriangles = triangles.length / 3;

        const gridCellCount = this.gridWidth * this.gridHeight;
        // Each cell stores triangle indices (logical indices), not triangle start indices
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
        
        // // Log triangle count per cell
        // console.log("NavTriIndex: Triangle distribution per cell:");
        // for (let cy = 0; cy < this.gridHeight; cy++) {
        //     for (let cx = 0; cx < this.gridWidth; cx++) {
        //         const cellIndex = cx + cy * this.gridWidth;
        //         const triangleCount = tempGrid[cellIndex].length;
        //         if (triangleCount > 0) {
        //             console.log(`Cell ${cx}, ${cy}: ${triangleCount}`);
        //         }
        //     }
        // }
        
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
        
        // Returns triangle indices. To access triangle data: triangles[triangle_idx * 3 + vertex_offset]
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
            const triPoints: Point2[] = [
                { x: points[p1Index * 2], y: points[p1Index * 2 + 1] },
                { x: points[p2Index * 2], y: points[p2Index * 2 + 1] },
                { x: points[p3Index * 2], y: points[p3Index * 2 + 1] },
            ];
            return isPointInTriangle(point, triPoints[0], triPoints[1], triPoints[2]);
        };

        if (lastTriangle !== -1 && checkTriangle(lastTriangle)) {
            return lastTriangle;
        }

        if (lastTriangle !== -1) {
            const triNeighbors = neighbors.slice(lastTriangle * 3, lastTriangle * 3 + 3);
            for (const neighborIdx of triNeighbors) {
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

    public getRandomTriangle(navmesh: Navmesh): number {
        const maxAttempts = 10;
        for (let i = 0; i < maxAttempts; i++) {
            const randomX = this.minX + Math.random() * (this.maxX - this.minX);
            const randomY = this.minY + Math.random() * (this.maxY - this.minY);
            const point: Point2 = { x: randomX, y: randomY };
            const triIndex = this.isPointInNavmesh(point, navmesh, -1);
            if (triIndex !== -1) {
                return triIndex;
            }
        }

        // Fallback: pick a random triangle by index
        const numTriangles = navmesh.triangles.length / 3;
        return Math.floor(Math.random() * numTriangles);
    }
} 