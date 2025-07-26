import { Point2 } from '../core/math';
import type { Feature, Polygon, LineString, GeoJsonProperties } from 'geojson';
import type { Path } from 'js-angusj-clipper';

export interface Building {
    id: string;
    stats: any;
    geometry: any;
  }

export interface BuildingFeature extends Feature<Polygon | LineString> {
    properties: GeoJsonProperties & {
        building?: string;
        [key: string]: any;
    };
    id?: string;
}

export const getPointsFromBuilding = (building: Building): Point2[] | null => {
    const geom = building.geometry;
    if (!geom) return null;

    // The geometry is expected to be a GeoJSON Polygon's coordinates array: number[][][]
    // We take the first ring.
    if (Array.isArray(geom) && Array.isArray(geom[0]) && Array.isArray(geom[0][0])) {
        return geom[0].map((p: any[]) => ({ x: p[0], y: p[1] }));
    }
    
    return null;
};

export const getPointsFromBuildingFeature = (building: BuildingFeature): Point2[] | null => {
    const geom = building.geometry;
    if (!geom) return null;

    if (geom.type === 'Polygon') {
        return geom.coordinates[0].map(p => ({ x: p[0], y: p[1] }));
    } else if (geom.type === 'LineString') {
        // Only treat closed LineStrings as polygons
        const coords = geom.coordinates;
        if (coords.length > 2 &&
            coords[0][0] === coords[coords.length - 1][0] &&
            coords[0][1] === coords[coords.length - 1][1]) {
            return coords.map(p => ({ x: p[0], y: p[1] }));
        }
    }
    return null;
};

export const createPolygonFeature = (points: Point2[], properties: GeoJsonProperties, id?: string): BuildingFeature => {
    const coordinates = points.map(p => [p.x, p.y]);
    if (coordinates.length > 0 && (coordinates[0][0] !== coordinates[coordinates.length - 1][0] || coordinates[0][1] !== coordinates[coordinates.length - 1][1])) {
        coordinates.push(coordinates[0]);
    }

    return {
        type: 'Feature',
        id: id,
        geometry: {
            type: 'Polygon',
            coordinates: [coordinates]
        },
        properties: properties || {},
    };
};

export const roundPoint = (p: Point2, M: number = 100): Point2 => {
    return {
        x: Math.round(p.x * M) / M,
        y: Math.round(p.y * M) / M
    }
}

export const roundCoords = (coords: number[], M: number = 100): number[] => {
    return coords.map(c => Math.round(c * M) / M);
}

export const formatCoords = (points: Point2[]): string => {
    return points.map(p => `${p.x};${p.y}`).join(';');
}

export const formatCoordsRounded = (points: Point2[], precision = 2): string => {
    const factor = Math.pow(10, precision);
    return points
        .map(p => `${Math.round(p.x * factor) / factor};${Math.round(p.y * factor) / factor}`)
        .join(';');
};

export const toClipperPath = (points: Point2[], scale: number = 1): Path => {
    const path: Path = [];
    for (let i = 0; i < points.length; i++) {
        path.push({ x: points[i].x * scale, y: points[i].y * scale });
    }
    return path;
};

export function fromClipperPath(polygon: { x: number, y: number }[], scale: number): Point2[] {
    if (!polygon) return [];
    return polygon
        .filter(p => p && p.x != null && p.y != null && !isNaN(p.x) && !isNaN(p.y))
        .map(p => ({ x: p.x / scale, y: p.y / scale }));
}

function getTriangleCentroids(polygon: Point2[]): Point2[] {
    const centroids: Point2[] = [];
    const n = polygon.length;
    if (n < 3) return [];

    for (let i = 0; i < n; i++) {
        const v1 = polygon[i];
        const v2 = polygon[(i + 1) % n];
        const v3 = polygon[(i + 2) % n];
        const centroid = {
            x: (v1.x + v2.x + v3.x) / 3,
            y: (v1.y + v2.y + v3.y) / 3
        };
        centroids.push(centroid);
    }
    return centroids;
}

export function isBuildingMostlyInsideBlob(
    buildingPolygon: Point2[], 
    scaledBlobPolygon: { x: number, y: number }[], 
    clipper: any, 
    scale: number
): boolean {
    if (!buildingPolygon || buildingPolygon.length === 0) return false;

    if (buildingPolygon.length < 3) {
        if (buildingPolygon.length > 0) {
            const scaledPoint = toClipperPath([buildingPolygon[0]], scale)[0];
            return clipper.pointInPolygon(scaledPoint, scaledBlobPolygon) !== 0;
        }
        return false;
    }

    const centroids = getTriangleCentroids(buildingPolygon);
    if (centroids.length === 0) return false;

    const scaledBuildingPolygon = toClipperPath(buildingPolygon, scale);
    const scaledCentroids = toClipperPath(centroids, scale);
    let allowedErrors = Math.floor(buildingPolygon.length / 9)

    for (const centroid of scaledCentroids) {
        const isInsideBuilding = clipper.pointInPolygon(centroid, scaledBuildingPolygon) !== 0;

        if (isInsideBuilding) {
            const isInsideBlob = clipper.pointInPolygon(centroid, scaledBlobPolygon) !== 0;
            if (!isInsideBlob) {
                allowedErrors--
                if (allowedErrors <= 0)
                    return false;
            }
        }
    }

    return true;
} 