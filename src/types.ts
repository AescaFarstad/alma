export interface MouseCoordinates {
  lng: number;
  lat: number;
}

export interface MapBounds {
  _sw: { lng: number; lat: number };
  _ne: { lng: number; lat: number };
} 