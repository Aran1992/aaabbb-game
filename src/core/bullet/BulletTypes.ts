import { Bullet } from './Bullet';
import { Unit } from '../Unit';

// 1. 直线穿透子弹
export class LinearBullet extends Bullet {
  private vx: number = 0;
  private vy: number = 0;
  private pierceCount: number = 1; // 穿透次数

  constructor(
    id: number,
    owner: Unit,
    x: number,
    y: number,
    angle: number, // 弧度
    speed: number,
    damage: number,
    isCrit: boolean,
    radius: number = 6,
    pierce: number = 1
  ) {
    super(id, owner, 'linear', x, y, damage, isCrit, radius);
    this.vx = Math.cos(angle) * speed;
    this.vy = Math.sin(angle) * speed;
    this.pierceCount = pierce;
  }

  protected move(dt: number): void {
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.owner.engine.eventBus.emit('BulletMoved', { id: this.id, x: this.x, y: this.y });
  }

  protected onHit(target: Unit): void {
    target.takeDamage(this.damage, this.isCrit);
    this.pierceCount--;
    if (this.pierceCount <= 0) {
      this.destroy();
    }
  }
}

// 2. 追踪子弹
export class TrackingBullet extends Bullet {
  private speed: number;

  constructor(
    id: number,
    owner: Unit,
    x: number,
    y: number,
    public target: Unit,
    speed: number,
    damage: number,
    isCrit: boolean,
    radius: number = 5
  ) {
    super(id, owner, 'tracking', x, y, damage, isCrit, radius);
    this.speed = speed;
  }

  protected move(dt: number): void {
    if (this.target && this.target.alive) {
      const dx = this.target.x - this.x;
      const dy = this.target.y - this.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist > 0) {
        // 朝着目标移动
        this.x += (dx / dist) * this.speed * dt;
        this.y += (dy / dist) * this.speed * dt;
      }
    } else {
      // 失去目标后，向前方匀速飞行（寻找新的最近目标）
      const newTarget = this.owner.findNearestEnemy(400);
      if (newTarget) {
        this.target = newTarget;
      } else {
        // 无目标则直接销毁
        this.destroy();
        return;
      }
    }
    this.owner.engine.eventBus.emit('BulletMoved', { id: this.id, x: this.x, y: this.y });
  }
}

// 3. 环绕子弹 (如旋转火球)
export class OrbitBullet extends Bullet {
  private initialAngle: number;
  private angularSpeed: number; // 弧度/秒
  private currentRadius: number;

  constructor(
    id: number,
    owner: Unit,
    initialAngle: number,
    angularSpeed: number,
    radius: number, // 环绕半径
    damage: number,
    isCrit: boolean,
    bulletSize: number = 8
  ) {
    // 初始坐标根据 owner 计算
    const sx = owner.x + Math.cos(initialAngle) * radius;
    const sy = owner.y + Math.sin(initialAngle) * radius;
    super(id, owner, 'orbit', sx, sy, damage, isCrit, bulletSize);

    this.initialAngle = initialAngle;
    this.angularSpeed = angularSpeed;
    this.currentRadius = radius;
    this.maxDuration = 10.0; // 环绕子弹寿命长一些
  }

  protected move(dt: number): void {
    // 坐标完全依赖于 owner 的位置和当前的累加角度
    const angle = this.initialAngle + this.angularSpeed * this.elapsed;
    this.x = this.owner.x + Math.cos(angle) * this.currentRadius;
    this.y = this.owner.y + Math.sin(angle) * this.currentRadius;
    this.owner.engine.eventBus.emit('BulletMoved', { id: this.id, x: this.x, y: this.y });
  }

  protected onHit(target: Unit): void {
    // 环绕子弹通常在碰撞后不直接消失，而是对怪物造成击中，并具有独立的内置打击 CD（比如单只怪 0.5s 判定一次）
    // 为了简化判定，这里我们每次只扣血并不销毁子弹，但是在怪身上记录被击中事件，或者让其拥有 pierce=999
    target.takeDamage(this.damage, this.isCrit);
  }
}

// 4. 地面法阵/区域效果子弹
export class AreaEffectBullet extends Bullet {
  private tickInterval: number = 0.5;
  private tickElapsed: number = 0;

  constructor(
    id: number,
    owner: Unit,
    x: number,
    y: number,
    radius: number, // 范围大小
    duration: number,
    damage: number,
    isCrit: boolean
  ) {
    super(id, owner, 'area', x, y, damage, isCrit, radius);
    this.maxDuration = duration;
  }

  protected move(dt: number): void {
    // 不移动，保持原位
  }

  protected checkCollision(): void {
    // 区域法阵通过每 0.5 秒的 tick 对范围内敌人造成伤害
    this.tickElapsed += 1/60; // 在没有更高精度 dt 时使用常数，或者将 dt 传进来。我们这里使用的是 tick 里的 dt。
    // update 里已经传了 dt 进来，所以我们重写 update 的 tick 判定
  }

  update(dt: number): void {
    if (!this.alive) return;

    this.elapsed += dt;
    if (this.elapsed >= this.maxDuration) {
      this.destroy();
      return;
    }

    this.tickElapsed += dt;
    if (this.tickElapsed >= this.tickInterval) {
      this.tickElapsed -= this.tickInterval;

      // 范围伤害触发
      const engine = this.owner.engine;
      const targets = engine.spatialHash.query(this.x, this.y, this.radius);

      for (const target of targets) {
        if (target.alive && target.type === 'enemy') {
          // 计算两点距离，确定在圆内
          const dx = target.x - this.x;
          const dy = target.y - this.y;
          if (dx * dx + dy * dy <= this.radius * this.radius) {
            target.takeDamage(this.damage, this.isCrit);
          }
        }
      }
    }
  }
}
