export class ObjectPool<T extends Phaser.GameObjects.GameObject> {
  private readonly items: T[] = [];
  private index = 0;

  constructor(
    private readonly createItem: () => T,
    private readonly resetItem: (item: T) => void,
    size: number
  ) {
    for (let i = 0; i < size; i += 1) {
      const item = this.createItem();
      this.resetItem(item);
      this.items.push(item);
    }
  }

  acquire(): T | null {
    for (let i = 0; i < this.items.length; i += 1) {
      const item = this.items[this.index];
      this.index = (this.index + 1) % this.items.length;
      if (!item.active) {
        item.setActive(true);
        return item;
      }
    }
    return null;
  }

  release(item: T): void {
    this.resetItem(item);
  }

  forEachActive(callback: (item: T) => void): void {
    for (const item of this.items) {
      if (item.active) callback(item);
    }
  }

  activeCount(): number {
    let count = 0;
    for (const item of this.items) {
      if (item.active) count += 1;
    }
    return count;
  }

  activeItems(): T[] {
    return this.items.filter((item) => item.active);
  }

  capacity(): number {
    return this.items.length;
  }
}
