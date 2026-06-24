import { AttributeModifier } from '../Attribute';
import { Unit } from '../Unit';

export interface BuffConfig {
  id: string;
  name: string;
  duration: number; // 持续时间（秒），-1 为永久
  maxStacks?: number; // 最大叠加层数，默认 1
  modifiers?: Omit<AttributeModifier, 'id'>[]; // 属性修改器
  tickInterval?: number; // 定时触发效果间隔（秒）
  onTick?: (target: Unit, elapsed: number) => void; // tick 触发的回调
}

export class Buff {
  public id: string;
  public name: string;
  public duration: number;
  public maxStacks: number;
  public elapsed: number = 0;
  public stacks: number = 1;
  public tickInterval: number = 0;
  private tickElapsed: number = 0;
  private config: BuffConfig;

  constructor(config: BuffConfig) {
    this.config = config;
    this.id = config.id;
    this.name = config.name;
    this.duration = config.duration;
    this.maxStacks = config.maxStacks || 1;
    this.tickInterval = config.tickInterval || 0;
  }

  get modifiers(): AttributeModifier[] {
    if (!this.config.modifiers) return [];
    // 为每个修饰器生成带 Buff 实例和叠加层数的唯一 ModifierID
    return this.config.modifiers.map((mod) => ({
      id: `Buff_${this.id}_${mod.type}`,
      type: mod.type,
      value: mod.value * this.stacks, // 叠加效果
    }));
  }

  update(target: Unit, dt: number): boolean {
    if (this.duration !== -1) {
      this.elapsed += dt;
      if (this.elapsed >= this.duration) {
        return true; // 应该被移除
      }
    }

    if (this.tickInterval > 0 && this.config.onTick) {
      this.tickElapsed += dt;
      if (this.tickElapsed >= this.tickInterval) {
        this.tickElapsed -= this.tickInterval;
        this.config.onTick(target, this.elapsed);
      }
    }

    return false;
  }

  addStack(): void {
    if (this.stacks < this.maxStacks) {
      this.stacks++;
    }
    this.elapsed = 0; // 重置持续时间
  }
}
