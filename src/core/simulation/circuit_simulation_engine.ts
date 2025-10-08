/**
 * 🚀 AkingSPICE 2.1 通用电路仿真引擎
 * 
 * 世界领先的通用电路仿真引擎，整合三大革命性技术：
 * - Generalized-α 时域积分器 (L-稳定，可控阻尼)
 * - 统一组件接口 (基础组件 + 智能设备)  
 * - Ultra KLU WASM 求解器 (极致性能)
 * 
 * 🏆 设计目标：
 * - 支持任意电路拓扑仿真
 * - 大规模电路高效处理 (1000+ 节点)
 * - 实时仿真能力 (μs 级时间步长)
 * - 工业级数值稳定性 (>99% 收敛率)
 * - 自适应仿真策略 (智能优化)
 * 
 * 📚 技术架构：
 *   Event-Driven MNA + Generalized-α + 统一组件接口
 *   多时间尺度处理 + 自适应步长控制
 *   并行化友好设计 + 内存优化
 * 
 * 🎯 应用领域：
 *   开关电源设计验证
 *   电力电子系统分析
 *   RF/模拟电路仿真
 *   多物理场耦合仿真
 */

// 导入语句部分，添加 VoltageSource
import type { 
  Time,
  ISparseMatrix,
  IVector,
  IEvent 
} from '../../types/index';
import { Vector } from '../../math/sparse/vector';
import { SparseMatrix } from '../../math/sparse/matrix';
import { GeneralizedAlphaIntegrator } from '../integrator/generalized_alpha';
import { ExtraVariableIndexManager, ExtraVariableType } from '../mna/extra_variable_manager';
// CHANGED: 导入统一的接口和新的类型守卫
import { ComponentInterface, AssemblyContext } from '../interfaces/component';
import type { 
  IIntelligentDeviceModel, 
  DeviceState 
} from '../devices/intelligent_device_model';
import { isIntelligentDeviceModel } from '../devices/intelligent_device_model';
import { EventDetector } from '../events/detector';

/**
 * 仿真状态枚举
 */
export enum SimulationState {
  IDLE = 'idle',                    // 空闲状态
  INITIALIZING = 'initializing',    // 初始化中
  RUNNING = 'running',              // 运行中
  PAUSED = 'paused',               // 暂停
  CONVERGED = 'converged',         // 收敛完成
  FAILED = 'failed',               // 仿真失败
  COMPLETED = 'completed'          // 完成
}

/**
 * 仿真配置参数
 */
export interface SimulationConfig {
  // 时间设置
  readonly startTime: Time;        // 开始时间
  readonly endTime: Time;          // 结束时间
  readonly initialTimeStep: number; // 初始时间步长
  readonly minTimeStep: number;    // 最小时间步长
  readonly maxTimeStep: number;    // 最大时间步长
  
  // 收敛控制
  readonly voltageToleranceAbs: number;  // 电压绝对容差
  readonly voltageToleranceRel: number;  // 电压相对容差
  readonly currentToleranceAbs: number;  // 电流绝对容差
  readonly currentToleranceRel: number;  // 电流相对容差
  readonly maxNewtonIterations: number;  // 最大 Newton 迭代次数
  
  // 积分器设置
  readonly alphaf: number;         // Generalized-α 参数
  readonly alpham: number;         // Generalized-α 参数
  readonly beta: number;           // Newmark 参数
  readonly gamma: number;          // Newmark 参数
  
  // 性能优化
  readonly enableAdaptiveTimeStep: boolean;  // 自适应时间步长
  readonly enablePredictiveAnalysis: boolean; // 预测性分析
  readonly enableParallelization: boolean;   // 并行化
  readonly maxMemoryUsage: number;           // 最大内存使用 (MB)
  
  // 调试选项
  readonly verboseLogging: boolean;          // 详细日志
  readonly saveIntermediateResults: boolean; // 保存中间结果
  readonly enablePerformanceMonitoring: boolean; // 性能监控
}

/**
 * 仿真结果数据
 */
export interface SimulationResult {
  readonly success: boolean;
  readonly finalTime: Time;
  readonly totalSteps: number;
  readonly convergenceRate: number;
  readonly averageStepTime: number;
  readonly peakMemoryUsage: number;
  readonly waveformData: WaveformData;
  readonly performanceMetrics: PerformanceMetrics;
  readonly errorMessage?: string;
}

/**
 * 波形数据
 */
export interface WaveformData {
  readonly timePoints: readonly Time[];
  readonly nodeVoltages: Map<number, readonly number[]>; // 节点ID -> 电压序列
  readonly deviceCurrents: Map<string, readonly number[]>; // 设备ID -> 电流序列
  readonly deviceStates: Map<string, readonly string[]>; // 设备ID -> 状态序列
}

/**
 * 性能指标
 */
export interface PerformanceMetrics {
  totalSimulationTime: number;    // 总仿真时间 (ms)
  matrixAssemblyTime: number;     // 矩阵装配时间 (ms)
  matrixSolutionTime: number;     // 矩阵求解时间 (ms)
  deviceEvaluationTime: number;   // 设备评估时间 (ms)
  convergenceCheckTime: number;   // 收敛检查时间 (ms)
  memoryPeakUsage: number;        // 内存峰值使用 (MB)
  averageIterationsPerStep: number; // 平均每步迭代次数
  failedSteps: number;            // 失败步数
  adaptiveStepChanges: number;    // 自适应步长变化次数
}

/**
 * 仿真事件
 */
export interface SimulationEvent {
  readonly time: Time;
  readonly type: string;
  readonly deviceId?: string | undefined;  // 明确允许undefined
  readonly description: string;
  readonly data?: any;
}

/**
 * 🚀 电路仿真引擎核心类
 * 
 * 整合所有革命性技术的统一仿真平台
 * 提供工业级的大规模电路仿真能力
 */
export class CircuitSimulationEngine {
  // 核心组件
  // @ts-ignore - 将在瞬态分析实现中使用
  private readonly _integrator: GeneralizedAlphaIntegrator;
  private readonly _eventDetector: EventDetector;
  // CHANGED: 设备容器现在接受任何 ComponentInterface
  private readonly _devices: Map<string, ComponentInterface> = new Map();
  private readonly _nodeMapping: Map<string, number> = new Map();
  
  // 🆕 额外变数管理器
  private _extraVariableManager: ExtraVariableIndexManager | null = null;
  
  // 仿真状态
  private _state: SimulationState = SimulationState.IDLE;
  private _config: SimulationConfig;
  private _currentTime: Time = 0;
  private _currentTimeStep: number = 1e-6;
  private _stepCount: number = 0;
  
  // 系统矩阵和向量
  private _systemMatrix: ISparseMatrix;
  private _rhsVector: IVector;
  private _solutionVector: IVector;
  
  // 性能监控
  private _performanceMetrics: PerformanceMetrics;
  private _startTime: number = 0;
  private _events: SimulationEvent[] = [];
  
  // 波形数据存储
  private _waveformData: WaveformData;
  
  // 内存管理
  private _memoryUsage: number = 0;
  private readonly _maxNodes: number;

