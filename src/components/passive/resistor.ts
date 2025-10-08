/**
 * 🔌 标准电阻组件 - AkingSPICE 2.1
 * 
 * 线性电阻元件的精确实现
 * 遵循标准 SPICE 模型和 MNA 矩阵装配规则
 */

import { ComponentInterface, ValidationResult, ComponentInfo, AssemblyContext } from '../../core/interfaces/component';

/**
 * 🔧 线性电阻组件
 * 
 * 实现欧姆定律: V = I * R
 * 
 * MNA 装配规则:
 * - 电导 G = 1/R
 * - 节点 i: G[i,i] += G, G[i,j] -= G
 * - 节点 j: G[j,j] += G, G[j,i] -= G
 * 
 * 其中 i, j 为电阻连接的两个节点
 */
export class Resistor implements ComponentInterface {
  readonly type = 'R';
  
  constructor(
    public readonly name: string,
    public readonly nodes: readonly [string, string],
    private readonly _resistance: number
  ) {
    if (_resistance <= 0) {
      throw new Error(`电阻值必须为正数: ${_resistance}`);
    }
    if (nodes.length !== 2) {
      throw new Error(`电阻必须连接两个节点，实际: ${nodes.length}`);
    }
    if (nodes[0] === nodes[1]) {
      throw new Error(`电阻不能连接到同一节点: ${nodes[0]}`);
    }
  }
  
  /**
   * 🎯 获取电阻值
   */
  get resistance(): number {
    return this._resistance;
  }
  
  /**
   * 🎯 获取电导值
   */
  get conductance(): number {
    return 1.0 / this._resistance;
  }
  
  /**
   * ✅ 统一组装方法 (NEW!)
   * 
   * 使用新的统一接口装配电阻的 MNA 贡献
   * 替代传统的 stamp() 方法
   * 
   * @param context - 组装上下文
   */
  assemble(context: AssemblyContext): void {
    const n1 = context.nodeMap.get(this.nodes[0]);
    const n2 = context.nodeMap.get(this.nodes[1]);
    const g = this.conductance;

    if (n1 !== undefined && n1 >= 0) {
      context.matrix.add(n1, n1, g);
      if (n2 !== undefined && n2 >= 0) {
        context.matrix.add(n1, n2, -g);
      }
    }
    if (n2 !== undefined && n2 >= 0) {
      context.matrix.add(n2, n2, g);
      if (n1 !== undefined && n1 >= 0) {
        context.matrix.add(n2, n1, -g);
      }
    }
  }

  /**
   * ⚡️ 检查此组件是否可能产生事件
   * 
   * 对于线性电阻，它本身不产生事件。
   */
  hasEvents(): boolean {
    return false;
  }


  /**
   * 🔍 组件验证
   */
  validate(): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    
    // 检查电阻值
    if (this._resistance <= 0) {
      errors.push(`电阻值必须为正数: ${this._resistance}`);
    }
    
    // 检查是否为极小电阻（可能导致数值问题）
    if (this._resistance < 1e-12) {
      warnings.push(`电阻值过小可能导致数值不稳定: ${this._resistance}Ω`);
    }
    
    // 检查是否为极大电阻（可能导致矩阵病态）
    if (this._resistance > 1e12) {
      warnings.push(`电阻值过大可能导致矩阵病态: ${this._resistance}Ω`);
    }
    
    // 检查节点数
    if (this.nodes.length !== 2) {
      errors.push(`电阻必须连接两个节点，实际: ${this.nodes.length}`);
    }
    
    // 检查节点连接
    if (this.nodes.length === 2 && this.nodes[0] === this.nodes[1]) {
      errors.push(`电阻不能连接到同一节点: ${this.nodes[0]}`);
    }
    
