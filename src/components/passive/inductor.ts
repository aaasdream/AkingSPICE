/**
 * 🧲 标准电感组件 - AkingSPICE 2.1
 * 
 * 线性电感元件的时域实现
 * 支持电流型和电压型伴随模型
 */

import { ComponentInterface, ValidationResult, ComponentInfo, AssemblyContext } from '../../core/interfaces/component';

/**
 * ⚡ 线性电感组件
 * 
 * 电感的基本关系: V = L * dI/dt
 * 
 * 时域离散化 (Backward Euler):
 * V(t) = L * (I(t) - I(t-Δt)) / Δt
 * 
 * 等效电路 (伴随模型):
 * R_eq = L / Δt  (等效电阻)
 * V_eq = L * I(t-Δt) / Δt  (等效电压源)
 */
export class Inductor implements ComponentInterface {
  readonly type = 'L';
  
  // 历史状态
  private _previousCurrent = 0;
  private _previousVoltage = 0;
  private _timeStep = 1e-6;
  
  // 电流支路索引 (用于扩展 MNA)
  private _currentIndex?: number;
  
  constructor(
    public readonly name: string,
    public readonly nodes: readonly [string, string],
    private readonly _inductance: number
  ) {
    if (_inductance <= 0) {
      throw new Error(`电感值必须为正数: ${_inductance}`);
    }
    if (!isFinite(_inductance) || isNaN(_inductance)) {
      throw new Error(`电感值必须为有限数值: ${_inductance}`);
    }
    if (nodes.length !== 2) {
      throw new Error(`电感必须连接两个节点，实际: ${nodes.length}`);
    }
    if (nodes[0] === nodes[1]) {
      throw new Error(`电感不能连接到同一节点: ${nodes[0]}`);
    }
    
    // 初始化历史状态为零（电感初始条件）
    this._previousCurrent = 0.0;
    this._previousVoltage = 0.0;
  }
  
  /**
   * 🎯 获取电感值
   */
  get inductance(): number {
    return this._inductance;
  }
  
  /**
   * 📊 获取历史电流
   */
  get previousCurrent(): number {
    return this._previousCurrent;
  }
  
  /**
   * ✅ 统一组装方法 (NEW!)
   */
  assemble(context: AssemblyContext): void {
    const n1 = context.nodeMap.get(this.nodes[0]);
    const n2 = context.nodeMap.get(this.nodes[1]);
    
    if (this._currentIndex === undefined) {
      throw new Error(`电感 ${this.name} 的电流支路索引未设置`);
    }
    
    const iL = this._currentIndex;
    const Req = this._inductance / this._timeStep;
    const Veq = Req * this._previousCurrent;
    
    // B 矩阵: 节点到支路的关联矩阵
    if (n1 !== undefined && n1 >= 0) {
      context.matrix.add(n1, iL, 1);
    }
    if (n2 !== undefined && n2 >= 0) {
      context.matrix.add(n2, iL, -1);
    }
    
    // C 矩阵: 支路到节点的关联矩阵 (B^T)
    if (n1 !== undefined && n1 >= 0) {
      context.matrix.add(iL, n1, 1);
    }
    if (n2 !== undefined && n2 >= 0) {
      context.matrix.add(iL, n2, -1);
    }
    
    // D 矩阵: 支路阻抗
    context.matrix.add(iL, iL, -Req);
    
    // 等效电压源
    context.rhs.add(iL, Veq);
  }

  /**
   * ⚡️ 检查此组件是否可能产生事件
   * 
   * 对于线性电感，它本身不产生事件。
   */
  hasEvents(): boolean {
    return false;
  }

  /**
   * 🔢 设置电流支路索引
   */
  setCurrentIndex(index: number): void {
    if (index < 0) {
      throw new Error(`电感 ${this.name} 的电流索引必须为非负数: ${index}`);
    }
    this._currentIndex = index;
  }
  
  /**
   * 🔍 检查电流索引是否已设置
   */
  hasCurrentIndexSet(): boolean {
    return this._currentIndex !== undefined;
  }
  
  /**
   * ⏱️ 设置时间步长
   */
  setTimeStep(dt: number): void {
    if (dt <= 0) {
      throw new Error(`时间步长必须为正数: ${dt}`);
    }
    if (!isFinite(dt) || isNaN(dt)) {
      throw new Error(`时间步长必须为有限数值: ${dt}`);
    }
    if (dt > 1e-3) {
      console.warn(`电感 ${this.name} 的时间步长过大，可能导致数值不稳定: ${dt}s，建议小于1ms`);
    }
    this._timeStep = dt;
  }
  
  /**
   * 📈 更新历史状态
   */
  updateHistory(current: number, voltage: number): void {
    // 检查数值有效性
    if (!isFinite(current) || isNaN(current)) {
      console.warn(`电感 ${this.name} 的电流值无效: ${current}，使用前一值`);
      current = this._previousCurrent;
    }
    if (!isFinite(voltage) || isNaN(voltage)) {
      console.warn(`电感 ${this.name} 的电压值无效: ${voltage}，使用前一值`);
      voltage = this._previousVoltage;
    }
    
    this._previousCurrent = current;
    this._previousVoltage = voltage;
  }
  