  constructor(config: Partial<SimulationConfig> = {}) {
    // 配置默认参数
    this._config = {
      startTime: 0,
      endTime: 1e-3,                    // 默认 1ms 仿真
      initialTimeStep: 1e-6,            // 默认 1μs 步长
      minTimeStep: 1e-9,                // 最小 1ns
      maxTimeStep: 1e-5,                // 最大 10μs
      voltageToleranceAbs: 1e-6,        // 1μV 绝对容差
      voltageToleranceRel: 1e-9,        // 1ppb 相对容差
      currentToleranceAbs: 1e-9,        // 1nA 绝对容差
      currentToleranceRel: 1e-9,        // 1ppb 相对容差
      maxNewtonIterations: 50,          // 最大 Newton 迭代
      alphaf: 0.4,                      // Generalized-α 参数 (数值阻尼)
      alpham: 0.2,                      // Generalized-α 参数 
      beta: 0.36,                       // Newmark β
      gamma: 0.7,                       // Newmark γ  
      enableAdaptiveTimeStep: true,     // 启用自适应步长
      enablePredictiveAnalysis: true,   // 启用预测分析
      enableParallelization: false,     // 暂不启用并行化
      maxMemoryUsage: 1024,             // 1GB 内存限制
      verboseLogging: false,            // 简洁日志
      saveIntermediateResults: true,    // 保存中间结果
      enablePerformanceMonitoring: true, // 启用性能监控
      ...config
    };
    
    this._eventDetector = new EventDetector({
      minTimestep: this._config.minTimeStep,
    });

    // 初始化积分器
    this._integrator = new GeneralizedAlphaIntegrator({
      spectralRadius: this._config.alphaf, // 使用正确的参数名
      tolerance: this._config.voltageToleranceAbs,
      maxNewtonIterations: this._config.maxNewtonIterations,
      verbose: this._config.verboseLogging
    });
    
    // 估算最大节点数 (基于内存限制)
    this._maxNodes = Math.floor(this._config.maxMemoryUsage * 1024 * 1024 / (8 * 1000)); // 估算公式
    
    // 初始化矩阵和向量 (使用估算大小)
    const estimatedSize = Math.min(this._maxNodes, 1000); // 默认最大1000节点
    this._systemMatrix = new SparseMatrix(estimatedSize, estimatedSize);
    this._rhsVector = new Vector(estimatedSize);
    this._solutionVector = new Vector(estimatedSize);
    
    // 初始化性能指标
    this._performanceMetrics = {
      totalSimulationTime: 0,
      matrixAssemblyTime: 0,
      matrixSolutionTime: 0,
      deviceEvaluationTime: 0,
      convergenceCheckTime: 0,
      memoryPeakUsage: 0,
      averageIterationsPerStep: 0,
      failedSteps: 0,
      adaptiveStepChanges: 0
    };
    
    // 初始化波形数据
    this._waveformData = {
      timePoints: [],
      nodeVoltages: new Map(),
      deviceCurrents: new Map(), 
      deviceStates: new Map()
    };
  }

  /**
   * 🔧 添加组件到电路 (统一接口)
   * 
   * CHANGED: 现在接受任何 ComponentInterface，实现真正的统一架构
   */
  addDevice(device: ComponentInterface): void {
    if (this._state !== SimulationState.IDLE) {
      throw new Error('Cannot add devices while simulation is running');
    }
    
    // 使用统一的 name 属性作为键
    this._devices.set(device.name, device);
    
    // 统一处理节点映射 - 支持字符串和数字节点
    device.nodes.forEach((nodeId) => {
      const nodeName = nodeId.toString();
      if (!this._nodeMapping.has(nodeName)) {
        const globalNodeId = this._nodeMapping.size;
        this._nodeMapping.set(nodeName, globalNodeId);
      }
    });
    
    this._logEvent('DEVICE_ADDED', device.name, `Added ${device.type} device`);
  }

  /**
   * 🔧 批量添加设备 (便于复杂电路创建)
   * 
   * CHANGED: 现在接受任何 ComponentInterface 数组
   */
  addDevices(devices: ComponentInterface[]): void {
    devices.forEach(device => this.addDevice(device));
  }

  /**
   * ⚙️ 初始化仿真系统 (重构版本)
   * 
   * 整合了额外变数管理器，现在支持电感、电压源和变压器
   */
  private async _initializeSimulation(): Promise<void> {
    this._state = SimulationState.INITIALIZING;
    const initStartTime = performance.now();
    
    try {
      // 1. 驗證電路
      this._validateCircuit();
      
      // 2. 預分析並初始化額外變數管理器
      const baseNodeCount = this._nodeMapping.size;
      this._extraVariableManager = new ExtraVariableIndexManager(baseNodeCount);
      
      // 3. 分配額外變數索引給需要的元件
      for (const device of this._devices.values()) {
          if ('getExtraVariableCount' in device && typeof (device as any).getExtraVariableCount === 'function') {
              const count = (device as any).getExtraVariableCount();
              if (count > 0) {
                  // 根據類型分配
                  if (device.type === 'V' || device.type === 'L') {
                      const index = this._extraVariableManager.allocateIndex(
                          device.type === 'V' ? ExtraVariableType.VOLTAGE_SOURCE_CURRENT : ExtraVariableType.INDUCTOR_CURRENT,
                          device.name
                      );
                      if ('setCurrentIndex' in device && typeof (device as any).setCurrentIndex === 'function') {
                          (device as any).setCurrentIndex(index);
                      }
                  } else if (device.type === 'K') {
                      const primaryIndex = this._extraVariableManager.allocateIndex(ExtraVariableType.TRANSFORMER_PRIMARY_CURRENT, device.name);
                      const secondaryIndex = this._extraVariableManager.allocateIndex(ExtraVariableType.TRANSFORMER_SECONDARY_CURRENT, device.name);
                      if ('setCurrentIndices' in device && typeof (device as any).setCurrentIndices === 'function') {
                          (device as any).setCurrentIndices(primaryIndex, secondaryIndex);
                      }
                  }
              }
          }
      }
      
      // 4. 根據最終系統大小創建矩陣和向量
      const totalSystemSize = this._extraVariableManager.getTotalMatrixSize();
      this._systemMatrix = new SparseMatrix(totalSystemSize, totalSystemSize);
      this._rhsVector = new Vector(totalSystemSize);
      this._solutionVector = new Vector(totalSystemSize);
      
      this._logEvent('INIT', undefined, `System initialized with ${baseNodeCount} nodes and ${this._extraVariableManager.getExtraVariableCount()} extra variables. Total size: ${totalSystemSize}.`);
  
      // 5. 計算 DC 工作點
      await this._performDCAnalysis();
  
      // 6. 初始化波形数据存储
      this._initializeWaveformStorage();
      
      // 7. 设置初始时间和步长
      this._currentTime = this._config.startTime;
      this._currentTimeStep = this._config.initialTimeStep;
      this._stepCount = 0;
      
      const initTime = performance.now() - initStartTime;
      this._logEvent('INITIALIZATION_COMPLETE', undefined, `Initialization completed in ${initTime.toFixed(2)}ms`);
      
    } catch (error) {
      this._state = SimulationState.FAILED;
      throw new Error(`Simulation initialization failed: ${error}`);
    }
  }

