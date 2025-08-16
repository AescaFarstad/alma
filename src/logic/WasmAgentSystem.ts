import { BlobGeometry, WasmModule, getWasmModule } from '../WasmModule';
import { Navmesh } from './navmesh/Navmesh';
import { WAgent } from './WAgent';
import { Blob } from '../BlobsLoader';
import { mapInstance } from '../map_instance';
import { allocateAndUploadConstantsBuffer } from "./wasm/ConstantsLayout";
import { calculateAgentDataSize, createAgentDataViews, AgentDataViews } from "./wasm/AgentSoALayout";
import { WasmBlobLoader } from "../WasmModule";

export class WasmAgentSystem {
    private wasm: WasmModule | null = null;
    private sharedBuffer: ArrayBuffer | SharedArrayBuffer | null = null;
    private sharedBufferPtr: number = 0;
    private navmeshBufferPtr: number = 0;
    public agents: WAgent[] = [];
    public agentDataViews: AgentDataViews = {} as AgentDataViews;
    private seed: number = 12345;

    // Cached cwraps
    private wasmAlloc: ((size: number) => number) | null = null;
    private wasmFree: ((ptr: number) => void) | null = null;

    // Renderer bindings (optional in first iteration)
    private _spriteRendererInit: ((selector: string) => void) | null = null;
    private _spriteUploadAtlasRGBA: ((ptr: number, w: number, h: number) => void) | null = null;
    private _spriteUploadFrameTable: ((ptr: number, frameCount: number) => void) | null = null;
    private _updateRT: ((dt: number, mPtr: number, widthPx: number, heightPx: number, dpr: number) => void) | null = null;
    private _spriteRendererClear: (() => void) | null = null;

    private cameraMatrixPtr: number = 0; // 9 floats

    // Frame mapping for TS side (kept in sync with WASM upload)
    private frameNameToId: Map<string, number> = new Map();

    constructor(private maxAgents: number, seed: number = 12345) {
        this.seed = seed;
    }

    public async init(navmesh: Navmesh, rawBlobs?: { id: string; coordinates: number[] }[]): Promise<void> {
        const module = getWasmModule();
        if (!module) throw new Error("WASM module is not initialized");
        this.wasm = module;

        // Bind allocators and extra exports if available
        if ((this.wasm as any).cwrap) {
            this.wasmAlloc = (this.wasm as any).cwrap("wasm_alloc", "number", ["number"]) as (n: number) => number;
            this.wasmFree = (this.wasm as any).cwrap("wasm_free", null, ["number"]) as (p: number) => void;
            (this.wasm as any)._set_rng_seed = (this.wasm as any).cwrap("set_rng_seed", null, ["number"]);
            // Renderer functions (may be absent if not linked yet)
            this._spriteRendererInit = (this.wasm as any).cwrap("sprite_renderer_init", null, ["string"]) as (s: string) => void;
            this._spriteUploadAtlasRGBA = (this.wasm as any).cwrap("sprite_upload_atlas_rgba", null, ["number", "number", "number"]) as (p: number, w: number, h: number) => void;
            this._spriteUploadFrameTable = (this.wasm as any).cwrap("sprite_upload_frame_table", null, ["number", "number"]) as (p: number, count: number) => void;
            this._updateRT = (this.wasm as any).cwrap("update_rt", null, ["number", "number", "number", "number", "number"]) as (dt: number, mptr: number, w: number, h: number, dpr: number) => void;
            this._spriteRendererClear = (this.wasm as any).cwrap("sprite_renderer_clear", null, []) as () => void;

        }

        // Step 0: Upload constants buffer so C++ can read TS values
        allocateAndUploadConstantsBuffer(this.wasm as WasmModule);

        // Step 1: Allocate memory and prepare data
        this.allocateMemoryOnly();
        this.prepareNavmeshBufferData(navmesh);

        // Step 2: Copy data to WASM heap BEFORE calling _init
        this.copySharedBufferToWasmHeap();
        this.copyNavmeshDataToWasmHeap(navmesh);

        // Step 3: Call WASM init
        (this.wasm as WasmModule)._init(this.sharedBufferPtr, this.navmeshBufferPtr, this.maxAgents, this.seed >>> 0);

        // Step 4: Create data views AFTER init
        this.agentDataViews = createAgentDataViews(this.wasm as WasmModule, this.sharedBufferPtr, this.maxAgents);

        // Step 5: Load blobs if provided (existing logic)
        if (rawBlobs && rawBlobs.length) {
            try {
                const loader = new WasmBlobLoader(this.wasm as WasmModule);
                loader.loadBlobs(
                    rawBlobs.map(b => ({
                        id: parseInt(b.id, 10),
                        points: (() => {
                            const pts: { x: number; y: number }[] = [];
                            for (let i = 0; i < b.coordinates.length; i += 2) {
                                pts.push({ x: b.coordinates[i], y: b.coordinates[i + 1] });
                            }
                            return pts;
                        })()
                    }))
                );
            } catch (e) {
                console.error("Failed to load blobs into WASM:", e);
            }
        }

        // Allocate camera matrix buffer (9 floats) if renderer is present
        if (this.wasmAlloc && (this._updateRT || this._spriteRendererInit)) {
            this.cameraMatrixPtr = this.wasmAlloc(9 * 4);
        }
    }

