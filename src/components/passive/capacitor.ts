/**
 * 📏 标准电容组件 - AkingSPICE 2.1
 * 
 * 线性电容元件的时域实现
 * 支持 Backward Euler 和 Trapezoidal 积分方法
 */

import { ComponentInterface, ValidationResult, ComponentInfo } from '../../core/interfaces/component';
import { SparseMatrix } from '../../math/sparse/matrix';
import { Vector } from '../../math/sparse/vector';

/**
 * 🔋 线性电容组件
 * 
 * 电容的基本关系: I = C * dV/dt
 * 
 * 时域离散化 (Backward Euler):
 * I(t) = C * (V(t) - V(t-Δt)) / Δt
 * 
 * 等效电路 (伴随模型):
 * G_eq = C / Δt
 * I_eq = C * V(t-Δt) / Δt
 */
export class Capacitor implements ComponentInterface {
  readonly type = 'C';
  
  // 历史状态 (用于时间积分)
  private _previousVoltage = 0;
  private _previousCurrent = 0;
  private _timeStep = 1e-6; // 默认时间步长
  
  constructor(
    public readonly name: string,
    public readonly nodes: readonly [string, string],
    private readonly _capacitance: number
  ) {
    if (_capacitance <= 0) {
      throw new Error(`电容值必须为正数: ${_capacitance}`);
    }
    if (nodes.length !== 2) {
      throw new Error(`电容必须连接两个节点，实际: ${nodes.length}`);
    }
    if (nodes[0] === nodes[1]) {
      throw new Error(`电容不能连接到同一节点: ${nodes[0]}`);
    }
  }
  
  /**
   * 🎯 获取电容值
   */
  get capacitance(): number {
    return this._capacitance;
  }
  
  /**
   * 📊 获取历史电压
   */
  get previousVoltage(): number {
    return this._previousVoltage;
  }
  
  /**
   * ⏱️ 设置时间步长
   */
  setTimeStep(dt: number): void {
    if (dt <= 0) {
      throw new Error(`时间步长必须为正数: ${dt}`);
    }
    this._timeStep = dt;
  }
  
  /**
   * 📈 更新历史状态
   */
  updateHistory(voltage: number, current: number): void {
    this._previousVoltage = voltage;
    this._previousCurrent = current;
  }
  
  /**
   * 🔥 MNA 矩阵装配 (Backward Euler)
   * 
   * 伴随模型:
   * G_eq = C / Δt  (等效电导)
   * I_eq = G_eq * V_prev  (等效电流源)
   * 
   * 矩阵装配:
   * [G_eq  -G_eq] [V1]   [I_eq ]
   * [-G_eq  G_eq] [V2] = [-I_eq]
   */
  stamp(
    matrix: SparseMatrix, 
    rhs: Vector, 
    nodeMap: Map<string, number>,
    currentTime?: number
  ): void {
    const n1 = nodeMap.get(this.nodes[0]);
    const n2 = nodeMap.get(this.nodes[1]);
    
    // 等效电导 G_eq = C / Δt
    const geq = this._capacitance / this._timeStep;
    
    // 等效电流源 I_eq = G_eq * V_prev
    const ieq = geq * this._previousVoltage;
    
    // 装配电导矩阵 (类似电阻)
    if (n1 !== undefined && n1 >= 0) {
      matrix.add(n1, n1, geq);
      
      if (n2 !== undefined && n2 >= 0) {
        matrix.add(n1, n2, -geq);
      }
    }
    
    if (n2 !== undefined && n2 >= 0) {
      matrix.add(n2, n2, geq);
      
      if (n1 !== undefined && n1 >= 0) {
        matrix.add(n2, n1, -geq);
      }
    }
    
    // 装配等效电流源到右侧向量
    if (n1 !== undefined && n1 >= 0) {
      rhs.add(n1, ieq);
    }
    if (n2 !== undefined && n2 >= 0) {
      rhs.add(n2, -ieq);
    }
  }
  
  /**
   * 🔍 组件验证
   */
  validate(): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    
    // 检查电容值
    if (this._capacitance <= 0) {
      errors.push(`电容值必须为正数: ${this._capacitance}`);
    }
    
    // 检查是否为极小电容
    if (this._capacitance < 1e-15) {
      warnings.push(`电容值过小可能被忽略: ${this._capacitance}F`);
    }
    
    // 检查是否为极大电容
    if (this._capacitance > 1e3) {
      warnings.push(`电容值过大可能导致数值问题: ${this._capacitance}F`);
    }
    
    // 检查节点连接
    if (this.nodes.length !== 2) {
      errors.push(`电容必须连接两个节点，实际: ${this.nodes.length}`);
    }
    