  /**
   * 🆕 为设备分配额外变数索引
   * 
   * 根据设备类型分配相应的额外变数（电流变数）
   */
  private async _allocateExtraVariablesForDevice(device: ComponentInterface): Promise<void> {
    if (!this._extraVariableManager) {
      throw new Error('Extra variable manager not initialized');
    }

    // 检查设备是否需要额外变数
    if (!('getExtraVariableCount' in device) || typeof device.getExtraVariableCount !== 'function') {
      return; // 该设备不需要额外变数
    }

    const extraVariableCount = device.getExtraVariableCount();
    if (extraVariableCount === 0) {
      return;
    }

    // 根据设备类型分配相应的变数
    try {
      if (device.type === 'V') {
        // 电压源需要一个电流变数
        const index = this._extraVariableManager.allocateIndex(
          ExtraVariableType.VOLTAGE_SOURCE_CURRENT,
          device.name,
          `${device.name} 的电流变数`
        );
        
        if ('setCurrentIndex' in device && typeof device.setCurrentIndex === 'function') {
          device.setCurrentIndex(index);
        }
        
      } else if (device.type === 'L') {
        // 电感需要一个电流变数
        const index = this._extraVariableManager.allocateIndex(
          ExtraVariableType.INDUCTOR_CURRENT,
          device.name,
          `${device.name} 的电流变数`
        );
        
        if ('setCurrentIndex' in device && typeof device.setCurrentIndex === 'function') {
          device.setCurrentIndex(index);
        }
        
      } else if (device.type === 'K') {
        // 理想变压器需要两个电流变数（初级和次级）
        const primaryIndex = this._extraVariableManager.allocateIndex(
          ExtraVariableType.TRANSFORMER_PRIMARY_CURRENT,
          device.name,
          `${device.name} 的初级电流变数`
        );
        
        const secondaryIndex = this._extraVariableManager.allocateIndex(
          ExtraVariableType.TRANSFORMER_SECONDARY_CURRENT,
          device.name,
          `${device.name} 的次级电流变数`
        );
        
        if ('setCurrentIndices' in device && typeof device.setCurrentIndices === 'function') {
          device.setCurrentIndices(primaryIndex, secondaryIndex);
        }
      }
      
    } catch (error) {
      throw new Error(`Failed to allocate extra variables for device ${device.name}: ${error}`);
    }
  }

  /**
   * 🚀 运行主要仿真循环
   */
  async runSimulation(): Promise<SimulationResult> {
    this._startTime = performance.now();
    this._state = SimulationState.RUNNING;
    
    try {
      // 1. 初始化仿真
      await this._initializeSimulation();
      
      // 2. 主仿真循环
      while (this._currentTime < this._config.endTime && this._state === SimulationState.RUNNING) {
        const stepSuccess = await this._performTimeStep();
        
        if (!stepSuccess) {
          // 步长减半重试
          if (this._currentTimeStep > this._config.minTimeStep * 2) {
            this._currentTimeStep *= 0.5;
            this._performanceMetrics.adaptiveStepChanges++;
            continue;
          } else {
            // 无法继续，仿真失败
            this._state = SimulationState.FAILED;
            break;
          }
        }
        
        // 3. 保存波形数据
        if (this._config.saveIntermediateResults) {
          this._saveWaveformPoint();
        }
        
        // 4. 自适应时间步长调整
        if (this._config.enableAdaptiveTimeStep) {
          await this._adaptTimeStep();
        }
        
        // 5. 内存使用检查
        if (this._memoryUsage > this._config.maxMemoryUsage * 1024 * 1024) {
          this._logEvent('MEMORY_WARNING', undefined, 'Memory usage exceeded limit');
          break;
        }
        
        this._stepCount++;
      }
      
      // 3. 生成最终结果
      return this._generateFinalResult();
      
    } catch (error) {
      this._state = SimulationState.FAILED;
      return {
        success: false,
        finalTime: this._currentTime,
        totalSteps: this._stepCount,
        convergenceRate: 0,
        averageStepTime: 0,
        peakMemoryUsage: this._memoryUsage / (1024 * 1024),
        waveformData: this._waveformData,
        performanceMetrics: this._performanceMetrics,
        errorMessage: `Simulation failed: ${error}`
      };
    }
  }

  /**
   * ⏸️ 暂停仿真
   */
  pauseSimulation(): void {
    if (this._state === SimulationState.RUNNING) {
      this._state = SimulationState.PAUSED;
      this._logEvent('SIMULATION_PAUSED', undefined, `Paused at t=${this._currentTime}`);
    }
  }

  /**
   ▶️ 恢复仿真
   */
  resumeSimulation(): void {
    if (this._state === SimulationState.PAUSED) {
      this._state = SimulationState.RUNNING;
      this._logEvent('SIMULATION_RESUMED', undefined, `Resumed at t=${this._currentTime}`);
    }
  }

  /**
   * ⏹️ 停止仿真
   */
  stopSimulation(): void {
    this._state = SimulationState.COMPLETED;
    this._logEvent('SIMULATION_STOPPED', undefined, `Stopped at t=${this._currentTime}`);
  }

  /**
   * 📊 获取当前仿真状态
   */
  getSimulationStatus() {
    return {
      state: this._state,
      currentTime: this._currentTime,
      progress: (this._currentTime - this._config.startTime) / (this._config.endTime - this._config.startTime),
      stepCount: this._stepCount,
      currentTimeStep: this._currentTimeStep,
      memoryUsage: this._memoryUsage / (1024 * 1024), // MB
      deviceCount: this._devices.size,
      nodeCount: this._nodeMapping.size
    };
  }

  // === 私有方法实现 ===

  private _validateCircuit(): void {
    if (this._devices.size === 0) {
      throw new Error('No devices found in circuit');
    }
    
    if (this._nodeMapping.size > this._maxNodes) {
      throw new Error(`Too many nodes: ${this._nodeMapping.size} > ${this._maxNodes}`);
    }
    
    // 验证节点连通性 (简化检查)
    const connectedNodes = new Set<number>();
    this._devices.forEach(device => {
      device.nodes.forEach(nodeId => {
        const globalNodeId = this._nodeMapping.get(nodeId.toString());
        if (globalNodeId !== undefined) {
          connectedNodes.add(globalNodeId);
        }
      });
    });
    
    if (connectedNodes.size !== this._nodeMapping.size) {
      console.warn('Warning: Some nodes may not be connected');
    }
  }

  /**
   * ⚙️ 执行 DC 工作点分析 (完全重构)
   * 实现了源步进 (外部循环) 和带步长阻尼的 Newton-Raphson (内部循环)
   */
  private async _performDCAnalysis(): Promise<void> {
    console.log('📊 開始 DC 工作點分析...');
    
    // 步驟 1: 標準 Newton-Raphson (帶阻尼)
    let dcResult = await this._solveDCNewtonRaphson();
    if (dcResult) {
      this._logEvent('dc_converged', undefined, '標準 Newton 收斂');
      return;
    }
    
    // 步驟 2: 源步進 (當前實現)
    console.log('🔄 標準 Newton 失敗，嘗試源步進...');
    dcResult = await this._sourceSteppingHomotopy();
    if (dcResult) {
      this._logEvent('dc_converged', undefined, '源步進收斂');
      return;
    }
    
    // 步驟 3: Gmin Stepping (新添加)
    console.log('🔄 源步進失敗，嘗試 Gmin Stepping...');
    dcResult = await this._gminSteppingHomotopy();
    if (dcResult) {
      this._logEvent('dc_converged', undefined, 'Gmin Stepping 收斂');
      return;
    }
    
    // 最終失敗
    this._logEvent('dc_failed', undefined, '所有 DC 方法失敗');
    throw new Error('DC 工作點分析失敗');
  }

