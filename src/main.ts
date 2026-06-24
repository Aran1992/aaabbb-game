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
  const bulletViews: Map<number, Graphics> = new Map();
  const particles: Set<Particle> = new Set();
  const damageTexts: Set<DamageText> = new Set();

  let totalKills = 0;
  let totalDamageThisSecond = 0;
  let lastDpsCalcTime = 0;

  // 3. 注册事件监听（解耦架构核心）
  engine.eventBus.on('UnitSpawned', (data) => {
    const container = new Container();
    container.x = data.x;
    container.y = data.y;

    // 绘制单位形状
    const body = new Graphics();
    if (data.type === 'hero') {
      // 英雄：炫酷赛博蓝圆圈，带外描边发光感觉
      body.circle(0, 0, data.radius);
      body.fill(0x06b6d4);
      body.stroke({ color: 0x22d3ee, width: 3 });
    } else {
      // 怪物：暗红色圆圈
      body.circle(0, 0, data.radius);
      body.fill(0xef4444);
      body.stroke({ color: 0x991b1b, width: 2 });
    }
    container.addChild(body);

    // 绘制血条
    const hpBar = new Graphics();
    // 绿色/红色血条背景
    hpBar.rect(-15, -data.radius - 8, 30, 4);
    hpBar.fill(0x1e293b);
    
    // 绿色/红色血条填充
    hpBar.rect(-15, -data.radius - 8, 30, 4);
    hpBar.fill(data.type === 'hero' ? 0x10b981 : 0xef4444);
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
        // 重新绘制血条
        hpBar.rect(-15, -18, 30, 4);
        hpBar.fill(0x1e293b);
        
        hpBar.rect(-15, -18, 30 * ratio, 4);
        hpBar.fill(data.id === engine.hero?.id ? 0x10b981 : 0xef4444);
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
      // 产生粒子爆裂效果
      spawnExplosionParticles(view.x, view.y, data.id === engine.hero?.id ? 0x06b6d4 : 0xef4444, 25);
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

  engine.eventBus.on('BulletSpawned', (data) => {
    const bullet = new Graphics();
    bullet.x = data.x;
    bullet.y = data.y;

    if (data.type === 'linear') {
      // 直线子弹：炫酷赛博蓝光球
      bullet.circle(0, 0, data.radius);
      bullet.fill(0x38bdf8);
      bullet.stroke({ color: 0xffffff, width: 1.5 });
    } else if (data.type === 'tracking') {
      // 追踪弹：带有魔法紫色感觉的飞弹
      bullet.circle(0, 0, data.radius);
      bullet.fill(0xc084fc);
      bullet.stroke({ color: 0xe9d5ff, width: 1.5 });
    } else if (data.type === 'orbit') {
      // 冰球护盾：冰蓝色旋转冰球
      bullet.circle(0, 0, data.radius);
      bullet.fill(0x06b6d4);
      bullet.stroke({ color: 0xccfbf1, width: 2 });
    } else if (data.type === 'area') {
      // 雷暴法阵：绘制一个半透明淡紫色光环
      bullet.circle(0, 0, data.radius);
      bullet.fill({ color: 0x8b5cf6, alpha: 0.15 });
      bullet.stroke({ color: 0xa78bfa, width: 2, alpha: 0.8 });
    }

    worldContainer.addChild(bullet);
    bulletViews.set(data.id, bullet);
  });

  engine.eventBus.on('BulletMoved', (data) => {
    const view = bulletViews.get(data.id);
    if (view) {
      // 产生少许拖尾粒子
      if (engine.curFrame % 2 === 0) {
        spawnTrailParticle(view.x, view.y, 0x38bdf8);
      }
      view.x = data.x;
      view.y = data.y;
    }
  });

  engine.eventBus.on('BulletDestroyed', (data) => {
    const view = bulletViews.get(data.id);
    if (view) {
      // 播放小微粒消散
      spawnExplosionParticles(view.x, view.y, 0x38bdf8, 6, 1.5);
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
      const monster = new Unit(
        engine,
        engine.getNextId(),
        'enemy',
        mx,
        my,
        {
          MaxHp: Math.round(40 * difficultyFactor),
          Speed: engine.randomRange(90, 130),
          Attack: Math.round(8 * difficultyFactor),
          CritRate: 0.0,
        }
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

    // 粒子与飘字更新
    updateParticles(dt);
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
