import { Unit } from '../Unit';
import { Skill, SkillConfig, SkillCastInstance } from './Skill';

export class SkillCtrl {
  private skills: Map<string, Skill> = new Map();
  private activeCasts: Set<SkillCastInstance> = new Set();

  constructor(private owner: Unit) {}

  addSkill(config: SkillConfig): Skill {
    const skill = new Skill(config);
    this.skills.set(skill.id, skill);
    return skill;
  }

  getSkills(): Skill[] {
    return Array.from(this.skills.values());
  }

  getSkill(id: string): Skill | undefined {
    return this.skills.get(id);
  }

  castSkill(id: string): boolean {
    const skill = this.skills.get(id);
    if (!skill || !skill.isReady()) return false;

    // 索敌
    const nearestEnemy = this.owner.findNearestEnemy(skill.range);
    
    // 如果是辅助型BUFF或者以自身为中心的环绕子弹，不需要强制有敌人目标
    const isSelfTarget = skill.actions.some(
      (a) => a.type === 'spawn_bullet' && a.params.bulletType === 'orbit'
    ) || skill.actions.some(
      (a) => a.type === 'apply_buff' && a.params.target === 'self'
    );

    if (!nearestEnemy && !isSelfTarget) {
      return false; // 无效目标
    }

    // 创建施法实例
    const cast = new SkillCastInstance(this.owner, nearestEnemy, skill);
    this.activeCasts.add(cast);

    // 触发冷却
    skill.startCooldown(this.owner);

    // 派发事件，给渲染层订阅
    this.owner.engine.eventBus.emit('SkillCast', {
      unitId: this.owner.id,
      skillId: skill.id,
      duration: skill.castDuration,
    });

    return true;
  }

  update(dt: number): void {
    // 1. 更新冷却时间
    for (const skill of this.skills.values()) {
      skill.updateCooldown(dt);
    }

    // 2. 更新正在释放的技能
    const finished: SkillCastInstance[] = [];
    for (const cast of this.activeCasts) {
      const isFinished = cast.update(dt);
      if (isFinished) {
        finished.push(cast);
      }
    }

    for (const cast of finished) {
      this.activeCasts.delete(cast);
    }

    // 3. 自动战斗 AI（割草游戏中所有技能自动循环触发）
    if (this.owner.alive && this.owner.type === 'hero') {
      for (const skill of this.skills.values()) {
        if (skill.isReady()) {
          this.castSkill(skill.id);
        }
      }
    }
  }

  onDestroy(): void {
    this.activeCasts.clear();
    this.skills.clear();
  }
}
