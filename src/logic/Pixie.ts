import * as PIXI from 'pixi.js';
import { Map as OlMap } from 'ol';
import { GameState } from './GameState';
import { PrimitiveState } from './drawing/PrimitiveState';
import { DrawScene } from './drawing/DrawScene';
import { DrawPrimitives } from './drawing/DrawPrimitives';
import { SceneState } from './drawing/SceneState';
import { DynamicScene } from './drawing/DynamicScene';
import { DrawDynamicScene } from './drawing/DrawDynamicScene';
import { AgentRenderer, AgentRenderingMode } from './drawing/AgentRenderer';

export class PixiLayer {
    private app: PIXI.Application;
    private olMap: OlMap;
    private gameState: GameState;
    private staticGraphics!: PIXI.Graphics;
    private dynamicGraphics!: PIXI.Graphics;
    private textContainer!: PIXI.Container;
    private dynamicTextContainer!: PIXI.Container;
    private agentGraphicsContainer!: PIXI.Container;
    private agentTextContainer!: PIXI.Container;
    private resizeObserver!: ResizeObserver;
    private boundSync: () => void;
    private staticPrimitives: PrimitiveState;
    private dynamicPrimitives: PrimitiveState;
    private sceneState: SceneState;
    private dynamicScene: DynamicScene;
    private agentRenderer: AgentRenderer;
    private stopped = false;
    private wAgentsEnabled = false;

    private wasmCanvas: HTMLCanvasElement | null = null;

    constructor(olMap: OlMap, gameState: GameState, sceneState: SceneState, dynamicScene: DynamicScene) {
        this.olMap = olMap;
        this.gameState = gameState;
        this.sceneState = sceneState;
        this.dynamicScene = dynamicScene;
        this.app = new PIXI.Application();
        this.boundSync = this.sync.bind(this);
        this.staticPrimitives = new PrimitiveState();
        this.dynamicPrimitives = new PrimitiveState();
        this.agentRenderer = new AgentRenderer();
    }

    public async init() {
        const mapElement = this.olMap.getTargetElement();

        // Prepare WASM GL canvas (always present below Pixi)
        const c = document.createElement('canvas');
        c.id = 'wasm-agents-canvas';
        const style = c.style as CSSStyleDeclaration;
        style.position = 'absolute';
        style.top = '0';
        style.left = '0';
        style.pointerEvents = 'none';
        style.zIndex = '0';
        mapElement.appendChild(c as unknown as Node);
        this.wasmCanvas = c;

        await this.app.init({
            width: mapElement.clientWidth,
            height: mapElement.clientHeight,
            backgroundAlpha: 0,
            autoDensity: true,
            resolution: window.devicePixelRatio,
        });

        await this.agentRenderer.load();

        if (this.app.canvas.style) {
            const style = this.app.canvas.style as CSSStyleDeclaration;
            style.position = 'absolute';
            style.top = '0';
            style.left = '0';
            style.pointerEvents = 'none';
            style.zIndex = '1';
        }
        
        mapElement.appendChild(this.app.canvas as unknown as Node);

        this.staticGraphics = new PIXI.Graphics();
        this.app.stage.addChild(this.staticGraphics);

        this.dynamicGraphics = new PIXI.Graphics();
        this.app.stage.addChild(this.dynamicGraphics);
        
        this.textContainer = new PIXI.Container();
        this.app.stage.addChild(this.textContainer);

        this.dynamicTextContainer = new PIXI.Container();
        this.app.stage.addChild(this.dynamicTextContainer);

        this.agentGraphicsContainer = new PIXI.Container();
        this.app.stage.addChild(this.agentGraphicsContainer);

        this.agentTextContainer = new PIXI.Container();
        this.app.stage.addChild(this.agentTextContainer);

        // Resize WASM canvas - renderer initialization is handled by WasmInit -> RenderInit
        this.resizeWasmCanvas();

        const view = this.olMap.getView();
        view.on('change:center', this.boundSync);
        view.on('change:resolution', this.boundSync);
        view.on('change:rotation', this.boundSync);
        
        this.resizeObserver = new ResizeObserver(() => this.resize());
        this.resizeObserver.observe(mapElement);

        this.sync();
        this.tick();
    }

    private buildScene() {
        DrawScene.buildPrimitives(this.staticPrimitives, this.sceneState, this.gameState);
        this.sceneState.isDirty = false;
    }

