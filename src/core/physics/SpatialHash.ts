export interface HasSpatialProperty {
  id: number;
  x: number;
  y: number;
  radius: number;
}

export class SpatialHash<T extends HasSpatialProperty> {
  private grid: Map<string, T[]> = new Map();

  constructor(private cellSize: number = 120) {}

  clear(): void {
    this.grid.clear();
  }

  private getKey(cx: number, cy: number): string {
    return `${cx},${cy}`;
  }

  insert(item: T): void {
    // 找出实体包围盒占用的所有网格
    const minX = Math.floor((item.x - item.radius) / this.cellSize);
    const maxX = Math.floor((item.x + item.radius) / this.cellSize);
    const minY = Math.floor((item.y - item.radius) / this.cellSize);
    const maxY = Math.floor((item.y + item.radius) / this.cellSize);

    for (let cx = minX; cx <= maxX; cx++) {
      for (let cy = minY; cy <= maxY; cy++) {
        const key = this.getKey(cx, cy);
        let list = this.grid.get(key);
        if (!list) {
          list = [];
          this.grid.set(key, list);
        }
        list.push(item);
      }
    }
  }

  query(x: number, y: number, radius: number): T[] {
    const minX = Math.floor((x - radius) / this.cellSize);
    const maxX = Math.floor((x + radius) / this.cellSize);
    const minY = Math.floor((y - radius) / this.cellSize);
    const maxY = Math.floor((y + radius) / this.cellSize);

    const result: T[] = [];
    const seenIds = new Set<number>();

    for (let cx = minX; cx <= maxX; cx++) {
      for (let cy = minY; cy <= maxY; cy++) {
        const key = this.getKey(cx, cy);
        const list = this.grid.get(key);
        if (list) {
          for (const item of list) {
            if (!seenIds.has(item.id)) {
              seenIds.add(item.id);
              result.push(item);
            }
          }
        }
      }
    }

    return result;
  }
}
