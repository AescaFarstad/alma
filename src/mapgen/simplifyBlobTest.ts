import type { GameState } from '../logic/GameState';
import type { SceneState } from '../logic/drawing/SceneState';
import type { Point2 } from '../logic/core/math';
import { ensureDevFeaturesLoaded, devFeatures } from '../logic/DevFeatures';
import { simplifyWithDilationErosion } from './simplification/dilationErosion';
import { flatten } from './simplification/flattening';
import { unround } from './simplification/unrounding';
import { cornerize } from './simplification/cornerize';
import { pullAway } from './simplification/pullAway';
import { uniteGeometries, type BuildingWithPolygon, type UnitedGroup } from './simplification/unite';

// Local centroid util for labeling
function centroidOfPolygon(pts: Point2[]): Point2 {
  if (!pts || pts.length === 0) return { x: 0, y: 0 };
  let area2 = 0; // twice the area
  let cx = 0;
  let cy = 0;
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const p = pts[i];
    const q = pts[j];
    const cross = p.x * q.y - q.x * p.y;
    area2 += cross;
    cx += (p.x + q.x) * cross;
    cy += (p.y + q.y) * cross;
  }
  if (Math.abs(area2) < 1e-6) {
    let ax = 0, ay = 0;
    for (const p of pts) { ax += p.x; ay += p.y; }
    return { x: ax / n, y: ay / n };
  }
  const inv = 1 / (3 * area2);
  return { x: cx * inv, y: cy * inv };
}

async function getOriginalOuterRingByBuildingId(gameState: GameState, id: number): Promise<Point2[] | null> {
  const props = gameState.navmesh.building_properties[id];
  const osmId = props?.osm_id;
  if (!osmId) return null;
  await ensureDevFeaturesLoaded();
  const rings = devFeatures.buildings.get(osmId);
  if (!rings || rings.length === 0) return null;
  const ring = rings[0];
  if (!ring || ring.length < 3) return null;
  return ring;
}

export interface SimplifyBlobTestOptions {
  radiusMeters?: number; // neighborhood radius around selected building
  mergeInflation?: number; // inflation used for uniteGeometries
}

// Implements a two-pass grouping strategy for better blobs:
// 1) Run uniteGeometries over all nearby buildings only to determine groups (discard geom).
// 2) For each discovered group, run uniteGeometries AGAIN but only with buildings from that group.
//    Use this second-pass geom as the basis for simplification.
export async function simplifyBlobTest(
  gameState: GameState,
  sceneState: SceneState,
  id: number,
  opts: SimplifyBlobTestOptions = {}
): Promise<void> {
  const MERGE_INFLATION = opts.mergeInflation ?? 2;
  const RADIUS_M = opts.radiusMeters ?? 50;

  // 1) Find original ring for the selected building and a bbox around its center
  const originRing = await getOriginalOuterRingByBuildingId(gameState, id);
  if (!originRing || originRing.length < 3) return;

  // Calculate center as average of vertices
  const center = originRing.reduce((acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }), { x: 0, y: 0 });
  center.x /= originRing.length;
  center.y /= originRing.length;

  const minX = center.x - RADIUS_M;
  const maxX = center.x + RADIUS_M;
  const minY = center.y - RADIUS_M;
  const maxY = center.y + RADIUS_M;

  // 2) Query building spatial index for IDs in the bbox
  const idx = gameState.navmesh.buildingIndex;
  const cxMin = Math.max(0, Math.floor((minX - idx.minX) / idx.cellSize));
  const cxMax = Math.min(idx.gridWidth - 1, Math.floor((maxX - idx.minX) / idx.cellSize));
  const cyMin = Math.max(0, Math.floor((minY - idx.minY) / idx.cellSize));
  const cyMax = Math.min(idx.gridHeight - 1, Math.floor((maxY - idx.minY) / idx.cellSize));

  const nearbyBuildingIds = new Set<number>();
  for (let cx = cxMin; cx <= cxMax; cx++) {
    for (let cy = cyMin; cy <= cyMax; cy++) {
      const items = idx.getItemsInCell(cx, cy);
      for (let i = 0; i < items.length; i++) nearbyBuildingIds.add(items[i]);
    }
  }
  if (nearbyBuildingIds.size === 0) return;

  // 3) Load original rings for all nearby buildings
  const buildingsForUnite: BuildingWithPolygon[] = [];
  for (const bId of nearbyBuildingIds) {
    const ring = await getOriginalOuterRingByBuildingId(gameState, bId);
    if (ring && ring.length >= 3) {
      buildingsForUnite.push({ id: String(bId), polygon: ring });
    }
  }
  if (buildingsForUnite.length === 0) return;

  // 4) Pre-simplify each building (same as create_blobs.ts pre-processing)
  for (const b of buildingsForUnite) {
    let simplified = unround(b.polygon, 10, 0.45);
    simplified = flatten(simplified, 3);
    b.polygon = simplified;
  }

  const allPoints = buildingsForUnite.flatMap(g => g.polygon);

  // 5) First unite: discover groups only; discard produced geoms
  const discoveredGroups: UnitedGroup[] = await uniteGeometries(buildingsForUnite, MERGE_INFLATION);
  if (!discoveredGroups || discoveredGroups.length === 0) return;

  // 6) For each discovered group, isolate its buildings and unite again
  let isFirstOutput = true;
  for (let gi = 0; gi < discoveredGroups.length; gi++) {
    const group = discoveredGroups[gi];
    if (!group.buildings || group.buildings.length === 0) continue;

    const groupSet = new Set(group.buildings);
    const subset = buildingsForUnite.filter(b => groupSet.has(b.id));
    if (subset.length === 0) continue;

    const refinedGroups = await uniteGeometries(subset, MERGE_INFLATION * 1);
    if (!refinedGroups || refinedGroups.length === 0) continue;

    // 7) Process each refined geom with the blob simplification pipeline
    for (let rgi = 0; rgi < refinedGroups.length; rgi++) {
      const refined = refinedGroups[rgi];

      let simplified = refined.geom;
      simplified = flatten(simplified, 3);

      const beforeDilation = simplified;
      simplified = await simplifyWithDilationErosion(simplified, MERGE_INFLATION * 2.5);
      simplified = flatten(simplified, 3);

      // Fuse small gaps by uniting pre/post dilation shapes in isolation
      const unionInput: BuildingWithPolygon[] = [
        { id: 'before', polygon: beforeDilation },
        { id: 'after',  polygon: simplified }
      ];
      const unioned = await uniteGeometries(unionInput, MERGE_INFLATION);
      if (unioned && unioned.length > 0) {
        const merged = unioned.find(g => g.buildings.length > 1) ?? unioned[0];
        simplified = merged.geom;
      }

      simplified = pullAway(simplified, 1, 5);
      simplified = cornerize(simplified, allPoints, MERGE_INFLATION + 0.1, 0.5);
      simplified = unround(simplified, 10, 0.45);
      simplified = flatten(simplified, 3);
      simplified = unround(simplified, 10, 0.5);
      simplified = flatten(simplified, 5);
      simplified = unround(simplified, 5, 0.55);
      simplified = flatten(simplified, 7);
      simplified = unround(simplified, 5, 0.55);

      const targetId = isFirstOutput ? id : Math.round(Math.random() * -1000000);
      isFirstOutput = false;
      sceneState.addSimplifiedBuilding(targetId, simplified);

      // const labelPos = centroidOfPolygon(simplified.length >= 3 ? simplified : refined.geom);
      // sceneState.addDebugText(labelPos, `G${gi}`, 'white');
    }
  }
}
