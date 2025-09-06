import { loadGeoJsonAtPath } from './GeoJsonStore';
import type { Point2 } from './core/math';

export type DevFeatures = {
  buildings: Map<string, Point2[][]>;
};

export const devFeatures: DevFeatures = {
  buildings: new Map<string, Point2[][]>(),
};

let loadingPromise: Promise<void> | null = null;

export async function ensureDevFeaturesLoaded(): Promise<void> {
  if (loadingPromise) return loadingPromise;
  loadingPromise = (async () => {
    await loadBuildingsAll();
  })();
  return loadingPromise;
}

async function loadBuildingsAll(): Promise<void> {
  const geo = await loadGeoJsonAtPath('/data/buildings_all.geojson');
  if (!geo || !Array.isArray(geo.features)) {
    console.error('DevFeatures: Invalid buildings_all.geojson format.');
    return;
  }

  devFeatures.buildings.clear();
  for (const feature of geo.features) {
    const id: string | undefined = feature?.properties?.id ?? (feature?.id != null ? String(feature.id) : undefined);
    if (!id) {
      console.error('DevFeatures: Skipping feature without id.');
      continue;
    }

    if (!feature.geometry) {
      console.error(`DevFeatures: Feature ${id} has no geometry.`);
      continue;
    }

    const geom = feature.geometry;
    if (geom.type !== 'Polygon') {
      console.error(`DevFeatures: Feature ${id} has unsupported geometry type: ${geom.type}. Expected Polygon.`);
      continue;
    }

    const rings: number[][][] = geom.coordinates as number[][][];
    if (!Array.isArray(rings) || rings.length === 0) {
      console.error(`DevFeatures: Feature ${id} has empty polygon coordinates.`);
      continue;
    }

    const polygons: Point2[][] = [];
    for (const ring of rings) {
      if (!Array.isArray(ring) || ring.length < 3) continue;
      const out: Point2[] = [];
      for (let i = 0; i < ring.length; i++) {
        const c = ring[i];
        if (!Array.isArray(c) || c.length < 2) continue;
        out.push({ x: c[0], y: c[1] });
      }
      // Remove duplicate last point if it repeats the first
      if (out.length >= 2) {
        const first = out[0];
        const last = out[out.length - 1];
        if (first.x === last.x && first.y === last.y) {
          out.pop();
        }
      }
      if (out.length >= 3) polygons.push(out);
    }

    if (polygons.length === 0) {
      console.error(`DevFeatures: Feature ${id} produced no valid polygon rings.`);
      continue;
    }

    devFeatures.buildings.set(id, polygons);
  }
}
