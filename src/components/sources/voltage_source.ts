/**
 * 🔌 标准电压源组件 - AkingSPICE 2.1
 * 
 * 理想电压源的实现
 * 支持直流、正弦波、脉冲等多种波形
 */

import { ComponentInterface, SourceInterface, ValidationResult, ComponentInfo, WaveformDescriptor } from '../../core/interfaces/component';
import { SparseMatrix } from '../../math/sparse/matrix';
import { Vector } from '../../math/sparse/vector';

/**
 * ⚡ 理想电压源组件
 * 
 * 电压源模型: V = V(t)
 * 
 * MNA 装配需要扩展矩阵:
 * [G   B ] [V ]   [I_s]
 * [C   D ] [I_v] = [V_s]
 * 
 * 其中 I_v 是电压源的电流变量
 */
export class VoltageSource implements ComponentInterface, SourceInterface {
  readonly type = 'V';
  
  private _currentIndex?: number;
  private _waveform: WaveformDescriptor;
  private _dcScaleFactor = 1.0; // 新增：直流缩放因子（用于源步进）
  
  constructor(
    public readonly name: string,
    public readonly nodes: readonly [string, string],
    private _dcValue: number,
    waveform?: WaveformDescriptor
  ) {
    if (nodes.length !== 2) {
      throw new Error(`电压源必须连接两个节点，实际: ${nodes.length}`);
    }
    if (nodes[0] === nodes[1]) {
      throw new Error(`电压源不能连接到同一节点: ${nodes[0]}`);
    }
    
    this._waveform = waveform || {
      type: 'DC',
      parameters: { value: _dcValue }
    };
  }
  
  /**
   * 🎯 获取直流值
   */
  get dcValue(): number {
    return this._dcValue;
  }
  
  /**
   * 🆕 设置直流缩放因子 (用于源步进)
   */
  scaleDcValue(factor: number): void {
    if (factor < 0 || factor > 1) {
      console.warn(`电压源 ${this.name} 的缩放因子超出 [0, 1] 范围: ${factor}`);
    }
    this._dcScaleFactor = factor;
  }
  
  /**
   * 🔢 设置电流支路索引
   */
  setCurrentIndex(index: number): void {
    this._currentIndex = index;
  }
  
  /**
   * 📈 获取当前激励值
   */
  getValue(time: number): number {
    switch (this._waveform.type) {
      case 'DC':
        // 将缩放因子应用于直流值
        return (this._waveform.parameters['value'] || this._dcValue) * this._dcScaleFactor;
        
      case 'SIN':
        {
          const params = this._waveform.parameters;
          // 源步进期间，我们也缩放正弦波的直流偏置和幅度
          const dc = (params['dc'] || 0) * this._dcScaleFactor;
          const amplitude = (params['amplitude'] || 1) * this._dcScaleFactor;
          const frequency = params['frequency'] || 1000;
          const phase = params['phase'] || 0;
          const delay = params['delay'] || 0;
          const damping = params['damping'] || 0;
          
          if (time < delay) return dc;
          
          const t = time - delay;
          const expTerm = damping > 0 ? Math.exp(-damping * t) : 1;
          return dc + amplitude * expTerm * Math.sin(2 * Math.PI * frequency * t + phase);
        }
        
      case 'PULSE':
        {
          const params = this._waveform.parameters;
          // 对脉冲波形也应用缩放
          const v1 = (params['v1'] || 0) * this._dcScaleFactor;
          const v2 = (params['v2'] || 1) * this._dcScaleFactor;
          const td = params['delay'] || 0;
          const tr = params['rise_time'] || 1e-9;
          const tf = params['fall_time'] || 1e-9;
          const pw = params['pulse_width'] || 1e-6;
          const period = params['period'] || 2e-6;
          
          if (time < td) return v1;
          
          const tmod = (time - td) % period;
          
          if (tmod < tr) {
            // 上升沿
            return v1 + (v2 - v1) * tmod / tr;
          } else if (tmod < tr + pw) {
            // 高电平
            return v2;
          } else if (tmod < tr + pw + tf) {
            // 下降沿
            return v2 - (v2 - v1) * (tmod - tr - pw) / tf;
          } else {
            // 低电平
            return v1;
          }
        }
        
      case 'EXP':
        {
          const params = this._waveform.parameters;
          // 对指数波形也应用缩放
          const v1 = (params['v1'] || 0) * this._dcScaleFactor;
          const v2 = (params['v2'] || 1) * this._dcScaleFactor;
          const td1 = params['delay1'] || 0;
          const tau1 = params['tau1'] || 1e-6;
          const td2 = params['delay2'] || 1e-6;
          const tau2 = params['tau2'] || 1e-6;
          
          if (time < td1) {
            return v1;
          } else if (time < td2) {
            return v1 + (v2 - v1) * (1 - Math.exp(-(time - td1) / tau1));
          } else {
            const v_peak = v1 + (v2 - v1) * (1 - Math.exp(-(td2 - td1) / tau1));
            return v_peak - (v2 - v1) * (1 - Math.exp(-(time - td2) / tau2));
          }
        }
        
      case 'AC':
        {
          const params = this._waveform.parameters;
          // 对交流波形也应用缩放
          const amplitude = (params['amplitude'] || 1) * this._dcScaleFactor;
          const frequency = params['frequency'] || 1000;
          const phase = params['phase'] || 0;
          
          return amplitude * Math.cos(2 * Math.PI * frequency * time + phase);
        }
        
      default:
        return this._dcValue * this._dcScaleFactor;
    }
  }
  