    // 检查节点名称
    for (const node of this.nodes) {
      if (!node || node.trim() === '') {
        errors.push('节点名称不能为空');
        break;
      }
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
        resistance: this._resistance,
        conductance: this.conductance,
        power_rating: 'N/A',  // 可在子类中扩展
        tolerance: 'N/A'      // 可在子类中扩展
      },
      units: {
        resistance: 'Ω',
        conductance: 'S',
        power_rating: 'W',
        tolerance: '%'
      }
    };
  }
  
  /**
   * 📐 计算功耗
   * 
   * P = I²R = V²/R
   * 
   * @param voltage - 跨阻电压
   * @param current - 通过电阻的电流
   * @returns 瞬时功耗 (W)
   */
  calculatePower(voltage: number, current: number): number {
    // 验证电压电流一致性（欧姆定律：V = I * R）
    const expectedCurrent = voltage / this._resistance;
    const currentTolerance = 1e-9;
    
    if (Math.abs(current - expectedCurrent) > currentTolerance) {
      console.warn(`电阻 ${this.name} 电压电流不一致: V=${voltage}V, I=${current}A, 期望I=${expectedCurrent}A`);
    }
    
    // 使用电压计算（更稳定）
    return (voltage * voltage) / this._resistance;
  }
  
  /**
   * 🌡️ 计算温度系数修正
   * 
   * R(T) = R₀ * [1 + α(T - T₀)]
   * 
   * @param temperature - 当前温度 (°C)
   * @param referenceTemp - 参考温度 (°C, 默认25°C)  
   * @param tempCoeff - 温度系数 (ppm/°C, 默认0)
   * @returns 温度修正后的电阻值
   */
  getTemperatureAdjustedResistance(
    temperature: number, 
    referenceTemp: number = 25,
    tempCoeff: number = 0
  ): number {
    const deltaT = temperature - referenceTemp;
    const alpha = tempCoeff * 1e-6; // ppm to fractional
    return this._resistance * (1 + alpha * deltaT);
  }
  
  /**
   * 📏 创建温度修正版本
   */
  createTemperatureAdjustedVersion(
    temperature: number,
    referenceTemp?: number,
    tempCoeff?: number
  ): Resistor {
    const adjustedR = this.getTemperatureAdjustedResistance(temperature, referenceTemp, tempCoeff);
    return new Resistor(`${this.name}_T${temperature}C`, this.nodes, adjustedR);
  }
  
  /**
   * 🔍 调试信息
   */
  toString(): string {
    return `${this.name}: R=${this._resistance}Ω between ${this.nodes[0]} and ${this.nodes[1]}`;
  }
}

/**
 * 🏭 电阻工厂函数
 */
export namespace ResistorFactory {
  /**
   * 创建标准电阻
   */
  export function create(name: string, nodes: [string, string], resistance: number): Resistor {
    return new Resistor(name, nodes, resistance);
  }
  
  /**
   * 创建标准阻值系列电阻 (E12系列)
   */
  export function createStandardValue(
    name: string, 
    nodes: [string, string], 
    baseValue: number,
    multiplier: number = 1
  ): Resistor {
    const standardValues = [1.0, 1.2, 1.5, 1.8, 2.2, 2.7, 3.3, 3.9, 4.7, 5.6, 6.8, 8.2];
    
    // 找到最近的标准值
    const closest = standardValues.reduce((prev, curr) => 
      Math.abs(curr - baseValue) < Math.abs(prev - baseValue) ? curr : prev
    );
    
    return new Resistor(name, nodes, closest * multiplier);
  }
  
  /**
   * 创建功率电阻
   */
  export function createPowerResistor(
    name: string,
    nodes: [string, string], 
    resistance: number,
    _powerRating: number
  ): Resistor {
    const resistor = new Resistor(name, nodes, resistance);
    // 可以在这里添加功率额定值属性
    return resistor;
  }
}

/**
 * 🧪 电阻测试工具
 */
export namespace ResistorTest {
  /**
   * 验证欧姆定律
   */
  export function verifyOhmsLaw(resistance: number, voltage: number): { current: number; power: number } {
    const current = voltage / resistance;
    const power = voltage * current;
    return { current, power };
  }
  
  /**
   * 验证MNA装配
   */
  export function verifyMNAStamp(resistance: number): { g11: number; g12: number; g21: number; g22: number } {
    const g = 1 / resistance;
    return {
      g11: g,   // G[0,0] = G
      g12: -g,  // G[0,1] = -G  
      g21: -g,  // G[1,0] = -G
      g22: g    // G[1,1] = G
    };
  }
}