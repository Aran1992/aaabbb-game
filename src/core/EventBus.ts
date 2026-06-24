export type BattleEventMap = {
  UnitSpawned: { id: number; type: 'hero' | 'enemy'; x: number; y: number; maxHp: number; radius: number };
  UnitMoved: { id: number; x: number; y: number };
  UnitDead: { id: number };
  UnitHpChanged: { id: number; curHp: number; maxHp: number; change: number; isCrit: boolean };
  BulletSpawned: { id: number; type: string; x: number; y: number; radius: number };
  BulletMoved: { id: number; x: number; y: number };
  BulletDestroyed: { id: number };
  SkillCast: { unitId: number; skillId: string; duration: number };
  BuffApplied: { unitId: number; buffId: string; stacks: number; duration: number };
  BuffRemoved: { unitId: number; buffId: string };
  DayNightChanged: { ratio: number; isNight: boolean };
};

export type BattleEventName = keyof BattleEventMap;
export type BattleEventListener<T extends BattleEventName> = (data: BattleEventMap[T]) => void;

export class EventBus {
  private listeners: { [K in BattleEventName]?: Set<BattleEventListener<K>> } = {};

  on<K extends BattleEventName>(event: K, listener: BattleEventListener<K>): void {
    if (!this.listeners[event]) {
      this.listeners[event] = new Set();
    }
    this.listeners[event]!.add(listener);
  }

  off<K extends BattleEventName>(event: K, listener: BattleEventListener<K>): void {
    const set = this.listeners[event];
    if (set) {
      set.delete(listener);
    }
  }

  emit<K extends BattleEventName>(event: K, data: BattleEventMap[K]): void {
    const set = this.listeners[event];
    if (set) {
      for (const listener of set) {
        listener(data);
      }
    }
  }

  clear(): void {
    this.listeners = {};
  }
}