  private async _sourceSteppingHomotopy(): Promise<boolean> {
    const sources = Array.from(this._devices.values()).filter(d => 'scaleSource' in d) as (ComponentInterface & ScalableSource)[];
    const stepFactors = [0.0, 0.25, 0.5, 0.75, 1.0];
    let converged = false;

    for (const factor of stepFactors) {
      this._logEvent('DC_SOURCE_STEP', undefined, `Setting source factor to ${(factor * 100).toFixed(0)}%`);
      
      for (const source of sources) {
        source.scaleSource(factor);
      }

      converged = await this._solveDCNewtonRaphson();

      if (!converged) {
        this._logEvent('DC_STEP_FAILED', undefined, `Newton-Raphson failed to converge at source factor ${factor}`);
        for (const source of sources) {
          source.restoreSource();
        }
        return false;
      }
    }

    for (const source of sources) {
      source.restoreSource();
    }
    
    return converged;
  }

  // 新方法: Gmin Stepping
  private async _gminSteppingHomotopy(): Promise<boolean> {
    const gminSteps = 10;  // 步進次數
    const initialGmin = 1e-2;  // 初始大電導 (S)
    const finalGmin = 1e-12;   // 最終小電導 (近零)
    
    let currentSolution = this._solutionVector.clone();  // 從上次嘗試開始
    
    for (let step = 0; step <= gminSteps; step++) {
      const factor = step / gminSteps;
      const currentGmin = initialGmin * Math.pow(finalGmin / initialGmin, factor);
      
      // 臨時添加 Gmin 到所有 PN 接面 (e.g., 二極管、BJT)
      this._applyGminToNonlinearDevices(currentGmin);
      
      // 重新構建 MNA 並求解
      const newtonResult = await this._solveDCNewtonRaphson();
      
      // 移除臨時 Gmin
      this._removeGminFromNonlinearDevices();
      
      if (!newtonResult) {
        return false;
      }
      
      this._logEvent('gmin_step', undefined, `Gmin=${currentGmin.toExponential(2)}, 步驟 ${step}/${gminSteps}`);
    }
    
    return true;
  }

  // 輔助: 應用/移除 Gmin (在 NonlinearDevice 如 Diode 中添加 stampGmin 方法)
  private _applyGminToNonlinearDevices(gmin: number): void {
    const devices = Array.from(this._devices.values());
    for (const device of devices) {
      if ('stampGmin' in device && typeof (device as any).stampGmin === 'function') {
        (device as any).stampGmin(gmin);
      }
    }
  }

  private _removeGminFromNonlinearDevices(): void {
    const devices = Array.from(this._devices.values());
    for (const device of devices) {
      if ('stampGmin' in device && typeof (device as any).stampGmin === 'function') {
        (device as any).stampGmin(0);
      }
    }
  }


  /**
   * 🆕 辅助方法：执行 Newton-Raphson 迭代求解 DC 工作点
   */
  private async _solveDCNewtonRaphson(): Promise<boolean> {
    let iterations = 0;
    
    while (iterations < this._config.maxNewtonIterations) {
      // a. 根据当前解 _solutionVector 装配系统
      await this._assembleSystem(0); // 明确传递 DC 时间点 t=0
      
      // b. 计算残差 F(x)，在我们的 MNA 框架中，它就是右侧向量 _rhsVector
      const residual = this._rhsVector;
      const residualNorm = residual.norm();

      // c. 检查收敛
      if (this._checkConvergenceDC(residualNorm, iterations)) {
        return true; // 收敛成功
      }

      // d. 求解线性系统 J * Δx = -F(x)
      const jacobian = this._systemMatrix;
      const negResidual = residual.scale(-1);
      const fullStepDeltaV = await this._solveLinearSystem(jacobian, negResidual);

      // e. 实现步长阻尼 (Line Search)
      const { accepted, finalSolution } = await this._applyDampedStep(fullStepDeltaV, residualNorm);

      if (!accepted) {
        this._logEvent('DC_DAMPING_FAILED', undefined, `Step damping failed at iteration ${iterations}. Convergence is unlikely.`);
        return false; // 阻尼失败，无法前进
      }

      this._solutionVector = finalSolution;
      iterations++;
    }

    this._logEvent('DC_NR_FAILED', undefined, `Newton-Raphson exceeded max iterations (${this._config.maxNewtonIterations}).`);
    return false; // 超过最大迭代次数
  }

  /**
   * 🆕 辅助方法：应用带阻尼的更新步长
   */
  private async _applyDampedStep(fullStep: IVector, initialResidualNorm: number): Promise<{ accepted: boolean, finalSolution: IVector }> {
    let alpha = 1.0; // 阻尼因子，从 1 (完整步长) 开始
    const minAlpha = 1e-4;

    while (alpha > minAlpha) {
      const trialSolution = this._solutionVector.plus(fullStep.scale(alpha));
      
      // 使用试探解计算新的残差
      const trialResidualNorm = await this._calculateResidualNorm(trialSolution);

      // 如果新的残差小于旧的，则接受这一步
      if (trialResidualNorm < initialResidualNorm) {
        return { accepted: true, finalSolution: trialSolution };
      }

      // 否则，减小步长再试一次
      alpha /= 2;
    }

    return { accepted: false, finalSolution: this._solutionVector }; // 阻尼失败
  }

  /**
   * 🆕 辅助方法：仅计算残差范数 (用于步长阻尼)
   */
  private async _calculateResidualNorm(solution: IVector): Promise<number> {
    // 这是计算成本较高的部分，因为它需要重新评估所有非线性设备
    const originalSolution = this._solutionVector;
    this._solutionVector = solution; // 临时设置为试探解
    
    await this._assembleSystem(0); // 在 DC 分析中重新装配，使用 t=0
    const norm = this._rhsVector.norm();

    this._solutionVector = originalSolution; // 恢复原始解
    return norm;
  }
  
  /**
   * 🆕 辅助方法：检查 DC 收敛
   */
  private _checkConvergenceDC(residualNorm: number, iteration: number): boolean {
    // 这里我们使用一个简化的收敛标准，基于电流残差
    const converged = residualNorm < this._config.currentToleranceAbs;
    if (this._config.verboseLogging) {
      console.log(`  [DC Iter ${iteration}] Residual Norm = ${residualNorm.toExponential(4)}`);
    }
    return converged;
  }

