import { GameState } from '../GameState';
import { PrimitiveState } from './PrimitiveState';
import { PolyStyle, CircleStyle, TextStyle, LineStyle } from './PrimitiveState';
import { TextStyle as PIXITextStyle } from 'pixi.js';
import { SceneState } from './SceneState';
import { getBuildingById } from '../GeoJsonStore';
import { mapInstance } from '../../map_instance';
import { cvtExp } from '../core/math';

const selectedBuildingPolyStyle: PolyStyle = {
    fillStyle: { color: 0x0000FF, alpha: 0.4 },
    strokeStyle: { width: 2, color: 0x0000FF, alpha: 0.8 },
};

const simplifiedBuildingPolyStyle: PolyStyle = {
    fillStyle: { color: 0x00FF00, alpha: 0.4 },
    strokeStyle: { width: 2, color: 0x00FF00, alpha: 0.8 },
};

const simplifiedVertexCircleStyle: CircleStyle = {
    fillStyle: { color: 0xFF0000 },
};

const vertexCircleStyle: CircleStyle = {
    fillStyle: { color: 0xFFFF00 },
};

const pointMarkStyle: CircleStyle = {
    fillStyle: { color: 0xFF00FF, alpha: 0.7 }, // ACMAGENTA
    strokeStyle: { width: 1, color: 0xFFFFFF, alpha: 0.9 },
};

const selectedPointMarkStyle: CircleStyle = {
    fillStyle: { color: 0x4B0082, alpha: 0.9 }, // ACINDIGO
    strokeStyle: { width: 2, color: 0xFFD700, alpha: 1 }, // Gold-like color for selection
};

const vertexTextStyle: TextStyle = {
    textStyle: new PIXITextStyle({
        fontSize: 12,
        fill: 'white',
        stroke: { color: 'black', width: 2 },
    }),
};

const debugPolygonStyle: PolyStyle = {
    fillStyle: { color: 0xFF0000, alpha: 0.3 },
    strokeStyle: { width: 1, color: 0xFF0000, alpha: 0.7 },
};

const debugPointStyles: Record<string, CircleStyle> = {
    red:        { fillStyle: { color: 0xFF0000, alpha: 1 } },
    green:      { fillStyle: { color: 0x9ACD32, alpha: 1 } }, // "acidic"
    blue:       { fillStyle: { color: 0x3399FF, alpha: 1 } }, // lighter
    yellow:     { fillStyle: { color: 0xFFFF00, alpha: 1 } },
    magenta:    { fillStyle: { color: 0xFF00FF, alpha: 1 } },
    cyan:       { fillStyle: { color: 0x00FFFF, alpha: 1 } },
    orange:     { fillStyle: { color: 0xFFA500, alpha: 1 } },
    // purple:     { fillStyle: { color: 0x800080, alpha: 1 } },
    brown:      { fillStyle: { color: 0xA52A2A, alpha: 1 } },
    black:      { fillStyle: { color: 0x000000, alpha: 1 } },
    white:      { fillStyle: { color: 0xFFFFFF, alpha: 1 } },
    gray:       { fillStyle: { color: 0x808080, alpha: 1 } },
    emerald:    { fillStyle: { color: 0x50C878, alpha: 1 } }, // dark green
    indigo:     { fillStyle: { color: 0x4B0082, alpha: 1 } }, // dark blue
    pink:       { fillStyle: { color: 0xFFC0CB, alpha: 1 } }, // light reddish white
};

const debugLineStyles: Record<string, LineStyle> = Object.fromEntries(
    Object.entries(debugPointStyles).map(([color, style]) => [
        color,
        { width: 0.25, color: style.fillStyle?.color ?? 0, alpha: 1 }
    ])
);

const debugCircleStyles: Record<string, LineStyle> = Object.fromEntries(
    Object.entries(debugPointStyles).map(([color, style]) => [
        color,
        { width: 0.25, color: style.fillStyle?.color ?? 0, alpha: 1 }
    ])
);

const debugAreaStyles: Record<string, PolyStyle> = Object.fromEntries(
    Object.entries(debugPointStyles).map(([color, style]) => [
        color,
        {
            fillStyle: { color: style.fillStyle?.color ?? 0, alpha: 0.4 },
        }
    ])
);

