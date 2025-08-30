import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { argv } from 'process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


const ORIGIN_LAT = 43.242502;
const ORIGIN_LON = 76.948339;
const EARTH_RADIUS_METERS = 6371000;
const COS_ORIGIN_LAT = Math.cos(ORIGIN_LAT * Math.PI / 180);

interface Args {
  inputDir: string;
  outputDir: string;
  generatedTypesFile: string;
}

interface Coordinates {
  [key: number]: number | Coordinates;
}

interface Geometry {
  type: 'Polygon' | 'MultiPolygon' | 'LineString' | 'Point' | string;
  coordinates: Coordinates;
}

interface Properties {
  [key: string]: any;
  building?: string;
  highway?: string;
  name?: string;
  'building:levels'?: string;
  'building:colour'?: string;
  'addr:housenumber'?: string;
  amenity?: string;
  shop?: string;
  area?: string;
}

interface Feature {
  type: 'Feature';
  id?: string;
  geometry: Geometry;
  properties: Properties;
  inscribedCenter?: [number, number] | null;
}

interface GeoJSON {
  type: 'FeatureCollection';
  features: Feature[];
  [key: string]: any;
}

interface LogCounts {
  [key: string]: number;
}

interface ProcessingLog {
  removed: {
    invalid_geometry: LogCounts;
    building_linestring_not_closed: number;
    building_invalid_geometry_type: LogCounts;
    building_with_barrier: number;
    highway_invalid_geometry_type: LogCounts;
    highway_type: LogCounts;
    highway_with_removable_prop: LogCounts;
    empty_properties: number;
  };
  modified: {
    building_set_to_healthcare: number;
    building_yes_to_commercial_by_props: LogCounts;
    building_yes_to_amenity_by_props: LogCounts;
    building_yes_to_industrial_by_props: LogCounts;
    building_category_condensed: LogCounts;
    highway_category_condensed: LogCounts;
    winding_order_reversed_exterior: number;
    winding_order_reversed_hole: number;
    winding_order_reversed_linestring: number;
  };
  totals: {
    read: number;
    remaining: number;
    buildings?: number;
    highways?: number;
    [key: string]: number | undefined;
  };
}

function parseArgs(): Args {
  const args = argv.slice(2);
  const inputArg = args.find(arg => arg.startsWith('--input='));
  const outputArg = args.find(arg => arg.startsWith('--output='));
  const generatedTypesFileArg = args.find(arg => arg.startsWith('--generated-types-file='));

  if (!inputArg || !outputArg || !generatedTypesFileArg) {
    console.error('Usage: ts-node filter_geojson.ts --input=<directory> --output=<directory> --generated-types-file=<file>');
    process.exit(1);
  }

  return {
    inputDir: inputArg.split('=')[1],
    outputDir: outputArg.split('=')[1],
    generatedTypesFile: generatedTypesFileArg.split('=')[1],
  };
}

function transformCoords(coordinates: any): any {
  if (typeof coordinates[0] === 'number' && typeof coordinates[1] === 'number') {
    const [lon, lat] = coordinates;
    const x = (lon - ORIGIN_LON) * Math.PI / 180 * COS_ORIGIN_LAT * EARTH_RADIUS_METERS;
    const y = (lat - ORIGIN_LAT) * Math.PI / 180 * EARTH_RADIUS_METERS;
    return [Math.round(x * 100) / 100, Math.round(y * 100) / 100];
  }
  return coordinates.map(transformCoords);
}

function getInscribedCenter(geometry: Geometry): [number, number] | null {
  let points: [number, number][] = [];
  if (geometry.type === 'Polygon') {
    points = (geometry.coordinates as any).flat(1);
  } else if (geometry.type === 'MultiPolygon') {
    points = (geometry.coordinates as any).flat(2);
  }

  if (points.length === 0) return null;

  const sum = points.reduce((acc, val) => [acc[0] + val[0], acc[1] + val[1]], [0, 0]);
  const centerX = sum[0] / points.length;
  const centerY = sum[1] / points.length;
  return [Math.round(centerX * 100) / 100, Math.round(centerY * 100) / 100];
}

function isLineStringClosed(coordinates: number[][]): boolean {
  const first = coordinates[0];
  const last = coordinates[coordinates.length - 1];
  return first[0] === last[0] && first[1] === last[1];
}

