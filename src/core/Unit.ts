import { Entity } from './Entity';
import { Engine } from './Engine';
import { Attribute, AttributeType } from './Attribute';
import { BuffCtrl } from './buff/BuffCtrl';
import { SkillCtrl } from './skill/SkillCtrl';

export class Unit extends Entity {
  public type: 'hero' | 'enemy';
  public hp: number = 0;

  private attributes: Map<AttributeType, Attribute> = new Map();
  public buffCtrl: BuffCtrl;
  public skillCtrl: SkillCtrl;

  // 目标位置，用于 AI 寻路或自动移动
  public targetX: number | null = null;
  public targetY: number | null = null;

  public enemyType?: 'jiang' | 'shi' | 'gui' | 'mo';

  constructor(
    public engine: Engine,
    id: number,
    type: 'hero' | 'enemy',
    x: number,
    y: number,
    baseAttrs: { [key in AttributeType]?: number } = {},
    enemyType?: 'jiang' | 'shi' | 'gui' | 'mo'
  ) {
    super(id, x, y);
    this.type = type;
    this.enemyType = enemyType;

    // 初始化属性系统
    this.attributes.set(AttributeType.MaxHp, new Attribute(baseAttrs.MaxHp ?? 100));
    this.attributes.set(AttributeType.Speed, new Attribute(baseAttrs.Speed ?? 150));
    this.attributes.set(AttributeType.Attack, new Attribute(baseAttrs.Attack ?? 10));
    this.attributes.set(AttributeType.CritRate, new Attribute(baseAttrs.CritRate ?? 0.05));
    this.attributes.set(AttributeType.CritDamage, new Attribute(baseAttrs.CritDamage ?? 1.5));
    this.attributes.set(AttributeType.CooldownReduction, new Attribute(baseAttrs.CooldownReduction ?? 0.0));

    this.hp = this.maxHp;

    this.buffCtrl = new BuffCtrl(this);
    this.skillCtrl = new SkillCtrl(this);

    if (type === 'hero') {
      this.radius = 16;
    } else {
      if (enemyType === 'jiang') this.radius = 11;
      else if (enemyType === 'shi') this.radius = 14;
      else if (enemyType === 'gui') this.radius = 18;
      else if (enemyType === 'mo') this.radius = 23;
      else this.radius = 12;
    }
  }

  // 属性只读 Getters
  get maxHp(): number { return Math.max(1, Math.round(this.attributes.get(AttributeType.MaxHp)!.value)); }
  get speed(): number { return Math.max(0, this.attributes.get(AttributeType.Speed)!.value); }
  get attack(): number { return Math.max(0, this.attributes.get(AttributeType.Attack)!.value); }
  get critRate(): number { return Math.min(1.0, Math.max(0, this.attributes.get(AttributeType.CritRate)!.value)); }
  get critDamage(): number { return Math.max(1.0, this.attributes.get(AttributeType.CritDamage)!.value); }
  get cooldownReduction(): number { return Math.min(0.8, Math.max(0, this.attributes.get(AttributeType.CooldownReduction)!.value)); }

  getAttribute(type: AttributeType): Attribute | undefined {
    return this.attributes.get(type);
  }

  takeDamage(amount: number, isCrit: boolean): void {
    if (!this.alive) return;

    this.hp = Math.max(0, this.hp - amount);
    this.engine.eventBus.emit('UnitHpChanged', {
      id: this.id,
      curHp: this.hp,
      maxHp: this.maxHp,
      change: -amount,
      isCrit: isCrit,
    });

    if (this.hp <= 0) {
      this.alive = false;
      this.engine.eventBus.emit('UnitDead', { id: this.id });
    }
  }

  heal(amount: number): void {
    if (!this.alive) return;
    const actualHeal = Math.min(this.maxHp - this.hp, amount);
    if (actualHeal <= 0) return;

    this.hp += actualHeal;
    this.engine.eventBus.emit('UnitHpChanged', {
      id: this.id,
      curHp: this.hp,
      maxHp: this.maxHp,
      change: actualHeal,
      isCrit: false,
    });
  }

  update(dt: number): void {
    if (!this.alive) return;

    // 1. 更新 Buff 和技能
    this.buffCtrl.update(dt);
    this.skillCtrl.update(dt);

    // 2. 简易 AI 行为
    if (this.type === 'enemy') {
      this.updateEnemyAI(dt);
    } else {
      this.updateHeroAI(dt);
    }
  }

  private updateEnemyAI(dt: number): void {
    // 怪物追踪英雄
    const hero = this.engine.hero;
    if (hero && hero.alive) {
      // 距离检测
      const dx = hero.x - this.x;
      const dy = hero.y - this.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      // 如果离英雄有一点距离，则朝英雄移动
      if (dist > this.radius + hero.radius - 2) {
        this.moveTowards(hero.x, hero.y, dt);
      } else {
        // 近战碰撞伤害（每隔 0.5 秒判定一次对英雄的撕咬）
        if (this.engine.curFrame % 30 === 0) {
          const isCrit = this.engine.random() < this.critRate;
          const damage = isCrit ? this.attack * this.critDamage : this.attack;
          hero.takeDamage(Math.round(damage), isCrit);
        }
      }
    }
  }

  private updateHeroAI(dt: number): void {
    // 英雄如果设置了目标位置，则走向目标位置（主要是鼠标点击或者自动寻路）
    if (this.targetX !== null && this.targetY !== null) {
      const dx = this.targetX - this.x;
      const dy = this.targetY - this.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist > 5) {
        this.moveTowards(this.targetX, this.targetY, dt);
      } else {
        this.targetX = null;
        this.targetY = null;
      }
    }
  }

  public moveTowards(tx: number, ty: number, dt: number): void {
    const dx = tx - this.x;
    const dy = ty - this.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist > 0) {
      const moveDist = this.speed * dt;
      if (moveDist >= dist) {
        this.x = tx;
        this.y = ty;
      } else {
        this.x += (dx / dist) * moveDist;
        this.y += (dy / dist) * moveDist;
      }
      this.engine.eventBus.emit('UnitMoved', { id: this.id, x: this.x, y: this.y });
    }
  }

  public findNearestEnemy(radius: number = 99999): Unit | null {
    // 利用空间哈希查询附近的怪物
    const potentialEnemies = this.engine.spatialHash.query(this.x, this.y, radius);
    let nearest: Unit | null = null;
    let minDist = radius;

    for (const enemy of potentialEnemies) {
      if (enemy.alive && enemy !== this) {
        const dx = enemy.x - this.x;
        const dy = enemy.y - this.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < minDist) {
          minDist = dist;
          nearest = enemy;
        }
      }
    }

    return nearest;
  }

  onDestroy(): void {
    super.onDestroy();
    this.buffCtrl.onDestroy();
    this.skillCtrl.onDestroy();
  }
}