  /**
   * 🔍 组件验证
   */
  validate(): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    
    // 检查电感值
    if (this._inductance <= 0) {
      errors.push(`电感值必须为正数: ${this._inductance}`);
    }
    
    // 检查是否为极小电感
    if (this._inductance < 1e-12) {
      warnings.push(`电感值过小可能被视为短路: ${this._inductance}H`);
    }
    
    // 检查是否为极大电感
    if (this._inductance > 1e6) {
      warnings.push(`电感值过大可能导致数值问题: ${this._inductance}H`);
    }
    
    // 检查节点连接
    if (this.nodes.length !== 2) {
      errors.push(`电感必须连接两个节点，实际: ${this.nodes.length}`);
    }
    
    if (this.nodes.length === 2 && this.nodes[0] === this.nodes[1]) {
      errors.push(`电感不能连接到同一节点: ${this.nodes[0]}`);
    }
    
    // 检查时间步长
    if (this._timeStep <= 0) {
      errors.push(`时间步长必须为正数: ${this._timeStep}`);
    }
    
    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }
  
  /**
   * 📊 获取组件信息
   */
  getInfo(): ComponentInfo {
    return {
      type: this.type,
      name: this.name,
      nodes: [...this.nodes],
      parameters: {
        inductance: this._inductance,
        timeStep: this._timeStep,
        previousCurrent: this._previousCurrent,
        previousVoltage: this._previousVoltage,
        currentIndex: this._currentIndex,
        equivalentResistance: this._inductance / this._timeStep
      },
      units: {
        inductance: 'H',
        timeStep: 's',
        previousCurrent: 'A',
        previousVoltage: 'V',
        currentIndex: '#',
        equivalentResistance: 'Ω'
      }
    };
  }
  
  /**
   * ⚡ 计算瞬时电压
   * 
   * V = L * dI/dt ≈ L * (I - I_prev) / Δt
   */
  calculateVoltage(currentCurrent: number): number {
    return this._inductance * (currentCurrent - this._previousCurrent) / this._timeStep;
  }
  
  /**
   * 🧲 计算储存能量
   * 
   * E = 0.5 * L * I²
   */
  calculateEnergy(current: number): number {
    return 0.5 * this._inductance * current * current;
  }
  

  /**
   * 🏃‍♂️ 获取需要的额外变量数量
   */
  getExtraVariableCount(): number {
    return 1; // 需要一个电流变量
  }
  
  /**
   * 🔍 调试信息
   */
  toString(): string {
    return `${this.name}: L=${this._inductance}H between ${this.nodes[0]} and ${this.nodes[1]}`;
  }
}

/**
 * 🏭 电感工厂函数
 */
export namespace InductorFactory {
  /**
   * 创建标准电感
   */
  export function create(name: string, nodes: [string, string], inductance: number): Inductor {
    return new Inductor(name, nodes, inductance);
  }
  
  /**
   * 创建标准系列电感 (E12系列)
   */
  export function createStandardValue(
    name: string, 
    nodes: [string, string], 
    baseValue: number,
    multiplier: number = 1
  ): Inductor {
    const standardValues = [1.0, 1.2, 1.5, 1.8, 2.2, 2.7, 3.3, 3.9, 4.7, 5.6, 6.8, 8.2];
    
    const closest = standardValues.reduce((prev, curr) => 
      Math.abs(curr - baseValue) < Math.abs(prev - baseValue) ? curr : prev
    );
    
    return new Inductor(name, nodes, closest * multiplier);
  }
  
  /**
   * 创建功率电感 (常用于开关电源)
   */
  export function createPowerInductor(
    name: string,
    nodes: [string, string], 
    inductance: number,
    _saturationCurrent: number
  ): Inductor {
    const inductor = new Inductor(name, nodes, inductance);
    // 可以扩展饱和电流特性
    return inductor;
  }
  
  /**
   * 创建空心电感 (低损耗，用于高频)
   */
  export function createAirCore(
    name: string,
    nodes: [string, string], 
    inductance: number
  ): Inductor {
    return new Inductor(name, nodes, inductance);
  }
}

/**
 * 🧪 电感测试工具
 */
export namespace InductorTest {
  /**
   * 验证电感基本关系
   */
  export function verifyInductanceRelation(
    inductance: number, 
    currentChange: number, 
    timeStep: number
  ): number {
    return inductance * currentChange / timeStep;
  }
  
  /**
   * 验证能量计算
   */
  export function verifyEnergyCalculation(inductance: number, current: number): number {
    return 0.5 * inductance * current * current;
  }
  
  /**
   * RL 时间常数计算
   */
  export function calculateTimeConstant(resistance: number, inductance: number): number {
    return inductance / resistance;
  }
  
  /**
   * 谐振频率计算 (LC 电路)
   */
  export function calculateResonantFrequency(inductance: number, capacitance: number): number {
    return 1 / (2 * Math.PI * Math.sqrt(inductance * capacitance));
  }
}