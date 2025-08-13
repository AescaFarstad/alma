import * as PIXI from 'pixi.js';
import { Agent, AgentState } from '../Agent';
import { Map as OlMap } from 'ol';
import {length} from '../core/math.ts'

// Global agent visibility control
export let agentRenderingEnabled = true;

export function setAgentRenderingEnabled(enabled: boolean) {
    agentRenderingEnabled = enabled;
}

interface AgentPixiElements {
    // Graphics objects for visual elements
    triangle: PIXI.Graphics;
    pathLine1: PIXI.Graphics;
    pathLine2: PIXI.Graphics;
    targetCircle: PIXI.Graphics;
    accelLine: PIXI.Graphics;
    velocityLine: PIXI.Graphics;
    velocityDiffLine: PIXI.Graphics;
    desiredVelocityLine: PIXI.Graphics;
    debugText: PIXI.Text;
    
    // Track if elements are currently added to containers
    triangleInContainer: boolean;
    pathLine1InContainer: boolean;
    pathLine2InContainer: boolean;
    targetCircleInContainer: boolean;
    accelLineInContainer: boolean;
    velocityLineInContainer: boolean;
    velocityDiffLineInContainer: boolean;
    desiredVelocityLineInContainer: boolean;
    debugTextInContainer: boolean;
}

type AgentStyle = 'smart' | 'dumb' | 'escaping';

export class AgentVisualPool {
    // Separate pools for different agent styles to avoid repainting
    private smartAgentPool: AgentPixiElements[] = [];
    private dumbAgentPool: AgentPixiElements[] = [];
    private escapingAgentPool: AgentPixiElements[] = [];
    
    // Track how many agents are currently drawn from each pool
    private smartAgentsDrawn = 0;
    private dumbAgentsDrawn = 0;
    private escapingAgentsDrawn = 0;
    
    // Track if agents were previously visible to handle one-time cleanup
    private wasRenderingEnabled = true;
    
    // --- Drawing Toggles ---
    private readonly SHOW_PATH_LINES = false;
    private readonly SHOW_SPEED_LINE = false;
    private readonly SHOW_DEBUG_LINES = false;
    private readonly SHOW_DEBUG_TEXT = false;
    // -----------------------

    private readonly agentSize = 6; // meters
    private readonly targetRadius = 5;

    // Colors
    private readonly smartAgentColor = 0x00aa00;
    private readonly dumbAgentColor = 0x000000;
    private readonly escapingAgentColor = 0xFF0000;
    private readonly pathLineColor = 0x00FF00;
    private readonly targetColor = 0x0000FF;
    private readonly accelLineColor = 0x0000aa; // ACINDIGO
    private readonly velocityLineColor = 0xFF0000; // RED
    private readonly velocityDiffLineColor = 0xFFFF00; // YELLOW
    private readonly desiredVelocityLineColor = 0x32CD32; // LIME GREEN

    public syncWithAgents(
        agents: Agent[], 
        graphicsContainer: PIXI.Container, 
        textContainer: PIXI.Container,
        olMap: OlMap
    ): void {
        // If agents are disabled and we need to clean up
        if (!agentRenderingEnabled) {
            if (this.wasRenderingEnabled) {
                // One-time cleanup: remove all agents from containers
                this.removeAllAgentsFromContainers(graphicsContainer, textContainer);
                this.wasRenderingEnabled = false;
            }
            // Skip all agent processing when disabled
            return;
        }
        
        // Mark that rendering is now enabled
        this.wasRenderingEnabled = true;
        
        // Reset counters
        this.smartAgentsDrawn = 0;
        this.dumbAgentsDrawn = 0;
        this.escapingAgentsDrawn = 0;
        
        // Single pass: process each agent
        for (let i = 0; i < agents.length; i++) {
            const agent = agents[i];
            const style = this.determineAgentStyle(agent);
            const element = this.getAgentFromPool(style);
            
            this.updateAgentVisuals(element, agent, i, graphicsContainer, textContainer, olMap);
        }
        
        // Remove remaining agents from containers for each pool
        this.removeUnusedAgentsFromContainers(graphicsContainer, textContainer);
    }

