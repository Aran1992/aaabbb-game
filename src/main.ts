import { Application, Graphics, Container, Text } from 'pixi.js';
import { Engine } from './core/Engine';
import { Unit } from './core/Unit';
import { AttributeType } from './core/Attribute';
import { SkillConfig } from './core/skill/Skill';

// 粒子系统定义
interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: number;
  radius: number;
  alpha: number;
  life: number;
  maxLife: number;
}

// 飘字系统定义
interface DamageText {
  container: Container;
  vy: number;
  life: number;
  maxLife: number;
}

(async () => {
  // 1. 初始化 PixiJS 8 应用程序
  const app = new Application();
  await app.init({
    width: window.innerWidth,
    height: window.innerHeight,
    antialias: true,
    backgroundColor: 0x07080b,
    resizeTo: window,
  });
  document.getElementById('app')?.appendChild(app.canvas);

  // 2. 初始化逻辑引擎
  const engine = new Engine();

  // 渲染容器
  const worldContainer = new Container();
  app.stage.addChild(worldContainer);

  const unitViews: Map<number, Container> = new Map();
  const bulletViews: Map<number, Container> = new Map();
  const particles: Set<Particle> = new Set();
  const damageTexts: Set<DamageText> = new Set();

  interface LightningBranch {
    graphics: Graphics;
    alpha: number;
    life: number;
    maxLife: number;
  }
  const lightningBranches: Set<LightningBranch> = new Set();

  let totalKills = 0;
  let totalDamageThisSecond = 0;
  let lastDpsCalcTime = 0;

  // 3. 注册事件监听（解耦架构核心）
  engine.eventBus.on('UnitSpawned', (data) => {
    const container = new Container();
    container.x = data.x;
    container.y = data.y;

    let charStr = '我';
    let charColor = 0xfff3c4; // 主角金黄
    let strokeColor = 0x9a3412; // 主角暗红描边
    let glowColor = 0xfacc15; // 主角金光外发光
    let fontSize = 26;

    if (data.type === 'hero') {
      const textNode = new Text({
        text: charStr,
        style: {
          fontFamily: 'SimHei, Microsoft YaHei, monospace',
          fontSize: fontSize,
          fill: charColor,
          fontWeight: 'bold',
          stroke: { color: strokeColor, width: 4 },
          dropShadow: {
            alpha: 0.95,
            angle: 0,
            blur: 10,
            color: glowColor,
            distance: 0,
          }
        }
      });
      textNode.anchor.set(0.5);
      container.addChild(textNode);
      (container as any).customColor = glowColor;
    } else {
      // 怪物：根据 enemyType 决定字的类型和大小
      const unit = engine.units.get(data.id);
      const enemyType = unit?.enemyType ?? 'jiang';

      if (enemyType === 'jiang') {
        charStr = '僵';
        charColor = 0x86efac; // 莹绿
        strokeColor = 0x14532d;
        glowColor = 0x22c55e;
        fontSize = 18;
      } else if (enemyType === 'shi') {
        charStr = '尸';
        charColor = 0xc0a080; // 枯骨黄褐
        strokeColor = 0x451a03;
        glowColor = 0xd97706; // 橙黄暗光
        fontSize = 23;
      } else if (enemyType === 'gui') {
        charStr = '鬼';
        charColor = 0xf472b6; // 幽紫粉
        strokeColor = 0x581c87;
        glowColor = 0xc084fc; // 紫光
        fontSize = 29;
      } else if (enemyType === 'mo') {
        charStr = '魔';
        charColor = 0xff8888; // 深渊亮红
        strokeColor = 0x7f1d1d; // 深红
        glowColor = 0xef4444; // 血光
        fontSize = 37;
      }

      const textNode = new Text({
        text: charStr,
        style: {
          fontFamily: 'SimHei, Microsoft YaHei, monospace',
          fontSize: fontSize,
          fill: charColor,
          fontWeight: 'bold',
          stroke: { color: strokeColor, width: 4 },
          dropShadow: {
            alpha: 0.95,
            angle: 0,
            blur: 8,
            color: glowColor,
            distance: 0,
          }
        }
      });
      textNode.anchor.set(0.5);
      container.addChild(textNode);
      (container as any).customColor = glowColor;
    }

    // 绘制血条，血条高度根据 radius 自适应
    const hpBar = new Graphics();
    const barY = -data.radius - 12;
    // 绿色/红色血条背景
    hpBar.rect(-15, barY, 30, 4);
    hpBar.fill(0x1e293b);
    
    // 绿色/红色血条填充
    hpBar.rect(-15, barY, 30, 4);
    const barFillColor = data.type === 'hero' ? 0x10b981 : glowColor;
    hpBar.fill(barFillColor);
    hpBar.name = 'hp_bar';
    container.addChild(hpBar);

    worldContainer.addChild(container);
    unitViews.set(data.id, container);
  });

  engine.eventBus.on('UnitMoved', (data) => {
    const view = unitViews.get(data.id);
    if (view) {
      view.x = data.x;
      view.y = data.y;
    }
  });

  engine.eventBus.on('UnitHpChanged', (data) => {
    const view = unitViews.get(data.id);
    if (view) {
      const hpBar = view.getChildByName('hp_bar') as Graphics;
      if (hpBar) {
        const ratio = Math.max(0, data.curHp / data.maxHp);
        hpBar.clear();
        
        // 重新绘制血条，自适应高度
        const unit = engine.units.get(data.id);
        const radius = unit ? unit.radius : 12;
        const barY = -radius - 12;

        hpBar.rect(-15, barY, 30, 4);
        hpBar.fill(0x1e293b);
        
        hpBar.rect(-15, barY, 30 * ratio, 4);
        const barColor = data.id === engine.hero?.id ? 0x10b981 : ((view as any).customColor ?? 0xef4444);
        hpBar.fill(barColor);
      }
    }

    // 飘字伤害显示
    if (data.change < 0) {
      createDamageFloatingText(view ? view.x : 0, view ? view.y - 20 : 0, Math.abs(data.change), data.isCrit);
      totalDamageThisSecond += Math.abs(data.change);
    }
  });

  engine.eventBus.on('UnitDead', (data) => {
    const view = unitViews.get(data.id);
    if (view) {
      // 产生粒子爆裂效果，使用该怪物独特的颜色
      const deathColor = (view as any).customColor ?? (data.id === engine.hero?.id ? 0xfacc15 : 0xef4444);
      spawnExplosionParticles(view.x, view.y, deathColor, 25);
      worldContainer.removeChild(view);
      view.destroy({ children: true });
      unitViews.delete(data.id);
    }
    if (data.id !== engine.hero?.id) {
      totalKills++;
      const killsVal = document.getElementById('val-kills');
      if (killsVal) killsVal.innerText = totalKills.toString();
    }
  });

  let orbitIndex = 0;
  engine.eventBus.on('BulletSpawned', (data) => {
    const bulletContainer = new Container();
    bulletContainer.x = data.x;
    bulletContainer.y = data.y;

    let customColor = 0x38bdf8;

    if (data.type === 'linear') {
      // 穿透道符：黄色字，深红描边，橙黄色发光
      const textNode = new Text({
        text: '符',
        style: {
          fontFamily: 'SimHei, Microsoft YaHei, monospace',
          fontSize: 16,
          fill: 0xfff066,
          fontWeight: 'bold',
          stroke: { color: 0x9a3412, width: 3 },
          dropShadow: {
            alpha: 0.9,
            angle: 0,
            blur: 6,
            color: 0xeab308,
            distance: 0,
          }
        }
      });
      textNode.anchor.set(0.5);
      bulletContainer.addChild(textNode);
      customColor = 0xfacc15;
    } else if (data.type === 'tracking') {
      // 追踪符：粉紫字，深紫描边，紫色发光
      const textNode = new Text({
        text: '符',
        style: {
          fontFamily: 'SimHei, Microsoft YaHei, monospace',
          fontSize: 14,
          fill: 0xf5d0fe,
          fontWeight: 'bold',
          stroke: { color: 0x701a75, width: 3 },
          dropShadow: {
            alpha: 0.9,
            angle: 0,
            blur: 6,
            color: 0xd946ef,
            distance: 0,
          }
        }
      });
      textNode.anchor.set(0.5);
      bulletContainer.addChild(textNode);
      customColor = 0xd946ef;
    } else if (data.type === 'orbit') {
      // 护盾：“护”和“盾”间隔
      const char = (orbitIndex++ % 2 === 0) ? '护' : '盾';
      const textNode = new Text({
        text: char,
        style: {
          fontFamily: 'SimHei, Microsoft YaHei, monospace',
          fontSize: 15,
          fill: 0xe0f2fe, // 极亮冰蓝
          fontWeight: 'bold',
          stroke: { color: 0x0369a1, width: 3 }, // 深蓝描边
          dropShadow: {
            alpha: 0.9,
            angle: 0,
            blur: 6,
            color: 0x0ea5e9, // 冰蓝发光
            distance: 0,
          }
        }
      });
      textNode.anchor.set(0.5);
      bulletContainer.addChild(textNode);
      customColor = 0x0ea5e9;
    } else if (data.type === 'area') {
      // 雷暴法阵：保留大范围的半透明紫色区域指示圈，圆心处绘制一个大尺寸、靛蓝色外发光、白色中心的“雷”字。
      const circleGraphics = new Graphics();
      circleGraphics.circle(0, 0, data.radius);
      circleGraphics.fill({ color: 0x8b5cf6, alpha: 0.12 });
      circleGraphics.stroke({ color: 0xa78bfa, width: 2, alpha: 0.7 });
      bulletContainer.addChild(circleGraphics);

      const textNode = new Text({
        text: '雷',
        style: {
          fontFamily: 'SimHei, Microsoft YaHei, monospace',
          fontSize: 32,
          fill: 0xffffff,
          fontWeight: 'bold',
          stroke: { color: 0x4338ca, width: 4 },
          dropShadow: {
            alpha: 0.95,
            angle: 0,
            blur: 12,
            color: 0x6366f1, // 靛蓝发光
            distance: 0,
          }
        }
      });
      textNode.anchor.set(0.5);
      
      // 动画初始状态：从天而降，极细长的高空状态
      textNode.y = -600;
      textNode.scale.set(0.1, 4.0);
      
      bulletContainer.addChild(textNode);
      customColor = 0x818cf8;

      // 挂载动画所需状态
      (bulletContainer as any).lightningText = textNode;
      (bulletContainer as any).animTime = 0;
      (bulletContainer as any).animDuration = 0.16; // 0.16秒落地，极具冲击力
      (bulletContainer as any).isFalling = true;
      (bulletContainer as any).isLanded = false;
    }

    (bulletContainer as any).customColor = customColor;
    worldContainer.addChild(bulletContainer);
    bulletViews.set(data.id, bulletContainer);
  });

  engine.eventBus.on('BulletMoved', (data) => {
    const view = bulletViews.get(data.id);
    if (view) {
      // 产生少许拖尾粒子，使用子弹类型颜色
      if (engine.curFrame % 2 === 0) {
        const color = (view as any).customColor ?? 0x38bdf8;
        spawnTrailParticle(view.x, view.y, color);
      }
      view.x = data.x;
      view.y = data.y;
    }
  });

  engine.eventBus.on('BulletDestroyed', (data) => {
    const view = bulletViews.get(data.id);
    if (view) {
      const color = (view as any).customColor ?? 0x38bdf8;
      if ((view as any).lightningText) {
        // 落雷法阵消逝：较多电光粒子
        spawnExplosionParticles(view.x, view.y, 0x6366f1, 14, 2.0);
        spawnExplosionParticles(view.x, view.y, 0xa78bfa, 8, 1.5);
      } else {
        spawnExplosionParticles(view.x, view.y, color, 6, 1.5);
      }
      worldContainer.removeChild(view);
      view.destroy();
      bulletViews.delete(data.id);
    }
  });

  // 4. 创建英雄和初始化技能
  function createHero() {
    const screenCenter = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    const hero = new Unit(
      engine,
      engine.getNextId(),
      'hero',
      screenCenter.x,
      screenCenter.y,
      {
        MaxHp: 200,
        Speed: 220,
        Attack: 25,
        CritRate: 0.15,
        CritDamage: 2.0,
        CooldownReduction: 0.1,
      }
    );
    engine.addUnit(hero);

    // 添加默认技能配置
    applySkillsFromSliders(hero);
  }

  // 从 HTML Slider 中读取参数并配置到英雄技能
  function applySkillsFromSliders(hero: Unit) {
    hero.skillCtrl.onDestroy(); // 清理旧技能

    // 1. 穿透矢技能 (Linear)
    const splitCount = parseInt((document.getElementById('cfg-split-count') as HTMLInputElement).value);
    const splitSpeed = parseInt((document.getElementById('cfg-split-speed') as HTMLInputElement).value);
    const splitPierce = parseInt((document.getElementById('cfg-split-pierce') as HTMLInputElement).value);
    const splitCd = parseFloat((document.getElementById('cfg-split-cd') as HTMLInputElement).value);

    const splitConfig: SkillConfig = {
      id: 'split_shot',
      name: '多重穿透箭',
      cooldown: splitCd,
      range: 350,
      castDuration: 0.1,
      actions: [
        {
          type: 'spawn_bullet',
          triggerTime: 0,
          params: {
            bulletType: 'linear',
            count: splitCount,
            spread: 30, // 散角 30 度
            speed: splitSpeed,
            pierce: splitPierce,
            damageMultiplier: 1.0,
            radius: 5,
          },
        },
      ],
    };

    // 2. 环绕护盾 (Orbit)
    const orbitCount = parseInt((document.getElementById('cfg-orbit-count') as HTMLInputElement).value);
    const orbitSpeed = parseFloat((document.getElementById('cfg-orbit-speed') as HTMLInputElement).value);
    const orbitRadius = parseInt((document.getElementById('cfg-orbit-radius') as HTMLInputElement).value);
    const orbitCd = parseFloat((document.getElementById('cfg-orbit-cd') as HTMLInputElement).value);

    const orbitConfig: SkillConfig = {
      id: 'orbit_shield',
      name: '旋转冰封护盾',
      cooldown: orbitCd,
      range: 200,
      castDuration: 0.1,
      actions: [
        {
          type: 'spawn_bullet',
          triggerTime: 0,
          params: {
            bulletType: 'orbit',
            count: orbitCount,
            angularSpeed: orbitSpeed,
            orbitRadius: orbitRadius,
            damageMultiplier: 0.6,
            radius: 6,
          },
        },
      ],
    };

    // 3. 落雷法阵 (Area)
    const areaRadius = parseInt((document.getElementById('cfg-area-radius') as HTMLInputElement).value);
    const areaDuration = parseFloat((document.getElementById('cfg-area-duration') as HTMLInputElement).value);
    const areaCd = parseFloat((document.getElementById('cfg-area-cd') as HTMLInputElement).value);

    const areaConfig: SkillConfig = {
      id: 'lightning_storm',
      name: '雷爆重击',
      cooldown: areaCd,
      range: 400,
      castDuration: 0.2,
      actions: [
        {
          type: 'spawn_bullet',
          triggerTime: 0.1,
          params: {
            bulletType: 'area',
            radius: areaRadius,
            duration: areaDuration,
            damageMultiplier: 2.2, // 高额范围爆发
          },
        },
      ],
    };

    hero.skillCtrl.addSkill(splitConfig);
    hero.skillCtrl.addSkill(orbitConfig);
    hero.skillCtrl.addSkill(areaConfig);
  }

  // 5. 键盘与玩家控制
  const keysPressed = new Set<string>();
  window.addEventListener('keydown', (e) => {
    keysPressed.add(e.key.toLowerCase());
  });
  window.addEventListener('keyup', (e) => {
    keysPressed.delete(e.key.toLowerCase());
  });

  // 6. 自动刷怪器
  let spawnMonsterTimer = 0;
  function handleMonsterSpawn(dt: number) {
    spawnMonsterTimer += dt;
    // 刷怪限制 120 只
    const monsterCount = Array.from(engine.units.values()).filter(u => u.type === 'enemy' && u.alive).length;
    
    if (monsterCount < 100 && spawnMonsterTimer >= 0.2) {
      spawnMonsterTimer = 0;

      // 在视口外随机产生一只小怪
      const hero = engine.hero;
      if (!hero || !hero.alive) return;

      const angle = engine.random() * Math.PI * 2;
      const dist = engine.randomRange(300, 650);
      const mx = hero.x + Math.cos(angle) * dist;
      const my = hero.y + Math.sin(angle) * dist;

      // 随时间增加一点小怪的最大 HP 和攻击力，产生渐进难度
      const difficultyFactor = 1 + engine.curTime / 60; // 每分钟难度翻倍

      // 随机决定怪物的恐怖级别
      const rand = engine.random();
      let enemyType: 'jiang' | 'shi' | 'gui' | 'mo' = 'jiang';
      let hpMultiplier = 0.8;
      let speedMultiplier = 1.1;
      let attackMultiplier = 0.8;

      if (rand < 0.5) { // 50% 概率为僵
        enemyType = 'jiang';
        hpMultiplier = 0.7;
        speedMultiplier = 1.15;
        attackMultiplier = 0.7;
      } else if (rand < 0.8) { // 30% 概率为尸
        enemyType = 'shi';
        hpMultiplier = 1.2;
        speedMultiplier = 0.95;
        attackMultiplier = 1.2;
      } else if (rand < 0.95) { // 15% 概率为鬼
        enemyType = 'gui';
        hpMultiplier = 2.0;
        speedMultiplier = 0.85;
        attackMultiplier = 2.0;
      } else { // 5% 概率为魔
        enemyType = 'mo';
        hpMultiplier = 3.5;
        speedMultiplier = 0.7;
        attackMultiplier = 3.5;
      }

      const monster = new Unit(
        engine,
        engine.getNextId(),
        'enemy',
        mx,
        my,
        {
          MaxHp: Math.round(40 * difficultyFactor * hpMultiplier),
          Speed: engine.randomRange(90, 130) * speedMultiplier,
          Attack: Math.round(8 * difficultyFactor * attackMultiplier),
          CritRate: enemyType === 'mo' ? 0.1 : 0.0,
        },
        enemyType
      );
      engine.addUnit(monster);
    }
  }

  // 7. 粒子效果逻辑
  function spawnExplosionParticles(x: number, y: number, color: number, count: number, speedScale = 3) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = (0.5 + Math.random() * 1.5) * speedScale;
      particles.add({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        color,
        radius: 1.5 + Math.random() * 2,
        alpha: 1.0,
        life: 0.4 + Math.random() * 0.4,
        maxLife: 0.8,
      });
    }
  }

  function spawnTrailParticle(x: number, y: number, color: number) {
    particles.add({
      x,
      y,
      vx: (Math.random() - 0.5) * 0.5,
      vy: (Math.random() - 0.5) * 0.5,
      color,
      radius: 1.2,
      alpha: 0.4,
      life: 0.15,
      maxLife: 0.15,
    });
  }

  // 产生折线闪电链
  function spawnLightningBranch(startX: number, startY: number, length: number, angle: number) {
    const g = new Graphics();
    g.moveTo(startX, startY);

    const segments = 4;
    const segLen = length / segments;
    const points: { x: number; y: number }[] = [{ x: startX, y: startY }];

    for (let i = 1; i <= segments; i++) {
      const baseTargetX = startX + Math.cos(angle) * (segLen * i);
      const baseTargetY = startY + Math.sin(angle) * (segLen * i);

      const perpAngle = angle + Math.PI / 2;
      const offset = (Math.random() - 0.5) * 12;

      const curX = baseTargetX + Math.cos(perpAngle) * offset;
      const curY = baseTargetY + Math.sin(perpAngle) * offset;
      points.push({ x: curX, y: curY });
    }

    // 绘制外围 Indigo 发光线条
    g.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
      g.lineTo(points[i].x, points[i].y);
    }
    g.stroke({ color: 0x6366f1, width: 5, alpha: 0.7 });

    // 绘制内部白色线条核心
    g.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
      g.lineTo(points[i].x, points[i].y);
    }
    g.stroke({ color: 0xffffff, width: 1.5, alpha: 1.0 });

    worldContainer.addChild(g);

    lightningBranches.add({
      graphics: g,
      alpha: 1.0,
      life: 0.12,
      maxLife: 0.12,
    });
  }

  function updateLightningBranches(dt: number) {
    for (const lb of lightningBranches) {
      lb.life -= dt;
      lb.alpha = Math.max(0, lb.life / lb.maxLife);
      lb.graphics.alpha = lb.alpha;
      if (lb.life <= 0) {
        worldContainer.removeChild(lb.graphics);
        lb.graphics.destroy();
        lightningBranches.delete(lb);
      }
    }
  }

  const particleGraphics = new Graphics();
  worldContainer.addChild(particleGraphics);

  function updateParticles(dt: number) {
    particleGraphics.clear();

    for (const p of particles) {
      p.x += p.vx * dt * 60;
      p.y += p.vy * dt * 60;
      p.life -= dt;
      p.alpha = Math.max(0, p.life / p.maxLife);

      if (p.life <= 0) {
        particles.delete(p);
      } else {
        particleGraphics.circle(p.x, p.y, p.radius);
        particleGraphics.fill({ color: p.color, alpha: p.alpha });
      }
    }
  }

  // 8. 伤害飘字逻辑 (PixiJS 8 规范)
  function createDamageFloatingText(x: number, y: number, damage: number, isCrit: boolean) {
    const textNode = new Text({
      text: damage.toString(),
      style: {
        fontFamily: 'monospace',
        fontSize: isCrit ? 22 : 14,
        fill: isCrit ? 0xef4444 : 0xf8fafc,
        stroke: { color: 0x000000, width: isCrit ? 4 : 2 },
        fontWeight: isCrit ? 'bold' : 'normal',
      }
    });
    
    // 设置锚点居中
    textNode.anchor.set(0.5);
    textNode.x = x + (Math.random() - 0.5) * 15;
    textNode.y = y;

    worldContainer.addChild(textNode);
    damageTexts.add({
      container: textNode,
      vy: isCrit ? -120 : -80,
      life: 0.6,
      maxLife: 0.6,
    });
  }

  function updateDamageTexts(dt: number) {
    for (const text of damageTexts) {
      text.container.y += text.vy * dt;
      text.life -= dt;
      text.container.alpha = Math.max(0, text.life / text.maxLife);

      if (text.life <= 0) {
        worldContainer.removeChild(text.container);
        text.container.destroy();
        damageTexts.delete(text);
      }
    }
  }

  // 9. 主 Ticker 渲染循环
  app.ticker.add((ticker) => {
    const dt = ticker.deltaTime / 60; // 转化为秒

    // 更新逻辑引擎
    if (engine.hero && engine.hero.alive) {
      // 键盘控制英雄位移
      let dx = 0;
      let dy = 0;
      if (keysPressed.has('w') || keysPressed.has('arrowup')) dy -= 1;
      if (keysPressed.has('s') || keysPressed.has('arrowdown')) dy += 1;
      if (keysPressed.has('a') || keysPressed.has('arrowleft')) dx -= 1;
      if (keysPressed.has('d') || keysPressed.has('arrowright')) dx += 1;

      if (dx !== 0 || dy !== 0) {
        const len = Math.sqrt(dx * dx + dy * dy);
        const speed = engine.hero.speed;
        engine.hero.x += (dx / len) * speed * dt;
        engine.hero.y += (dy / len) * speed * dt;

        // 边界限制
        engine.hero.x = Math.max(50, Math.min(window.innerWidth - 50, engine.hero.x));
        engine.hero.y = Math.max(50, Math.min(window.innerHeight - 50, engine.hero.y));

        engine.eventBus.emit('UnitMoved', {
          id: engine.hero.id,
          x: engine.hero.x,
          y: engine.hero.y,
        });
      }

      // 相机跟随主角：让 worldContainer 产生平滑偏移以使得 Hero 在屏幕中心
      const targetCamX = window.innerWidth / 2 - engine.hero.x;
      const targetCamY = window.innerHeight / 2 - engine.hero.y;
      worldContainer.x += (targetCamX - worldContainer.x) * 0.1;
      worldContainer.y += (targetCamY - worldContainer.y) * 0.1;
    }

    // 驱动物理与核心逻辑
    engine.update(dt);

    // 更新落雷动画表现
    for (const [bulletId, view] of bulletViews.entries()) {
      const viewAny = view as any;
      if (viewAny.isFalling) {
        viewAny.animTime += dt;
        let progress = viewAny.animTime / viewAny.animDuration;
        if (progress >= 1.0) {
          progress = 1.0;
          viewAny.isFalling = false;
          viewAny.isLanded = true;
          viewAny.landedTime = 0;

          // 落地瞬间！爆发出电火花粒子和折线闪电链
          const x = view.x;
          const y = view.y;
          for (let i = 0; i < 6; i++) {
            const angle = (i * Math.PI * 2) / 6 + (Math.random() - 0.5) * 0.4;
            const length = 50 + Math.random() * 50;
            spawnLightningBranch(x, y, length, angle);
          }
          // 电火花火花粒子效果
          spawnExplosionParticles(x, y, 0xffffff, 16, 5.0); // 耀眼白光
          spawnExplosionParticles(x, y, 0x6366f1, 16, 3.8); // 靛蓝电能
          spawnExplosionParticles(x, y, 0xa78bfa, 12, 2.5); // 紫色余波
        }

        const textNode = viewAny.lightningText;
        if (textNode) {
          // 加速下落公式 (1 - progress)^2
          textNode.y = -600 * Math.pow(1 - progress, 2);
          
          // 缩放控制：下落期窄长 (0.1, 4.0)，越接近地面 x轴迅速放大，落地瞬间达到 x=1.6
          textNode.scale.x = 0.1 + 1.5 * Math.pow(progress, 3);
          textNode.scale.y = 4.0 - 3.0 * Math.pow(progress, 2);
        }
      } else if (viewAny.isLanded) {
        viewAny.landedTime += dt;
        const textNode = viewAny.lightningText;
        if (textNode) {
          // 落地回弹：0.12秒内，从 x=1.6, y=1.0 恢复到 x=1.25, y=1.25 的粗壮雷字
          const landProgress = Math.min(1.0, viewAny.landedTime / 0.12);
          textNode.scale.x = 1.6 - 0.35 * landProgress;
          textNode.scale.y = 1.0 + 0.25 * landProgress;

          // 落地前 0.6 秒进行轻微颤抖，展现电能的不稳定感
          if (viewAny.landedTime < 0.6) {
            textNode.x = (Math.random() - 0.5) * 2;
            textNode.y = (Math.random() - 0.5) * 2;
          } else {
            textNode.x = 0;
            textNode.y = 0;
          }

          // 地面残留期间，每 4 帧在法阵内随机冒出小火花
          if (engine.curFrame % 4 === 0 && Math.random() < 0.5) {
            const rx = view.x + (Math.random() - 0.5) * 50;
            const ry = view.y + (Math.random() - 0.5) * 50;
            spawnExplosionParticles(rx, ry, 0x6366f1, 2, 1.2);
          }
        }
      }
    }

    // 粒子与飘字更新
    updateParticles(dt);
    updateLightningBranches(dt);
    updateDamageTexts(dt);

    // 怪物自动孵化
    handleMonsterSpawn(dt);

    // 更新控制面板状态数据
    updateUIStats(dt);
  });

  // 10. UI 数据刷新与 Slider 值绑定
  function updateUIStats(dt: number) {
    // FPS
    const fpsVal = document.getElementById('val-fps');
    if (fpsVal) fpsVal.innerText = Math.round(app.ticker.FPS).toString();

    // 怪物数量
    const monsterCount = Array.from(engine.units.values()).filter(u => u.type === 'enemy' && u.alive).length;
    const monsterVal = document.getElementById('val-monsters');
    if (monsterVal) monsterVal.innerText = monsterCount.toString();

    // DPS 计算 (每一秒刷新一次)
    const now = engine.curTime;
    if (now - lastDpsCalcTime >= 1.0) {
      const dpsVal = document.getElementById('val-dps');
      if (dpsVal) dpsVal.innerText = Math.round(totalDamageThisSecond / (now - lastDpsCalcTime)).toString();
      totalDamageThisSecond = 0;
      lastDpsCalcTime = now;
    }
  }

  // 绑定 Sliders 的 Label 交互
  function bindSliderLabel(sliderId: string, labelId: string, suffix = '') {
    const slider = document.getElementById(sliderId) as HTMLInputElement;
    const label = document.getElementById(labelId);
    if (slider && label) {
      slider.addEventListener('input', () => {
        label.innerText = slider.value + suffix;
      });
    }
  }

  bindSliderLabel('cfg-split-count', 'lbl-split-count');
  bindSliderLabel('cfg-split-speed', 'lbl-split-speed');
  bindSliderLabel('cfg-split-pierce', 'lbl-split-pierce');
  bindSliderLabel('cfg-split-cd', 'lbl-split-cd', 's');
  
  bindSliderLabel('cfg-orbit-count', 'lbl-orbit-count');
  bindSliderLabel('cfg-orbit-speed', 'lbl-orbit-speed');
  bindSliderLabel('cfg-orbit-radius', 'lbl-orbit-radius');
  bindSliderLabel('cfg-orbit-cd', 'lbl-orbit-cd', 's');

  bindSliderLabel('cfg-area-radius', 'lbl-area-radius');
  bindSliderLabel('cfg-area-duration', 'lbl-area-duration', 's');
  bindSliderLabel('cfg-area-cd', 'lbl-area-cd', 's');

  // 热重载应用按钮
  document.getElementById('btn-apply')?.addEventListener('click', () => {
    if (engine.hero && engine.hero.alive) {
      applySkillsFromSliders(engine.hero);
      // 在屏幕中心飘出“配置热重载成功”
      createDamageFloatingText(engine.hero.x, engine.hero.y - 40, 9999, true);
    }
  });

  // 重置战斗
  document.getElementById('btn-reset')?.addEventListener('click', () => {
    // 销毁所有渲染 Container
    for (const view of unitViews.values()) {
      worldContainer.removeChild(view);
      view.destroy({ children: true });
    }
    unitViews.clear();

    for (const view of bulletViews.values()) {
      worldContainer.removeChild(view);
      view.destroy();
    }
    bulletViews.clear();

    for (const text of damageTexts) {
      worldContainer.removeChild(text.container);
      text.container.destroy();
    }
    damageTexts.clear();
    particles.clear();
    for (const lb of lightningBranches) {
      worldContainer.removeChild(lb.graphics);
      lb.graphics.destroy();
    }
    lightningBranches.clear();

    engine.clear();
    
    totalKills = 0;
    totalDamageThisSecond = 0;
    lastDpsCalcTime = 0;

    const killsVal = document.getElementById('val-kills');
    if (killsVal) killsVal.innerText = '0';
    const dpsVal = document.getElementById('val-dps');
    if (dpsVal) dpsVal.innerText = '0';

    createHero();
  });

  // 11. 窗口缩放适配
  window.addEventListener('resize', () => {
    app.renderer.resize(window.innerWidth, window.innerHeight);
  });

  // 启动游戏
  createHero();

})();