  /**
   * 🌊 设置激励波形
   */
  setWaveform(waveform: WaveformDescriptor): void {
    this._waveform = waveform;
  }
  
  /**
   * 🔥 MNA 矩阵装配
   * 
   * 电压源需要扩展 MNA 矩阵:
   * - 添加电压源电流变量
   * - 施加电压约束方程
   */
  stamp(
    matrix: SparseMatrix, 
    rhs: Vector, 
    nodeMap: Map<string, number>,
    currentTime: number = 0
  ): void {
    const n1 = nodeMap.get(this.nodes[0]);
    const n2 = nodeMap.get(this.nodes[1]);
    
    if (this._currentIndex === undefined) {
      throw new Error(`电压源 ${this.name} 的电流支路索引未设置`);
    }
    
    const iv = this._currentIndex;
    const voltage = this.getValue(currentTime);
    
    // B 矩阵: 节点到支路的关联 (KCL)
    if (n1 !== undefined && n1 >= 0) {
      matrix.add(n1, iv, 1);  // 电流从正端流出
    }
    if (n2 !== undefined && n2 >= 0) {
      matrix.add(n2, iv, -1); // 电流流入负端
    }
    
    // C 矩阵: 支路到节点的关联 (KVL)
    if (n1 !== undefined && n1 >= 0) {
      matrix.add(iv, n1, 1);  // V+ 
    }
    if (n2 !== undefined && n2 >= 0) {
      matrix.add(iv, n2, -1); // -V-
    }
    
    // 电压约束: V+ - V- = Vs
    rhs.add(iv, voltage);
  }
  
  /**
   * 🔍 组件验证
   */
  validate(): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    
    // 检查节点连接
    if (this.nodes.length !== 2) {
      errors.push(`电压源必须连接两个节点，实际: ${this.nodes.length}`);
    }
    
    if (this.nodes.length === 2 && this.nodes[0] === this.nodes[1]) {
      errors.push(`电压源不能连接到同一节点: ${this.nodes[0]}`);
    }
    
