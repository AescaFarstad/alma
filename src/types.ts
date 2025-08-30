export interface MouseCoordinates {
  lng: number;
  lat: number;
}

export interface MapBounds {
  _sw: { lng: number; lat: number };
  _ne: { lng: number; lat: number };
}

export type { MouseCoordinates as MouseCoords };

export type BuildingProperties = {
  building: string;
  levels?: string;
  name?: string;
  num?: string;
  osm_id: string;
}; 