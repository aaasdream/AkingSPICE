/**
 * 🚀 智能设备模型 API - AkingSPICE 2.1 革命性架构
 * 
 * 世界领先的非线性设备建模接口，专为电力电子电路设计
 * 结合 Generalized-α 积分器和 Ultra KLU 求解器的终极性能
 * 
 * 🏆 核心创新：
 * - 物理意义驱动的收敛判断
 * - 自适应 Newton 步长限制
 * - 智能状态预测与事件检测
 * - 数值稳定性保障机制
 * - 多时间尺度处理能力
 * 
 * 📚 设计理念：
 *   基于现代数值分析理论和电力电子物理特性
 *   参考 Cadence Spectre、Synopsys HSPICE 的工业标准
 *   针对开关器件的特殊数值挑战进行优化
 * 
 * 🎯 应用场景：
 *   - MOSFET/IGBT 开关建模
 *   - 二极管反向恢复特性
 *   - 磁芯非线性建模
 *   - 电容/电感寄生效应
 */

import { 
  Time,
  IEvent,
  IVector,
} from '../../types/index';
import { Vector } from '../../math/sparse/vector';
// ADDED: Import the base interface
import type { ComponentInterface, AssemblyContext } from '../interfaces/component';

/**
 * 设备载入结果
 */
export interface LoadResult {
  /** 载入是否成功 */
  readonly success: boolean;
  
  /** MNA 矩阵贡献 */
  readonly matrixStamp: MatrixStamp;
  
  /** 右侧向量贡献 */
  readonly rhsContribution: { index: number, value: number }[];
  
  /** 设备当前状态 */
  readonly deviceState: DeviceState;
  
  /** 错误信息 (如果载入失败) */
  readonly errorMessage?: string;
  
  /** 性能统计 */
  readonly stats: {
    readonly loadTime: number;        // 载入耗时 (ms)
    readonly nonlinearIterations: number;  // 非线性迭代次数
    readonly jacobianEvaluations: number;  // Jacobian 计算次数
  };
}

/**
 * MNA 矩阵印花 (Stamp)
 */
export interface MatrixStamp {
  /** 印花的矩阵行列位置和数值 */
  readonly entries: readonly StampEntry[];
  
  /** 印花类型 */
  readonly type: StampType;
  
  /** 是否为线性印花 */
  readonly isLinear: boolean;
  
  /** 条件数估计 */
  readonly conditionEstimate?: number;
}

export interface StampEntry {
  readonly row: number;
  readonly col: number;
  readonly value: number;
}

export enum StampType {
  RESISTIVE = 'resistive',      // 纯阻性
  CAPACITIVE = 'capacitive',    // 电容性
  INDUCTIVE = 'inductive',      // 电感性
  NONLINEAR = 'nonlinear',      // 非线性
  SWITCHING = 'switching'       // 开关性
}

/**
 * 设备物理状态
 */
export interface DeviceState {
  /** 设备 ID */
  readonly deviceId: string;
  
  /** 当前时间 */
  readonly time: Time;
  
  /** 设备端电压 */
  readonly voltage: Vector;
  
  /** 设备端电流 */
  readonly current: Vector;
  
  /** 设备工作模式 */
  readonly operatingMode: string;
  
  /** 物理参数 */
  readonly parameters: Record<string, number>;
  
  /** 内部状态变量 */
  readonly internalStates: Record<string, any>;
  
  /** 温度效应 */
  readonly temperature: number;
}

/**
 * 收敛性分析结果
 */
export interface ConvergenceInfo {
  /** 是否收敛 */
  readonly converged: boolean;
  
  /** 收敛置信度 [0,1] */
  readonly confidence: number;
  
  /** 物理合理性检查 */
  readonly physicalConsistency: PhysicalConsistency;
  
  /** 建议的 Newton 步长缩放因子 */
  readonly suggestedStepScale: number;
  
  /** 收敛诊断信息 */
  readonly diagnostics: ConvergenceDiagnostics;
}

export interface PhysicalConsistency {
  /** 电压是否在合理范围 */
  readonly voltageValid: boolean;
  
  /** 电流是否在合理范围 */
  readonly currentValid: boolean;
  
  /** 功率是否守恒 */
  readonly powerConsistent: boolean;
  
  /** 器件工作区域是否合理 */
  readonly operatingRegionValid: boolean;
  
