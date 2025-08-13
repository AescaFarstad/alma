import * as PIXI from 'pixi.js';
import { Agent } from '../Agent';
import { Point2 } from '../core/math';
import { BaseAgentSpritePool, AgentSpriteElements } from './BaseAgentSpritePool';

export class TsAgentSpritePool extends BaseAgentSpritePool {
    public syncWithAgents(
        agents: Agent[],
        container: PIXI.Container,
    ): void {
        if (!this.sheet || !this.assetsLoaded) return;

        if (agents.length === 0) {
            if (this.wasRenderingEnabled) {
                this.removeAllAgentsFromContainers(container);
                this.wasRenderingEnabled = false;
            }
            return;
        }

        this.wasRenderingEnabled = true;
        this.drawnCounts.clear();

        for (const agent of agents) {
            const displayName = agent.display;
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
            
            const { sprite } = element;
            const pos = agent.coordinate;
            const look = agent.look;
            sprite.x = pos.x;
            sprite.y = -pos.y;
            sprite.rotation = Math.atan2(-look.y, look.x) - Math.PI / 2;
            const AGENT_SPRITE_SCALE = 0.3;
            sprite.scale.set(AGENT_SPRITE_SCALE);
            this.ensureInContainer(element, container);

            this.drawnCounts.set(displayName, drawnCount + 1);
        }

        this.removeUnusedAgentsFromContainers(container);
    }
} 