    // Renderer: initialize GL context on a specific canvas
    public initRenderer(canvasSelector: string): void {
        if (!this._spriteRendererInit) return;
        this._spriteRendererInit(canvasSelector);
    }

    // Renderer: upload atlas image and set default sprite UVs
    public async uploadAtlasFromUrl(url: string): Promise<void> {
        if (!this.wasm || !this._spriteUploadAtlasRGBA || !this.wasmAlloc) return;
        const img = await fetch(url).then(r => r.blob()).then(createImageBitmap);
        const w = img.width, h = img.height;
        const off = new OffscreenCanvas(w, h);
        const ctx = off.getContext('2d', { willReadFrequently: true })!;
        ctx.drawImage(img, 0, 0);
        const data = ctx.getImageData(0, 0, w, h).data; // Uint8ClampedArray
        const bytes = new Uint8Array(data.buffer.slice(0)); // copy to Uint8Array
        const ptr = this.wasmAlloc(w * h * 4) >>> 0;
        (this.wasm as any).HEAPU8.set(bytes, ptr);
        this._spriteUploadAtlasRGBA(ptr, w, h);
        if (this.wasmFree) this.wasmFree(ptr);

        // Load atlas json, build lexicographically sorted frame table, upload to WASM, and cache mapping
        try {
            const res = await fetch('/img/base.json');
            if (res.ok) {
                const atlas = await res.json() as Record<string, { x:number, y:number, w:number, h:number }>;
                const namesSorted = Object.keys(atlas).sort((a,b)=> a.localeCompare(b));
                this.frameNameToId.clear();
                for (let i = 0; i < namesSorted.length; i++) this.frameNameToId.set(namesSorted[i], i);
                const uv = new Float32Array(namesSorted.length * 4);
                for (let i = 0; i < namesSorted.length; i++) {
                    const f = atlas[namesSorted[i]];
                    uv[i*4+0] = f.x / w;
                    uv[i*4+1] = f.y / h;
                    uv[i*4+2] = (f.x + f.w) / w;
                    uv[i*4+3] = (f.y + f.h) / h;
                }
                if (this._spriteUploadFrameTable) {
                    const uvBytes = new Uint8Array(uv.buffer);
                    const uvPtr = this.wasmAlloc!(uvBytes.byteLength) >>> 0;
                    (this.wasm as any).HEAPU8.set(uvBytes, uvPtr);
                    this._spriteUploadFrameTable(uvPtr, namesSorted.length);
                    if (this.wasmFree) this.wasmFree(uvPtr);
                }

                // No need to set a default UV if frame table is used
            }
        } catch {}
    }

    // Renderer: per-frame update + render in one call
    public updateRenderer(dt: number, m3x3RowMajor: number[], widthPx: number, heightPx: number, dpr: number): void {
        if (!this.wasm || !this.cameraMatrixPtr) {
            return;
        }
        if (m3x3RowMajor.length !== 9) {
            return;
        }
        const heap = (this.wasm as any).HEAPF32 as Float32Array;
        const base = this.cameraMatrixPtr >>> 2; // float index
        for (let i = 0; i < 9; i++) heap[base + i] = m3x3RowMajor[i];

        // Single call that advances simulation and renders internally
        (this.wasm as WasmModule)._update(dt, this.cameraMatrixPtr, widthPx | 0, heightPx | 0, dpr);
    }