  /** 详细检查结果 */
  readonly details: string[];
}

export interface ConvergenceDiagnostics {
  /** 电压变化率 */
  readonly voltageChangeRate: number;
  
  /** 电流变化率 */
  readonly currentChangeRate: number;
  
  /** Jacobian 条件数 */
  readonly jacobianCondition: number;
  
  /** 非线性强度指标 */
  readonly nonlinearityStrength: number;
  
  /** 建议行动 */
  readonly recommendations: string[];
}

/**
 * 状态预测结果
 */
export interface PredictionHint {
  /** 预测的下一步状态 */
  readonly predictedState: DeviceState;
  
  /** 预测置信度 */
  readonly confidence: number;
  
  /** 建议的时间步长 */
  readonly suggestedTimestep: number;
  
  /** 潜在的开关事件 */
  readonly switchingEvents: readonly SwitchingEvent[];
  
  /** 数值挑战警告 */
  readonly numericalChallenges: readonly NumericalChallenge[];
}

export interface SwitchingEvent {
  readonly eventType: 'turn_on' | 'turn_off' | 'mode_change';
  readonly estimatedTime: Time;
  readonly confidence: number;
  readonly impactSeverity: 'low' | 'medium' | 'high';
}

export interface NumericalChallenge {
  readonly type: 'stiffness' | 'discontinuity' | 'ill_conditioning';
  readonly severity: number;  // [0,1]
  readonly mitigation: string;
}

/**
 * 🚀 智能设备模型基础接口
 * 
 * 所有电力电子器件的统一建模标准
 * 提供物理意义驱动的数值稳定性保障
 * 
 * CHANGED: 直接继承 ComponentInterface，实现真正的统一接口
 */
export interface IIntelligentDeviceModel extends ComponentInterface {
  /** 设备唯一标识符 (对应 ComponentInterface.name) */
  readonly deviceId: string;
  
  /** 设备类型 (对应 ComponentInterface.type) */
  readonly deviceType: string;
  
  /** 设备节点连接 (重载为数值索引，智能设备在数值计算层面工作) */
  readonly nodes: readonly string[];
  
  /** 设备参数 */
  readonly parameters: Readonly<Record<string, number>>;
  
  /**
   * ADDED: 获取设备在给定电压下的工作模式
   * @param voltage 节点电压向量
   * @param nodeMap 可选的节点映射，用于将字符串节点名转换为索引
   * @returns 代表工作模式的字符串
   */
  getOperatingMode(voltage: IVector, nodeMap?: Map<string, number>): string;
  
  /**
   * 🎯 收敛性检查：物理意义驱动的 Newton 收敛判断
   * 
   * 不同于传统的纯数值收敛判断，这个方法结合：
   * 1. 物理定律检验 (KCL, KVL, 功率守恒)
   * 2. 器件工作区域合理性
   * 3. 数值稳定性指标
   * 4. 历史收敛模式学习
   * 
   * @param deltaV Newton 迭代的电压变化量
   * @returns 详细的收敛分析结果
   */
  checkConvergence(deltaV: IVector, nodeMap?: Map<string, number>): ConvergenceInfo;
  
  /**
   * 🛡️ Newton 步长限制：防止数值发散的智能控制
   * 
   * 根据设备物理特性和数值稳定性要求，智能限制 Newton 步长：
   * 1. 防止电压/电流超出物理合理范围
   * 2. 避免跨越器件工作模式边界
   * 3. 处理开关瞬态的数值奇点
   * 4. 自适应步长缩放策略
   * 
   * @param deltaV 原始 Newton 步长
   * @returns 经过智能限制的安全步长
   */
  limitUpdate(deltaV: IVector, nodeMap?: Map<string, number>): IVector;
  
  /**
   * 🔮 状态预测：辅助积分器的智能时间步长控制
   * 
   * 基于设备物理模型和历史行为，预测：
   * 1. 下一步可能的状态变化
   * 2. 潜在的开关事件时间
   * 3. 数值挑战和建议缓解措施
   * 4. 最优时间步长建议
   * 
   * @param dt 当前时间步长
   * @returns 预测结果和优化建议
   */
  predictNextState(dt: number): PredictionHint;
  
