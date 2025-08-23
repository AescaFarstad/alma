import type { Navmesh } from "./Navmesh";
import { Point2, isPointInTriangle } from "../core/math";
import { seededRandom } from "../core/mathUtils";


export function findTriangle(point: Point2, navmesh: Navmesh, lastTriangle: number): number {
    const checkTriangle = (triIdx: number) => {
        if (triIdx < 0 || triIdx * 3 >= navmesh.triangles.length) {
            return false;
        }
        
        const v1Idx = navmesh.triangles[triIdx * 3];
        const v2Idx = navmesh.triangles[triIdx * 3 + 1];
        const v3Idx = navmesh.triangles[triIdx * 3 + 2];
        
        const v1x = navmesh.vertices[v1Idx * 2];
        const v1y = navmesh.vertices[v1Idx * 2 + 1];
        const v2x = navmesh.vertices[v2Idx * 2];
        const v2y = navmesh.vertices[v2Idx * 2 + 1];
        const v3x = navmesh.vertices[v3Idx * 2];
        const v3y = navmesh.vertices[v3Idx * 2 + 1];
        
        return isPointInTriangle(point.x, point.y, v1x, v1y, v2x, v2y, v3x, v3y);
    };
    
    // Try the last triangle first if provided
    if (lastTriangle >= 0) {
        if (checkTriangle(lastTriangle)) {
            return lastTriangle;
        }
    }
    const candidateTriangles = navmesh.triangleIndex.query(point.x, point.y);
    
    for (const triIdx of candidateTriangles) {
        if (checkTriangle(triIdx)) {
            return triIdx;
        }
    }
    return -1;
}

export function isPointInNavmesh(point: Point2, navmesh: Navmesh, lastTriangle: number): number {
    const triIdx = findTriangle(point, navmesh, lastTriangle);
    if (triIdx === -1 || triIdx >= navmesh.walkable_triangle_count) {
        return -1;
    }
    return triIdx;
}

export function getRandomTriangle(navmesh: Navmesh, seed?: number): number {
    let currentSeed = seed ?? 12345;
    const maxAttempts = 10;
    
    for (let i = 0; i < maxAttempts; i++) {
        const { value: randomX, newSeed: newSeedX } = seededRandom(currentSeed);
        currentSeed = newSeedX;
        const { value: randomY, newSeed: newSeedY } = seededRandom(currentSeed);
        currentSeed = newSeedY;
        
        const x = navmesh.triangleIndex.minX + randomX * (navmesh.triangleIndex.maxX - navmesh.triangleIndex.minX);
        const y = navmesh.triangleIndex.minY + randomY * (navmesh.triangleIndex.maxY - navmesh.triangleIndex.minY);
        const point: Point2 = { x, y };
        const triIndex = isPointInNavmesh(point, navmesh, -1);
        if (triIndex !== -1) {
            return triIndex;
        }
    }

    const numTriangles = navmesh.triangles.length / 3;
    const { value } = seededRandom(currentSeed);
    return Math.floor(value * numTriangles);
}

export function getRandomTriangleInArea(navmesh: Navmesh, centerX: number, centerY: number, numCellExtents: number, seed?: number): number {
    let currentSeed = seed ?? 12345;
    const maxAttempts = 20;
    
    const halfExtent = numCellExtents * navmesh.triangleIndex.cellSize;
    const minX = centerX - halfExtent;
    const maxX = centerX + halfExtent;
    const minY = centerY - halfExtent;
    const maxY = centerY + halfExtent;
    
    const clampedMinX = Math.max(minX, navmesh.triangleIndex.minX);
    const clampedMaxX = Math.min(maxX, navmesh.triangleIndex.maxX);
    const clampedMinY = Math.max(minY, navmesh.triangleIndex.minY);
    const clampedMaxY = Math.min(maxY, navmesh.triangleIndex.maxY);
    
    for (let i = 0; i < maxAttempts; i++) {
        const { value: randomX, newSeed: newSeedX } = seededRandom(currentSeed);
        currentSeed = newSeedX;
        const { value: randomY, newSeed: newSeedY } = seededRandom(currentSeed);
        currentSeed = newSeedY;
        
        const x = clampedMinX + randomX * (clampedMaxX - clampedMinX);
        const y = clampedMinY + randomY * (clampedMaxY - clampedMinY);
        const point: Point2 = { x, y };
        const triIndex = isPointInNavmesh(point, navmesh, -1);
        if (triIndex !== -1) {
            return triIndex;
        }
    }

    const startCellX = Math.max(0, Math.floor((clampedMinX - navmesh.triangleIndex.minX) / navmesh.triangleIndex.cellSize));
    const endCellX = Math.min(navmesh.triangleIndex.gridWidth - 1, Math.floor((clampedMaxX - navmesh.triangleIndex.minX) / navmesh.triangleIndex.cellSize));
    const startCellY = Math.max(0, Math.floor((clampedMinY - navmesh.triangleIndex.minY) / navmesh.triangleIndex.cellSize));
    const endCellY = Math.min(navmesh.triangleIndex.gridHeight - 1, Math.floor((clampedMaxY - navmesh.triangleIndex.minY) / navmesh.triangleIndex.cellSize));
    
    const candidateTriangles: number[] = [];
    for (let cx = startCellX; cx <= endCellX; cx++) {
        for (let cy = startCellY; cy <= endCellY; cy++) {
            const cellTriangles = getTrianglesInCell(navmesh, cx, cy);
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
    
    return getRandomTriangle(navmesh, currentSeed);
}


export function getTrianglesInCell(navmesh: Navmesh, cx: number, cy: number): Int32Array {
    const cellIndex = cx + cy * navmesh.triangleIndex.gridWidth;
    if (cellIndex < 0 || cellIndex >= navmesh.triangleIndex.cellOffsets.length - 1) {
        return new Int32Array(0);
    }
    const start = navmesh.triangleIndex.cellOffsets[cellIndex];
    const end = navmesh.triangleIndex.cellOffsets[cellIndex + 1];
    return navmesh.triangleIndex.cellItems.slice(start, end);
}