export enum AttributeType {
  MaxHp = 'MaxHp',
  Speed = 'Speed',
  Attack = 'Attack',
  CritRate = 'CritRate',
  CritDamage = 'CritDamage',
  CooldownReduction = 'CooldownReduction', // 0 到 0.8
}

export interface AttributeModifier {
  id: string; // 唯一标识，如 "Buff_SpeedDown"
  type: 'flat' | 'percent'; // flat: 直接加减，percent: 百分比加减
  value: number; // 增加或减少的值，如果是 percent，0.1 表示增加 10%
}

export class Attribute {
  private baseValue: number;
  private modifiers: Map<string, AttributeModifier> = new Map();
  private _cachedValue: number;
  private isDirty = true;

  constructor(baseValue: number) {
    this.baseValue = baseValue;
    this._cachedValue = baseValue;
  }

  get value(): number {
    if (this.isDirty) {
      this._cachedValue = this.calculateValue();
      this.isDirty = false;
    }
    return this._cachedValue;
  }

  setBaseValue(val: number) {
    this.baseValue = val;
    this.isDirty = true;
  }

  getBaseValue(): number {
    return this.baseValue;
  }

  addModifier(modifier: AttributeModifier) {
    this.modifiers.set(modifier.id, modifier);
    this.isDirty = true;
  }

  removeModifier(id: string) {
    if (this.modifiers.delete(id)) {
      this.isDirty = true;
    }
  }

  clearModifiers() {
    this.modifiers.clear();
    this.isDirty = true;
  }

  private calculateValue(): number {
    let flatSum = 0;
    let percentSum = 0;

    for (const mod of this.modifiers.values()) {
      if (mod.type === 'flat') {
        flatSum += mod.value;
      } else if (mod.type === 'percent') {
        percentSum += mod.value;
      }
    }

    return (this.baseValue + flatSum) * (1 + percentSum);
  }
}