function processBuilding(feature: Feature, log: ProcessingLog): Feature | null {
  const props = feature.properties;

  // 2.1.1 `building` Tag Refinement - Removal rules
  if (!['Polygon', 'MultiPolygon'].includes(feature.geometry.type)) {
    if (feature.geometry.type === 'LineString' && isLineStringClosed(feature.geometry.coordinates as number[][])) {
      // This is an allowed case, do nothing
    } else {
      if (feature.geometry.type === 'LineString') {
        log.removed.building_linestring_not_closed++;
      } else {
        log.removed.building_invalid_geometry_type[feature.geometry.type] = (log.removed.building_invalid_geometry_type[feature.geometry.type] || 0) + 1;
      }
      return null;
    }
  }
  if (props.barrier || props.bollard) {
    log.removed.building_with_barrier++;
    return null;
  }

  // 2.1.1. `building` Tag Refinement
  if (props.healthcare || props['healthcare:speciality']) {
    props.building = 'healthcare';
    log.modified.building_set_to_healthcare++;
  }

  if (props.building === 'yes') {
    const commercialChecks = ['amenity', 'brand', 'brand:en', 'brand:ru', 'brand:wikidata', 'brand:wikipedia', 'construction', 'cuisine', 'fuel:diesel', 'fuel:octane_95', 'fuel:octane_98', 'leisure', 'opening_hours', 'phone', 'phone_1', 'product', 'shop'];
    const amenityChecks = ['community_centre', 'government', 'public_transport', 'railway', 'religion', 'sport', 'tourism'];
    const industrialChecks = ['industrial', 'power'];

    const foundCommercialProps = commercialChecks.filter(p => props[p]);
    const foundPaymentProps = Object.keys(props).filter(p => p.startsWith('payment:'));
    
    if (foundCommercialProps.length > 0 || foundPaymentProps.length > 0) {
      props.building = 'commercial';
      const triggers = [...foundCommercialProps, ...foundPaymentProps];
      log.modified.building_yes_to_commercial_by_props[triggers.join(',')] = (log.modified.building_yes_to_commercial_by_props[triggers.join(',')] || 0) + 1;
    } else if (amenityChecks.some(p => props[p])) {
      props.building = 'amenity';
      const foundProps = amenityChecks.filter(p => props[p]);
      log.modified.building_yes_to_amenity_by_props[foundProps.join(',')] = (log.modified.building_yes_to_amenity_by_props[foundProps.join(',')] || 0) + 1;
    } else if (industrialChecks.some(p => props[p])) {
      props.building = 'industrial';
      const foundProps = industrialChecks.filter(p => props[p]);
      log.modified.building_yes_to_industrial_by_props[foundProps.join(',')] = (log.modified.building_yes_to_industrial_by_props[foundProps.join(',')] || 0) + 1;
    }
  }

  // 2.1.2. Property Normalization
  const addr: { housenumber?: string } = {};
  if (props['addr:housenumber']) addr.housenumber = props['addr:housenumber'];
  else if (props['addr2:housenumber']) addr.housenumber = props['addr2:housenumber'];
  else if (props['addr:housenumber2']) addr.housenumber = props['addr:housenumber2'];

  if (props['addr:housenumber'] && props['addr:housenumber2'] && props['addr:housenumber'] !== props['addr:housenumber2']) {
    addr.housenumber = `${props['addr:housenumber']}/${props['addr:housenumber2']}`;
  }

  if (!addr.housenumber && props['addr:unit']) addr.housenumber = props['addr:unit'];
  else if (addr.housenumber && props['addr:unit']) addr.housenumber = `${addr.housenumber}-${props['addr:unit']}`;
  if (addr.housenumber) props['addr:housenumber'] = addr.housenumber;
  
  if (!props['addr:street'] && props['addr:street:ru']) props['addr:street'] = props['addr:street:ru'];

  const namePriority = ['name:ru', 'name:en', 'name:es', 'name:de', 'name:fr', 'name:kk', 'name:tr', 'name:tt', 'name:zh', 'name:cv', 'name:ko', 'name:alt', 'name:old'];
  const officialNamePriority = ['official_name:ru', 'official_name', 'official_name:kk', 'old_name', 'short_name', 'short_name:ru', 'short_name:en', 'short_name:de'];

  if (props['name:ru']) props.name = props['name:ru'];
  if (!props.name) {
    for (const key of namePriority) if (props[key]) { props.name = props[key]; break; }
  }
  if (!props.name) {
    for (const key of officialNamePriority) if (props[key]) { props.name = props[key]; break; }
  }
  if (!props.name && props.wikimedia_commons) props.name = props.wikimedia_commons.replace('Category:', '');
  if (!props.name && props.wikipedia) props.name = props.wikipedia.replace(/^(ru|en|kk):/, '');

  if (!props['building:levels'] && (props.levels || props.level)) props['building:levels'] = props.levels || props.level;
  if (!props['building:colour'] && props['roof:colour']) props['building:colour'] = props['roof:colour'];
  
  // 2.1.3. `building` Category Condensation
  const buildingCategoryMap: { [key: string]: string[] } = {
    residential: ['apartments', 'house', 'residential', 'detached', 'dormitory', 'hut', 'yes'],
    commercial: ['commercial', 'retail', 'office', 'service', 'hotel', 'warehouse', 'shop', 'kiosk', 'supermarket'],
    education: ['school', 'university', 'kindergarten', 'college', 'library'],
    industrial: ['industrial', 'garages', 'garage', 'hangar', 'shed', 'greenhouse', 'construction'],
    healthcare: ['hospital', 'healthcare'],
    amenity: ['roof', 'civic', 'public', 'government', 'church', 'toilets', 'mosque', 'temple', 'museum', 'theater', 'community_centre', 'sports_centre', 'stadium', 'guardhouse', 'parking', 'bridge', 'ruins', 'no']
  };
  let categorized = false;
  const originalBuilding = props.building;
  for (const category in buildingCategoryMap) {
    if (props.building && buildingCategoryMap[category].includes(props.building)) {
      props.building = category;
      categorized = true;
      log.modified.building_category_condensed[`${originalBuilding}_to_${category}`] = (log.modified.building_category_condensed[`${originalBuilding}_to_${category}`] || 0) + 1;
      break;
    }
  }
  if (!categorized) {
    log.modified.building_category_condensed[`${originalBuilding}_to_amenity`] = (log.modified.building_category_condensed[`${originalBuilding}_to_amenity`] || 0) + 1;
    props.building = 'amenity'; // Default for unlisted
  }

  // 2.1.5. Final Property Pruning and Renaming
  const finalProps: Properties = {};
  if (props.building) finalProps.building = props.building;
  if (props['building:levels']) finalProps.levels = props['building:levels'];
  if (props['building:colour']) finalProps.color = props['building:colour'];
  if (props['addr:housenumber']) finalProps.num = props['addr:housenumber'];
  if (props.amenity) finalProps.amenity = props.amenity;
  if (props.shop) finalProps.shop = props.shop;
  if (props.area) finalProps.area = props.area;
  if (props.name) finalProps.name = props.name;

  feature.properties = finalProps;
  
  return feature;
}

