import { Unit } from '../Unit';
import { SkillActionConfig, SkillActionExecutor } from './SkillAction';

export interface SkillConfig {
  id: string;
  name: string;
  cooldown: number; // 冷却时间 (秒)
  range?: number; // 施法距离
  castDuration?: number; // 施法动作总时长 (秒)
  actions: SkillActionConfig[];
}

export class Skill {
  public id: string;
  public name: string;
  public baseCooldown: number;
  public cooldownTimer: number = 0;
  public range: number;
  public castDuration: number;
  public actions: SkillActionConfig[];

  constructor(config: SkillConfig) {
    this.id = config.id;
    this.name = config.name;
    this.baseCooldown = config.cooldown;
    this.range = config.range ?? 200;
    this.castDuration = config.castDuration ?? 0.5;
    this.actions = config.actions;
  }

  isReady(): boolean {
    return this.cooldownTimer <= 0;
  }

  startCooldown(caster: Unit): void {
    // 冷却缩减动态计算，上限 80% (0.8)
    const cdr = caster.cooldownReduction;
    this.cooldownTimer = this.baseCooldown * (1 - cdr);
  }

  updateCooldown(dt: number): void {
    if (this.cooldownTimer > 0) {
      this.cooldownTimer = Math.max(0, this.cooldownTimer - dt);
    }
  }
}

export class SkillCastInstance {
  public elapsedTime: number = 0;
  private pendingActions: SkillActionConfig[];
  private castAngle: number = 0;

  constructor(
    public caster: Unit,
    public target: Unit | null,
    public skill: Skill
  ) {
    // 浅拷贝动作数组以便逐个消费
    this.pendingActions = [...skill.actions];

    // 锁定释放瞬间的方向
    if (target && target.alive) {
      this.castAngle = Math.atan2(target.y - caster.y, target.x - caster.x);
    } else {
      // 默认朝施法者正右方
      this.castAngle = 0;
    }
  }

  update(dt: number): boolean {
    this.elapsedTime += dt;

    // 筛选出达到触发时间的动作节点
    const triggered: SkillActionConfig[] = [];
    this.pendingActions = this.pendingActions.filter((action) => {
      if (this.elapsedTime >= action.triggerTime) {
        triggered.push(action);
        return false; // 从未触发队列中移除
      }
      return true;
    });

    // 依次执行触发的动作节点
    for (const action of triggered) {
      SkillActionExecutor.execute(this.caster, this.target, action, this.castAngle);
    }

    // 动作列表执行完毕且已达到最大动作时长时销毁
    const isFinished = this.pendingActions.length === 0 && this.elapsedTime >= this.skill.castDuration;
    return isFinished;
  }
}
