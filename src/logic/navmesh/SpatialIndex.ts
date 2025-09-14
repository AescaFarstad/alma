/**
 * Spatial index class that provides views into C++ spatial index data
 */
export class SpatialIndex {
  public cellOffsets: Uint32Array = new Uint32Array(0);
  public cellItems: Int32Array = new Int32Array(0);
  public gridWidth: number = 0;
  public gridHeight: number = 0;
  public cellSize: number = 0;
  public minX: number = 0;
  public minY: number = 0;
  public maxX: number = 0;
  public maxY: number = 0;

  constructor() {}

  public initializeFromWasm(
    cellOffsetsPtr: number,
    cellItemsPtr: number,
    cellOffsetsCount: number,
    cellItemsCount: number,
    gridWidth: number,
    gridHeight: number,
    cellSize: number,
    minX: number,
    minY: number,
    maxX: number,
    maxY: number,
    wasmMemory: ArrayBuffer
  ): void {
    // console.log(`[TS SPATIAL INIT DEBUG] Initializing spatial index:`);
    // console.log(`  - cellOffsetsPtr: ${cellOffsetsPtr}, cellItemsPtr: ${cellItemsPtr}`);
    // console.log(`  - cellOffsetsCount: ${cellOffsetsCount}, cellItemsCount: ${cellItemsCount}`);
    // console.log(`  - grid: ${gridWidth}x${gridHeight}, cellSize: ${cellSize}`);
    // console.log(`  - bbox: [${minX}, ${minY}, ${maxX}, ${maxY}]`);
    // console.log(`  - wasmMemory.byteLength: ${wasmMemory.byteLength}`);

    if (cellOffsetsPtr !== 0 && cellOffsetsCount > 0) {
      this.cellOffsets = new Uint32Array(wasmMemory, cellOffsetsPtr, cellOffsetsCount);
      // console.log(`[TS SPATIAL INIT DEBUG] cellOffsets created: length=${this.cellOffsets.length}, first few values: [${Array.from(this.cellOffsets.slice(0, 10)).join(', ')}]`);
    } else {
      // console.log(`[TS SPATIAL INIT DEBUG] cellOffsets not initialized (ptr=${cellOffsetsPtr}, count=${cellOffsetsCount})`);
    }

    if (cellItemsPtr !== 0 && cellItemsCount > 0) {
      this.cellItems = new Int32Array(wasmMemory, cellItemsPtr, cellItemsCount);
      // console.log(`[TS SPATIAL INIT DEBUG] cellItems created: length=${this.cellItems.length}`);
    } else {
      // console.log(`[TS SPATIAL INIT DEBUG] cellItems not initialized (ptr=${cellItemsPtr}, count=${cellItemsCount})`);
    }

    this.gridWidth = gridWidth;
    this.gridHeight = gridHeight;
    this.cellSize = cellSize;
    this.minX = minX;
    this.minY = minY;
    this.maxX = maxX;
    this.maxY = maxY;

    // console.log(`[TS SPATIAL INIT DEBUG] Initialization complete. Final state:`);
    // console.log(`  - cellOffsets.length: ${this.cellOffsets.length}, cellItems.length: ${this.cellItems.length}`);
    // console.log(`  - grid: ${this.gridWidth}x${this.gridHeight}, cellSize: ${this.cellSize}`);
    // console.log(`  - bbox: [${this.minX}, ${this.minY}, ${this.maxX}, ${this.maxY}]`);
  }

  public query(x: number, y: number): Int32Array {
    if (x < this.minX || x > this.maxX || y < this.minY || y > this.maxY) {
      // console.log(`[TS SPATIAL DEBUG] Out of bounds: x=${x} (${this.minX}-${this.maxX}), y=${y} (${this.minY}-${this.maxY})`);
      return new Int32Array(0);
    }

    const cx = Math.floor((x - this.minX) / this.cellSize);
    const cy = Math.floor((y - this.minY) / this.cellSize);

    const idx = cx + cy * this.gridWidth;
    if (idx < 0 || idx >= this.cellOffsets.length - 1) {
      return new Int32Array(0);
    }

    const threshold = 0.1;
    const cellMinX = this.minX + cx * this.cellSize;
    const cellMaxX = cellMinX + this.cellSize;
    const cellMinY = this.minY + cy * this.cellSize;
    const cellMaxY = cellMinY + this.cellSize;

    const nearLeft = (x - cellMinX) <= threshold;
    const nearRight = (cellMaxX - x) <= threshold;
    const nearBottom = (y - cellMinY) <= threshold;
    const nearTop = (cellMaxY - y) <= threshold;

    // Fast path: not near any boundary, return the primary cell slice directly
    if (!nearLeft && !nearRight && !nearBottom && !nearTop) {
      const start = this.cellOffsets[idx];
      const end = this.cellOffsets[idx + 1];
      return this.cellItems.subarray(start, end);
    }

    // Slow path: merge with adjacent cells, deduping
    const start = this.cellOffsets[idx];
    const end = this.cellOffsets[idx + 1];
    const base = this.cellItems.slice(start, end);
    const out: number[] = Array.from(base);
    const seen = new Set<number>(base as unknown as number[]);

    if (nearLeft) SpatialIndex.addCellItemsUnique(this, cx - 1, cy, seen, out);
    if (nearRight) SpatialIndex.addCellItemsUnique(this, cx + 1, cy, seen, out);
    if (nearBottom) SpatialIndex.addCellItemsUnique(this, cx, cy - 1, seen, out);
    if (nearTop) SpatialIndex.addCellItemsUnique(this, cx, cy + 1, seen, out);

    return Int32Array.from(out);
  }

  public getItemsInCell(cx: number, cy: number): Int32Array {
    const cellIndex = cx + cy * this.gridWidth;
    if (cellIndex < 0 || cellIndex >= this.cellOffsets.length - 1) {
      return new Int32Array(0);
    }

    const start = this.cellOffsets[cellIndex];
    const end = this.cellOffsets[cellIndex + 1];
    return this.cellItems.subarray(start, end);
  }

  private static addCellItemsUnique(self: SpatialIndex, cx: number, cy: number, seen: Set<number>, out: number[]): void {
    if (cx < 0 || cy < 0 || cx >= self.gridWidth || cy >= self.gridHeight) return;
    const idx = cx + cy * self.gridWidth;
    if (idx < 0 || idx >= self.cellOffsets.length - 1) return;
    const start = self.cellOffsets[idx];
    const end = self.cellOffsets[idx + 1];
    for (let i = start; i < end; i++) {
      const v = self.cellItems[i];
      if (!seen.has(v)) { seen.add(v); out.push(v); }
    }
  }
}
