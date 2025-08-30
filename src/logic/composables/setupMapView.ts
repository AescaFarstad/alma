import { Projection } from 'ol/proj';
import View from 'ol/View';
import TileGrid from 'ol/tilegrid/TileGrid';
import { Map as OlMap } from 'ol';
import { defaults as defaultInteractions } from 'ol/interaction';
import { createStaticLayers } from '../../map/staticLayers';
import { createDynamicLayers } from '../../map/dynamicLayers';
import { createDynamicCombinedLayers } from '../../map/dynamicCombinedLayers';
import { ensureDataLoaded } from '../GeoJsonStore';

type TileMode = 'static' | 'dynamic_separate' | 'dynamic_combined';

export async function setupMapView(
  target: HTMLDivElement,
  tileMode: TileMode,
  layerVisibility: Record<string, boolean>
) {
  const cartesianProjection = new Projection({
  code: 'xkcd-map',
  units: 'm',
  extent: [-10000, -10000, 10000, 10000],
  });

  let view;
  let customTileGrid: TileGrid | undefined;

  if (tileMode === 'static') {
  const resolutions = [
    20000 / 512,
    10000 / 512,
    5000 / 512,
    2500 / 512,
    1250 / 512,
    625 / 512,
    312.5 / 512,
  ];

  customTileGrid = new TileGrid({
    extent: [-10000, -10000, 10000, 10000],
    resolutions: resolutions,
    tileSize: 512,
  });

  view = new View({
    projection: cartesianProjection,
    center: [0, 0],
    zoom: 2,
    resolutions: resolutions,
    constrainResolution: true,
  });
  } else {
  view = new View({
    projection: cartesianProjection,
    center: [0, 0],
    zoom: 7,
    minZoom: 0,
    maxZoom: 18,
    constrainResolution: false,
    smoothResolutionConstraint: true,
    enableRotation: false,
  });
  }

  const map = new OlMap({
  target,
  layers: [],
  view: view,
  interactions: defaultInteractions({ doubleClickZoom: false }),
  });

  if (tileMode === 'static') {
  console.log('Map created with STATIC tiles. View details:', {
    zoom: map.getView().getZoom(),
    resolution: map.getView().getResolution(),
    resolutions: map.getView().getResolutions(),
  });
  }

  // Ensure GeoJSON data is loaded for dynamic modes
  if (tileMode === 'dynamic_separate' || tileMode === 'dynamic_combined') {
  await ensureDataLoaded();
  }

  switch (tileMode) {
  case 'static':
    createStaticLayers(map, cartesianProjection, customTileGrid!);
    break;
  case 'dynamic_separate':
    createDynamicLayers(map, cartesianProjection);
    break;
  case 'dynamic_combined':
    const combinedLayer = createDynamicCombinedLayers(
    cartesianProjection,
    layerVisibility as any
    );
    map.addLayer(combinedLayer);
    break;
  }

  return { map, cartesianProjection };
} 