    // Simulation only: advances agent logic without rendering
    public updateSimulation(dt: number): void {
        if (!this.wasm) {
            return;
        }
        (this.wasm as WasmModule)._update_simulation(dt);
    }

    // Render only: uses fresh map data to render agents without simulation
    public renderOnly(): void {
        if (!this.wasm || !this.cameraMatrixPtr) {
            return;
        }

        // Get fresh map data to ensure immediate response to map changes
        const map = mapInstance.map;
        if (!map) {
            return;
        }

        const view = map.getView();
        const center = view.getCenter();
        if (!center) {
            return;
        }

        const resolution = view.getResolution()!;
        const mapElement = map.getTargetElement();
        const cssW = mapElement.clientWidth;
        const cssH = mapElement.clientHeight;
        const dpr = window.devicePixelRatio || 1;
        const widthPx = Math.max(1, Math.floor(cssW * dpr));
        const heightPx = Math.max(1, Math.floor(cssH * dpr));

        // Compute world-to-clip matrix (same logic as Pixie.ts)
        const worldTopLeftX = center[0] - (cssW / 2) * resolution;
        const worldTopLeftY = center[1] + (cssH / 2) * resolution;
        const s_px = (1 / resolution) * dpr; // world units -> device pixels

        const a = 2 * s_px / widthPx;
        const c = -1 - worldTopLeftX * a;
        const e = 2 * s_px / heightPx;
        const f = 1 - worldTopLeftY * e;
        // Row-major 3x3
        const m3x3RowMajor = [a, 0, c, 0, e, f, 0, 0, 1];

        // Upload matrix to WASM memory
        const heap = (this.wasm as any).HEAPF32 as Float32Array;
        const base = this.cameraMatrixPtr >>> 2; // float index
        for (let i = 0; i < 9; i++) heap[base + i] = m3x3RowMajor[i];

        // Call render-only with dt=0 since we're not doing simulation
        if (this._updateRT) {
            this._updateRT(0, this.cameraMatrixPtr, widthPx, heightPx, dpr);
        }
    }

    public clearRenderer(): void {
        if (this._spriteRendererClear) {
            this._spriteRendererClear();
        }
    }

    public isReady(): boolean {
        return !!(this.wasm && 
                 (this.sharedBufferPtr !== undefined) && 
                 (this.navmeshBufferPtr > 0));
    }

    public setSeed(seed: number): void {
        this.seed = seed;
        if (this.wasm && (this.wasm as any)._set_rng_seed) {
            try { (this.wasm as any)._set_rng_seed(this.seed >>> 0); } catch {}
        }
    }

    public getFrameIdByName(name: string): number {
        return this.frameNameToId.get(name) ?? 0;
    }

    private allocateMemoryOnly(): void {
        const agentDataSize = calculateAgentDataSize(this.maxAgents);
        const hasSAB = typeof (globalThis as any).SharedArrayBuffer !== 'undefined';
        this.sharedBuffer = hasSAB ? new SharedArrayBuffer(agentDataSize) : new ArrayBuffer(agentDataSize);
        
        if (!this.wasm) return;
        
        if (this.wasmAlloc) {
            this.sharedBufferPtr = this.wasmAlloc(agentDataSize);
        } else {
            this.sharedBufferPtr = 0;
        }
    }

    private prepareNavmeshBufferData(navmesh: Navmesh): void {
        if (!this.wasm) return;
    
        const navmeshBufferSize = this.calculateNavmeshDataSize(navmesh);
        
        if (this.wasmAlloc) {
            this.navmeshBufferPtr = this.wasmAlloc(navmeshBufferSize);
        } else {
            this.navmeshBufferPtr = 0;
        }

        if (!this.navmeshBufferPtr) {
            console.error("Failed to allocate navmesh buffer in WASM");
            return;
        }

        if (!navmesh.bbox || navmesh.bbox.length !== 4) {
            console.error("Navmesh bbox is malformed.", navmesh.bbox);
            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
            const pts = navmesh.points;
            for (let i = 0; i < pts.length; i += 2) {
                const x = pts[i];
                const y = pts[i + 1];
                if (x < minX) minX = x;
                if (y < minY) minY = y;
                if (x > maxX) maxX = x;
                if (y > maxY) maxY = y;
            }
            if (minX === Infinity) {
                minX = minY = maxX = maxY = 0;
            }
            navmesh.bbox = new Float32Array([minX, minY, maxX, maxY]);
        }
    }