function processHighway(feature: Feature, log: ProcessingLog): Feature | null {
  const props = feature.properties;

  if (feature.geometry.type !== 'LineString') {
    log.removed.highway_invalid_geometry_type[feature.geometry.type] = (log.removed.highway_invalid_geometry_type[feature.geometry.type] || 0) + 1;
    return null;
  }
  
  // 2.2.1. Feature Removal
  const removeHighways = ['crossing', 'traffic_signals', 'speed_camera', 'bus_stop'];
  if (props.highway && removeHighways.includes(props.highway)) {
    log.removed.highway_type[props.highway] = (log.removed.highway_type[props.highway] || 0) + 1;
    return null;
  }
  const removeProps = ['bench', 'crossing', 'crossing:island', 'crossing:markings', 'crossing:signals', 'crossing_ref'];
  const foundRemoveProps = removeProps.filter(p => props[p]);
  if (foundRemoveProps.length > 0) {
    log.removed.highway_with_removable_prop[foundRemoveProps.join(',')] = (log.removed.highway_with_removable_prop[foundRemoveProps.join(',')] || 0) + 1;
    return null;
  }

  // 2.2.2. Property Normalization
  const namePriority = ['int_name', 'name:ru', 'name:ru:word_stress', 'addr:street', 'name:en', 'name:kk', 'old_name:ru', 'old_name', 'old_name_1', 'alt_name', 'description'];
  if (props.int_name) props.name = props.int_name;
  if (!props.name) {
    for (const key of namePriority) if (props[key]) { props.name = props[key]; break; }
  }

  // 2.2.3. `highway` Category Condensation
  const highwayCategoryMap: { [key: string]: string[] } = {
    primary: ['primary', 'primary_link'],
    secondary: ['secondary', 'secondary_link'],
    tertiary: ['tertiary', 'tertiary_link'],
    service: ['service', 'residential', 'unclassified', 'living_street', 'track', 'turning_circle', 'raceway', 'construction'],
    footway: ['footway', 'steps', 'cycleway', 'pedestrian', 'path', 'corridor', 'bridleway', 'platform']
  };
  let categorized = false;
  const originalHighway = props.highway;
  for (const category in highwayCategoryMap) {
    if (props.highway && highwayCategoryMap[category].includes(props.highway)) {
      props.highway = category;
      categorized = true;
      log.modified.highway_category_condensed[`${originalHighway}_to_${category}`] = (log.modified.highway_category_condensed[`${originalHighway}_to_${category}`] || 0) + 1;
      break;
    }
  }
  if (!categorized) {
    log.modified.highway_category_condensed[`${originalHighway}_to_footway`] = (log.modified.highway_category_condensed[`${originalHighway}_to_footway`] || 0) + 1;
    props.highway = 'footway'; // Default for unlisted
  }

  // 2.2.4. Final Property Pruning
  const allowedHighwayProps = new Set(['highway', 'name']);
  for (const key in props) {
    if (!allowedHighwayProps.has(key)) {
      delete props[key];
    }
  }

  return feature;
}

