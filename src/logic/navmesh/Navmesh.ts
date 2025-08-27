import { SpatialIndex } from './SpatialIndex';
import { BuildingProperties } from '../../types';

// Centralized constant for spatial index cell size used across navmesh and WASM
export const SPATIAL_INDEX_CELL_SIZE = 64;

export class Navmesh {
    // Layout: [x1, y1, x2, y2, x3, y3, ...]
    public vertices: Float32Array;
    
    /**
     * Layout: [t1_v1_idx, t1_v2_idx, t1_v3_idx, t2_v1_idx, t2_v2_idx, t2_v3_idx, ...]
     * To get the actual coordinates: {x:vertices[t1_v1_idx * 2], y:vertices[t1_v1_idx * 2 + 1]}
     */
    public triangles: Int32Array;

    /**
     * Layout: [t1_n1_idx, t1_n2_idx, t1_n3_idx, t2_n1_idx, t2_n2_idx, t2_n3_idx, ...]
     * For a triangle `i` with vertices `v1, v2, v3` (from the `triangles` array):
     * - `neighbors[i * 3]` is the neighbor across edge (v1, v2)
     * - `neighbors[i * 3 + 1]` is the neighbor across edge (v2, v3)
     * - `neighbors[i * 3 + 2]` is the neighbor across edge (v3, v1)
     * A neighbor index >= walkable_triangle_count indicates no walkable neighbor on that edge.
     */
    public neighbors: Int32Array;

    /**
     * Triangle centroids calculated in WASM. Layout: [t1_x, t1_y, t2_x, t2_y, ...]
     * Centroids for triangle `i` at: {x: triangle_centroids[i * 2], y: triangle_centroids[i * 2 + 1]}
     */
    public triangle_centroids: Float32Array;

    public bbox: Float32Array; // [minX, minY, maxX, maxY] - Real/original bounding box
    public buffered_bbox: Float32Array; // [minX, minY, maxX, maxY] - Enlarged bounding box used for triangulation

    // New fields from new_navmesh.md
    public walkable_triangle_count: number;
    public walkable_polygon_count: number;

    public polygons: Int32Array;
    public poly_centroids: Float32Array;
    public poly_verts: Int32Array;
    public poly_tris: Int32Array;
    public poly_neighbors: Int32Array;
    public buildings: Int32Array;
    public building_verts: Int32Array;
    public blob_buildings: Int32Array;

    public building_properties: BuildingProperties[]; // Parsed JSON metadata for buildings

    // Auxiliary structures built in C++
    public triangle_to_polygon: Int32Array; // Maps triangle index to polygon index
    public building_to_blob: Int32Array; // Maps building index to blob index

    // Spatial indices for fast queries
    public triangleIndex: SpatialIndex;
    public polygonIndex: SpatialIndex;
    public buildingIndex: SpatialIndex;
    public blobIndex: SpatialIndex;

    constructor() {
        this.vertices = new Float32Array(0);
        this.triangles = new Int32Array(0);
        this.neighbors = new Int32Array(0);
        this.triangle_centroids = new Float32Array(0);
        this.bbox = new Float32Array(4);
        this.buffered_bbox = new Float32Array(4);
        
        this.walkable_triangle_count = 0;
        this.walkable_polygon_count = 0;

        this.polygons = new Int32Array(0);
        this.poly_centroids = new Float32Array(0);
        this.poly_verts = new Int32Array(0);
        this.poly_tris = new Int32Array(0);
        this.poly_neighbors = new Int32Array(0);
        this.buildings = new Int32Array(0);
        this.building_verts = new Int32Array(0);
        this.blob_buildings = new Int32Array(0);
        this.building_properties = [];

        // Initialize auxiliary structures
        this.triangle_to_polygon = new Int32Array(0);
        this.building_to_blob = new Int32Array(0);

        // Initialize spatial indices
        this.triangleIndex = new SpatialIndex();
        this.polygonIndex = new SpatialIndex();
        this.buildingIndex = new SpatialIndex();
        this.blobIndex = new SpatialIndex();
    }
} 