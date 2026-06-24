import { Unit } from '../Unit';
import { LinearBullet, TrackingBullet, OrbitBullet, AreaEffectBullet } from '../bullet/BulletTypes';
import { BuffConfig } from '../buff/Buff';

export interface SkillActionConfig {
  type: 'spawn_bullet' | 'trigger_damage' | 'apply_buff';
  triggerTime: number; // 释放后多少秒触发 (秒)
  params: any; // 参数
}

export class SkillActionExecutor {
  static execute(
    caster: Unit,
    target: Unit | null,
    config: SkillActionConfig,
    castAngle: number
  ): void {
    const engine = caster.engine;

    // 计算是否暴击
    const isCrit = engine.random() < caster.critRate;
    const baseDamage = caster.attack;

    switch (config.type) {
      case 'spawn_bullet': {
        const p = config.params;
        const damage = Math.round(baseDamage * (p.damageMultiplier ?? 1.0));
        const bulletType = p.bulletType ?? 'linear';

        if (bulletType === 'linear') {
          const count = p.count ?? 1;
          const spread = (p.spread ?? 0) * Math.PI / 180; // 弧度
          const speed = p.speed ?? 300;
          const radius = p.radius ?? 6;
          const pierce = p.pierce ?? 1;

          // 计算每发子弹的偏转角
          const startAngle = castAngle - (spread * (count - 1)) / 2;
          for (let i = 0; i < count; i++) {
            const angle = startAngle + i * spread;
            const bulletId = engine.getNextId();
            const b = new LinearBullet(
              bulletId,
              caster,
              caster.x,
              caster.y,
              angle,
              speed,
              damage,
              isCrit,
              radius,
              pierce
            );
            engine.addBullet(b);
          }
        } else if (bulletType === 'tracking') {
          if (target && target.alive) {
            const bulletId = engine.getNextId();
            const speed = p.speed ?? 250;
            const radius = p.radius ?? 5;
            const b = new TrackingBullet(
              bulletId,
              caster,
              caster.x,
              caster.y,
              target,
              speed,
              damage,
              isCrit,
              radius
            );
            engine.addBullet(b);
          } else {
            // 没有目标时，尝试索敌
            const nearest = caster.findNearestEnemy(400);
            if (nearest) {
              const bulletId = engine.getNextId();
              const speed = p.speed ?? 250;
              const radius = p.radius ?? 5;
              const b = new TrackingBullet(
                bulletId,
                caster,
                caster.x,
                caster.y,
                nearest,
                speed,
                damage,
                isCrit,
                radius
              );
              engine.addBullet(b);
            }
          }
        } else if (bulletType === 'orbit') {
          // 环绕子弹，支持发射多颗呈环形排列
          const count = p.count ?? 1;
          const angularSpeed = p.angularSpeed ?? 3.0; // 弧度/秒
          const orbitRadius = p.orbitRadius ?? 50;
          const size = p.radius ?? 8;

          for (let i = 0; i < count; i++) {
            const initAngle = castAngle + (i * Math.PI * 2) / count;
            const bulletId = engine.getNextId();
            const b = new OrbitBullet(
              bulletId,
              caster,
              initAngle,
              angularSpeed,
              orbitRadius,
              damage,
              isCrit,
              size
            );
            engine.addBullet(b);
          }
        } else if (bulletType === 'area') {
          // 法阵/落雷
          const radius = p.radius ?? 60;
          const duration = p.duration ?? 3.0;
          // 生成位置：若有目标，生成在目标脚下；否则生成在施法者前方或脚下
          const tx = target ? target.x : caster.x + Math.cos(castAngle) * 80;
          const ty = target ? target.y : caster.y + Math.sin(castAngle) * 80;
          const bulletId = engine.getNextId();

          const b = new AreaEffectBullet(
            bulletId,
            caster,
            tx,
            ty,
            radius,
            duration,
            damage,
            isCrit
          );
          engine.addBullet(b);
        }
        break;
      }

      case 'trigger_damage': {
        const p = config.params;
        const damage = Math.round(baseDamage * (p.damageMultiplier ?? 1.0));
        const radius = p.radius ?? 80;

        // 圆形或扇形范围瞬时判定
        const enemies = engine.spatialHash.query(caster.x, caster.y, radius);
        for (const enemy of enemies) {
          if (enemy.alive) {
            const dx = enemy.x - caster.x;
            const dy = enemy.y - caster.y;
            const distSq = dx * dx + dy * dy;

            if (distSq <= radius * radius) {
              if (p.shape === 'sector') {
                const angle = Math.atan2(dy, dx);
                let diff = angle - castAngle;
                while (diff < -Math.PI) diff += Math.PI * 2;
                while (diff > Math.PI) diff -= Math.PI * 2;
                const spread = (p.spread ?? 60) * Math.PI / 180;
                if (Math.abs(diff) > spread / 2) {
                  continue; // 不在扇形夹角内
                }
              }
              enemy.takeDamage(damage, isCrit);
            }
          }
        }
        break;
      }

      case 'apply_buff': {
        const p = config.params;
        const buffCfg: BuffConfig = {
          id: p.buffId,
          name: p.name ?? '技能BUFF',
          duration: p.duration ?? 3.0,
          maxStacks: p.maxStacks ?? 1,
          modifiers: p.modifiers,
          tickInterval: p.tickInterval,
        };

        // 如果是持续毒伤 buff，附加 tick 处理
        if (p.buffId === 'poison' || p.buffId === 'burn') {
          buffCfg.onTick = (tgt) => {
            const tickDmg = Math.round(caster.attack * (p.tickDamageMultiplier ?? 0.2));
            tgt.takeDamage(tickDmg, false);
          };
        }

        const buffTarget = p.target === 'self' ? caster : target;
        if (buffTarget && buffTarget.alive) {
          buffTarget.buffCtrl.addBuff(buffCfg);
        }
        break;
      }
    }
  }
}
