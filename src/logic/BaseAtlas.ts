export interface AtlasFrame {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface AtlasData {
  frameNameToId: Map<string, number>;
  sortedFrameNames: string[];
  uvCoordinates: Float32Array;
  atlasWidth: number;
  atlasHeight: number;
}

class BaseAtlas {
  private _data: AtlasData | null = null;

  get data(): AtlasData | null {
    return this._data;
  }

  getFrameId(frameName: string): number | undefined {
    return this._data?.frameNameToId.get(frameName);
  }

  async loadAtlas(atlasJsonUrl: string, atlasWidth: number, atlasHeight: number): Promise<void> {
    try {
      const response = await fetch(atlasJsonUrl);
      if (!response.ok) {
        throw new Error(`Failed to load atlas: ${response.statusText}`);
      }

      const atlas = await response.json() as Record<string, AtlasFrame>;
      
      // Sort frame names lexicographically
      const sortedFrameNames = Object.keys(atlas).sort((a, b) => a.localeCompare(b));
      
      // Create frame name to ID mapping
      const frameNameToId = new Map<string, number>();
      sortedFrameNames.forEach((name, index) => {
        frameNameToId.set(name, index);
      });

      // Create UV coordinates array (4 floats per frame)
      const uvCoordinates = new Float32Array(sortedFrameNames.length * 4);
      sortedFrameNames.forEach((frameName, index) => {
        const frame = atlas[frameName];
        const baseIndex = index * 4;
        uvCoordinates[baseIndex + 0] = frame.x / atlasWidth;    // u1
        uvCoordinates[baseIndex + 1] = frame.y / atlasHeight;   // v1
        uvCoordinates[baseIndex + 2] = (frame.x + frame.w) / atlasWidth;  // u2
        uvCoordinates[baseIndex + 3] = (frame.y + frame.h) / atlasHeight; // v2
      });

      this._data = {
        frameNameToId,
        sortedFrameNames,
        uvCoordinates,
        atlasWidth,
        atlasHeight
      };

    } catch (error) {
      console.error('Failed to load atlas:', error);
      throw error;
    }
  }

  clear(): void {
    this._data = null;
  }
}

// Export singleton instance
export const baseAtlas = new BaseAtlas(); 