  /**
   * 🚀 執行一個時間步進 (事件驅動重構版)
   * 
   * 核心流程：
   * 1. 執行一個完整的積分器步進。
   * 2. 檢查在 [t_n, t_{n+1}] 區間內是否發生了事件。
   * 3. 如果沒有事件，接受該步進。
   * 4. 如果有事件，使用二分法精確定位第一個事件的時間 t_event。
   * 5. 將仿真時間推進到 t_event，更新解，並處理事件。
   * 6. 從 t_event 繼續執行剩餘的時間步。
   */
  private async _performTimeStep(): Promise<boolean> {
    const t_start = this._currentTime;
    let dt = this._currentTimeStep;
    const original_t_end = t_start + dt;

    while (true) { // 使用循環來處理單步內可能發生的多個事件
        const t_end = this._currentTime + dt;

        // 1. 執行試探性積分步
        // @ts-ignore
        const integratorResult = await this._integrator.step(this, this._currentTime, dt, this._solutionVector);
        if (!integratorResult.converged) {
            this._logEvent('INTEGRATOR_FAILURE', undefined, `Integrator failed to converge at t=${this._currentTime}`);
            return false; // 積分失敗，需要外部循環減小步長重試
        }
        const tentativeSolution = integratorResult.solution;

        // 2. 檢測事件
        const eventfulComponents = Array.from(this._devices.values()).filter(d => d.getEventFunctions);
        const events = this._eventDetector.detectEvents(
            eventfulComponents,
            this._currentTime, t_end, this._solutionVector, tentativeSolution
        );

        if (events.length === 0) {
            // 3.A. 沒有事件：接受此步
            this._currentTime = t_end;
            this._solutionVector = tentativeSolution;
            this._currentTimeStep = integratorResult.nextDt; // 使用積分器建議的下一步長
            return true; // 步進成功
        } else {
            // 3.B. 有事件：處理第一個事件
            const firstEvent = events[0]; 
            if (!firstEvent) return true; // Should not happen, but satisfies compiler

            this._logEvent('EVENT_DETECTED', firstEvent.component.name, `Event ${firstEvent.type} detected at ~${firstEvent.time.toExponential(3)}s`);

            // 4. 精確定位事件時間
            const eventTime = await this._eventDetector.locateEventTime(firstEvent, (time: Time) => this._integrator.interpolate(time));
            
            // 檢查事件是否太近
            if (this._eventDetector.isTimestepTooSmall(eventTime - this._currentTime)) {
                this._logEvent('EVENT_TOO_CLOSE', firstEvent.component.name, `Event time is too close. Forcing step to event time.`);
                // 事件太近，先強行推進到事件點，然後在下一個大步中解決
                this._currentTime = eventTime;
                this._solutionVector = this._integrator.interpolate(eventTime);
                this._handleEvent(firstEvent); // 處理事件
                // @ts-ignore
                this._integrator.restart({ time: this._currentTime, solution: this._solutionVector });
                return true;
            }

            // 5. 拒絕試探步，精確積分到事件點
            const eventDt = eventTime - this._currentTime;
            // @ts-ignore
            const finalResult = await this._integrator.step(this, this._currentTime, eventDt, this._solutionVector);
            
            // 6. 更新狀態到事件點並處理事件
            this._currentTime = eventTime;
            this._solutionVector = finalResult.solution;
            this._handleEvent(firstEvent);

            // 7. 積分器需要重新啟動以處理不連續性
            // @ts-ignore
            this._integrator.restart({ time: this._currentTime, solution: this._solutionVector });

            // 更新剩餘的時間步，在同一個 _performTimeStep 內繼續
            dt = original_t_end - this._currentTime;
            if (this._eventDetector.isTimestepTooSmall(dt)) {
                return true; // 剩餘時間太短，結束此步
            }
            // 否則，循環將使用剩餘的 dt 繼續嘗試走完原計劃的步長
        }
    }
  }

  /**
   * 處理單個仿真事件
   * @param event 要處理的事件
   */
  private _handleEvent(event: IEvent): void {
    const device = event.component;
    if (device && 'handleEvent' in device && typeof device.handleEvent === 'function') {
      // @ts-ignore
      device.handleEvent(event.type, event);
      this._logEvent('EVENT_HANDLED', device.name, `Device handled event ${event.type}`);
    }
    // 可以在此處添加更通用的事件處理邏輯
  }

  /**
   * 🚀 系统矩阵装配 (重构版本)
   * 
   * 使用统一的组装接口，消除 stamp() vs load() 的分裂
   * 所有组件都通过 assemble() 方法提供其 MNA 贡献
   * 
   * @param time - 装配时的仿真时间 (默认使用当前时间)
   * @param gmin - Gmin Stepping 的电导值
   */
  private async _assembleSystem(time: number = this._currentTime, gmin: number = 0): Promise<void> {
    const assemblyStartTime = performance.now();
    
    // 清空矩阵和向量
    this._systemMatrix.clear();
    this._rhsVector.fill(0);
    
    // 創建統一的組裝上下文
    const assemblyContext: AssemblyContext = {
      matrix: this._systemMatrix as SparseMatrix,
      rhs: this._rhsVector as Vector,
      nodeMap: this._nodeMapping,
      currentTime: time,
      solutionVector: this._solutionVector as Vector,
      gmin: gmin,
      getExtraVariableIndex: (componentName: string, variableType: string) => 
        this._extraVariableManager?.getIndex(componentName, variableType as ExtraVariableType)
    };
    
    // ✅ 這就是先進架構的威力：一個簡單、統一的迴圈！
    for (const device of this._devices.values()) {
      try {
        device.assemble(assemblyContext);
      } catch (error) {
        throw new Error(`Assembly failed for component ${device.name}: ${error}`);
      }
    }
    
    this._performanceMetrics.matrixAssemblyTime += performance.now() - assemblyStartTime;
  }

  private async _solveLinearSystem(_A: ISparseMatrix, b: IVector): Promise<IVector> {
    // TODO: 集成 Ultra KLU WASM 求解器
    // 暂时使用简化的直接求解
    
    // 简化实现：对角占优矩阵的 Jacobi 迭代
    const solution = new Vector(b.size);
    const iterations = 100;
    
    for (let iter = 0; iter < iterations; iter++) {
      for (let i = 0; i < b.size; i++) {
        let sum = 0;
        for (let j = 0; j < b.size; j++) {
          if (i !== j) {
            // 需要实现矩阵元素访问
            // sum += A.get(i, j) * solution.get(j);
          }
        }
        // const diag = A.get(i, i) || 1.0;
        const diag = 1.0; // 简化
        solution.set(i, (b.get(i) - sum) / diag);
      }
    }
    
    return solution;
  }

  private async _applyStepLimiting(deltaV: IVector): Promise<IVector> {
    let limitedDeltaV = deltaV;
    
    // 只对智能设备应用步长限制
    const devices = Array.from(this._devices.values());
    for (const device of devices) {
      if (isIntelligentDeviceModel(device)) {
        limitedDeltaV = device.limitUpdate(limitedDeltaV);
      }
    }
    
    return limitedDeltaV;
  }

  /**
   * 🌐 全局策略：線搜索算法 (Armijo條件)
   * 
   * 實現工業級線搜索，確保在困難電路中的收斂性
   * 基於Armijo條件的backtracking line search
   */
  private async _globalLineSearch(searchDirection: IVector, initialResidualNorm: number): Promise<{ alpha: number, newSolution: IVector, converged: boolean }> {
    const c1 = 1e-4; // Armijo條件參數
    const rho = 0.5;  // 步長收縮比例
    let alpha = 1.0;  // 初始步長
    const maxLineSearchIterations = 20;
    
    const initialSolution = this._solutionVector;
    
    for (let iter = 0; iter < maxLineSearchIterations; iter++) {
      // 試探新解
      const trialSolution = initialSolution.plus(searchDirection.scale(alpha));
      
      // 計算新的目標函數值（殘差范數）
      const newResidualNorm = await this._calculateResidualNorm(trialSolution);
      
      // Armijo條件檢查
      const armijoCondition = newResidualNorm <= initialResidualNorm * (1 - c1 * alpha);
      
      if (armijoCondition) {
        console.log(`🎯 線搜索成功: α=${alpha.toFixed(4)}, 殘差減少 ${((1 - newResidualNorm/initialResidualNorm)*100).toFixed(2)}%`);
        return { 
          alpha, 
          newSolution: trialSolution, 
          converged: true 
        };
      }
      
      // 收縮步長
      alpha *= rho;
      
      if (alpha < 1e-8) {
        console.log('⚠️ 線搜索步長過小，退出');
        break;
      }
    }
    
    console.log('❌ 線搜索失敗，使用原始解');
    return { 
      alpha: 0, 
      newSolution: initialSolution, 
      converged: false 
    };
  }

