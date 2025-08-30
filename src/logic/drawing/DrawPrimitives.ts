import * as PIXI from 'pixi.js';
import { PrimitiveState } from './PrimitiveState';
import { Map as OlMap } from 'ol';

export class DrawPrimitives {
  private static textCache: PIXI.Text[] = [];


  public static draw(
    graphics: PIXI.Graphics,
    textContainer: PIXI.Container,
    primitives: PrimitiveState,
    olMap: OlMap,
  ) {
    graphics.clear();

    const oldTexts = textContainer.removeChildren();
    for (let i = 0; i < oldTexts.length; i++) {
      this.textCache.push(oldTexts[i] as PIXI.Text);
    }

    for (const [style, polygons] of primitives.polyCommands.entries()) {
      if (polygons.length === 0) continue;
      for (const poly of polygons) {
        graphics.poly(poly);
      }
      graphics.fill(style.fillStyle);
      if (style.strokeStyle) {
        graphics.stroke(style.strokeStyle);
      }
    }

    for (const [style, data] of primitives.circleCommands.entries()) {
      if (data.length === 0) continue;
      for (let i = 0; i < data.length; i += 3) {
        graphics.circle(data[i], data[i + 1], data[i + 2]);
      }
      graphics.fill(style.fillStyle);
    }

    for (const [style, data] of primitives.lineCommands.entries()) {
      if (data.length === 0) continue;
      for (let i = 0; i < data.length; i += 4) {
        graphics.moveTo(data[i], data[i + 1]);
        graphics.lineTo(data[i + 2], data[i + 3]);
      }
      graphics.stroke(style);
    }
    
    const resolution = olMap.getView().getResolution()!;
    for (const [style, data] of primitives.textCommands.entries()) {
      for (let i = 0; i < data.length; i += 3) {
        const textContent = data[i] as string;
        const x = data[i + 1] as number;
        const y = data[i + 2] as number;
        
        let text: PIXI.Text;
        if (this.textCache.length > 0) {
          text = this.textCache.pop()!;
          text.text = textContent;
          text.visible = true;
        } else {
          text = new PIXI.Text({
            text: textContent,
            style: style.textStyle,
          });
        }
        
        text.x = x;
        text.y = y;
        text.anchor.set(0.5);
        text.scale.set(resolution);
        
        textContainer.addChild(text);
      }
    }
    
    for (let i = 0; i < this.textCache.length; i++) {
      this.textCache[i].visible = false;
    }
  }
} 