  /**
   * 🔄 状态更新：时间步接受后的状态同步
   * 
   * 当 Generalized-α 积分器接受一个时间步后，更新：
   * 1. 设备内部状态变量
   * 2. 历史状态缓存
   * 3. 统计和性能指标
   * 4. 自适应参数调整
   * 
   * @param newState 新的设备状态
   */
  updateState(newState: DeviceState): void;
  
  /**
   * 📊 性能诊断：设备建模效率分析
   * 
   * 提供设备建模的性能统计和优化建议：
   * 1. Newton 收敛统计
   * 2. 数值稳定性历史
   * 3. 计算效率分析
   * 4. 参数敏感度信息
   * 
   * @returns 性能报告
   */
  getPerformanceReport(): DevicePerformanceReport;
  
  /**
   * ♻️ 资源清理：释放设备相关资源
   */
  dispose(): void;
}

export interface DevicePerformanceReport {
  readonly deviceId: string;
  readonly totalLoadCalls: number;
  readonly avgLoadTime: number;
  readonly convergenceRate: number;
  readonly numericalStability: number;
  readonly recommendations: string[];
}

/**
 * 🏭 智能设备模型工厂 (前向声明)
 * 
 * 为不同类型的电力电子器件创建优化的模型实例
 * 具体实现在 intelligent_device_factory.ts 中
 */
export abstract class IntelligentDeviceModelFactory {
  /**
   * 创建 MOSFET 智能模型
   */
  static createMOSFET(
    _deviceId: string,
    _nodes: [number, number, number], // [Drain, Gate, Source]
    _parameters: MOSFETParameters
  ): IIntelligentDeviceModel {
    throw new Error('Factory implementation not loaded. Import from intelligent_device_factory.ts');
  }
  
  /**
   * 创建二极管智能模型  
   */
  static createDiode(
    _deviceId: string,
    _nodes: [number, number], // [Anode, Cathode]
    _parameters: DiodeParameters
  ): IIntelligentDeviceModel {
    throw new Error('Factory implementation not loaded. Import from intelligent_device_factory.ts');
  }
  
  // 注意：电感和电容属于基础组件，在 src/components/passive/ 中实现
  // 智能设备工厂只处理需要智能建模的非线性器件
}

// 器件参数接口定义
export interface MOSFETParameters extends Record<string, number> {
  readonly Vth: number;      // 阈值电压
  readonly Kp: number;       // 跨导参数
  readonly lambda: number;   // 沟道长度调制
  readonly Cgs: number;      // 栅源电容
  readonly Cgd: number;      // 栅漏电容
  readonly Ron: number;      // 导通电阻
  readonly Roff: number;     // 关断电阻
  readonly Vmax: number;     // 最大工作电压
  readonly Imax: number;     // 最大工作电流
}

export interface DiodeParameters extends Record<string, number> {
  readonly Is: number;       // 反向饱和电流
  readonly n: number;        // 理想因子
  readonly Rs: number;       // 串联电阻
  readonly Cj0: number;      // 零偏结电容
  readonly Vj: number;       // 结电位
  readonly m: number;        // 分级系数
  readonly tt: number;       // 渡越时间
}

// 注意：InductorParameters 和 CapacitorParameters 已移除
// 基础组件的参数定义在 src/components/passive/ 各自的文件中
// 智能设备模型只包含需要智能建模的非线性器件参数

/**
 * 🚀 智能设备模型基类
 * 
 * 提供通用的智能建模功能实现
 * 子类只需实现设备特定的物理模型
 */
export abstract class IntelligentDeviceModelBase implements IIntelligentDeviceModel {
  protected _currentState: DeviceState;
  protected _stateHistory: DeviceState[] = [];
  protected _performanceStats: DevicePerformanceReport;
  
  // 性能统计
  protected _totalLoadCalls = 0;
  protected _totalLoadTime = 0;
  protected _convergenceHistory: boolean[] = [];
  protected _stabilityMetrics: number[] = [];

  constructor(
    public readonly deviceId: string,
    public readonly deviceType: string,
    public readonly nodes: readonly string[],
    public readonly parameters: Readonly<Record<string, number>>
  ) {
    // 初始化设备状态
    this._currentState = {
      deviceId,
      time: 0,
      voltage: new Vector(nodes.length),
      current: new Vector(nodes.length),
      operatingMode: 'initial',
      parameters: { ...parameters },
      internalStates: {},
      temperature: 300 // 27°C
    };
    
    // 初始化性能统计
    this._performanceStats = {
      deviceId,
      totalLoadCalls: 0,
      avgLoadTime: 0,
      convergenceRate: 1.0,
      numericalStability: 1.0,
      recommendations: []
    };
  }

