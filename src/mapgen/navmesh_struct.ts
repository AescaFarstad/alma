export type MyPoint = [number, number];
export type MyPolygon = MyPoint[];

// New comprehensive navmesh data structures

export interface NavmeshData {
  // Core geometric data
  vertices: Float32Array;           // {x, y} pairs
  triangles: Int32Array;           // {v1, v2, v3} triplets, sorted by parent polygon ID
  neighbors: Int32Array;           // Triangle neighbors {tri1, tri2, tri3}, re-mapped after sort
  
  // Polygon data
  polygons: Int32Array;            // Index into poly_verts, poly_neighbors. length = poly_count + 1
  poly_centroids: Float32Array;    // {x, y} pairs
  poly_verts: Int32Array;          // Vertex indices for polygons
  poly_tris: Int32Array;           // Index into triangles array. length = poly_count + 1
  poly_neighbors: Int32Array;      // Neighbor polygon indices, ordered by vertex
  
  // Building data
  buildings: Int32Array;           // Index into building_verts. length = building_count + 1
  building_verts: Int32Array;      // Original high-detail vertices
  blob_buildings: Int32Array;      // Index into buildings array. length = blob_count + 1
  building_meta: string[];         // Array of JSON strings, one per building (encoded to binary only when writing file)
  
  // Index boundaries
  walkable_triangle_count: number;
  walkable_polygon_count: number;
  
  // Metadata
  bbox: [number, number, number, number];          // Real/original bounding box
  buffered_bbox: [number, number, number, number]; // Enlarged bounding box used for triangulation
  stats: NavmeshStats;
}

export interface NavmeshStats {
  vertices: number;
  triangles: number;
  walkable_triangles: number;
  impassable_triangles: number;
  polygons: number;
  walkable_polygons: number;
  impassable_polygons: number;
  buildings: number;
  blobs: number;
  bbox: [number, number, number, number];
  avg_triangle_area: number;
  avg_polygon_area: number;
}

// Intermediate data structures for generation pipeline
export interface BlobData {
  simplified_vertices: MyPoint[];
  constituent_buildings: number[];  // Building IDs
  is_single_building: boolean;
}

export interface GenerationContext {
  buildings: any[];
  blobs: BlobData[];
  processing_bbox: [number, number, number, number];
}

// Optimization result type (for k-opt algorithm)
export interface OptimizationResult {
  polygons: MyPolygon[];
  originalCount: number;
  optimizedCount: number;
  improvementPercent: number;
  iterations: number;
} 