    private determineAgentStyle(agent: Agent): AgentStyle {
        if (agent.state === AgentState.Escaping) {
            return 'escaping';
        } else if (agent.intelligence > 0) {
            return 'smart';
        } else {
            return 'dumb';
        }
    }

    private getAgentFromPool(style: AgentStyle): AgentPixiElements {
        let pool: AgentPixiElements[];
        let drawnCount: number;
        
        switch (style) {
            case 'smart':
                pool = this.smartAgentPool;
                drawnCount = this.smartAgentsDrawn++;
                break;
            case 'dumb':
                pool = this.dumbAgentPool;
                drawnCount = this.dumbAgentsDrawn++;
                break;
            case 'escaping':
                pool = this.escapingAgentPool;
                drawnCount = this.escapingAgentsDrawn++;
                break;
        }
        
        // Expand pool if needed
        if (drawnCount >= pool.length) {
            pool.push(this.createAgentPixiElements(style));
        }
        
        return pool[drawnCount];
    }

    private createAgentPixiElements(style: AgentStyle): AgentPixiElements {
        const triangle = this.createTriangleGraphics(style);
        const pathLine1 = new PIXI.Graphics();
        const pathLine2 = new PIXI.Graphics();
        const targetCircle = this.createTargetCircleGraphics();
        const accelLine = new PIXI.Graphics();
        const velocityLine = new PIXI.Graphics();
        const velocityDiffLine = new PIXI.Graphics();
        const desiredVelocityLine = new PIXI.Graphics();
        const debugText = new PIXI.Text({
            text: '',
            style: new PIXI.TextStyle({
                fontSize: 12,
                fill: 'white',
                fontFamily: 'Arial',
                stroke: { color: 'blue', width: 2 },
                fontWeight: 'bold'
            })
        });
        debugText.anchor.set(0.5);

        return {
            triangle,
            pathLine1,
            pathLine2,
            targetCircle,
            accelLine,
            velocityLine,
            velocityDiffLine,
            desiredVelocityLine,
            debugText,
            triangleInContainer: false,
            pathLine1InContainer: false,
            pathLine2InContainer: false,
            targetCircleInContainer: false,
            accelLineInContainer: false,
            velocityLineInContainer: false,
            velocityDiffLineInContainer: false,
            desiredVelocityLineInContainer: false,
            debugTextInContainer: false,
        };
    }

    private createTriangleGraphics(style: AgentStyle): PIXI.Graphics {
        const graphics = new PIXI.Graphics();
        
        // Choose color based on style
        let color: number;
        switch (style) {
            case 'smart': color = this.smartAgentColor; break;
            case 'dumb': color = this.dumbAgentColor; break;
            case 'escaping': color = this.escapingAgentColor; break;
        }
        
        graphics.fill({ color, alpha: 0.8 });
        
        // Create triangle pointing right (will be rotated as needed)
        // Triangle points: front tip, back-left, back-right
        const frontTip = { x: this.agentSize, y: 0 };
        const backLeft = { x: -this.agentSize * 0.5, y: -this.agentSize * 0.5 };
        const backRight = { x: -this.agentSize * 0.5, y: this.agentSize * 0.5 };
        
        graphics.poly([frontTip.x, frontTip.y, backLeft.x, backLeft.y, backRight.x, backRight.y]);
        graphics.fill();
        
        return graphics;
    }

    private createTargetCircleGraphics(): PIXI.Graphics {
        const graphics = new PIXI.Graphics();
        graphics.fill({ color: this.targetColor, alpha: 0.9 });
        graphics.circle(0, 0, this.targetRadius);
        graphics.fill();
        return graphics;
    }