  // --- ADDED: 实现 ComponentInterface 所需的属性和方法 ---
  
  /** 对应 ComponentInterface.name */
  get name(): string {
    return this.deviceId;
  }

  /** 对应 ComponentInterface.type */
  get type(): string {
    return this.deviceType;
  }
  
  /**
   * 🚀 统一组装方法 (NEW!)
   * 
   * 智能设备的统一组装接口
   */
  assemble(context: AssemblyContext): void {
    if (!context.solutionVector) {
      throw new Error(`Intelligent device '${this.name}' requires a solution vector in the assembly context.`);
    }

    // 調用設備特定的 load() 方法
    const loadResult = this.load(context.solutionVector);
    
    if (!loadResult.success) {
      throw new Error(`Intelligent device ${this.name} load failed: ${loadResult.errorMessage}`);
    }

    // 將 load() 結果裝配到系統矩陣
    for (const entry of loadResult.matrixStamp.entries) {
      context.matrix.add(entry.row, entry.col, entry.value);
    }
    for (const contribution of loadResult.rhsContribution) {
        context.rhs.add(contribution.index, contribution.value);
    }
  }

  /**
   * 👁️ 检查此组件是否会产生事件
   * 智能设备是事件的主要来源
   */
  hasEvents(): boolean {
    return true;
  }

  /**
   * 🆕 返回一个或多个条件函数，其零点对应一个事件。
   * @returns { type: EventType, condition: (v: IVector) => number }[]
   */
  getEventFunctions?(): { type: string, condition: (v: IVector) => number }[];

  /**
   * ⚡ 处理一个已确认的事件
   * 对于智能设备，主要动作是更新其内部状态
   */
  handleEvent(event: IEvent, context: AssemblyContext): void {
    // 检查是否是和自己相关的状态改变事件
    if (event.component === this && context.solutionVector) {
        const newMode = this.getOperatingMode(context.solutionVector);
        
        // 更新当前状态的工作模式和时间
        this._currentState = {
            ...this._currentState,
            operatingMode: newMode,
            time: event.time,
        };
        
        console.log(`[${this.name}] handled event at t=${event.time.toExponential(3)}s. New mode: ${newMode}`);
    }
  }

  /**
   * MODIFIED: 讓 stamp 的錯誤訊息更有幫助
   * @deprecated 請使用 assemble() 方法替代
   */

  
  /**
   * ADDED: 实现基本的参数验证
   */
  validate(): { isValid: boolean; errors: string[]; warnings: string[]; } {
    const errors: string[] = [];
    const warnings: string[] = [];
    
    // 基本验证
    if (!this.deviceId || this.deviceId.trim() === '') {
      errors.push('Device ID cannot be empty');
    }
    
    if (!this.deviceType || this.deviceType.trim() === '') {
      errors.push('Device type cannot be empty');
    }
    
    if (this.nodes.length === 0) {
      errors.push('Device must have at least one node');
    }
    
    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }
  
  /**
   * ADDED: 提供设备信息用于调试
   */
  getInfo(): { type: string; name: string; nodes: string[]; parameters: Record<string, any>; units?: Record<string, string>; } {
    const units = this._getParameterUnits();
    return {
      type: this.deviceType,
      name: this.deviceId,
      nodes: this.nodes.map(n => n.toString()), // 转换为字符串以符合接口
      parameters: { ...this.parameters },
      ...(units && { units }) // 只在有单位信息时包含
    };
  }
  
  /**
   * 子类可重写以提供参数单位信息
   */
  protected _getParameterUnits(): Record<string, string> | undefined {
    return undefined;
  }

  /**
   * 🔥 核心方法：载入设备到 MNA 系统
   * 
   * 这是设备模型的核心方法，负责：
   * 1. 计算设备在当前状态下的线性化模型
   * 2. 生成 MNA 矩阵印花 (stamp)
   * 3. 计算右侧向量贡献
   * 4. 更新设备内部状态
   * 
   * @param voltage 当前节点电压向量
   * @returns 载入结果，包含矩阵印花和状态信息
   * @deprecated The `load` method is deprecated and will be removed. Use `assemble` instead.
   */
  load(_voltage: IVector): LoadResult {
      throw new Error(`The 'load' method is deprecated for device ${this.name}. Use the 'assemble' method instead.`);
  };
  
