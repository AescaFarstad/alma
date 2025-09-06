import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BASE_DATA_DIR = path.resolve(__dirname, '../../../data');

export const RAW_OSM_FILE = path.resolve(BASE_DATA_DIR, 'other/kazakhstan-latest.osm.pbf');
export const FILTERED_OSM_FILE = path.resolve(BASE_DATA_DIR, 'almaty_c.pbf');
export const RAW_FILTERING_AREA: [number, number, number, number] = [76.80, 43.15, 77.05, 43.35];

export const AREA_DEFINITION = {
  // city_center: {
  //   bounds: [76.88, 43.22, 76.98, 43.27],
  //   description: 'Downtown Almaty (~25 km²)'
  // },
  city_crop: {
    bounds: [76.827, 43.195, 76.985, 43.275],
    description: 'Downtown Almaty squareish (~35 km²)',
    splitLines:[
      [
        {"x":4570.759007718483,"y":261.9884671941986},
        {"x":3172.19383937038,"y":925.2808288732351},
        {"x":2732.848420071992,"y":1565.469868422315},
        {"x":1707.3888733031672,"y":1554.5719293287168},
        {"x":-5847.180829481108,"y":822.0328727368076},
        {"x":-7858.39191971051,"y":233.29495065532342},
        {"x":-8207.845585702786,"y":56.85355915886407},
        {"x":-10447.383582719136,"y":-642.3525308245141}
      ],
      [
        {"x":351.76173482835065,"y":-4984.5618342838125},
        {"x":1520.0727295817578,"y":-3549.2461072410056},
        {"x":1141.0795790651505,"y":-2078.8293871180285},
        {"x":755.2994081428903,"y":-650.0439587232269},
        {"x":568.9596379979528,"y":1447.3596568699704},
        {"x":819.6436970495004,"y":1504.4446994411367},
        {"x":755.9890261267931,"y":2472.491707889063},
        {"x":779.1361791895961,"y":2531.1862745840317},
        {"x":467.07385098808163,"y":5481.487653752499}
      ],
      [
        {"x":-4426.843186499865,"y":-3766.850311009824},
        {"x":-4973.962664193902,"y":1938.3232870797085},
        {"x":-4855.373640068135,"y":3203.962301172627}
      ]
    ]
  },
  // city_main: {
  //   bounds: [76.85, 43.20, 77.00, 43.30],
  //   description: 'Main urban area (~100 km²)'
  // },
  // city_full: {
  //   bounds: [76.80, 43.18, 77.05, 43.35],
  //   description: 'Full city limits (~320 km²)'
  // }
}; 