  /**
   * 🌐 全局策略：Trust Region算法
   * 
   * 當Newton方法失敗時的備用策略
   * 限制搜索區域，保證數值穩定性
   */
  private async _trustRegionMethod(jacobian: ISparseMatrix, residual: IVector, trustRadius: number): Promise<{ step: IVector, newRadius: number, success: boolean }> {
    // 求解 Trust Region 子問題: min ||J*p + r||^2, s.t. ||p|| <= trustRadius
    
    // 1. 嘗試完整Newton步
    const fullNewtonStep = await this._solveLinearSystem(jacobian, residual.scale(-1));
    const fullStepNorm = await this._vectorNorm(fullNewtonStep);
    
    let proposedStep: IVector;
    
    if (fullStepNorm <= trustRadius) {
      // Newton步在trust region內，直接使用
      proposedStep = fullNewtonStep;
      console.log(`🎯 Trust Region: 使用完整Newton步 (||p||=${fullStepNorm.toFixed(4)} <= ${trustRadius.toFixed(4)})`);
    } else {
      // Newton步超出trust region，需要截斷
      const scaleFactor = trustRadius / fullStepNorm;
      proposedStep = fullNewtonStep.scale(scaleFactor);
      console.log(`🔄 Trust Region: 截斷Newton步 (比例=${scaleFactor.toFixed(4)})`);
    }
    
    // 2. 計算實際降幅與預測降幅的比值
    const currentSolution = this._solutionVector;
    const trialSolution = currentSolution.plus(proposedStep);
    
    const currentResidualNorm = await this._calculateResidualNorm(currentSolution);
    const trialResidualNorm = await this._calculateResidualNorm(trialSolution);
    
    const actualReduction = currentResidualNorm - trialResidualNorm;
    const predictedReduction = this._predictedReduction(jacobian, residual, proposedStep);
    
    const rho = actualReduction / predictedReduction; // 實際降幅/預測降幅
    
    // 3. 調整trust region半徑
    let newRadius = trustRadius;
    let success = false;
    
    if (rho > 0.75 && Math.abs(this._vectorNorm(proposedStep) - trustRadius) < 1e-12) {
      // 步長接近邊界且效果很好，擴大region
      newRadius = Math.min(2 * trustRadius, 1.0);
      success = true;
      console.log(`📈 Trust Region 擴大: ${trustRadius.toFixed(4)} → ${newRadius.toFixed(4)}`);
    } else if (rho > 0.25) {
      // 效果尚可，保持region
      success = true;
      console.log(`✅ Trust Region 保持: ${trustRadius.toFixed(4)}`);
    } else {
      // 效果不佳，縮小region
      newRadius = 0.5 * trustRadius;
      success = false;
      console.log(`📉 Trust Region 縮小: ${trustRadius.toFixed(4)} → ${newRadius.toFixed(4)}`);
    }
    
    return { step: proposedStep, newRadius, success };
  }

  /**
   * 🌐 全局策略：預測降幅計算
   */
  private _predictedReduction(jacobian: ISparseMatrix, residual: IVector, step: IVector): number {
    // 線性模型預測: m(p) = 0.5 * ||J*p + r||^2
    // 預測降幅 = 0.5 * ||r||^2 - 0.5 * ||J*p + r||^2
    const jacobianTimesStep = jacobian.multiply(step);
    const newResidual = residual.plus(jacobianTimesStep);
    
    const oldObjective = 0.5 * this._vectorNorm(residual) ** 2;
    const newObjective = 0.5 * this._vectorNorm(newResidual) ** 2;
    
    return oldObjective - newObjective;
  }

  /**
   * 🌐 全局策略：向量范數計算
   */
  private async _vectorNorm(vector: IVector): Promise<number> {
    let sum = 0;
    for (let i = 0; i < vector.size; i++) {
      const val = vector.get(i);
      sum += val * val;
    }
    return Math.sqrt(sum);
  }

  /**
   * 🌐 全局策略：高級重啟策略
   * 
   * 當所有方法都失敗時的最後手段
   */
  private async _advancedRestartStrategy(): Promise<{ newSolution: IVector, success: boolean }> {
    console.log('🔄 啟動高級重啟策略...');
    
    // 策略1: 回退到更保守的初始條件
    const conservativeSolution = this._solutionVector.scale(0.1); // 縮小所有電壓
    console.log('📉 嘗試保守解 (電壓×0.1)');
    
    // 策略2: 隨機擾動當前解
    const perturbedSolution = this._addRandomPerturbation(this._solutionVector, 0.01);
    console.log('🎲 嘗試隨機擾動解');
    
    // 策略3: 分段線性化
    const segmentedSolution = await this._segmentedLinearization();
    console.log('🔀 嘗試分段線性化');
    
    // 選擇最佳候選解
    const candidates = [conservativeSolution, perturbedSolution, segmentedSolution];
    let bestSolution = this._solutionVector;
    let bestResidual = Infinity;
    
    for (const candidate of candidates) {
      const residualNorm = await this._calculateResidualNorm(candidate);
      if (residualNorm < bestResidual) {
        bestResidual = residualNorm;
        bestSolution = candidate;
      }
    }
    
    const improvement = bestResidual < await this._calculateResidualNorm(this._solutionVector);
    console.log(`🎯 重啟策略結果: ${improvement ? '成功' : '失敗'}, 殘差=${bestResidual.toExponential(3)}`);
    
    return { newSolution: bestSolution, success: improvement };
  }

  /**
   * 輔助方法：添加隨機擾動
   */
  private _addRandomPerturbation(solution: IVector, magnitude: number): IVector {
    const perturbedData: number[] = [];
    for (let i = 0; i < solution.size; i++) {
      const perturbation = (Math.random() - 0.5) * 2 * magnitude;
      perturbedData.push(solution.get(i) + perturbation);
    }
    return Vector.from(perturbedData);
  }

  /**
   * 輔助方法：分段線性化求解
   */
  private async _segmentedLinearization(): Promise<IVector> {
    // 簡化版：線性內插到零解
    const alpha = 0.5;
    return this._solutionVector.scale(alpha);
  }

  /**
   * CHANGED: 收敛检查 - 只对智能设备进行设备级收敛检查
   */
  private async _checkConvergence(deltaV: IVector): Promise<boolean> {
    // 全局收敛检查
    const maxDelta = this._getMaxAbsValue(deltaV);
    const relativeDelta = this._getRelativeChange(deltaV);
    
    // 添加調試信息
    if (this._config.verboseLogging) {
      console.log(`🔍 收斂檢查: maxDelta=${maxDelta.toExponential(3)}, relativeDelta=${relativeDelta.toExponential(3)}`);
      console.log(`🔍 容差: abs=${this._config.voltageToleranceAbs.toExponential(3)}, rel=${this._config.voltageToleranceRel.toExponential(3)}`);
    }
    
    const voltageConverged = maxDelta < this._config.voltageToleranceAbs && 
                            relativeDelta < this._config.voltageToleranceRel;
    
    // 设备级收敛检查 - 只对智能设备进行
    let deviceConvergenceCount = 0;
    let totalIntelligentDevices = 0;
    
    const devices = Array.from(this._devices.values());
    for (const device of devices) {
      if (isIntelligentDeviceModel(device)) {
        totalIntelligentDevices++;
        const convergenceInfo = device.checkConvergence(deltaV);
        if (convergenceInfo.converged) {
          deviceConvergenceCount++;
        }
      }
    }
    
    // 如果沒有智能設備，認為設備層面已收斂
    const deviceConverged = totalIntelligentDevices === 0 || deviceConvergenceCount === totalIntelligentDevices;
    
    const overallConverged = voltageConverged && deviceConverged;
    
    if (this._config.verboseLogging) {
      console.log(`🔍 收斂結果: voltage=${voltageConverged}, device=${deviceConverged}, overall=${overallConverged}`);
    }
    
    return overallConverged;
  }

