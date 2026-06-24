import { Unit } from '../Unit';
import { Buff, BuffConfig } from './Buff';

export class BuffCtrl {
  private buffs: Map<string, Buff> = new Map();

  constructor(private owner: Unit) {}

  addBuff(config: BuffConfig): void {
    let buff = this.buffs.get(config.id);
    if (buff) {
      // 存在则增加层数，并重置时间
      const prevMods = buff.modifiers;
      buff.addStack();
      this.refreshModifiers(prevMods, buff.modifiers);
      this.owner.engine.eventBus.emit('BuffApplied', {
        unitId: this.owner.id,
        buffId: buff.id,
        stacks: buff.stacks,
        duration: buff.duration,
      });
    } else {
      // 不存在则创建
      buff = new Buff(config);
      this.buffs.set(buff.id, buff);
      // 应用属性修饰器
      for (const mod of buff.modifiers) {
        this.owner.getAttribute(mod.id as any)?.addModifier(mod);
      }
      this.owner.engine.eventBus.emit('BuffApplied', {
        unitId: this.owner.id,
        buffId: buff.id,
        stacks: buff.stacks,
        duration: buff.duration,
      });
    }
  }

  removeBuff(id: string): void {
    const buff = this.buffs.get(id);
    if (buff) {
      // 移除属性修饰器
      for (const mod of buff.modifiers) {
        this.owner.getAttribute(mod.id as any)?.removeModifier(mod.id);
      }
      this.buffs.delete(id);
      this.owner.engine.eventBus.emit('BuffRemoved', {
        unitId: this.owner.id,
        buffId: id,
      });
    }
  }

  hasBuff(id: string): boolean {
    return this.buffs.has(id);
  }

  getBuff(id: string): Buff | undefined {
    return this.buffs.get(id);
  }

  update(dt: number): void {
    const expired: string[] = [];
    for (const [id, buff] of this.buffs.entries()) {
      const shouldRemove = buff.update(this.owner, dt);
      if (shouldRemove) {
        expired.push(id);
      }
    }

    for (const id of expired) {
      this.removeBuff(id);
    }
  }

  onDestroy(): void {
    for (const id of this.buffs.keys()) {
      this.removeBuff(id);
    }
    this.buffs.clear();
  }

  private refreshModifiers(oldMods: any[], newMods: any[]) {
    // 先移除旧的，再添加新的，保证属性实时重新计算
    for (const mod of oldMods) {
      this.owner.getAttribute(mod.id as any)?.removeModifier(mod.id);
    }
    for (const mod of newMods) {
      this.owner.getAttribute(mod.id as any)?.addModifier(mod);
    }
  }
}