function processFeature(feature: Feature, log: ProcessingLog): Feature[] | null {
  const props = feature.properties;
  if (!props) return null;

  // 1.1 Global Pre-processing & Filtering
  const validGeomTypes = ['Polygon', 'MultiPolygon', 'LineString'];
  if (!feature.geometry || !validGeomTypes.includes(feature.geometry.type)) {
    const geomType = feature.geometry ? feature.geometry.type : 'missing';
    log.removed.invalid_geometry[geomType] = (log.removed.invalid_geometry[geomType] || 0) + 1;
    return null;
  }

  // 2. Feature-Specific Processing
  if (props.building) {
    const processedBuilding = processBuilding(feature, log);
    if (!processedBuilding) {
      return null;
    }

    if (processedBuilding.geometry.type === 'MultiPolygon') {
      const newFeatures: Feature[] = [];
      const originalId = processedBuilding.id || '';
      (processedBuilding.geometry.coordinates as any).forEach((polygonCoords: any, index: number) => {
        const newFeature: Feature = {
          ...processedBuilding,
          id: `M${originalId}${index}`,
          properties: { ...processedBuilding.properties },
          geometry: {
            type: 'Polygon',
            coordinates: polygonCoords,
          },
        };
        newFeatures.push(newFeature);
      });
      return newFeatures;
    }
    return [processedBuilding];
  } else if (props.highway) {
    const processedHighway = processHighway(feature, log);
    return processedHighway ? [processedHighway] : null;
  }
  
  return null; 
}

function createLog(): ProcessingLog {
  return {
    removed: {
      invalid_geometry: {},
      building_linestring_not_closed: 0,
      building_invalid_geometry_type: {},
      building_with_barrier: 0,
      highway_invalid_geometry_type: {},
      highway_type: {},
      highway_with_removable_prop: {},
      empty_properties: 0,
    },
    modified: {
      building_set_to_healthcare: 0,
      building_yes_to_commercial_by_props: {},
      building_yes_to_amenity_by_props: {},
      building_yes_to_industrial_by_props: {},
      building_category_condensed: {},
      highway_category_condensed: {},
      winding_order_reversed_exterior: 0,
      winding_order_reversed_hole: 0,
      winding_order_reversed_linestring: 0,
    },
    totals: {
      read: 0,
      remaining: 0,
      buildings: 0,
      highways: 0,
    }
  };
}