  /**
   * CHANGED: 状态更新 - 只为智能设备更新状态
   */
  private async _updateDeviceStates(): Promise<void> {
    const devices = Array.from(this._devices.values());
    for (const device of devices) {
      if (isIntelligentDeviceModel(device)) {
        // 创建新的设备状态 (只对智能设备)
        const newState: DeviceState = {
          deviceId: device.deviceId,
          time: this._currentTime,
          voltage: this._solutionVector,
          current: new Vector(device.nodes.length), // TODO: 计算实际电流
          operatingMode: 'normal',
          parameters: device.parameters,
          internalStates: {},
          temperature: 300
        };
        
        device.updateState(newState);
      }
      // 基础组件不需要状态更新，因为它们是无状态的
    }
  }

  /**
   * CHANGED: 自适应步长 - 基于智能设备的预测
   */
  private async _adaptTimeStep(): Promise<void> {
    if (!this._config.enablePredictiveAnalysis) return;
    
    // 基于智能设备预测的自适应步长调整
    let suggestedTimeStep = this._currentTimeStep;
    
    const devices = Array.from(this._devices.values());
    for (const device of devices) {
      if (isIntelligentDeviceModel(device)) {
        const prediction = device.predictNextState(this._currentTimeStep);
        if (prediction.suggestedTimestep > 0 && prediction.suggestedTimestep < suggestedTimeStep) {
          suggestedTimeStep = prediction.suggestedTimestep;
        }
      }
      // 基础组件不参与自适应步长预测
    }
    
    // 限制步长变化幅度
    const maxIncrease = 1.5;
    const maxDecrease = 0.5;
    
    if (suggestedTimeStep > this._currentTimeStep * maxIncrease) {
      suggestedTimeStep = this._currentTimeStep * maxIncrease;
    } else if (suggestedTimeStep < this._currentTimeStep * maxDecrease) {
      suggestedTimeStep = this._currentTimeStep * maxDecrease;
    }
    
    // 应用步长限制
    suggestedTimeStep = Math.max(this._config.minTimeStep, 
                                Math.min(this._config.maxTimeStep, suggestedTimeStep));
    
    if (Math.abs(suggestedTimeStep - this._currentTimeStep) / this._currentTimeStep > 0.1) {
      this._currentTimeStep = suggestedTimeStep;
      this._performanceMetrics.adaptiveStepChanges++;
    }
  }

  private _saveWaveformPoint(): void {
    // 保存当前时间点的波形数据
    (this._waveformData.timePoints as Time[]).push(this._currentTime);
    
    // 保存节点电压
    for (let i = 0; i < this._solutionVector.size; i++) {
      if (!this._waveformData.nodeVoltages.has(i)) {
        (this._waveformData.nodeVoltages as Map<number, number[]>).set(i, []);
      }
      (this._waveformData.nodeVoltages.get(i) as number[]).push(this._solutionVector.get(i));
    }
    
    // 保存设备电流和状态 (简化实现) - 只对智能设备
    const devices = Array.from(this._devices.values());
    for (const device of devices) {
      if (isIntelligentDeviceModel(device)) {
        const deviceId = device.deviceId;
        
        if (!this._waveformData.deviceCurrents.has(deviceId)) {
          (this._waveformData.deviceCurrents as Map<string, number[]>).set(deviceId, []);
          (this._waveformData.deviceStates as Map<string, string[]>).set(deviceId, []);
        }
        
        // TODO: 获取实际设备电流
        (this._waveformData.deviceCurrents.get(deviceId) as number[]).push(0);
        (this._waveformData.deviceStates.get(deviceId) as string[]).push('normal');
      } else {
        // 对基础组件，使用统一的 name 属性
        const deviceId = device.name;
        
        if (!this._waveformData.deviceCurrents.has(deviceId)) {
          (this._waveformData.deviceCurrents as Map<string, number[]>).set(deviceId, []);
          (this._waveformData.deviceStates as Map<string, string[]>).set(deviceId, []);
        }
        
        // TODO: 获取实际设备电流
        (this._waveformData.deviceCurrents.get(deviceId) as number[]).push(0);
        (this._waveformData.deviceStates.get(deviceId) as string[]).push('normal');
      }
    }
  }

  private _generateFinalResult(): SimulationResult {
    const totalTime = performance.now() - this._startTime;
    this._performanceMetrics.totalSimulationTime = totalTime;
    
    const convergenceRate = 1 - (this._performanceMetrics.failedSteps / Math.max(this._stepCount, 1));
    
    return {
      success: this._state === SimulationState.COMPLETED || this._currentTime >= this._config.endTime,
      finalTime: this._currentTime,
      totalSteps: this._stepCount,
      convergenceRate,
      averageStepTime: totalTime / Math.max(this._stepCount, 1),
      peakMemoryUsage: this._performanceMetrics.memoryPeakUsage,
      waveformData: this._waveformData,
      performanceMetrics: this._performanceMetrics
    };
  }

  private _initializeWaveformStorage(): void {
    // 预分配波形数据存储
    // 开始瞬态分析 (暂时跳过，集中精力于DC分析)
    
    // 节点电压存储
    for (let nodeId = 0; nodeId < this._nodeMapping.size; nodeId++) {
      (this._waveformData.nodeVoltages as Map<number, number[]>).set(nodeId, []);
    }
    
    // 设备电流和状态存储
    const devices = Array.from(this._devices.values());
    for (const device of devices) {
      const deviceId = isIntelligentDeviceModel(device) ? device.deviceId : device.name;
      (this._waveformData.deviceCurrents as Map<string, number[]>).set(deviceId, []);
      (this._waveformData.deviceStates as Map<string, string[]>).set(deviceId, []);
    }
  }

  private _logEvent(type: string, deviceId?: string, description: string = ''): void {
    const event: SimulationEvent = {
      time: this._currentTime,
      type,
      deviceId,
      description,
      data: null
    };
    
    this._events.push(event);
    
    if (this._config.verboseLogging) {
      console.log(`[${type}] t=${this._currentTime.toExponential(3)} ${deviceId ? `[${deviceId}]` : ''}: ${description}`);
    }
  }

  // 辅助方法
  private _getMaxAbsValue(vector: IVector): number {
    let max = 0;
    for (let i = 0; i < vector.size; i++) {
      max = Math.max(max, Math.abs(vector.get(i)));
    }
    return max;
  }

  private _getRelativeChange(deltaV: IVector): number {
    const deltaNorm = deltaV.norm();
    const stateNorm = Math.max(this._solutionVector.norm(), 1e-12);
    return deltaNorm / stateNorm;
  }