    private updateAgentVisuals(
        element: AgentPixiElements, 
        agent: Agent, 
        agentIndex: number,
        graphicsContainer: PIXI.Container,
        textContainer: PIXI.Container,
        olMap: OlMap
    ): void {
        const pos = agent.coordinate;
        const look = agent.look;
        
        // Update triangle position and rotation (no clearing/repainting)
        this.updateTriangleTransform(element, pos, look);
        this.ensureInContainer(element.triangle, graphicsContainer, 'triangleInContainer', element);
        
        if (this.SHOW_DEBUG_LINES || agent.debug) {
            this.updateAccelLine(element, pos, agent);
            this.ensureInContainer(element.accelLine, graphicsContainer, 'accelLineInContainer', element);

            this.updateVelocityDiffLine(element, pos, agent);
            this.ensureInContainer(element.velocityDiffLine, graphicsContainer, 'velocityDiffLineInContainer', element);

            this.updateDesiredVelocityLine(element, pos, agent);
            this.ensureInContainer(element.desiredVelocityLine, graphicsContainer, 'desiredVelocityLineInContainer', element);
        } else {
            this.ensureNotInContainer(element.accelLine, graphicsContainer, 'accelLineInContainer', element);
            this.ensureNotInContainer(element.velocityDiffLine, graphicsContainer, 'velocityDiffLineInContainer', element);
            this.ensureNotInContainer(element.desiredVelocityLine, graphicsContainer, 'desiredVelocityLineInContainer', element);
        }

        if (this.SHOW_SPEED_LINE || agent.debug) {
            this.updateVelocityLine(element, pos, agent);
            this.ensureInContainer(element.velocityLine, graphicsContainer, 'velocityLineInContainer', element);
        } else {
            this.ensureNotInContainer(element.velocityLine, graphicsContainer, 'velocityLineInContainer', element);
        }

        // Update path lines and target based on agent state
        if ((this.SHOW_PATH_LINES || agent.debug) && agent.state === AgentState.Traveling) {
            this.updatePathLines(element, pos, agent); // This can repaint as requested
            this.updateTargetCirclePosition(element, agent); // Just move, don't repaint
            
            this.ensureInContainer(element.pathLine1, graphicsContainer, 'pathLine1InContainer', element);
            this.ensureInContainer(element.pathLine2, graphicsContainer, 'pathLine2InContainer', element);
            this.ensureInContainer(element.targetCircle, graphicsContainer, 'targetCircleInContainer', element);
        } else {
            this.ensureNotInContainer(element.pathLine1, graphicsContainer, 'pathLine1InContainer', element);
            this.ensureNotInContainer(element.pathLine2, graphicsContainer, 'pathLine2InContainer', element);
            this.ensureNotInContainer(element.targetCircle, graphicsContainer, 'targetCircleInContainer', element);
        }
        
        // Update debug text with current speed
        if (this.SHOW_DEBUG_TEXT || agent.debug) {
            this.updateDebugText(element, pos, agentIndex, agent, olMap);
            this.ensureInContainer(element.debugText, textContainer, 'debugTextInContainer', element);
        } else {
            this.ensureNotInContainer(element.debugText, textContainer, 'debugTextInContainer', element);
        }
    }

    private updateTriangleTransform(element: AgentPixiElements, pos: { x: number, y: number }, look: { x: number, y: number }): void {
        const triangle = element.triangle;
        
        // Update position
        triangle.x = pos.x;
        triangle.y = -pos.y;
        
        // Update rotation to point in look direction
        // Fix: Account for flipped Y coordinate system
        triangle.rotation = Math.atan2(-look.y, look.x);
    }

    private updateAccelLine(element: AgentPixiElements, pos: { x: number, y: number }, agent: Agent): void {
        const scaleM = 0.2;
        const line = element.accelLine;
        line.clear();
        line.stroke({ color: this.accelLineColor, width: 1, alpha: 0.9 });
        line.moveTo(pos.x, -pos.y);
        line.lineTo(pos.x + agent.lastAppliedAccel.x * scaleM, -pos.y - agent.lastAppliedAccel.y * scaleM);
        line.stroke();
    }