function printLog(log: ProcessingLog, fileName: string): void {
  console.log(`\n--- Processing Log for ${fileName} ---`);
  console.log("Removals:");
  
  // Invalid geometry by type
  if (Object.keys(log.removed.invalid_geometry).length > 0) {
    console.log("  invalid_geometry:");
    for (const [geomType, count] of Object.entries(log.removed.invalid_geometry)) {
      console.log(`  ${geomType}: ${count}`);
    }
  }
  
  // Building-specific removals
  if (log.removed.building_linestring_not_closed > 0) {
    console.log(`  building_linestring_not_closed: ${log.removed.building_linestring_not_closed}`);
  }
  if (Object.keys(log.removed.building_invalid_geometry_type).length > 0) {
    console.log("  building_invalid_geometry_type:");
    for (const [geomType, count] of Object.entries(log.removed.building_invalid_geometry_type)) {
      console.log(`  ${geomType}: ${count}`);
    }
  }
  if (log.removed.building_with_barrier > 0) {
    console.log(`  building_with_barrier: ${log.removed.building_with_barrier}`);
  }
  
  // Highway-specific removals
  if (Object.keys(log.removed.highway_invalid_geometry_type).length > 0) {
    console.log("  highway_invalid_geometry_type:");
    for (const [geomType, count] of Object.entries(log.removed.highway_invalid_geometry_type)) {
      console.log(`  ${geomType}: ${count}`);
    }
  }
  if (Object.keys(log.removed.highway_type).length > 0) {
    console.log("  highway_type_removed:");
    for (const [type, count] of Object.entries(log.removed.highway_type)) {
      console.log(`  ${type}: ${count}`);
    }
  }
  if (Object.keys(log.removed.highway_with_removable_prop).length > 0) {
    console.log("  highway_with_removable_prop:");
    for (const [props, count] of Object.entries(log.removed.highway_with_removable_prop)) {
      console.log(`  ${props}: ${count}`);
    }
  }
  
  if (log.removed.empty_properties > 0) {
    console.log(`  empty_properties: ${log.removed.empty_properties}`);
  }

  console.log("Modifications:");
  if (log.modified.building_set_to_healthcare > 0) {
    console.log(`  building_set_to_healthcare: ${log.modified.building_set_to_healthcare}`);
  }
  
  if (Object.keys(log.modified.building_yes_to_commercial_by_props).length > 0) {
    console.log("  building_yes_to_commercial_by_props:");
    for (const [props, count] of Object.entries(log.modified.building_yes_to_commercial_by_props)) {
      console.log(`  ${props}: ${count}`);
    }
  }
  if (Object.keys(log.modified.building_yes_to_amenity_by_props).length > 0) {
    console.log("  building_yes_to_amenity_by_props:");
    for (const [props, count] of Object.entries(log.modified.building_yes_to_amenity_by_props)) {
      console.log(`  ${props}: ${count}`);
    }
  }
  if (Object.keys(log.modified.building_yes_to_industrial_by_props).length > 0) {
    console.log("  building_yes_to_industrial_by_props:");
    for (const [props, count] of Object.entries(log.modified.building_yes_to_industrial_by_props)) {
      console.log(`  ${props}: ${count}`);
    }
  }
  
  if (Object.keys(log.modified.building_category_condensed).length > 0) {
    console.log("  building_category_condensed:");
    for (const [transformation, count] of Object.entries(log.modified.building_category_condensed)) {
      console.log(`  ${transformation}: ${count}`);
    }
  }
  
  if (Object.keys(log.modified.highway_category_condensed).length > 0) {
    console.log("  highway_category_condensed:");
    for (const [transformation, count] of Object.entries(log.modified.highway_category_condensed)) {
      console.log(`  ${transformation}: ${count}`);
    }
  }

  if (log.modified.winding_order_reversed_exterior > 0) {
    console.log(`  winding_order_reversed_exterior: ${log.modified.winding_order_reversed_exterior}`);
  }
  if (log.modified.winding_order_reversed_hole > 0) {
    console.log(`  winding_order_reversed_hole: ${log.modified.winding_order_reversed_hole}`);
  }
  if (log.modified.winding_order_reversed_linestring > 0) {
    console.log(`  winding_order_reversed_linestring: ${log.modified.winding_order_reversed_linestring}`);
  }

  console.log("Totals:");
  for (const key in log.totals) console.log(`  ${key}: ${log.totals[key]}`);
  console.log("--- End Log ---");
}

function getSignedArea(ring: number[][]): number {
  let area = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    area += ring[i][0] * ring[i+1][1] - ring[i+1][0] * ring[i][1];
  }
  return area / 2;
}