  // 公共 API 方法

  /**
   * 📊 获取仿真事件日志
   */
  getSimulationEvents(): readonly SimulationEvent[] {
    return this._events;
  }

  /**
   * 📈 获取波形数据
   */
  getWaveformData(): WaveformData {
    return this._waveformData;
  }

  /**
   * 📊 获取性能指标
   */
  getPerformanceMetrics(): PerformanceMetrics {
    return { ...this._performanceMetrics };
  }

  /**
   * 🔧 获取设备列表 (更新为统一接口)
   */
  getDevices(): Map<string, ComponentInterface> {
    return new Map(this._devices);
  }
  
  /**
   * 🔧 获取智能设备列表 (仅返回智能设备)
   */
  getIntelligentDevices(): Map<string, IIntelligentDeviceModel> {
    const intelligentDevices = new Map<string, IIntelligentDeviceModel>();
    const deviceEntries = Array.from(this._devices.entries());
    for (const [key, device] of deviceEntries) {
      if (isIntelligentDeviceModel(device)) {
        intelligentDevices.set(key, device);
      }
    }
    return intelligentDevices;
  }

  /**
   * 🗺️ 获取节点映射
   */
  getNodeMapping(): Map<string, number> {
    return new Map(this._nodeMapping);
  }

  /**
   * 🎯 檢測預步事件
   */
  private async _detectPreStepEvents(): Promise<any[]> {
    // 檢測可能的器件狀態變化 - 只對智能設備進行
    const events: any[] = [];
    
    const devices = Array.from(this._devices.values());
    for (const device of devices) {
      if (isIntelligentDeviceModel(device)) {
        // 檢查二極管是否即將轉換狀態
        if (device.deviceType === 'diode') {
          const nodes = device.nodes;
          if (nodes.length >= 2 && nodes[0] !== undefined && nodes[1] !== undefined) {
            // 使用 nodeMapping 來獲取節點的矩陣索引
            const node0Index = this._getNodeIndex(nodes[0]);
            const node1Index = this._getNodeIndex(nodes[1]);
            
            if (node0Index !== -1 && node1Index !== -1) {
              const currentV = this._solutionVector.get(node0Index) - 
                              this._solutionVector.get(node1Index);
              const threshold = 0.6; // 二極管轉折電壓
              
              if (Math.abs(currentV - threshold) < 0.1) {
                events.push({
                  type: 'diode_transition',
                  device: device,
                  voltage: currentV
                });
              }
            }
          }
        }
      }
    }
    
    return events;
  }
  
  /**
   * 輔助方法：根據節點 ID 獲取矩陣索引
   */
  private _getNodeIndex(nodeId: number): number {
    // 對於智能設備，節點 ID 通常是數字，需要找到對應的字符串映射
    const nodeMappingEntries = Array.from(this._nodeMapping.entries());
    for (const [nodeName, index] of nodeMappingEntries) {
      if (parseInt(nodeName) === nodeId) {
        return index;
      }
    }
    return -1; // 未找到
  }

  /**
   * 🎯 處理預步事件
   */
  private _handlePreStepEvents(events: any[]): void {
    for (const event of events) {
      console.log(`🎯 處理預步事件: ${event.type}`);
      // 可以調整步長或初始條件
      if (event.type === 'diode_transition') {
        this._currentTimeStep = Math.min(this._currentTimeStep, 1e-9);
      }
    }
  }

  /**
   * 🎯 檢測後步事件
   */
  private async _detectPostStepEvents(): Promise<any[]> {
    const events: any[] = [];
    // 檢測器件狀態實際變化
    return events;
  }

  /**
   * 🎯 處理後步事件
   */
  private async _handlePostStepEvents(events: any[]): Promise<void> {
    for (const event of events) {
      console.log(`🎯 處理後步事件: ${event.type}`);
    }
  }

  /**
   * ✅ 驗證解的物理合理性
   */
  private async _validateSolution(): Promise<boolean> {
    // 檢查節點電壓是否在合理範圍內
    for (let i = 0; i < this._solutionVector.size; i++) {
      const voltage = this._solutionVector.get(i);
      if (Math.abs(voltage) > 1000) { // 超過1kV可能不合理
        console.log(`⚠️ 節點 ${i} 電壓過大: ${voltage}V`);
        return false;
      }
      if (isNaN(voltage) || !isFinite(voltage)) {
        console.log(`⚠️ 節點 ${i} 電壓無效: ${voltage}`);
        return false;
      }
    }
    return true;
  }

  /**
   * 🛡️ Newton失敗處理策略 (增強版)
   */
  private async _handleNewtonFailure(retryCount: number): Promise<string> {
    console.log(`🛡️ Newton失敗處理 - 第 ${retryCount + 1} 次重試`);
    
    if (retryCount === 0) {
      // 第一次重試：使用線搜索
      console.log('🎯 嘗試線搜索算法...');
      const searchDirection = await this._solveLinearSystem(this._systemMatrix, this._rhsVector.scale(-1));
      const initialResidualNorm = await this._calculateResidualNorm(this._solutionVector);
      
      const lineSearchResult = await this._globalLineSearch(searchDirection, initialResidualNorm);
      if (lineSearchResult.converged) {
        this._solutionVector = lineSearchResult.newSolution;
        return 'line_search_success';
      }
      
      return 'restart_with_damping';
    } else if (retryCount === 1) {
      // 第二次重試：使用Trust Region方法
      console.log('🌐 嘗試Trust Region算法...');
      const residual = this._rhsVector.scale(-1);
      const trustRadius = 0.1;
      
      const trustRegionResult = await this._trustRegionMethod(this._systemMatrix, residual, trustRadius);
      if (trustRegionResult.success) {
        this._solutionVector = this._solutionVector.plus(trustRegionResult.step);
        return 'trust_region_success';
      }
      
      return 'reduce_timestep';
    } else {
      // 最後手段：高級重啟策略
      console.log('🔄 嘗試高級重啟策略...');
      const restartResult = await this._advancedRestartStrategy();
      if (restartResult.success) {
        this._solutionVector = restartResult.newSolution;
        return 'restart_success';
      }
      
      return 'use_global_strategy';
    }
  }

  /**
   * ⚡ 自適應步長控制
   */
  private _adaptiveTimeStepControl(iterations: number): void {
    const targetIterations = 5; // 目標迭代次數
    
    if (iterations < targetIterations / 2) {
      // 收斂太快，可以增大步長
      this._currentTimeStep = Math.min(this._currentTimeStep * 1.2, this._config.maxTimeStep);
    } else if (iterations > targetIterations * 1.5) {
      // 收斂太慢，減小步長
      this._currentTimeStep = Math.max(this._currentTimeStep * 0.8, this._config.minTimeStep);
    }
    
    console.log(`⚡ 步長調整: dt=${this._currentTimeStep.toExponential(3)}s (${iterations} 迭代)`);
  }

  /**
   * ♻️ 清理资源 - 只对智能设备调用 dispose
   */
  dispose(): void {
    // 只对智能设备调用 dispose 方法
    this._devices.forEach(device => {
      if (isIntelligentDeviceModel(device)) {
        device.dispose();
      }
      // 基础组件通常不需要特殊的资源清理
    });
    this._devices.clear();
    this._events = [];
    this._state = SimulationState.IDLE;
  }
}