    private updateVelocityLine(element: AgentPixiElements, pos: { x: number, y: number }, agent: Agent): void {
        const scaleM = 1;
        const line = element.velocityLine;
        line.clear();
        line.stroke({ color: this.velocityLineColor, width: 1, alpha: 0.9 });
        line.moveTo(pos.x, -pos.y);
        line.lineTo(pos.x + agent.velocity.x * scaleM, -pos.y - agent.velocity.y * scaleM);
        line.stroke();
    }

    private updateVelocityDiffLine(element: AgentPixiElements, pos: { x: number, y: number }, agent: Agent): void {
        const scaleM = 1;
        const line = element.velocityDiffLine;
        line.clear();
        line.stroke({ color: this.velocityDiffLineColor, width: 1, alpha: 0.9 });
        line.moveTo(pos.x, -pos.y);
        line.lineTo(pos.x + agent.debug_velocityDiff.x * scaleM, -pos.y - agent.debug_velocityDiff.y * scaleM);
        line.stroke();
    }

    private updateDesiredVelocityLine(element: AgentPixiElements, pos: { x: number, y: number }, agent: Agent): void {
        const scaleM = 1;
        const line = element.desiredVelocityLine;
        line.clear();
        line.stroke({ color: this.desiredVelocityLineColor, width: 2, alpha: 0.7 });
        line.moveTo(pos.x, -pos.y);
        line.lineTo(pos.x + agent.debug_desiredVelocity.x * scaleM, -pos.y - agent.debug_desiredVelocity.y * scaleM);
        line.stroke();
    }

    private updatePathLines(element: AgentPixiElements, pos: { x: number, y: number }, agent: Agent): void {
        // Path line 1: current position to next corner (can repaint)
        const line1 = element.pathLine1;
        line1.clear();
        line1.stroke({ color: this.pathLineColor, width: 0.5, alpha: 0.7 });
        line1.moveTo(pos.x, -pos.y);
        line1.lineTo(agent.nextCorner.x, -agent.nextCorner.y);
        line1.stroke();
        
        // Path line 2: next corner to next corner 2 (can repaint)
        const line2 = element.pathLine2;
        line2.clear();
        line2.stroke({ color: this.pathLineColor, width: 0.5, alpha: 0.7 });
        line2.moveTo(agent.nextCorner.x, -agent.nextCorner.y);
        line2.lineTo(agent.nextCorner2.x, -agent.nextCorner2.y);
        line2.stroke();
    }

    private updateTargetCirclePosition(element: AgentPixiElements, agent: Agent): void {
        // Just move the circle, don't repaint
        const circle = element.targetCircle;
        circle.x = agent.endTarget.x;
        circle.y = -agent.endTarget.y;
    }

    private updateDebugText(
        element: AgentPixiElements, 
        pos: { x: number, y: number }, 
        agentIndex: number, 
        agent: Agent,
        olMap: OlMap
    ): void {
        const text = element.debugText;

        const speed = length(agent.velocity);        
        // text.text = `${Math.round(speed)} d: ${Math.round(length(agent.debug_desiredVelocity))} st:${Math.round(agent.stuckRating)}`;
        text.text = agent.stuckRating > 15 ? `${Math.round(agent.stuckRating)}` : '';
        text.x = pos.x;
        text.y = -pos.y + 8; // Offset above the agent
        
        // Scale text inversely with map resolution to keep consistent size
        const resolution = olMap.getView().getResolution()!;
        // Use a small constant scale factor that's inversely proportional to resolution
        const textScale = Math.max(0.5, Math.min(2.0, resolution * 0.3));
        text.scale.set(textScale);
    }