  /**
   * ADDED: 新增的抽象方法，子类必须实现
   * 获取设备在给定电压下的工作模式
   */
  abstract getOperatingMode(voltage: IVector, nodeMap?: Map<string, number>): string;

  /**
   * 🎯 通用收敛性检查实现
   */
  checkConvergence(deltaV: IVector, nodeMap?: Map<string, number>): ConvergenceInfo {
    const startTime = performance.now();
    
    try {
      // 1. 基础数值检查
      const maxDelta = this._getMaxAbsValue(deltaV);
      const relativeDelta = this._getRelativeChange(deltaV);
      
      // 2. 物理合理性检查
      const physicalCheck = this._checkPhysicalConsistency(deltaV, nodeMap);
      
      // 3. 数值稳定性评估
      const stabilityCheck = this._assessNumericalStability(deltaV);
      
      // 4. 综合收敛判断
      const converged = this._determineConvergence(maxDelta, relativeDelta, physicalCheck, stabilityCheck);
      
      // 5. 置信度计算
      const confidence = this._calculateConfidence(converged, physicalCheck, stabilityCheck);
      
      // 6. Newton 步长缩放建议
      const stepScale = this._suggestStepScale(converged, maxDelta, physicalCheck);
      
      // 7. 诊断信息收集
      const diagnostics = this._generateDiagnostics(deltaV, physicalCheck, stabilityCheck);
      
      return {
        converged,
        confidence,
        physicalConsistency: physicalCheck,
        suggestedStepScale: stepScale,
        diagnostics
      };
      
    } finally {
      // 性能统计更新
      const checkTime = performance.now() - startTime;
      this._updateConvergenceStats(checkTime);
    }
  }

  /**
   * 🛡️ 通用 Newton 步长限制实现
   */
  limitUpdate(deltaV: IVector, nodeMap?: Map<string, number>): IVector {
    // Since IVector doesn't have clone, we create a new Vector from it.
    const limited = Vector.from(deltaV.toArray());
    
    // 1. 物理边界限制
    this._applyPhysicalLimits(limited);
    
    // 2. 数值稳定性限制  
    this._applyStabilityLimits(limited);
    
    // 3. 器件特定限制 (子类可重写)
    this._applyDeviceSpecificLimits(limited, nodeMap);
    
    return limited;
  }

  /**
   * 🔮 通用状态预测实现
   */
  predictNextState(dt: number): PredictionHint {
    // 基于历史状态和物理模型进行预测
    const predictedState = this._extrapolateState(dt);
    const confidence = this._calculatePredictionConfidence(dt);
    const suggestedDt = this._suggestOptimalTimestep(dt);
    const switchingEvents = this._detectSwitchingEvents(dt);
    const challenges = this._identifyNumericalChallenges(dt);
    
    return {
      predictedState,
      confidence,
      suggestedTimestep: suggestedDt,
      switchingEvents,
      numericalChallenges: challenges
    };
  }

  /**
   * 🔄 状态更新实现
   */
  updateState(newState: DeviceState): void {
    // 更新状态历史
    this._stateHistory.unshift(this._currentState);
    
    // 限制历史长度
    if (this._stateHistory.length > 10) {
      this._stateHistory.pop();
    }
    
    // 更新当前状态
    this._currentState = { ...newState };
    
    // 更新性能统计
    this._updatePerformanceMetrics();
  }

  /**
   * 📊 性能报告生成
   */
  getPerformanceReport(): DevicePerformanceReport {
    return { ...this._performanceStats };
  }

  /**
   * ♻️ 资源清理
   */
  dispose(): void {
    this._stateHistory = [];
    this._convergenceHistory = [];
    this._stabilityMetrics = [];
  }

  // === 保护方法：子类可访问的通用功能 ===

  protected _getMaxAbsValue(vector: IVector): number {
    let max = 0;
    for (let i = 0; i < vector.size; i++) {
      max = Math.max(max, Math.abs(vector.get(i)));
    }
    return max;
  }