    private copyNavmeshDataToWasmHeap(navmesh: Navmesh): void {
        if (!this.wasm) return;
        if (!this.navmeshBufferPtr || !(this.wasm as WasmModule).HEAPU8) return;

        try {
            const navmeshBufferSize = this.calculateNavmeshDataSize(navmesh);
            const navmeshBufferView = new Uint8Array((this.wasm as WasmModule).HEAPU8.buffer, this.navmeshBufferPtr, navmeshBufferSize);
            
            let offset = 0;
            
            // Copy bbox
            const bboxBytes = new Uint8Array(navmesh.bbox.buffer, navmesh.bbox.byteOffset, navmesh.bbox.byteLength);
            navmeshBufferView.set(bboxBytes, offset);
            offset += bboxBytes.byteLength;
            
            // Copy header
            const numPoints = navmesh.points.length / 2;
            const numTriangles = navmesh.triangles.length / 3;
            const headerBytes = new Uint8Array(new ArrayBuffer(2 * 4));
            const headerView = new DataView(headerBytes.buffer);
            headerView.setInt32(0, numPoints, true);
            headerView.setInt32(4, numTriangles, true);
            navmeshBufferView.set(headerBytes, offset);
            offset += headerBytes.byteLength;
            
            // Copy points
            navmeshBufferView.set(new Uint8Array(navmesh.points.buffer, navmesh.points.byteOffset, navmesh.points.byteLength), offset);
            offset += navmesh.points.byteLength;

            // Copy triangles
            navmeshBufferView.set(new Uint8Array(navmesh.triangles.buffer, navmesh.triangles.byteOffset, navmesh.triangles.byteLength), offset);
            offset += navmesh.triangles.byteLength;

            // Copy neighbors
            navmeshBufferView.set(new Uint8Array(navmesh.neighbors.buffer, navmesh.neighbors.byteOffset, navmesh.neighbors.byteLength), offset);
            offset += navmesh.neighbors.byteLength;

            // Copy centroids
            navmeshBufferView.set(new Uint8Array(navmesh.centroids.buffer, navmesh.centroids.byteOffset, navmesh.centroids.byteLength), offset);
        } catch (error) {
            console.error("Failed to copy navmesh buffer to WASM heap:", error);
        }
    }
    
    private calculateNavmeshDataSize(navmesh: Navmesh): number {
        let totalSize = 0;
        totalSize += navmesh.bbox.byteLength; // bbox
        totalSize += 2 * 4; // header
        totalSize += navmesh.points.byteLength;
        totalSize += navmesh.triangles.byteLength;
        totalSize += navmesh.neighbors.byteLength;
        totalSize += navmesh.centroids.byteLength;
        return totalSize;
    }

    private copySharedBufferToWasmHeap(): void {
        if (!this.wasm || !this.sharedBuffer) return;
        
        if (!this.sharedBufferPtr || !(this.wasm as WasmModule).HEAPU8) {
            console.warn("Cannot copy shared buffer to WASM heap:", {
                hasPointer: !!this.sharedBufferPtr,
                hasHEAPU8: !!(this.wasm as WasmModule).HEAPU8
            });
            return;
        }

        try {
            (this.wasm as WasmModule).HEAPU8.set(new Uint8Array(this.sharedBuffer), this.sharedBufferPtr);
        } catch (error) {
            console.error("Failed to copy shared buffer to WASM heap:", error);
        }
    }
    
    public createAgent(x: number, y: number, display: string): void {
        if (!this.wasm) {
            console.warn('Cannot create WAgent: WASM module not initialized');
            return;
        }
        const agentIndex = (this.wasm as WasmModule)._add_agent(x, y);
        if (agentIndex !== -1) {
            const agent = new WAgent(agentIndex, display);
            this.agents.push(agent);
        }
    }

    // public update(dt: number): void {
    //     if (!this.wasm) return;
    //     if (!this.cameraMatrixPtr && this.wasmAlloc) {
    //         this.cameraMatrixPtr = this.wasmAlloc(9 * 4);
    //     }
    //     console.log("!!#");
    //     (this.wasm as WasmModule)._update(dt, this.cameraMatrixPtr || 0, 0, 0, 1);
    // }
} 