import * as PIXI from 'pixi.js';

const AGENT_SCALE = 4;

export interface AgentSpriteElements {
  sprite: PIXI.Sprite;
  spriteInContainer: boolean;
}

export abstract class BaseAgentSpritePool {
  protected pools: Map<string, AgentSpriteElements[]> = new Map();
  protected drawnCounts: Map<string, number> = new Map();
  protected sheet: PIXI.Spritesheet | null = null;
  protected wasRenderingEnabled = true;
  public assetsLoaded = false;
  private loggedMissingTextures?: Set<string>;

  // Frame mapping derived from atlas json (lexicographic order)
  protected frameNamesSorted: string[] = [];
  protected frameNameToId: Map<string, number> = new Map();

  public async load(): Promise<void> {
    if (this.assetsLoaded) return;

    try {
      const texture = await PIXI.Assets.load('/img/base.webp');
      const response = await fetch('/img/base.json');
      if (!response.ok) {
        throw new Error(`Failed to fetch base.json: ${response.status} ${response.statusText}`);
      }
      const atlasData = await response.json();
      
      // Build sorted frame list and mapping
      this.frameNamesSorted = Object.keys(atlasData).sort((a,b)=> a.localeCompare(b));
      this.frameNameToId.clear();
      for (let i = 0; i < this.frameNamesSorted.length; i++) {
        this.frameNameToId.set(this.frameNamesSorted[i], i);
      }
      
      const formattedData = {
        frames: {} as any,
        meta: { scale: AGENT_SCALE }
      };

      for (const [frameName, frameData] of Object.entries(atlasData)) {
        const frame = frameData as { x: number, y: number, w: number, h: number };
        formattedData.frames[frameName] = {
          frame: { x: frame.x, y: frame.y, w: frame.w, h: frame.h },
          sourceSize: { w: frame.w, h: frame.h },
          spriteSourceSize: { x: 0, y: 0, w: frame.w, h: frame.h }
        };
      }

      this.sheet = new PIXI.Spritesheet(texture, formattedData);
      await this.sheet.parse();
      this.assetsLoaded = true;
    } catch (error) {
      console.error('Error loading agent spritesheet:', error);
      if (error instanceof Error) console.error('Error stack:', error.stack);
    }
  }

  protected createSprite(displayName: string, pool: AgentSpriteElements[]) {
    if (!this.sheet) return;
    const texture = this.sheet.textures[displayName];
    if (!texture) {
      if (!this.loggedMissingTextures) this.loggedMissingTextures = new Set();
      if (!this.loggedMissingTextures.has(displayName)) {
        console.warn(`Texture not found for: ${displayName}. Available textures:`, Object.keys(this.sheet.textures));
        this.loggedMissingTextures.add(displayName);
      }
      return;
    }
    const sprite = new PIXI.Sprite(texture);
    sprite.anchor.set(0.5);
    pool.push({ sprite, spriteInContainer: false });
  }

  protected ensureInContainer(element: AgentSpriteElements, container: PIXI.Container): void {
    if (!element.spriteInContainer) {
      container.addChild(element.sprite);
      element.spriteInContainer = true;
    }
  }

  protected ensureNotInContainer(element: AgentSpriteElements, container: PIXI.Container): void {
    if (element.spriteInContainer) {
      container.removeChild(element.sprite);
      element.spriteInContainer = false;
    }
  }

  protected removeUnusedAgentsFromContainers(container: PIXI.Container): void {
    for (const [displayName, pool] of this.pools.entries()) {
      const drawnCount = this.drawnCounts.get(displayName) || 0;
      for (let i = drawnCount; i < pool.length; i++) {
        this.ensureNotInContainer(pool[i], container);
      }
    }
  }
  
  protected removeAllAgentsFromContainers(container: PIXI.Container): void {
    for (const pool of this.pools.values()) {
      for (const element of pool) {
        this.ensureNotInContainer(element, container);
      }
    }
  }

  public getSheet(): PIXI.Spritesheet | null {
    return this.sheet;
  }

  public setSheet(sheet: PIXI.Spritesheet | null): void {
    this.sheet = sheet;
  }

  public getFrameIdByName(name: string): number {
    return this.frameNameToId.get(name) ?? 0;
  }

  public getFrameNameById(id: number): string {
    if (id < 0 || id >= this.frameNamesSorted.length) return this.frameNamesSorted[0] || 'character_black_blue';
    return this.frameNamesSorted[id];
  }
} 