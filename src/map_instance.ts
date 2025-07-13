import type { Map } from 'maplibre-gl';

export const mapInstance: { map: Map | null } = {
    map: null
};

export const START_COORDS: [number, number] = [76.9470, 43.2467]; // Lng, Lat

const lat = START_COORDS[1];
const latRad = lat * Math.PI / 180;

export const DEG_PER_METER_LAT = 1 / 111132.954;
export const DEG_PER_METER_LNG = 1 / (111320 * Math.cos(latRad)); 