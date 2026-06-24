export class Entity {
  public id: number = 0;
  public x: number = 0;
  public y: number = 0;
  public radius: number = 10;
  public alive: boolean = true;

  constructor(id: number, x: number, y: number) {
    this.id = id;
    this.x = x;
    this.y = y;
  }

  update(dt: number): void {}

  onDestroy(): void {
    this.alive = false;
  }
}