    private ensureInContainer(
        displayObject: PIXI.Graphics | PIXI.Text, 
        container: PIXI.Container, 
        flagName: keyof AgentPixiElements, 
        element: AgentPixiElements
    ): void {
        if (!element[flagName]) {
            container.addChild(displayObject);
            (element as any)[flagName] = true;
        }
    }

    private ensureNotInContainer(
        displayObject: PIXI.Graphics | PIXI.Text, 
        container: PIXI.Container, 
        flagName: keyof AgentPixiElements, 
        element: AgentPixiElements
    ): void {
        if (element[flagName]) {
            container.removeChild(displayObject);
            (element as any)[flagName] = false;
        }
    }

    private removeUnusedAgentsFromContainers(
        graphicsContainer: PIXI.Container, 
        textContainer: PIXI.Container
    ): void {
        // Remove unused smart agents
        for (let i = this.smartAgentsDrawn; i < this.smartAgentPool.length; i++) {
            const element = this.smartAgentPool[i];
            this.ensureNotInContainer(element.triangle, graphicsContainer, 'triangleInContainer', element);
            this.ensureNotInContainer(element.pathLine1, graphicsContainer, 'pathLine1InContainer', element);
            this.ensureNotInContainer(element.pathLine2, graphicsContainer, 'pathLine2InContainer', element);
            this.ensureNotInContainer(element.targetCircle, graphicsContainer, 'targetCircleInContainer', element);
            this.ensureNotInContainer(element.accelLine, graphicsContainer, 'accelLineInContainer', element);
            this.ensureNotInContainer(element.velocityLine, graphicsContainer, 'velocityLineInContainer', element);
            this.ensureNotInContainer(element.velocityDiffLine, graphicsContainer, 'velocityDiffLineInContainer', element);
            this.ensureNotInContainer(element.desiredVelocityLine, graphicsContainer, 'desiredVelocityLineInContainer', element);
            this.ensureNotInContainer(element.debugText, textContainer, 'debugTextInContainer', element);
        }
        
        // Remove unused dumb agents
        for (let i = this.dumbAgentsDrawn; i < this.dumbAgentPool.length; i++) {
            const element = this.dumbAgentPool[i];
            this.ensureNotInContainer(element.triangle, graphicsContainer, 'triangleInContainer', element);
            this.ensureNotInContainer(element.pathLine1, graphicsContainer, 'pathLine1InContainer', element);
            this.ensureNotInContainer(element.pathLine2, graphicsContainer, 'pathLine2InContainer', element);
            this.ensureNotInContainer(element.targetCircle, graphicsContainer, 'targetCircleInContainer', element);
            this.ensureNotInContainer(element.accelLine, graphicsContainer, 'accelLineInContainer', element);
            this.ensureNotInContainer(element.velocityLine, graphicsContainer, 'velocityLineInContainer', element);
            this.ensureNotInContainer(element.velocityDiffLine, graphicsContainer, 'velocityDiffLineInContainer', element);
            this.ensureNotInContainer(element.desiredVelocityLine, graphicsContainer, 'desiredVelocityLineInContainer', element);
            this.ensureNotInContainer(element.debugText, textContainer, 'debugTextInContainer', element);
        }
        
        // Remove unused escaping agents
        for (let i = this.escapingAgentsDrawn; i < this.escapingAgentPool.length; i++) {
            const element = this.escapingAgentPool[i];
            this.ensureNotInContainer(element.triangle, graphicsContainer, 'triangleInContainer', element);
            this.ensureNotInContainer(element.pathLine1, graphicsContainer, 'pathLine1InContainer', element);
            this.ensureNotInContainer(element.pathLine2, graphicsContainer, 'pathLine2InContainer', element);
            this.ensureNotInContainer(element.targetCircle, graphicsContainer, 'targetCircleInContainer', element);
            this.ensureNotInContainer(element.accelLine, graphicsContainer, 'accelLineInContainer', element);
            this.ensureNotInContainer(element.velocityLine, graphicsContainer, 'velocityLineInContainer', element);
            this.ensureNotInContainer(element.velocityDiffLine, graphicsContainer, 'velocityDiffLineInContainer', element);
            this.ensureNotInContainer(element.desiredVelocityLine, graphicsContainer, 'desiredVelocityLineInContainer', element);
            this.ensureNotInContainer(element.debugText, textContainer, 'debugTextInContainer', element);
        }
    }

