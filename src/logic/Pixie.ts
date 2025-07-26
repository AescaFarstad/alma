import * as PIXI from 'pixi.js';
import { Map as OlMap } from 'ol';
import { GameState } from './GameState';
import { PrimitiveState } from './drawing/PrimitiveState';
import { DrawScene } from './drawing/DrawScene';
import { DrawPrimitives } from './drawing/DrawPrimitives';
import { SceneState } from './drawing/SceneState';

export class PixiLayer {
    private app: PIXI.Application;
    private olMap: OlMap;
    private gameState: GameState;
    private graphics!: PIXI.Graphics;
    private textContainer!: PIXI.Container;
    private resizeObserver!: ResizeObserver;
    private boundSync: () => void;
    private primitives: PrimitiveState;
    private sceneState: SceneState;
    private stopped = false;

    constructor(olMap: OlMap, gameState: GameState, sceneState: SceneState) {
        this.olMap = olMap;
        this.gameState = gameState;
        this.sceneState = sceneState;
        this.app = new PIXI.Application();
        this.boundSync = this.sync.bind(this);
        this.primitives = new PrimitiveState();
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

        this.graphics = new PIXI.Graphics();
        this.app.stage.addChild(this.graphics);
        
        this.textContainer = new PIXI.Container();
        this.app.stage.addChild(this.textContainer);

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
        DrawScene.buildPrimitives(this.primitives, this.sceneState, this.gameState);
        this.sceneState.isDirty = false;
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

        if (this.sceneState.isDirty) {
            this.buildScene();
        }

        DrawPrimitives.draw(
            this.graphics,
            this.textContainer,
            this.primitives,
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