  protected _getRelativeChange(deltaV: IVector): number {
    const deltaNorm = deltaV.norm();
    const stateNorm = Math.max(this._currentState.voltage.norm(), 1e-12);
    return deltaNorm / stateNorm;
  }

  protected _checkPhysicalConsistency(deltaV: IVector, nodeMap?: Map<string, number>): PhysicalConsistency {
    // We need to perform vector addition, so we ensure we have a Vector object.
    const currentVoltage = this._currentState.voltage.clone();
    const newVoltage = currentVoltage.plus(deltaV);
    
    return {
      voltageValid: this._isVoltageInRange(newVoltage),
      currentValid: this._isCurrentReasonable(newVoltage, nodeMap),
      powerConsistent: this._checkPowerConsistency(newVoltage),
      operatingRegionValid: this._isOperatingRegionValid(newVoltage, nodeMap),
      details: []
    };
  }

  protected _assessNumericalStability(deltaV: IVector): number {
    // 评估数值稳定性 (0-1, 1为最稳定)
    const deltaRate = this._getRelativeChange(deltaV);
    const convergenceTrend = this._analyzeConvergenceTrend();
    
    return Math.min(1.0, Math.max(0.0, 1.0 - deltaRate * 10) * convergenceTrend);
  }

  // === 私有辅助方法 ===

  private _determineConvergence(
    maxDelta: number, 
    relativeDelta: number,
    physicalCheck: PhysicalConsistency,
    stability: number
  ): boolean {
    const VOLTAGE_TOL = 1e-6;  // 1μV
    const RELATIVE_TOL = 1e-8; // 0.000001%
    const MIN_STABILITY = 0.5;
    
    return maxDelta < VOLTAGE_TOL && 
           relativeDelta < RELATIVE_TOL &&
           physicalCheck.voltageValid &&
           physicalCheck.currentValid &&
           stability > MIN_STABILITY;
  }

  private _calculateConfidence(
    converged: boolean,
    physicalCheck: PhysicalConsistency,
    stability: number
  ): number {
    let confidence = converged ? 0.8 : 0.2;
    
    if (physicalCheck.voltageValid) confidence += 0.1;
    if (physicalCheck.currentValid) confidence += 0.1;
    if (physicalCheck.powerConsistent) confidence += 0.05;
    
    confidence *= stability;
    
    return Math.min(1.0, Math.max(0.0, confidence));
  }

  private _suggestStepScale(
    converged: boolean,
    maxDelta: number,
    physicalCheck: PhysicalConsistency
  ): number {
    if (converged && physicalCheck.voltageValid) {
      return 1.0; // 可以使用完整步长
    }
    
    if (!physicalCheck.voltageValid) {
      return 0.1; // 物理不合理，大幅缩小步长
    }
    
    // 根据变化幅度调整步长
    const scale = Math.min(1.0, 1e-3 / Math.max(maxDelta, 1e-12));
    return Math.max(0.01, scale);
  }

  private _generateDiagnostics(
    deltaV: IVector,
    physicalCheck: PhysicalConsistency,
    stability: number
  ): ConvergenceDiagnostics {
    return {
      voltageChangeRate: this._getRelativeChange(deltaV),
      currentChangeRate: 0, // TODO: 实现电流变化率计算
      jacobianCondition: 1, // TODO: 从求解器获取条件数
      nonlinearityStrength: this._assessNonlinearity(),
      recommendations: this._generateRecommendations(physicalCheck, stability)
    };
  }

  private _isVoltageInRange(voltage: IVector): boolean {
    // 检查电压是否在合理范围内 (例如 ±1kV)
    for (let i = 0; i < voltage.size; i++) {
      const v = voltage.get(i);
      if (Math.abs(v) > 1000) return false;
    }
    return true;
  }

  private _isCurrentReasonable(_voltage: IVector, _nodeMap?: Map<string, number>): boolean {
    // 基于电压估算电流是否合理
    // 简化实现：假设设备不会产生超过 1kA 的电流
    return true; // TODO: 实现具体的电流检查逻辑
  }

  private _checkPowerConsistency(_voltage: IVector): boolean {
    // 检查功率是否守恒
    // 简化实现：总是返回 true
    return true; // TODO: 实现功率一致性检查
  }

