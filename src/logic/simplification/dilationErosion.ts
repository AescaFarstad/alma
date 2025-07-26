import { clipperProvider } from '../ClipperProvider';
import type { Point2 } from '../core/math';
import { distance } from '../core/math';
import * as clipperLib from 'js-angusj-clipper';

export async function simplifyWithDilationErosion(polygon: Point2[], offset: number): Promise<Point2[]> {
    if (polygon.length > 0 && distance(polygon[0], polygon[polygon.length - 1]) < 1e-9) {
        polygon.pop();
    }
    const clipper = await clipperProvider.getClipper();
    const scale = 1e7;

    const scaledPolygon = polygon.map(p => ({ x: p.x * scale, y: p.y * scale }));

    const dilated = clipper.offsetToPaths({
        delta: offset * scale,
        offsetInputs: [{
            data: scaledPolygon,
            joinType: clipperLib.JoinType.Miter,
            endType: clipperLib.EndType.ClosedPolygon
        }]
    });

    if (!dilated || dilated.length === 0) {
        return [];
    }

    const eroded = clipper.offsetToPaths({
        delta: -offset * scale,
        offsetInputs: [{
            data: dilated[0],
            joinType: clipperLib.JoinType.Miter,
            endType: clipperLib.EndType.ClosedPolygon
        }]
    });

    if (!eroded || eroded.length === 0) {
        return [];
    }

    return eroded[0].map((p: Point2) => ({ x: p.x / scale, y: p.y / scale }));
} 