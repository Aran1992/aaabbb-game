import { EventBus } from './EventBus';
import { Unit } from './Unit';
import { Bullet } from './bullet/Bullet';
import { SpatialHash } from './physics/SpatialHash';

export class Engine {
  public eventBus: EventBus = new EventBus();
  public units: Map<number, Unit> = new Map();
  public bullets: Map<number, Bullet> = new Map();
  public spatialHash: SpatialHash<Unit> = new SpatialHash(120);

  public curFrame: number = 0;
  public curTime: number = 0; // 秒
  public nextEntityId: number = 1;

  public hero!: Unit;

  // 确定性伪随机数种子
  private randomSeed: number = 12345;

  constructor(seed: number = 12345) {
    this.randomSeed = seed;
  }

  // 确定性随机数，返回 0 到 1 之间
  public random(): number {
    const x = Math.sin(this.randomSeed++) * 10000;
    return x - Math.floor(x);
  }

  public randomRange(min: number, max: number): number {
    return min + this.random() * (max - min);
  }

  public getNextId(): number {
    return this.nextEntityId++;
  }

  public addUnit(unit: Unit): void {
    this.units.set(unit.id, unit);
    if (unit.type === 'hero') {
      this.hero = unit;
    }
    this.eventBus.emit('UnitSpawned', {
      id: unit.id,
      type: unit.type,
      x: unit.x,
      y: unit.y,
      maxHp: unit.maxHp,
      radius: unit.radius,
    });
  }

  public addBullet(bullet: Bullet): void {
    this.bullets.set(bullet.id, bullet);
    this.eventBus.emit('BulletSpawned', {
      id: bullet.id,
      type: bullet.type,
      x: bullet.x,
      y: bullet.y,
      radius: bullet.radius,
    });
  }

  public update(dt: number): void {
    this.curFrame++;
    this.curTime += dt;

    // 1. 刷新空间哈希网格 (只塞入存活的怪物)
    this.spatialHash.clear();
    for (const unit of this.units.values()) {
      if (unit.alive && unit.type === 'enemy') {
        this.spatialHash.insert(unit);
      }
    }

    // 2. 更新所有单位
    for (const unit of this.units.values()) {
      if (unit.alive) {
        unit.update(dt);
      }
    }

    // 3. 更新所有子弹
    for (const bullet of this.bullets.values()) {
      if (bullet.alive) {
        bullet.update(dt);
      }
    }

    // 4. 清理已死亡或销毁的实体
    for (const [id, unit] of this.units.entries()) {
      if (!unit.alive) {
        unit.onDestroy();
        this.units.delete(id);
      }
    }

    for (const [id, bullet] of this.bullets.entries()) {
      if (!bullet.alive) {
        bullet.onDestroy();
        this.bullets.delete(id);
      }
    }
  }

  public clear(): void {
    this.units.clear();
    this.bullets.clear();
    this.spatialHash.clear();
    this.eventBus.clear();
    this.curFrame = 0;
    this.curTime = 0;
    this.nextEntityId = 1;
  }
}
