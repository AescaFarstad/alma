import { Projection } from 'ol/proj';
import TileGrid from 'ol/tilegrid/TileGrid';
import VectorTileLayer from 'ol/layer/VectorTile';
import VectorTileSource from 'ol/source/VectorTile';
import MVT from 'ol/format/MVT';
import { getBuildingStyle, getRoadStyle } from './styles';
import type { Map as OlMap } from 'ol';

export function createStaticLayers(map: OlMap, projection: Projection, tileGrid: TileGrid) {
  const buildingsLayer = new VectorTileLayer({
    source: new VectorTileSource({
      format: new MVT({ layers: ['buildings'] }),
      projection: projection,
      tileGrid: tileGrid,
      tileUrlFunction: (tileCoord) => {
        const z = tileCoord[0] + 9; // Map index to semantic zoom
        return `/map-tiles/buildings/${z}/${tileCoord[1]}/${-tileCoord[2] - 1}.pbf`;
      },
    }),
    style: getBuildingStyle
  });
  map.addLayer(buildingsLayer);

  const roadsLayer = new VectorTileLayer({
    source: new VectorTileSource({
      format: new MVT({ layers: ['roads'] }),
      projection: projection,
      tileGrid: tileGrid,
      tileUrlFunction: (tileCoord) => {
        const z = tileCoord[0] + 9; // Map index to semantic zoom
        return `/map-tiles/roads/${z}/${tileCoord[1]}/${-tileCoord[2] - 1}.pbf`;
      },
    }),
    style: getRoadStyle,
  });
  map.addLayer(roadsLayer);
} 