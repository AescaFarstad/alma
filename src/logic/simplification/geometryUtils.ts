import { Point2 } from "../core/math";
import { Path } from "js-angusj-clipper";

export function getPointsFromBuilding(building: any): Point2[] | null {
    if (!building || !building.geometry) {
        return null;
    }

    let coords: any;
    let type: string | undefined;

    if (building.geometry.type && building.geometry.coordinates) {
        coords = building.geometry.coordinates;
        type = building.geometry.type;
    } else if (Array.isArray(building.geometry)) {
        coords = building.geometry;
        if (coords.length > 0 && Array.isArray(coords[0]) && coords[0].length > 0 && Array.isArray(coords[0][0])) {
            type = 'Polygon';
        } else if (coords.length > 0 && Array.isArray(coords[0])) {
            type = 'LineString';
        }
    }

    if (!coords) {
        console.warn('[GeometryUtils] Could not determine coordinates from building geometry:', building.geometry);
        return null;
    }

    let ring: any[] | undefined;

    if (type === 'Polygon') {
        ring = coords[0];
    } else if (type === 'MultiPolygon') {
        const firstPolygon = coords[0];
        if (Array.isArray(firstPolygon)) {
            ring = firstPolygon[0];
        }
    } else if (type === 'LineString') {
        ring = coords;
    }

    if (ring && Array.isArray(ring)) {
        const points = ring.map((p: number[]) => ({ x: p[0], y: p[1] }));
        if (points.length > 1) {
            const first = points[0];
            const last = points[points.length - 1];
            if (first.x === last.x && first.y === last.y) {
                return points.slice(0, -1);
            }
        }
        return points;
    }

    console.warn('[GeometryUtils] Could not extract polygon from building geometry:', building.geometry);
    return null;
}

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