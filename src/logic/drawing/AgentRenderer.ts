import * as PIXI from 'pixi.js';
import { Agent } from '../agents/Agent';
import { Map as OlMap } from 'ol';
import { AgentVisualPool } from './AgentVisualPool';
import { TsAgentSpritePool } from './TsAgentSpritePool';
import { WasmAgentSpritePool } from './WasmAgentSpritePool';

export type AgentRenderingMode = 'visual' | 'sprite';

export class AgentRenderer {
  private visualPool = new AgentVisualPool();
  public tsSpritePool = new TsAgentSpritePool();
  public wasmSpritePool = new WasmAgentSpritePool();
  private mode: AgentRenderingMode = 'visual';
  private tsAgentsEnabled: boolean = true;
  private assetsLoaded = false;

  public async load(): Promise<void> {
    if (this.assetsLoaded) return;
    await this.tsSpritePool.load();
    // Ensure WASM pool has the same frame mapping; it shares the same atlas
    await this.wasmSpritePool.load();
    this.wasmSpritePool.assetsLoaded = this.tsSpritePool.assetsLoaded;
    this.wasmSpritePool.setSheet(this.tsSpritePool.getSheet());
    this.assetsLoaded = true;
  }

  public setRenderingMode(mode: AgentRenderingMode): void {
    this.mode = mode;
  }

  public getRenderingMode(): AgentRenderingMode {
    return this.mode;
  }

  public setTsAgentsEnabled(enabled: boolean): void {
    this.tsAgentsEnabled = enabled;
  }

  public areTsAgentsEnabled(): boolean {
    return this.tsAgentsEnabled;
  }

  public getSpritePool(): TsAgentSpritePool {
    return this.tsSpritePool;
  }

  public syncWithAgents(
    agents: Agent[],
    graphicsContainer: PIXI.Container,
    textContainer: PIXI.Container,
    olMap: OlMap
  ): void {

    if (!this.tsAgentsEnabled) {
      // Hide all agents when disabled
      this.tsSpritePool.syncWithAgents([], graphicsContainer);
      this.visualPool.syncWithAgents([], graphicsContainer, textContainer, olMap);
      return;
    }

    if (this.mode === 'visual') {
      // Hide sprites when in visual mode
      this.tsSpritePool.syncWithAgents([], graphicsContainer);
      this.visualPool.syncWithAgents(agents, graphicsContainer, textContainer, olMap);
    } else { // 'sprite' mode
      // Hide visual debug drawings when in sprite mode
      this.visualPool.syncWithAgents([], graphicsContainer, textContainer, olMap);
      this.tsSpritePool.syncWithAgents(agents, graphicsContainer);
    }
  }
} 