    private buildDynamicScene() {
        DrawDynamicScene.buildDynamicPrimitives(this.dynamicPrimitives, this.dynamicScene, this.gameState, this.olMap);
        
        this.agentRenderer.syncWithAgents(
            this.gameState.agents, 
            this.agentGraphicsContainer, 
            this.agentTextContainer, 
            this.olMap
        );

        // Pixi WASM-sprite rendering (always on when sprite mode is active)
        const renderMode = this.agentRenderer.getRenderingMode();
        
        if (this.wAgentsEnabled && renderMode === 'sprite') {
            this.agentRenderer.wasmSpritePool.syncWithWasmData(
                this.gameState.wasm_agents,
                this.gameState.wagents.length,
                this.agentGraphicsContainer,
                this.wAgentsEnabled,
                renderMode
            );
        } else {
            // Clear sprites when disabled - minimal processing
            this.agentRenderer.wasmSpritePool.syncWithWasmData(
                this.gameState.wasm_agents,
                0,
                this.agentGraphicsContainer,
                false,
                renderMode
            );
        }
    }

    private resize() {
        const mapElement = this.olMap.getTargetElement();
        this.app.renderer.resize(mapElement.clientWidth, mapElement.clientHeight);
        this.resizeWasmCanvas();
        this.sync();
    }

    private resizeWasmCanvas() {
        if (!this.wasmCanvas) return;
        const mapElement = this.olMap.getTargetElement();
        const cssW = mapElement.clientWidth;
        const cssH = mapElement.clientHeight;
        const dpr = window.devicePixelRatio || 1;
        this.wasmCanvas.style.width = cssW + 'px';
        this.wasmCanvas.style.height = cssH + 'px';
        this.wasmCanvas.width = Math.max(1, Math.floor(cssW * dpr));
        this.wasmCanvas.height = Math.max(1, Math.floor(cssH * dpr));
    }

    public setAgentRenderingMode(mode: AgentRenderingMode): void {
        this.agentRenderer.setRenderingMode(mode);
    }

    public setTsAgentRenderingEnabled(enabled: boolean): void {
        this.agentRenderer.setTsAgentsEnabled(enabled);
    }

    public setWasmAgentRenderingEnabled(enabled: boolean): void {
        this.wAgentsEnabled = enabled;
    }

    private sync() {
        if (!this.olMap) return;

        const view = this.olMap.getView();
        const center = view.getCenter();
        if (!center) return;

        const resolution = view.getResolution()!;
        const size = this.olMap.getSize()!;

        const worldTopLeft = [
            center[0] - (size[0] / 2) * resolution,
            center[1] + (size[1] / 2) * resolution,
        ];

        const scale = 1 / resolution;

        this.app.stage.x = -worldTopLeft[0] * scale;
        this.app.stage.y = worldTopLeft[1] * scale;
        this.app.stage.scale.set(scale);
    }

    private computeWorldToClip3x3(): number[] {
        const view = this.olMap.getView();
        const center = view.getCenter();
        if (!center) return [1,0,0, 0,1,0, 0,0,1];
        const resolution = view.getResolution()!;
        const mapElement = this.olMap.getTargetElement();
        const cssW = mapElement.clientWidth;
        const cssH = mapElement.clientHeight;
        const dpr = window.devicePixelRatio || 1;
        const widthPx = Math.max(1, Math.floor(cssW * dpr));
        const heightPx = Math.max(1, Math.floor(cssH * dpr));

        const worldTopLeftX = center[0] - (cssW / 2) * resolution;
        const worldTopLeftY = center[1] + (cssH / 2) * resolution;
        const s_px = (1 / resolution) * dpr; // world units -> device pixels

        const a = 2 * s_px / widthPx;
        const c = -1 - worldTopLeftX * a;
        const e = 2 * s_px / heightPx;
        const f = 1 - worldTopLeftY * e;
        // Row-major 3x3
        return [a, 0, c,  0, e, f,  0, 0, 1];
    }

    private tick() {
        if (this.stopped) return;
        requestAnimationFrame(this.tick.bind(this));

        if (this.sceneState.isDirty) {
            this.buildScene();
            DrawPrimitives.draw(
                this.staticGraphics,
                this.textContainer,
                this.staticPrimitives,
                this.olMap
            );
        }

        this.buildDynamicScene();
        DrawPrimitives.draw(
            this.dynamicGraphics,
            this.dynamicTextContainer, // reusing for now
            this.dynamicPrimitives,
            this.olMap
        );
    }

    public stop() {
        this.stopped = true;
    }

    public destroy() {
        this.stop();
        this.resizeObserver.disconnect();

        const view = this.olMap.getView();
        view.un('change:center', this.boundSync);
        view.un('change:resolution', this.boundSync);
        view.un('change:rotation', this.boundSync);

        this.app.destroy(true, { children: true, texture: true });
    }
}