    private removeAllAgentsFromContainers(
        graphicsContainer: PIXI.Container, 
        textContainer: PIXI.Container
    ): void {
        // Remove all agents from graphics container
        for (let i = 0; i < this.smartAgentPool.length; i++) {
            const element = this.smartAgentPool[i];
            this.ensureNotInContainer(element.triangle, graphicsContainer, 'triangleInContainer', element);
            this.ensureNotInContainer(element.pathLine1, graphicsContainer, 'pathLine1InContainer', element);
            this.ensureNotInContainer(element.pathLine2, graphicsContainer, 'pathLine2InContainer', element);
            this.ensureNotInContainer(element.targetCircle, graphicsContainer, 'targetCircleInContainer', element);
            this.ensureNotInContainer(element.accelLine, graphicsContainer, 'accelLineInContainer', element);
            this.ensureNotInContainer(element.velocityLine, graphicsContainer, 'velocityLineInContainer', element);
            this.ensureNotInContainer(element.velocityDiffLine, graphicsContainer, 'velocityDiffLineInContainer', element);
            this.ensureNotInContainer(element.desiredVelocityLine, graphicsContainer, 'desiredVelocityLineInContainer', element);
            this.ensureNotInContainer(element.debugText, textContainer, 'debugTextInContainer', element);
        }
        for (let i = 0; i < this.dumbAgentPool.length; i++) {
            const element = this.dumbAgentPool[i];
            this.ensureNotInContainer(element.triangle, graphicsContainer, 'triangleInContainer', element);
            this.ensureNotInContainer(element.pathLine1, graphicsContainer, 'pathLine1InContainer', element);
            this.ensureNotInContainer(element.pathLine2, graphicsContainer, 'pathLine2InContainer', element);
            this.ensureNotInContainer(element.targetCircle, graphicsContainer, 'targetCircleInContainer', element);
            this.ensureNotInContainer(element.accelLine, graphicsContainer, 'accelLineInContainer', element);
            this.ensureNotInContainer(element.velocityLine, graphicsContainer, 'velocityLineInContainer', element);
            this.ensureNotInContainer(element.velocityDiffLine, graphicsContainer, 'velocityDiffLineInContainer', element);
            this.ensureNotInContainer(element.desiredVelocityLine, graphicsContainer, 'desiredVelocityLineInContainer', element);
            this.ensureNotInContainer(element.debugText, textContainer, 'debugTextInContainer', element);
        }
        for (let i = 0; i < this.escapingAgentPool.length; i++) {
            const element = this.escapingAgentPool[i];
            this.ensureNotInContainer(element.triangle, graphicsContainer, 'triangleInContainer', element);
            this.ensureNotInContainer(element.pathLine1, graphicsContainer, 'pathLine1InContainer', element);
            this.ensureNotInContainer(element.pathLine2, graphicsContainer, 'pathLine2InContainer', element);
            this.ensureNotInContainer(element.targetCircle, graphicsContainer, 'targetCircleInContainer', element);
            this.ensureNotInContainer(element.accelLine, graphicsContainer, 'accelLineInContainer', element);
            this.ensureNotInContainer(element.velocityLine, graphicsContainer, 'velocityLineInContainer', element);
            this.ensureNotInContainer(element.velocityDiffLine, graphicsContainer, 'velocityDiffLineInContainer', element);
            this.ensureNotInContainer(element.desiredVelocityLine, graphicsContainer, 'desiredVelocityLineInContainer', element);
            this.ensureNotInContainer(element.debugText, textContainer, 'debugTextInContainer', element);
        }
    }
} 