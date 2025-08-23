import * as PIXI from 'pixi.js';
import { BaseAgentSpritePool, AgentSpriteElements } from './BaseAgentSpritePool';
import { Agents } from '../agents/Agents';
import type { AgentRenderingMode } from './AgentRenderer';

export class WasmAgentSpritePool extends BaseAgentSpritePool {
    private enabled: boolean = true;

    public setEnabled(enabled: boolean): void {
        this.enabled = enabled;
    }

    public syncWithWasmData(
        agents: Agents,
        wagentsCount: number,
        container: PIXI.Container,
        globalEnabled: boolean = true,
        renderMode: AgentRenderingMode = 'sprite'
    ): void {
        if (!this.sheet || !this.assetsLoaded) {
            return;
        }

        // Check if agents should be rendered (for safety, though this should be handled upstream now)
        const shouldRender = this.enabled && globalEnabled && renderMode === 'sprite';
        
        if (!shouldRender) {
            if (this.wasRenderingEnabled) {
                this.removeAllAgentsFromContainers(container);
                this.wasRenderingEnabled = false;
            }
            return;
        }

        // Check if WASM agents are initialized and we have active agents
        if (!agents.positions || !agents.is_alive || wagentsCount === 0) {
            if (this.wasRenderingEnabled) {
                this.removeAllAgentsFromContainers(container);
                this.wasRenderingEnabled = false;
            }
            return;
        }

        this.wasRenderingEnabled = true;
        this.drawnCounts.clear();

        // Iterate over allocated agent slots, skipping dead agents
        for (let i = 0; i < wagentsCount; i++) {
            // Skip dead agents
            if (!agents.is_alive[i]) {
                continue;
            }

            const fid = (agents.frame_ids && agents.frame_ids.length > i) ? agents.frame_ids[i] : 0;
            const displayName = this.getFrameNameById(fid);
            if (!this.pools.has(displayName)) {
                this.pools.set(displayName, []);
            }
            this.drawnCounts.set(displayName, (this.drawnCounts.get(displayName) || 0));
            const pool = this.pools.get(displayName)!;
            let drawnCount = this.drawnCounts.get(displayName) || 0;
            if (drawnCount >= pool.length) {
                this.createSprite(displayName, pool);
            }
            const element = pool[drawnCount];
            
            if (!element) {
                continue;
            }
            
            const { sprite } = element;
            sprite.x = agents.positions[i * 2];
            sprite.y = -agents.positions[i * 2 + 1];
            sprite.rotation = Math.atan2(-agents.looks[i * 2 + 1], agents.looks[i * 2]) - Math.PI / 2;
            const AGENT_SPRITE_SCALE = 0.3;
            sprite.scale.set(AGENT_SPRITE_SCALE);
            this.ensureInContainer(element, container);

            this.drawnCounts.set(displayName, drawnCount + 1);
        }

        this.removeUnusedAgentsFromContainers(container);
    }
} 