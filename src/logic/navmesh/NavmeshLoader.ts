import { Navmesh } from './Navmesh';
import { NavTriIndex } from './NavTriIndex';

export async function loadNavmeshData(navmesh: Navmesh): Promise<void> {
    try {
        const response = await fetch('/data/navmesh.txt');
        if (!response.ok) {
            throw new Error(`Failed to fetch navmesh.txt: ${response.statusText}`);
        }
        const text = await response.text();
        const lines = text.split('\n');

        const pointsLine = lines.find(line => line.startsWith('points:'));
        const trianglesLine = lines.find(line => line.startsWith('triangles:'));
        const statsLine = lines.find(line => line.startsWith('stats:'));

        if (!pointsLine || !trianglesLine) {
            throw new Error('Invalid navmesh.txt format');
        }

        const pointsData = JSON.parse(pointsLine.substring('points:'.length));
        const trianglesData = JSON.parse(trianglesLine.substring('triangles:'.length));

        navmesh.points = new Float32Array(pointsData);
        navmesh.triangles = new Int32Array(trianglesData);

        if (statsLine) {
            const statsJson = statsLine.substring('stats:'.length);
            const stats = JSON.parse(statsJson);
            if (stats.bbox) {
                navmesh.bbox = new Float32Array(stats.bbox);
            }
        }

        calculateCentroids(navmesh);
        calculateNeighbors(navmesh);

        navmesh.triIndex = new NavTriIndex(navmesh);

    } catch (error) {
        console.error("Error loading navmesh data:", error);
        console.error("Stack trace:", error instanceof Error ? error.stack : 'No stack trace');
    }
}

function calculateCentroids(navmesh: Navmesh): void {
    const numTriangles = navmesh.triangles.length / 3;
    navmesh.centroids = new Float32Array(numTriangles * 2);

    for (let i = 0; i < numTriangles; i++) {
        const triIndex = i * 3;
        const p1_idx = navmesh.triangles[triIndex];
        const p2_idx = navmesh.triangles[triIndex + 1];
        const p3_idx = navmesh.triangles[triIndex + 2];

        const p1x = navmesh.points[p1_idx * 2];
        const p1y = navmesh.points[p1_idx * 2 + 1];
        const p2x = navmesh.points[p2_idx * 2];
        const p2y = navmesh.points[p2_idx * 2 + 1];
        const p3x = navmesh.points[p3_idx * 2];
        const p3y = navmesh.points[p3_idx * 2 + 1];

        const centroidX = (p1x + p2x + p3x) / 3;
        const centroidY = (p1y + p2y + p3y) / 3;

        navmesh.centroids[i * 2] = centroidX;
        navmesh.centroids[i * 2 + 1] = centroidY;
    }
}

function calculateNeighbors(navmesh: Navmesh): void {
    const triangles = navmesh.triangles;
    const numTriangles = triangles.length / 3;
    const neighbors = new Int32Array(numTriangles * 3).fill(-1);

    // Key: "v1_idx,v2_idx" (sorted), Value: { tri_idx: number, edge_idx: number }
    const edgeToTriangleMap = new Map<string, { tri_idx: number, edge_idx: number }>();

    for (let i = 0; i < numTriangles; i++) {
        const triIndex = i * 3;
        for (let j = 0; j < 3; j++) {
            const v1_idx = triangles[triIndex + j];
            const v2_idx = triangles[triIndex + ((j + 1) % 3)];
            const key = `${Math.min(v1_idx, v2_idx)},${Math.max(v1_idx, v2_idx)}`;

            if (edgeToTriangleMap.has(key)) {
                const neighbor = edgeToTriangleMap.get(key)!;
                
                // Set neighbor for the current triangle
                neighbors[triIndex + j] = neighbor.tri_idx;
                
                // Set neighbor for the other triangle
                neighbors[neighbor.tri_idx * 3 + neighbor.edge_idx] = i;

            } else {
                edgeToTriangleMap.set(key, { tri_idx: i, edge_idx: j });
            }
        }
    }

    navmesh.neighbors = neighbors;
} 