export class DrawScene {
    public static buildPrimitives(primitives: PrimitiveState, sceneState: SceneState, _gameState: GameState) {
        primitives.clear();
        let r = 0;
        const zoom = mapInstance.map?.getView().getZoom() || 0;
        const dynamicWidth = cvtExp(zoom, 3.5, 10, 20, 0.15, true);
        const dynamicRadius = cvtExp(zoom, 3.5, 10, 8, 2, true);

        for (const id of Array.from(sceneState.selectedBuildingIds)) {
            const buildingFeature = getBuildingById(id);
            if (!buildingFeature || !buildingFeature.geometry) continue;

            const processPolygon = (polygonCoords: number[][][]) => {
                for (const ring of polygonCoords) { // A polygon can have multiple rings (for holes)
                    const flattenedRing = new Array(ring.length * 2);
                    for (let i = 0; i < ring.length; i++) {
                        const point = ring[i];
                        const x = point[0];
                        const y = -point[1];
                        flattenedRing[i * 2] = x;
                        flattenedRing[i * 2 + 1] = y;
                        primitives.addCircle(x, y, 0.5, vertexCircleStyle);
                    }
                    primitives.addPolygon(flattenedRing, selectedBuildingPolyStyle);
                }
            };

            if (buildingFeature.geometry.type === 'Polygon') {
                processPolygon(buildingFeature.geometry.coordinates as number[][][]);
            } else if (buildingFeature.geometry.type === 'MultiPolygon') {
                const multiPoly = buildingFeature.geometry.coordinates as number[][][][];
                for (const polygon of multiPoly) {
                    processPolygon(polygon);
                }
            }
        }
        for (const [, simplifiedGeometry] of sceneState.simplifiedGeometries) {
            const n = simplifiedGeometry.length;
            const flattenedRing = new Array(n * 2);
            for (let i = 0; i < n; i++) {
                const point = simplifiedGeometry[i];
                const x = point.x;
                const y = -point.y;
                flattenedRing[i * 2] = x;
                flattenedRing[i * 2 + 1] = y;
                primitives.addCircle(x, y, 1, simplifiedVertexCircleStyle);
                primitives.addText(i.toString(), x, y, vertexTextStyle);
            }
            primitives.addPolygon(flattenedRing, simplifiedBuildingPolyStyle);
        }

        for (let i = 0; i < _gameState.pointMarks.length; i++) {
            const pointMark = _gameState.pointMarks[i];
            const style = sceneState.isPointMarkSelected(pointMark.id)
                ? selectedPointMarkStyle
                : pointMarkStyle;
            primitives.addCircle(pointMark.x, -pointMark.y, dynamicRadius * 1.5, style);
            
            // Add index text next to the marker (1-based for user friendliness)
            const indexText = (i + 1).toString();
            const textOffset = dynamicRadius * 2; // Offset the text to the right of the marker
            primitives.addText(indexText, pointMark.x + textOffset, -pointMark.y, vertexTextStyle);
        }

        if (sceneState.measurementLine) {
            const measurementLineStyle: LineStyle = {
                width: dynamicWidth,
                color: 0xFF0000,
                alpha: 0.8,
            };

            const { start, end } = sceneState.measurementLine;
            primitives.addLine([start.lng, -start.lat, end.lng, -end.lat], measurementLineStyle);
        
            const dx = end.lng - start.lng;
            const dy = end.lat - start.lat;
            const distance = Math.sqrt(dx * dx + dy * dy);
        
            const midX = (start.lng + end.lng) / 2;
            const midY = (-start.lat - end.lat) / 2;
        
            primitives.addText(distance.toFixed(1) + 'm', midX, midY, vertexTextStyle);
        }

        for (const polygon of sceneState.debugPolygons) {
            const n = polygon.length;
            const flattenedRing = new Array(n * 2);
            for (let i = 0; i < n; i++) {
                const point = polygon[i];
                flattenedRing[i * 2] = point.x;
                flattenedRing[i * 2 + 1] = -point.y;
            }
            primitives.addPolygon(flattenedRing, debugPolygonStyle);
        }

        const debugPointColors = Object.keys(sceneState.debugPoints);
        r = debugPointColors.length;
        for (const color of debugPointColors) {
            r--;
            const points = sceneState.debugPoints[color as keyof typeof sceneState.debugPoints];
            if (points.length === 0) continue;

            const style = debugPointStyles[color];
            if (style) {
                for (const point of points) {
                    primitives.addCircle(point.x, -point.y, 0.3 + r * 0.07, style);
                }
            }
        }

        const debugLineColors = Object.keys(sceneState.debugLines);
        for (const color of debugLineColors) {
            const lines = sceneState.debugLines[color as keyof typeof sceneState.debugLines];
            if (lines.length === 0) continue;
            const style = debugLineStyles[color];
            if (style) {
                const dynamicStyle = { ...style, width: dynamicWidth };
                for (const line of lines) {
                    primitives.addLine([line.start.x, -line.start.y, line.end.x, -line.end.y], dynamicStyle);
                }
            }
        }

        const debugCircleColors = Object.keys(sceneState.debugCircles);
        r = debugCircleColors.length;
        for (const color of debugCircleColors) {
            const circles = sceneState.debugCircles[color as keyof typeof sceneState.debugCircles];
            if (circles.length === 0) continue;
            const style = debugCircleStyles[color];
            if (style) {
                const dynamicStyle = { ...style, width: dynamicWidth };
                for (const circle of circles) {
                    primitives.addCircle(circle.center.x, -circle.center.y, 0.3 + r * 0.07, { strokeStyle: dynamicStyle });
                }
            }
        }

        const debugXColors = Object.keys(sceneState.debugXs);
        r = debugXColors.length;
        for (const color of debugXColors) {
            const xs = sceneState.debugXs[color as keyof typeof sceneState.debugXs];
            if (xs.length === 0) continue;
            const style = debugLineStyles[color];
            if (style) {
                const dynamicStyle = { ...style, width: dynamicWidth };
                for (const x of xs) {
                    const size = 0.3 + r * 0.07;
                    primitives.addLine([x.center.x - size, -x.center.y - size, x.center.x + size, -x.center.y + size], dynamicStyle);
                    primitives.addLine([x.center.x - size, -x.center.y + size, x.center.x + size, -x.center.y - size], dynamicStyle);
                }
            }
        }

        const debugArrowColors = Object.keys(sceneState.debugArrows);
        for (const color of debugArrowColors) {
            const arrows = sceneState.debugArrows[color as keyof typeof sceneState.debugArrows];
            if (arrows.length === 0) continue;
            const style = debugLineStyles[color];
            if (style) {
                const dynamicStyle = { ...style, width: dynamicWidth };
                for (const arrow of arrows) {
                    primitives.addLine([arrow.start.x, -arrow.start.y, arrow.end.x, -arrow.end.y], dynamicStyle);
                    const angle = Math.atan2(arrow.end.y - arrow.start.y, arrow.end.x - arrow.start.x);
                    const length = 5;
                    const arrowAngle = 0.5;
                    primitives.addLine([arrow.end.x, -arrow.end.y, arrow.end.x - length * Math.cos(angle - arrowAngle), -arrow.end.y + length * Math.sin(angle - arrowAngle)], dynamicStyle);
                    primitives.addLine([arrow.end.x, -arrow.end.y, arrow.end.x - length * Math.cos(angle + arrowAngle), -arrow.end.y + length * Math.sin(angle + arrowAngle)], dynamicStyle);
                }
            }
        }

        const debugAreaColors = Object.keys(sceneState.debugAreas);
        for (const color of debugAreaColors) {
            const areas = sceneState.debugAreas[color as keyof typeof sceneState.debugAreas];
            if (areas.length === 0) continue;
            const style = debugAreaStyles[color];
            if (style) {
                for (const area of areas) {
                    const n = area.length;
                    const flattenedRing = new Array(n * 2);
                    for (let i = 0; i < n; i++) {
                        const point = area[i];
                        flattenedRing[i * 2] = point.x;
                        flattenedRing[i * 2 + 1] = -point.y;
                    }
                    primitives.addPolygon(flattenedRing, style);
                }
            }
        }

        const debugTextColors = Object.keys(sceneState.debugTexts);
        for (const color of debugTextColors) {
            const texts = sceneState.debugTexts[color as keyof typeof sceneState.debugTexts];
            if (texts.length === 0) continue;
            
            for (const debugText of texts) {
                primitives.addText(debugText.text, debugText.position.x, -debugText.position.y, vertexTextStyle);
            }
        }

        const debugNavmeshTriangleColors = Object.keys(sceneState.debugNavmeshTriangles);
        for (const color of debugNavmeshTriangleColors) {
            const triangles = sceneState.debugNavmeshTriangles[color as keyof typeof sceneState.debugNavmeshTriangles];
            if (triangles.length === 0) continue;

            const style = debugAreaStyles[color];
            if (style && _gameState.navmesh) {
                for (const debugTriangle of triangles) {
                    const triIdx = debugTriangle.index;
                    const navmesh = _gameState.navmesh;
                    
                    const p1Index = navmesh.triangles[triIdx * 3];
                    const p2Index = navmesh.triangles[triIdx * 3 + 1];
                    const p3Index = navmesh.triangles[triIdx * 3 + 2];

                    const p1 = { x: navmesh.points[p1Index * 2], y: navmesh.points[p1Index * 2 + 1] };
                    const p2 = { x: navmesh.points[p2Index * 2], y: navmesh.points[p2Index * 2 + 1] };
                    const p3 = { x: navmesh.points[p3Index * 2], y: navmesh.points[p3Index * 2 + 1] };

                    const flattenedTriangle = [p1.x, -p1.y, p2.x, -p2.y, p3.x, -p3.y];
                    primitives.addPolygon(flattenedTriangle, style);

                    // Add optional text
                    if (debugTriangle.text) {
                        const centroidX = navmesh.centroids[triIdx * 2];
                        const centroidY = navmesh.centroids[triIdx * 2 + 1];
                        primitives.addText(debugTriangle.text, centroidX, -centroidY, vertexTextStyle);
                    }
                }
            }
        }

        // Render corridors stored in SceneState
        const corridors = sceneState.getAllCorridors();
        if (corridors.length > 0) {
            const blueStyle = debugAreaStyles['blue'];
            
            if (blueStyle) {
                for (const corridor of corridors) {
                    // Get the navmesh from gameState to render triangle geometry
                    const navmesh = _gameState.navmesh;
                    if (navmesh) {
                        for (const triIdx of corridor.triangleIndices) {
                            const p1Index = navmesh.triangles[triIdx * 3];
                            const p2Index = navmesh.triangles[triIdx * 3 + 1];
                            const p3Index = navmesh.triangles[triIdx * 3 + 2];

                            const p1 = { x: navmesh.points[p1Index * 2], y: navmesh.points[p1Index * 2 + 1] };
                            const p2 = { x: navmesh.points[p2Index * 2], y: navmesh.points[p2Index * 2 + 1] };
                            const p3 = { x: navmesh.points[p3Index * 2], y: navmesh.points[p3Index * 2 + 1] };

                            const flattenedTriangle = [p1.x, -p1.y, p2.x, -p2.y, p3.x, -p3.y];
                            primitives.addPolygon(flattenedTriangle, blueStyle);
                        }
                    }
                }
            }
        }

        // Render paths stored in SceneState
        const paths = sceneState.getAllPaths();
        if (paths.length > 0) {
            const indigoLineStyle = debugLineStyles['indigo'];
            
            if (indigoLineStyle) {
                const dynamicIndigoStyle = { ...indigoLineStyle, width: dynamicWidth };
                for (const path of paths) {
                    // Render the path using ACINDIGO lines
                    if (path.corners.length > 1) {
                        for (let i = 0; i < path.corners.length - 1; i++) {
                            const start = path.corners[i];
                            const end = path.corners[i + 1];
                            primitives.addLine([start.x, -start.y, end.x, -end.y], dynamicIndigoStyle);
                        }
                        
                        // Add text with total path length at the center of the first leg
                        if (path.corners.length >= 2) {
                            const firstStart = path.corners[0];
                            const firstEnd = path.corners[1];
                            const midX = (firstStart.x + firstEnd.x) / 2;
                            const midY = (-firstStart.y + -firstEnd.y) / 2;
                            const lengthText = Math.round(path.totalLength).toString() + 'm';
                            primitives.addText(lengthText, midX, midY, vertexTextStyle);
                        }
                    }
                }
            }
        }
    }
} 