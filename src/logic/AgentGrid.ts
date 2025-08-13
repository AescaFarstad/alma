import { Agent } from './Agent';
import { Point2 } from './core/math';

/**
 * Spatial grid for agent collision optimization
 * Uses fixed 256m cell size with Halton sequence offset to prevent persistent border issues
 */

const CELL_SIZE = 256; // meters
const WORLD_MIN_X = -10000;
const WORLD_MIN_Y = -10000;
const WORLD_MAX_X = 10000;
const WORLD_MAX_Y = 10000;
const GRID_WIDTH = Math.ceil((WORLD_MAX_X - WORLD_MIN_X) / CELL_SIZE);
const GRID_HEIGHT = Math.ceil((WORLD_MAX_Y - WORLD_MIN_Y) / CELL_SIZE);

export class AgentGrid {
    public readonly cellData: Uint16Array;
    public readonly cellOffsets: Uint32Array;
    public readonly cellCounts: Uint16Array;
    private haltonOffset: Point2 = { x: 0, y: 0 };
    private frameCounter: number = 0;
    public readonly maxAgentsPerCell: number = 256;
    public readonly totalCells: number = GRID_WIDTH * GRID_HEIGHT;

    constructor() {
        // Pre-allocate typed arrays
        this.cellData = new Uint16Array(this.totalCells * this.maxAgentsPerCell);
        this.cellOffsets = new Uint32Array(this.totalCells);
        this.cellCounts = new Uint16Array(this.totalCells);
        
        // Initialize cell offsets
        for (let i = 0; i < this.totalCells; i++) {
            this.cellOffsets[i] = i * this.maxAgentsPerCell;
        }
    }

    /**
     * Clear grid and re-index all agents with Halton offset
     */
    public clearAndReindex(agents: Agent[]): void {
        // Clear cell counts
        this.cellCounts.fill(0);

        // Generate Halton offset for this frame
        this.generateHaltonOffset();

        // Re-index all agents
        for (let i = 0; i < agents.length; i++) {
            const agent = agents[i];
            const cellIndex = this.getCellIndex(agent.coordinate);
            if (cellIndex >= 0 && cellIndex < this.totalCells) {
                const count = this.cellCounts[cellIndex];
                if (count < this.maxAgentsPerCell) {
                    const offset = this.cellOffsets[cellIndex] + count;
                    this.cellData[offset] = i;
                    this.cellCounts[cellIndex]++;
                }
            }
        }

        this.frameCounter++;
    }

    /**
     * Convert world coordinate to cell index with Halton offset
     */
    public getCellIndex(coordinate: Point2): number {
        const offsetX = coordinate.x + this.haltonOffset.x;
        const offsetY = coordinate.y + this.haltonOffset.y;
        
        const gridX = Math.floor((offsetX - WORLD_MIN_X) / CELL_SIZE);
        const gridY = Math.floor((offsetY - WORLD_MIN_Y) / CELL_SIZE);
        
        if (gridX < 0 || gridX >= GRID_WIDTH || gridY < 0 || gridY >= GRID_HEIGHT) {
            return -1;
        }
        
        return gridY * GRID_WIDTH + gridX;
    }

    /**
     * Generate Halton sequence offset for current frame
     * Uses bases 2 and 3 for 2D sequence
     */
    private generateHaltonOffset(): void {
        const halfCell = CELL_SIZE * 0.5;
        this.haltonOffset.x = this.halton(this.frameCounter, 2) * CELL_SIZE - halfCell;
        this.haltonOffset.y = this.halton(this.frameCounter, 3) * CELL_SIZE - halfCell;
    }

    /**
     * Generate Halton sequence value
     */
    private halton(index: number, base: number): number {
        let result = 0;
        let fraction = 1;
        let i = index;
        
        while (i > 0) {
            fraction /= base;
            result += (i % base) * fraction;
            i = Math.floor(i / base);
        }
        
        return result;
    }
}