  private _isOperatingRegionValid(_voltage: IVector, _nodeMap?: Map<string, number>): boolean {
    // 检查器件是否在有效工作区域
    return true; // 子类应重写此方法
  }

  private _analyzeConvergenceTrend(): number {
    if (this._convergenceHistory.length < 3) return 1.0;
    
    const recentConvergence = this._convergenceHistory.slice(0, 5);
    const convergenceRate = recentConvergence.filter(c => c).length / recentConvergence.length;
    
    return convergenceRate;
  }

  private _assessNonlinearity(): number {
    // 评估设备非线性强度
    return 0.5; // TODO: 基于 Jacobian 特征值等实现
  }

  private _generateRecommendations(
    physicalCheck: PhysicalConsistency,
    stability: number
  ): string[] {
    const recommendations: string[] = [];
    
    if (!physicalCheck.voltageValid) {
      recommendations.push('电压超出合理范围，建议减小 Newton 步长');
    }
    
    if (stability < 0.5) {
      recommendations.push('数值不稳定，建议增加阻尼或使用更小时间步长');
    }
    
    return recommendations;
  }

  // 步长限制方法
  protected _applyPhysicalLimits(deltaV: Vector): void {
    // 限制单步电压变化不超过 10V
    const MAX_VOLTAGE_STEP = 10.0;
    
    for (let i = 0; i < deltaV.size; i++) {
      const delta = deltaV.get(i);
      if (Math.abs(delta) > MAX_VOLTAGE_STEP) {
        deltaV.set(i, Math.sign(delta) * MAX_VOLTAGE_STEP);
      }
    }
  }

  protected _applyStabilityLimits(deltaV: Vector): void {
    // 基于数值稳定性的步长限制
    const stabilityFactor = this._assessNumericalStability(deltaV);
    
    if (stabilityFactor < 0.5) {
      // 稳定性较差时，缩小步长
      for (let i = 0; i < deltaV.size; i++) {
        deltaV.set(i, deltaV.get(i) * 0.5);
      }
    }
  }

  protected _applyDeviceSpecificLimits(_deltaV: Vector, _nodeMap?: Map<string, number>): void {
    // 子类重写实现设备特定的限制
  }

  // 状态预测方法
  private _extrapolateState(dt: number): DeviceState {
    // 简单线性外推
    return { ...this._currentState, time: this._currentState.time + dt };
  }

  private _calculatePredictionConfidence(dt: number): number {
    // 基于时间步长和历史稳定性计算置信度
    const historyStability = this._analyzeConvergenceTrend();
    const timestepFactor = Math.exp(-dt / 1e-6); // 1μs 特征时间
    
    return historyStability * timestepFactor;
  }

  private _suggestOptimalTimestep(currentDt: number): number {
    // 基于设备特性建议最优时间步长
    return currentDt; // TODO: 实现智能步长建议
  }

  private _detectSwitchingEvents(_dt: number): readonly SwitchingEvent[] {
    // 基于状态变化趋势检测开关事件
    return []; // TODO: 实现开关事件检测
  }

  private _identifyNumericalChallenges(_dt: number): readonly NumericalChallenge[] {
    // 识别潜在的数值挑战
    return []; // TODO: 实现数值挑战识别
  }

  // 性能统计更新
  private _updateConvergenceStats(_checkTime: number): void {
    // 更新收敛检查性能统计
  }

  private _updatePerformanceMetrics(): void {
    // 更新整体性能指标
    this._performanceStats = {
      ...this._performanceStats,
      totalLoadCalls: this._totalLoadCalls,
      avgLoadTime: this._totalLoadCalls > 0 ? this._totalLoadTime / this._totalLoadCalls : 0,
      convergenceRate: this._analyzeConvergenceTrend()
    };
  }
}

/**
 * ADDED: 關鍵的類型守衛函數
 * 這個函數將被引擎用來區分智能設備和基礎組件
 * 
 * 檢查邏輯：智能設備必須具有 'assemble' 方法
 */
export function isIntelligentDeviceModel(component: ComponentInterface): component is IIntelligentDeviceModel {
  // 使用智能設備獨有的 'deviceId' 屬性或 'checkConvergence' 方法來判斷
  // 'checkConvergence' 更具代表性
  return 'checkConvergence' in component && typeof (component as any).checkConvergence === 'function';
}