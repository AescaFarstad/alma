import { GameState } from '../GameState';
import { SceneState } from '../drawing/SceneState';
import { Point2 } from '../core/math';
import { ACBLUE, ACYELLOW, ACBLACK } from '../drawing/SceneState';

export function useNavmeshGridDebug(gameState?: GameState, sceneState?: SceneState) {
    if (!gameState || !sceneState) {
        return {
            drawNavGrid: () => {
                console.warn("Gamestate or scenestate not available for navmesh debug")
            }
        }
    }

    const { navmesh } = gameState;

    const drawNavGrid = (pattern: number) => {
        if (!navmesh) {
            console.warn('Navmesh not loaded');
            return;
        }

        const gridInfo = navmesh.triIndex.getGridInfo();
        const { gridWidth, gridHeight, cellSize, minX, minY } = gridInfo;

        for (let cy = 0; cy < gridHeight; cy++) {
            for (let cx = 0; cx < gridWidth; cx++) {
                const cellMinX = minX + cx * cellSize;
                const cellMinY = minY + cy * cellSize;
                const cellMaxX = cellMinX + cellSize;
                const cellMaxY = cellMinY + cellSize;

                sceneState.addDebugLine({ x: cellMinX, y: cellMinY }, { x: cellMaxX, y: cellMinY }, ACBLACK);
                sceneState.addDebugLine({ x: cellMaxX, y: cellMinY }, { x: cellMaxX, y: cellMaxY }, ACBLACK);
                sceneState.addDebugLine({ x: cellMaxX, y: cellMaxY }, { x: cellMinX, y: cellMaxY }, ACBLACK);
                sceneState.addDebugLine({ x: cellMinX, y: cellMaxY }, { x: cellMinX, y: cellMinY }, ACBLACK);

                let color: 'yellow' | 'blue' | null = null;

                if (pattern === 1) {
                    if ((cx % 2 === 0 && cy % 2 === 0)) {
                        color = ACYELLOW;
                    } else if ((cx % 2 !== 0 && cy % 2 !== 0)) {
                        color = ACBLUE;
                    }
                } else if (pattern === 2) {
                    if ((cx % 2 !== 0 && cy % 2 === 0)) {
                        color = ACYELLOW;
                    } else if ((cx % 2 === 0 && cy % 2 !== 0)) {
                        color = ACBLUE;
                    }
                }

                if (!color) continue;

                const cellTriangles = navmesh.triIndex.getTrianglesInCell(cx, cy);
                for (const triIdx of cellTriangles) {
                    const triVertexStartIndex = triIdx * 3;
                    const p1Index = navmesh.triangles[triVertexStartIndex];
                    const p2Index = navmesh.triangles[triVertexStartIndex + 1];
                    const p3Index = navmesh.triangles[triVertexStartIndex + 2];

                    const triPoints: Point2[] = [
                        { x: navmesh.points[p1Index * 2], y: navmesh.points[p1Index * 2 + 1] },
                        { x: navmesh.points[p2Index * 2], y: navmesh.points[p2Index * 2 + 1] },
                        { x: navmesh.points[p3Index * 2], y: navmesh.points[p3Index * 2 + 1] },
                    ];
                    sceneState.addDebugArea(triPoints, color);
                }
            }
        }
    };

    return { drawNavGrid };
} 