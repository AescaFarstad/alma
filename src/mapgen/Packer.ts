import sharp from 'sharp';

export interface ImageToPack {
  id: string;
  width: number;
  height: number;
  buffer: Buffer;
}

export interface PackedRect extends ImageToPack {
  x: number;
  y: number;
}

interface PackingNode {
  x: number;
  y: number;
  width: number;
  height: number;
  used?: boolean;
  down?: PackingNode;
  right?: PackingNode;
}

export class Packer {
  private rootNode: PackingNode | null = null;
  private readonly PADDING = 1;

  public pack(images: ImageToPack[]): { packedRects: PackedRect[], atlasWidth: number, atlasHeight: number } {
    const sortedImages = [...images].sort((a, b) => Math.max(b.width, b.height) - Math.max(a.width, a.height));

    if (sortedImages.length === 0) {
      return { packedRects: [], atlasWidth: 0, atlasHeight: 0 };
    }

    const firstImage = sortedImages[0];
    this.rootNode = { x: 0, y: 0, width: firstImage.width + this.PADDING, height: firstImage.height + this.PADDING };

    const packedRects: PackedRect[] = [];

    for (const image of sortedImages) {
      const node = this.findNode(this.rootNode!, image.width + this.PADDING, image.height + this.PADDING);
      if (node) {
        const fittedNode = this.splitNode(node, image.width + this.PADDING, image.height + this.PADDING);
        packedRects.push({
          ...image,
          x: fittedNode.x,
          y: fittedNode.y,
        });
      } else {
        this.rootNode = this.growNode(image.width + this.PADDING, image.height + this.PADDING);
        const newNode = this.findNode(this.rootNode!, image.width + this.PADDING, image.height + this.PADDING);
        if (newNode) {
          const fittedNode = this.splitNode(newNode, image.width + this.PADDING, image.height + this.PADDING);
          packedRects.push({
            ...image,
            x: fittedNode.x,
            y: fittedNode.y,
          });
        } else {
          throw new Error(`Failed to pack image after growing atlas: ${image.id}`);
        }
      }
    }

    let atlasWidth = 0;
    let atlasHeight = 0;
    for (const rect of packedRects) {
      atlasWidth = Math.max(atlasWidth, rect.x + rect.width);
      atlasHeight = Math.max(atlasHeight, rect.y + rect.height);
    }

    return { packedRects, atlasWidth, atlasHeight };
  }

  private findNode(root: PackingNode, w: number, h: number): PackingNode | null {
    if (root.used) {
      return this.findNode(root.right!, w, h) || this.findNode(root.down!, w, h);
    } else if (w <= root.width && h <= root.height) {
      return root;
    }
    return null;
  }

  private splitNode(node: PackingNode, w: number, h: number): PackingNode {
    node.used = true;
    node.down = { x: node.x, y: node.y + h, width: node.width, height: node.height - h };
    node.right = { x: node.x + w, y: node.y, width: node.width - w, height: h };
    return node;
  }

  private growNode(w: number, h: number): PackingNode {
    const canGrowDown = w <= this.rootNode!.width;
    const canGrowRight = h <= this.rootNode!.height;

    const shouldGrowRight = canGrowRight && (this.rootNode!.height >= (this.rootNode!.width + w));
    const shouldGrowDown = canGrowDown && (this.rootNode!.width >= (this.rootNode!.height + h));

    if (shouldGrowRight) {
      return this.growRight(w, h);
    } else if (shouldGrowDown) {
      return this.growDown(w, h);
    } else if (canGrowRight) {
      return this.growRight(w, h);
    } else if (canGrowDown) {
      return this.growDown(w, h);
    }
    throw new Error("Cannot grow node");
  }

  private growRight(w: number, h: number): PackingNode {
    const newRoot: PackingNode = {
      used: true,
      x: 0,
      y: 0,
      width: this.rootNode!.width + w,
      height: this.rootNode!.height,
      down: this.rootNode!,
      right: { x: this.rootNode!.width, y: 0, width: w, height: this.rootNode!.height }
    };
    this.rootNode = newRoot;
    return newRoot;
  }

  private growDown(w: number, h: number): PackingNode {
    const newRoot: PackingNode = {
      used: true,
      x: 0,
      y: 0,
      width: this.rootNode!.width,
      height: this.rootNode!.height + h,
      down: { x: 0, y: this.rootNode!.height, width: this.rootNode!.width, height: h },
      right: this.rootNode!,
    };
    this.rootNode = newRoot;
    return newRoot;
  }
} 