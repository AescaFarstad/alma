import * as PIXI from 'pixi.js';

export interface PolyStyle {
  fillStyle: PIXI.FillStyle;
  strokeStyle?: PIXI.StrokeStyle;
}

export interface CircleStyle {
  fillStyle?: PIXI.FillStyle;
  strokeStyle?: PIXI.StrokeStyle;
}

export interface LineStyle extends PIXI.StrokeStyle {}

export interface TextStyle {
  textStyle: PIXI.TextStyle;
}

export interface DrawCommand {
  style: PolyStyle | CircleStyle | TextStyle;
  // For polygons, it's a flat array of vertices [x1, y1, x2, y2, ...]
  // For circles, it's [x, y, radius]
  // For text, it's [x, y, text_content]
  data: (number | string)[]; 
}

export class PrimitiveState {
  public polyCommands: Map<PolyStyle, number[][]> = new Map();
  public circleCommands: Map<CircleStyle, number[]> = new Map();
  public lineCommands: Map<LineStyle, number[]> = new Map();
  public textCommands: Map<TextStyle, (string | number)[]> = new Map();

  public addPolygon(vertices: number[], style: PolyStyle) {
    if (!this.polyCommands.has(style)) {
      this.polyCommands.set(style, []);
    }
    this.polyCommands.get(style)!.push(vertices);
  }
  
  public addCircle(x: number, y: number, radius: number, style: CircleStyle) {
    if (!this.circleCommands.has(style)) {
      this.circleCommands.set(style, []);
    }
    this.circleCommands.get(style)!.push(x, y, radius);
  }
  
  public addLine(vertices: number[], style: LineStyle) {
    if (!this.lineCommands.has(style)) {
      this.lineCommands.set(style, []);
    }
    this.lineCommands.get(style)!.push(...vertices);
  }
  
  public addText(text: string, x: number, y: number, style: TextStyle) {
    if (!this.textCommands.has(style)) {
      this.textCommands.set(style, []);
    }
    this.textCommands.get(style)!.push(text, x, y);
  }
  
  public clear() {
    this.polyCommands.clear();
    this.circleCommands.clear();
    this.lineCommands.clear();
    this.textCommands.clear();
  }
} 