function ensureWindingOrder(geometry: Geometry, log: ProcessingLog): void {
  if (geometry.type === 'Polygon') {
    const rings = geometry.coordinates as number[][][];
    for (let i = 0; i < rings.length; i++) {
      const ring = rings[i];
      const area = getSignedArea(ring);

      if (i === 0) { // Exterior ring should be CCW
        if (area < 0) { // It's CW, needs reversal
          ring.reverse();
          log.modified.winding_order_reversed_exterior = (log.modified.winding_order_reversed_exterior || 0) + 1;
        }
      } else { // Hole rings should be CW
        if (area > 0) { // It's CCW, needs reversal
          ring.reverse();
          log.modified.winding_order_reversed_hole = (log.modified.winding_order_reversed_hole || 0) + 1;
        }
      }
    }
  } else if (geometry.type === 'LineString') {
    const ring = geometry.coordinates as number[][];
    // A closed LineString has at least 4 points (e.g., A, B, C, A) and its first and last points are identical.
    if (ring.length >= 4 && ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1]) {
      const area = getSignedArea(ring);
      if (area < 0) { // It's CW, reverse to make it CCW.
        ring.reverse();
        log.modified.winding_order_reversed_linestring = (log.modified.winding_order_reversed_linestring || 0) + 1;
      }
    }
  }
}

async function main(): Promise<void> {
  const { inputDir, outputDir, generatedTypesFile } = parseArgs();

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const files = fs.readdirSync(inputDir).filter(f => f.endsWith('.geojson'));

  for (const fileName of files) {
    const filePath = path.join(inputDir, fileName);
    const content = fs.readFileSync(filePath, 'utf-8');
    const geojson: GeoJSON = JSON.parse(content);
    
    const log = createLog();
    log.totals.read = geojson.features.length;

    const processedFeatures: Feature[] = [];
    for (const feature of geojson.features) {
      const processedArray = processFeature(feature, log);

      if (processedArray) {
        for (let processed of processedArray) {
          // 3.1. Coordinate System Transformation
          processed.geometry.coordinates = transformCoords(processed.geometry.coordinates);

          // Enforce GeoJSON winding order rules
          if (processed.properties.building && (processed.geometry.type === 'Polygon' || processed.geometry.type === 'LineString')) {
            ensureWindingOrder(processed.geometry, log);
          }

          // Add inscribedCenter for buildings after transformation
          if (processed.properties.building) {
            processed.inscribedCenter = getInscribedCenter(processed.geometry);
          }

          // Final check for empty properties
          if (Object.keys(processed.properties).length === 0) {
            log.removed.empty_properties++;
            continue;
          }

          if (processed.properties.building) log.totals.buildings!++;
          if (processed.properties.highway) log.totals.highways!++;
          processedFeatures.push(processed);
        }
      }
    }

    geojson.features = processedFeatures;
    log.totals.remaining = processedFeatures.length;

    if (log.totals.buildings === 0) log.totals.buildings = undefined;
    if (log.totals.highways === 0) log.totals.highways = undefined;

    const outputPath = path.join(outputDir, fileName);
    
    const { features, ...geojsonHeader } = geojson;
    const featuresJson = processedFeatures.map(f => JSON.stringify(f));
    const outputContent = JSON.stringify(geojsonHeader).slice(0, -1) + ',"features":[\n' + featuresJson.join(',\n') + '\n]}';
    fs.writeFileSync(outputPath, outputContent);
    
    printLog(log, fileName);
    console.log(`\nWritten processed file to ${outputPath}`);
    const stats = fs.statSync(outputPath);
    console.log(`Output file size: ${Math.round(stats.size / 1024)} KB`);
  }

  console.log(`\nRunning generate-structure script on ${outputDir}...`);
  try {
    const generateScriptPath = path.resolve(__dirname, 'generate-structure.cjs');
    execSync(`node "${generateScriptPath}" --input=${outputDir} --output=${generatedTypesFile}`, { stdio: 'inherit' });
  } catch (error) {
    console.error(`Failed to run generate-structure.cjs: ${(error as Error).message}`);
    process.exit(1);
  }
}

// Execute main function if this is the entry point
if (import.meta.url.endsWith(process.argv[1])) {
  main().catch(console.error);
} 