import * as PIXI from 'pixi.js';
import { Map as OlMap } from 'ol';
import { GameState } from './GameState';
import { PrimitiveState } from './drawing/PrimitiveState';
import { DrawScene } from './drawing/DrawScene';
import { DrawPrimitives } from './drawing/DrawPrimitives';
import { SceneState } from './drawing/SceneState';
import { DynamicScene } from './drawing/DynamicScene';
import { DrawDynamicScene } from './drawing/DrawDynamicScene';
import { AgentVisualPool } from './drawing/AgentVisualPool';

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
    private agentPool: AgentVisualPool;
    private stopped = false;

    constructor(olMap: OlMap, gameState: GameState, sceneState: SceneState, dynamicScene: DynamicScene) {
        this.olMap = olMap;
        this.gameState = gameState;
        this.sceneState = sceneState;
        this.dynamicScene = dynamicScene;
        this.app = new PIXI.Application();
        this.boundSync = this.sync.bind(this);
        this.staticPrimitives = new PrimitiveState();
        this.dynamicPrimitives = new PrimitiveState();
        this.agentPool = new AgentVisualPool();
    }

    public async init() {
        const mapElement = this.olMap.getTargetElement();

        await this.app.init({
            width: mapElement.clientWidth,
            height: mapElement.clientHeight,
            backgroundAlpha: 0,
            autoDensity: true,
            resolution: window.devicePixelRatio,
        });

        if (this.app.canvas.style) {
            const style = this.app.canvas.style as CSSStyleDeclaration;
            style.position = 'absolute';
            style.top = '0';
            style.left = '0';
            style.pointerEvents = 'none';
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
        
        // Update agent visuals directly on PIXI containers
        this.agentPool.syncWithAgents(
            this.gameState.agents, 
            this.agentGraphicsContainer, 
            this.agentTextContainer, 
            this.olMap
        );
    }

    private resize() {
        const mapElement = this.olMap.getTargetElement();
        this.app.renderer.resize(mapElement.clientWidth, mapElement.clientHeight);
        this.sync();
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

    private tick() {
        if (this.stopped) {
            return;
        }
        requestAnimationFrame(this.tick.bind(this));
        // console.log("[Pixie] tick");

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