    // 检查波形参数
    if (!this._waveform) {
      errors.push('波形描述符不能为空');
    } else {
      switch (this._waveform.type) {
        case 'SIN':
          if (!this._waveform.parameters['frequency'] || this._waveform.parameters['frequency'] <= 0) {
            errors.push('正弦波频率必须为正数');
          }
          break;
        case 'PULSE':
          if (!this._waveform.parameters['period'] || this._waveform.parameters['period'] <= 0) {
            errors.push('脉冲周期必须为正数');
          }
          break;
        case 'EXP':
          if (!this._waveform.parameters['tau1'] || this._waveform.parameters['tau1'] <= 0) {
            errors.push('指数时间常数必须为正数');
          }
          break;
      }
    }
    
    // 检查电压幅值
    if (Math.abs(this._dcValue) > 1e6) {
      warnings.push(`电压幅值过大: ${this._dcValue}V`);
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
        dcValue: this._dcValue,
        waveform: this._waveform,
        currentIndex: this._currentIndex
      },
      units: {
        dcValue: 'V',
        waveform: 'various',
        currentIndex: '#'
      }
    };
  }
  
  /**
   * 🏃‍♂️ 获取需要的额外变量数量
   */
  getExtraVariableCount(): number {
    return 1; // 需要一个电流变量
  }
  
  /**
   * 📏 创建交流版本
   */
  createACVersion(amplitude: number, frequency: number, phase: number = 0): VoltageSource {
    const acSource = new VoltageSource(
      `${this.name}_AC`, 
      this.nodes, 
      0,
      {
        type: 'AC',
        parameters: { amplitude, frequency, phase }
      }
    );
    return acSource;
  }
  
  /**
   * 🔍 调试信息
   */
  toString(): string {
    return `${this.name}: V=${this._dcValue}V between ${this.nodes[0]}(+) and ${this.nodes[1]}(-)`;
  }
}

/**
 * 🏭 电压源工厂函数
 */
export namespace VoltageSourceFactory {
  /**
   * 创建直流电压源
   */
  export function createDC(name: string, nodes: [string, string], voltage: number): VoltageSource {
    return new VoltageSource(name, nodes, voltage);
  }
  
  /**
   * 创建正弦波电压源
   */
  export function createSine(
    name: string,
    nodes: [string, string],
    dc: number,
    amplitude: number,
    frequency: number,
    phase: number = 0
  ): VoltageSource {
    return new VoltageSource(name, nodes, dc, {
      type: 'SIN',
      parameters: { dc, amplitude, frequency, phase }
    });
  }
  
  /**
   * 创建脉冲电压源
   */
  export function createPulse(
    name: string,
    nodes: [string, string],
    v1: number,
    v2: number,
    delay: number = 0,
    riseTime: number = 1e-9,
    fallTime: number = 1e-9,
    pulseWidth: number = 1e-6,
    period: number = 2e-6
  ): VoltageSource {
    return new VoltageSource(name, nodes, v1, {
      type: 'PULSE',
      parameters: {
        v1, v2, delay,
        rise_time: riseTime,
        fall_time: fallTime,
        pulse_width: pulseWidth,
        period
      }
    });
  }
  
  /**
   * 创建指数电压源
   */
  export function createExponential(
    name: string,
    nodes: [string, string],
    v1: number,
    v2: number,
    delay1: number = 0,
    tau1: number = 1e-6,
    delay2?: number,
    tau2?: number
  ): VoltageSource {
    return new VoltageSource(name, nodes, v1, {
      type: 'EXP',
      parameters: {
        v1, v2, delay1, tau1,
        delay2: delay2 || delay1 + 5 * tau1,
        tau2: tau2 || tau1
      }
    });
  }
}

/**
 * 🧪 电压源测试工具
 */
export namespace VoltageSourceTest {
  /**
   * 测试正弦波形
   */
  export function testSineWave(
    amplitude: number,
    frequency: number,
    time: number,
    phase: number = 0
  ): number {
    return amplitude * Math.sin(2 * Math.PI * frequency * time + phase);
  }
  
  /**
   * 测试脉冲波形
   */
  export function testPulseWave(
    v1: number,
    v2: number,
    pulseWidth: number,
    period: number,
    time: number
  ): number {
    const tmod = time % period;
    return tmod < pulseWidth ? v2 : v1;
  }
}