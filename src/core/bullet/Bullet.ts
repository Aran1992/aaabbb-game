import { Entity } from '../Entity';
import { Unit } from '../Unit';

export abstract class Bullet extends Entity {
  public elapsed: number = 0;
  public maxDuration: number = 5.0; // 默认最大寿命 5 秒

  constructor(
    id: number,
    public owner: Unit,
    public type: string,
    x: number,
    y: number,
    public damage: number,
    public isCrit: boolean,
    radius: number = 6
  ) {
    super(id, x, y);
    this.radius = radius;
  }

  update(dt: number): void {
    if (!this.alive) return;

    this.elapsed += dt;
    if (this.elapsed >= this.maxDuration) {
      this.destroy();
      return;
    }

    // 更新位移
    this.move(dt);

    // 碰撞检测（如果是玩家发射的，则与怪物碰撞；如果是怪物发射的，则与玩家碰撞）
    this.checkCollision();
  }

  // 由子类实现具体的位移算法
  protected abstract move(dt: number): void;

  protected checkCollision(): void {
    const engine = this.owner.engine;
    if (this.owner.type === 'hero') {
      // 玩家子弹：在附近网格查询怪物
      const enemies = engine.spatialHash.query(this.x, this.y, this.radius);
      for (const enemy of enemies) {
        if (enemy.alive && this.testOverlap(enemy)) {
          this.onHit(enemy);
          if (!this.alive) break; // 子弹可能在碰撞后销毁
        }
      }
    } else {
      // 怪物子弹：直接判定与英雄碰撞
      const hero = engine.hero;
      if (hero && hero.alive && this.testOverlap(hero)) {
        this.onHit(hero);
      }
    }
  }

  private testOverlap(other: Entity): boolean {
    const dx = this.x - other.x;
    const dy = this.y - other.y;
    const distSq = dx * dx + dy * dy;
    const rSum = this.radius + other.radius;
    return distSq <= rSum * rSum;
  }

  protected onHit(target: Unit): void {
    target.takeDamage(this.damage, this.isCrit);
    this.destroy(); // 默认碰撞后子弹消失
  }

  public destroy(): void {
    this.alive = false;
    this.owner.engine.eventBus.emit('BulletDestroyed', { id: this.id });
  }
}
