import { NavTriIndex } from './NavTriIndex';

export class Navmesh {
    // Layout: [x1, y1, x2, y2, x3, y3, ...]
    public points: Float32Array;
    
    /**
     * Layout: [t1_v1_idx, t1_v2_idx, t1_v3_idx, t2_v1_idx, t2_v2_idx, t2_v3_idx, ...]
     * To get the actual coordinates: {x:points[t1_v1_idx * 2], y:points[t1_v1_idx * 2 + 1]}
     */
    public triangles: Int32Array;

    /**
     * Layout: [t1_n1_idx, t1_n2_idx, t1_n3_idx, t2_n1_idx, t2_n2_idx, t2_n3_idx, ...]
     * For a triangle `i` with vertices `v1, v2, v3` (from the `triangles` array):
     * - `neighbors[i * 3]` is the neighbor across edge (v1, v2)
     * - `neighbors[i * 3 + 1]` is the neighbor across edge (v2, v3)
     * - `neighbors[i * 3 + 2]` is the neighbor across edge (v3, v1)
     * A value of -1 indicates no neighbor on that edge.
     */
    public neighbors: Int32Array;

   // Layout: [c1x, c1y, c2x, c2y, ...]
    public centroids: Float32Array;

    public bbox: number[];
    public triIndex!: NavTriIndex;

    constructor() {
        this.points = new Float32Array(0);
        this.triangles = new Int32Array(0);
        this.neighbors = new Int32Array(0);
        this.centroids = new Float32Array(0);
        this.bbox = [];
    }
} 