    if (this.nodes.length === 2 && this.nodes[0] === this.nodes[1]) {
      errors.push(`电容不能连接到同一节点: ${this.nodes[0]}`);
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
        capacitance: this._capacitance,
        timeStep: this._timeStep,
        previousVoltage: this._previousVoltage,
        previousCurrent: this._previousCurrent,
        equivalentConductance: this._capacitance / this._timeStep
      },
      units: {
        capacitance: 'F',
        timeStep: 's',
        previousVoltage: 'V',
        previousCurrent: 'A',
        equivalentConductance: 'S'
      }
    };
  }
  
  /**
   * ⚡ 计算瞬时电流
   * 
   * I = C * dV/dt ≈ C * (V - V_prev) / Δt
   */
  calculateCurrent(currentVoltage: number): number {
    return this._capacitance * (currentVoltage - this._previousVoltage) / this._timeStep;
  }
  
  /**
   * 🔋 计算储存能量
   * 
   * E = 0.5 * C * V²
   */
  calculateEnergy(voltage: number): number {
    return 0.5 * this._capacitance * voltage * voltage;
  }
  
  /**
   * 🔄 梯形积分方法装配 (可选的高精度方法)
   */
  stampTrapezoidal(
    matrix: SparseMatrix, 
    rhs: Vector, 
    nodeMap: Map<string, number>
  ): void {
    const n1 = nodeMap.get(this.nodes[0]);
    const n2 = nodeMap.get(this.nodes[1]);
    
    // 梯形公式: G_eq = 2C / Δt
    const geq = 2 * this._capacitance / this._timeStep;
    
    // 等效电流源包含历史项
    const ieq = geq * this._previousVoltage + this._previousCurrent;
    
    // 装配矩阵
    if (n1 !== undefined && n1 >= 0) {
      matrix.add(n1, n1, geq);
      if (n2 !== undefined && n2 >= 0) {
        matrix.add(n1, n2, -geq);
      }
    }
    
    if (n2 !== undefined && n2 >= 0) {
      matrix.add(n2, n2, geq);
      if (n1 !== undefined && n1 >= 0) {
        matrix.add(n2, n1, -geq);
      }
    }
    
    // 装配右侧向量
    if (n1 !== undefined && n1 >= 0) {
      rhs.add(n1, ieq);
    }
    if (n2 !== undefined && n2 >= 0) {
      rhs.add(n2, -ieq);
    }
  }
  
  /**
   * 🔍 调试信息
   */
  toString(): string {
    return `${this.name}: C=${this._capacitance}F between ${this.nodes[0]} and ${this.nodes[1]}`;
  }
}

/**
 * 🏭 电容工厂函数
 */
export namespace CapacitorFactory {
  /**
   * 创建标准电容
   */
  export function create(name: string, nodes: [string, string], capacitance: number): Capacitor {
    return new Capacitor(name, nodes, capacitance);
  }
  
  /**
   * 创建标准系列电容 (E6系列)
   */
  export function createStandardValue(
    name: string, 
    nodes: [string, string], 
    baseValue: number,
    multiplier: number = 1
  ): Capacitor {
    const standardValues = [1.0, 1.5, 2.2, 3.3, 4.7, 6.8];
    
    const closest = standardValues.reduce((prev, curr) => 
      Math.abs(curr - baseValue) < Math.abs(prev - baseValue) ? curr : prev
    );
    
    return new Capacitor(name, nodes, closest * multiplier);
  }
  
  /**
   * 创建陶瓷电容 (常用于高频)
   */
  export function createCeramic(
    name: string,
    nodes: [string, string], 
    capacitance: number
  ): Capacitor {
    return new Capacitor(name, nodes, capacitance);
  }
  
  /**
   * 创建电解电容 (常用于电源滤波)
   */
  export function createElectrolytic(
    name: string,
    nodes: [string, string], 
    capacitance: number
  ): Capacitor {
    const cap = new Capacitor(name, nodes, capacitance);
    // 电解电容通常有极性，这里可以扩展
    return cap;
  }
}

/**
 * 🧪 电容测试工具
 */
export namespace CapacitorTest {
  /**
   * 验证电容基本关系
   */
  export function verifyCapacitanceRelation(
    capacitance: number, 
    voltageChange: number, 
    timeStep: number
  ): number {
    return capacitance * voltageChange / timeStep;
  }
  
  /**
   * 验证能量计算
   */
  export function verifyEnergyCalculation(capacitance: number, voltage: number): number {
    return 0.5 * capacitance * voltage * voltage;
  }
  
  /**
   * RC 时间常数计算
   */
  export function calculateTimeConstant(resistance: number, capacitance: number): number {
    return resistance * capacitance;
  }
}