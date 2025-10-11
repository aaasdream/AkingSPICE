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
  IEvent,
  IMNASystem
} from '../../types/index';
import { Vector } from '../../math/sparse/vector';
import { SparseMatrix } from '../../math/sparse/matrix';
import { GeneralizedAlphaIntegrator } from '../integrator/generalized_alpha';
import { ExtraVariableIndexManager, ExtraVariableType } from '../mna/extra_variable_manager';
// CHANGED: 导入统一的接口和新的类型守卫
import { ComponentInterface, AssemblyContext } from '../interfaces/component';
import type { 
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

interface ScalableSource {
  scaleSource(factor: number): void;
  restoreSource(): void;
}

/**
 * 🚀 电路仿真引擎核心类
 * 
 * 整合所有革命性技术的统一仿真平台
 * 提供工业级的大规模电路仿真能力
 */
export class CircuitSimulationEngine implements IMNASystem { // <--- 實現介面
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
  
  // System矩阵和向量
  private _systemMatrix: ISparseMatrix;
  private _rhsVector: IVector;
  private _solutionVector: IVector;
  private _previousSolutionVector: IVector;  // 🔧 保存上一个时间步的解

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
    this._previousSolutionVector = new Vector(estimatedSize);  // 🔧 初始化历史解向量
    
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
   * 🆕 按名称获取节点 ID
   */
  getNodeIdByName(name: string): number | undefined {
    return this._nodeMapping.get(name);
  }

  /**
   * ⚙️ 初始化仿真系统 (重构版本)
   * 
   * 整合了额外变数管理器，现在支持电感、电压源和变压器
   */
  private async _initializeSimulation(): Promise<void> {
    this._logEvent('INFO', undefined, '� Initializing simulation system...');
    
    try {
      // Note: Don't set state here, let runSimulation() manage it
      // this._state = SimulationState.INITIALIZING;
      // const initStartTime = performance.now();
      
      this._validateCircuit();
  
      // 1. 預掃描以確定系統總大小
      const baseNodeCount = this._nodeMapping.size;
      let extraVarsCount = 0;
      for (const device of this._devices.values()) {
        if ('getExtraVariableCount' in device && typeof (device as any).getExtraVariableCount === 'function') {
          extraVarsCount += (device as any).getExtraVariableCount();
        }
      }
  
      // 2. 初始化管理器
      this._extraVariableManager = new ExtraVariableIndexManager(baseNodeCount);
      const totalSystemSize = baseNodeCount + extraVarsCount;
  
      // 3. 創建正確大小的矩陣和向量
      this._systemMatrix = new SparseMatrix(totalSystemSize, totalSystemSize);
      this._rhsVector = new Vector(totalSystemSize);
      this._solutionVector = new Vector(totalSystemSize);
      this._previousSolutionVector = new Vector(totalSystemSize);  // 🔧 重新初始化历史解向量
      
      // 4. 第二次掃描，為元件分配索引
      for (const device of this._devices.values()) {
          if ('getExtraVariableCount' in device && typeof (device as any).getExtraVariableCount === 'function') {
              if (device.type === 'V' || device.type === 'L') {
                  const index = this._extraVariableManager.allocateIndex(
                      device.type === 'V' ? ExtraVariableType.VOLTAGE_SOURCE_CURRENT : ExtraVariableType.INDUCTOR_CURRENT,
                      device.name
                  );
                  if ('setCurrentIndex' in device) (device as any).setCurrentIndex(index);
              } else if (device.type === 'K') {
                  const pIdx = this._extraVariableManager.allocateIndex(ExtraVariableType.TRANSFORMER_PRIMARY_CURRENT, device.name);
                  const sIdx = this._extraVariableManager.allocateIndex(ExtraVariableType.TRANSFORMER_SECONDARY_CURRENT, device.name);
                  if ('setCurrentIndices' in device) (device as any).setCurrentIndices(pIdx, sIdx);
              }
          }
      }
  
            this._logEvent('INIT', undefined, `System size: ${totalSystemSize} (${baseNodeCount} nodes + ${extraVarsCount} extra vars).`);
  
      // 关键修复：在开始 DC 分析之前，确保解向量是一个干净的全零向量
      this._solutionVector.fill(0);

      // 5. 計算 DC 工作點 (所有仿真類型都需要)
      await this._performDCAnalysis();
      
      // 🔧 初始化历史解向量为 DC 工作点 (瞬态分析的初始条件)
      this._previousSolutionVector = this._solutionVector.clone();
  
      // DC-only 分析 (endTime = 0) 到此結束
      if (this._config.endTime === 0) {
        // 🔧 關鍵修復：DC 分析後也需要保存波形數據
        this._saveWaveformPoint();
        this._state = SimulationState.COMPLETED;
        return;
      }
  
      // 🎯 瞬态分析：使用零初始条件 (UIC)
      // 对于电容和电感，将其节点电压重置为 0
      // 这模拟了 SPICE 的 .TRAN UIC 行为
      for (const device of this._devices.values()) {
        if (device.type === 'C' || device.type === 'L') {
          // 对于电容/电感，将其节点设为 0（保持电压源节点不变）
          const nodes = device.nodes;
          for (const nodeName of nodes) {
            const nodeNameStr = nodeName.toString();
            if (nodeNameStr !== '0') {  // 跳过地节点
              const nodeIndex = this._nodeMapping.get(nodeNameStr);
              if (nodeIndex !== undefined && nodeIndex >= 0 && nodeIndex < this._nodeMapping.size) {
                // 只重置电路节点，不重置额外变量
                this._solutionVector.set(nodeIndex, 0);
                this._previousSolutionVector.set(nodeIndex, 0);
              }
            }
          }
          // 🧠 關鍵修正：對所有電感器的支路電流（extra variable）初始化為 0
          if (device.type === 'L' && typeof (device as any).hasCurrentIndexSet === 'function' && typeof (device as any).setCurrentIndex === 'function') {
            // 取得支路電流索引
            const currentIndex = (device as any)._currentIndex;
            if (currentIndex !== undefined && currentIndex >= 0 && currentIndex < this._solutionVector.size) {
              this._solutionVector.set(currentIndex, 0);
              this._previousSolutionVector.set(currentIndex, 0);
            }
          }
        }
      }
      
      this._logEvent('INIT', undefined, '⚡ Applied zero initial conditions (UIC) for capacitors and inductors.');
  
      // 6. 用零初始狀態來啟動積分器
      await this._integrator.restart({
          time: this._config.startTime,
          solution: this._solutionVector as Vector,
          derivative: Vector.zeros(this._solutionVector.size) // 假設 t=0 時導數為 0
      });
      console.log('🔄 Generalized-α integrator restarted with UIC.');

      // 6. 初始化波形数据存储
      this._initializeWaveformStorage();
      
      // 7. 设置初始时间和步长
      this._currentTime = this._config.startTime;
      this._currentTimeStep = this._config.initialTimeStep;
      this._stepCount = 0;
        
    } catch (error) {
      this._state = SimulationState.FAILED;
      // 增加更详细的错误日志
      console.error('Detailed error in _initializeSimulation:', error);
      // Re-throw the error to be caught by the main runSimulation catch block
      throw new Error(`Simulation initialization failed: ${error}`);
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
      
      this._logEvent('INFO', undefined, '✅ Simulation initialization complete.');

      // 2. 主仿真循环
      while (this._currentTime < this._config.endTime && this._state === SimulationState.RUNNING) {
        try {
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
              this._logEvent('FATAL', undefined, 'Time step fell below minimum and could not recover.');
              break;
            }
          }
        } catch (stepError) {
            console.error(`💥 Error within simulation loop at t=${this._currentTime}:`, stepError);
            throw stepError; // Re-throw to be caught by the main catch block
        }
        
        // 3. 保存波形数据
        if (this._config.saveIntermediateResults) {
          this._saveWaveformPoint();
        }
        
        // 5. 内存使用检查
        if (this._memoryUsage > this._config.maxMemoryUsage * 1024 * 1024) {
          this._logEvent('MEMORY_WARNING', undefined, 'Memory usage exceeded limit');
          break;
        }
        
        this._stepCount++;
      }
      
      // Mark simulation as completed if we reached the end time normally
      if (this._currentTime >= this._config.endTime && this._state === SimulationState.RUNNING) {
        this._state = SimulationState.COMPLETED;
        this._logEvent('INFO', undefined, '✅ Simulation completed successfully.');
      }
      
      // 3. 生成最终结果
      return this._generateFinalResult();
      
    } catch (error) {
      this._state = SimulationState.FAILED;
      // 增加更详细的错误日志
      console.error('🔥 Detailed error object in runSimulation:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        finalTime: this._currentTime,
        totalSteps: this._stepCount,
        convergenceRate: 0,
        averageStepTime: 0,
        peakMemoryUsage: this._memoryUsage / (1024 * 1024),
        waveformData: this._waveformData,
        performanceMetrics: this._performanceMetrics,
        errorMessage: `Simulation failed: ${errorMessage}. Check console for detailed error object.`
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

  // --- 實現 IMNASystem 所需的屬性 ---

  get size(): number {
      return this._systemMatrix.rows;
  }

  get systemMatrix(): ISparseMatrix {
      return this._systemMatrix;
  }

  getRHS(): IVector {
      return this._rhsVector;
  }

  // --- 實現 IMNASystem 所需的核心方法 ---
  
  /**
   * 這個方法是積分器和引擎之間的橋樑。
   * 積分器在每一次內部 Newton 迭代時都會呼叫它。
   */
  public assemble(solution: IVector, time: Time): void {
      // 更新當前解，以便 _assembleSystem 使用
      this._solutionVector = solution;
      // 使用新的解和時間來重新組裝
      // 注意：這裡不能用 await，因為 IMNASystem 介面是同步的
      // 因此 _assembleSystem 也需要改成同步
      // 🎯 瞬態分析時使用 this._currentTimeStep，DC 分析時使用 0
      this._assembleSystem(time, 0, this._currentTimeStep); 
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

    // 关键修复：在整个 DC 分析开始时，提供一个初始的非零猜测。
    // 这可以避免在 v=0 时的数值奇点（例如，在半导体器件模型中）。
    this._solutionVector.fill(1e-6);
    
    // 步骤 1: Gmin Stepping (作为首选的鲁棒方法)
    console.log('🔄 优先尝试 Gmin Stepping...');
    let dcResult = await this._gminSteppingHomotopy();
    if (dcResult) {
      this._logEvent('dc_converged', undefined, 'Gmin Stepping 收敛');
      return;
    }

    // 步骤 2: 源步进 (作为备用方法)
    console.log('🔄 Gmin Stepping 失败，尝试源步进...');
    // 在尝试源步进之前，重置解向量，因为 Gmin 可能已将其带入一个不好的区域
    this._solutionVector.fill(1e-6); 
    dcResult = await this._sourceSteppingHomotopy();
    if (dcResult) {
      this._logEvent('dc_converged', undefined, '源步进收敛');
      return;
    }
    
    // 步骤 3: 标准 Newton-Raphson (最后的尝试)
    console.log('🔄 源步进失败，最后尝试标准 Newton...');
    this._solutionVector.fill(1e-6); // 再次重置
    dcResult = await this._solveDCNewtonRaphson();
    if (dcResult) {
      this._logEvent('dc_converged', undefined, '標準 Newton 收斂');
      return;
    }
    
    // 最终失败
    this._logEvent('dc_failed', undefined, '所有 DC 方法失敗');
    throw new Error('DC 工作點分析失敗');
  }

  private async _sourceSteppingHomotopy(): Promise<boolean> {
    const sources = Array.from(this._devices.values()).filter(d => 'scaleSource' in d) as (ComponentInterface & ScalableSource)[];
    const stepFactors = [0.0, 0.25, 0.5, 0.75, 1.0];
    let converged = false;

    for (const factor of stepFactors) {
      this._logEvent('DC_SOURCE_STEP', undefined, `Setting source factor to ${(factor * 100).toFixed(0)}%`);      
      // 🧠 智能初始猜测：当所有源为0时，最佳猜测就是0向量
      if (factor === 0.0) {
        this._solutionVector.fill(0);
      }

      for (const source of sources) {
        source.scaleSource(factor);
      }

      // 🧠 使用更鲁棒的阻尼策略进行源步进
      converged = await this._solveDCNewtonRaphson(0);

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
    const gminSteps = 10;
    const initialGmin = 1e-2;
    const finalGmin = 1e-12;
    
    for (let step = 0; step <= gminSteps; step++) {
      const factor = step / gminSteps;
      // Use logarithmic stepping for gmin
      const currentGmin = initialGmin * Math.pow(finalGmin / initialGmin, factor);
      
      this._logEvent('gmin_step', undefined, `Gmin=${currentGmin.toExponential(2)}, Step ${step}/${gminSteps}`);

      // Pass the current Gmin value to the Newton-Raphson solver
      const newtonResult = await this._solveDCNewtonRaphson(currentGmin);
      
      if (!newtonResult) {
        this._logEvent('gmin_step_failed', undefined, `Newton-Raphson failed with Gmin = ${currentGmin.toExponential(2)}`);
        return false;
      }
    }
    
    // Final check with zero Gmin
    this._logEvent('gmin_step', undefined, 'Final convergence check with Gmin = 0');
    return await this._solveDCNewtonRaphson(0);
  }

  // 替換原有的 _solveDCNewtonRaphson 方法
private async _solveDCNewtonRaphson(gmin: number = 0): Promise<boolean> {
    let iterations = 0;
    const x_k = this._solutionVector as Vector;

    while (iterations < this._config.maxNewtonIterations) {
        // 1. 根據當前的解 x_k 組裝雅可比矩陣 J(x_k) 和非線性函數 F(x_k)
        // F(x_k) = J(x_k) * x_k - b(x_k)
        this._assembleSystem(0, gmin, 0); // 🎯 time=0, gmin, dt=0 for DC analysis
        const J = this._systemMatrix;
        const b = this._rhsVector;
        const F = (J.multiply(x_k) as Vector).minus(b);

        // 2. 求解線性系統 J(x_k) * Δx = -F(x_k)
        const F_neg = F.scale(-1);
        const delta_x = await this._solveLinearSystem(J, F_neg);

        // 檢查求解器是否返回了無效值
        if (isNaN(delta_x.norm())) {
            this._logEvent('DC_SOLVER_ERROR', undefined, `[Iter ${iterations}] Linear solver returned NaN.`);
            return false;
        }

        // 3. 更新解 x_{k+1} = x_k + Δx
        // 注意：這裡的 this._solutionVector 就是 x_k，所以我們直接在它上面操作
        (this._solutionVector as Vector).addInPlace(delta_x);
        
        // 4. 檢查收斂性
        const deltaNorm = delta_x.norm();
        const solutionNorm = this._solutionVector.norm();

        if (this._config.verboseLogging) {
            console.log(`  [DC Iter ${iterations}] Update Norm (||Δx||) = ${deltaNorm.toExponential(4)}`);
        }

        if (deltaNorm < (this._config.voltageToleranceRel * solutionNorm + this._config.voltageToleranceAbs)) {
            this._logEvent('DC_NR_CONVERGED', undefined, `Newton-Raphson converged in ${iterations + 1} iterations.`);
            return true;
        }
        
        iterations++;
    }

    this._logEvent('DC_NR_FAILED', undefined, `Newton-Raphson exceeded max iterations (${this._config.maxNewtonIterations}).`);
    return false;
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
    const dt = this._currentTimeStep;
    const t_end = t_start + dt;
  
    let integratorResult;
    try {
      // 1. 執行一個「暫定」的積分步驟
      integratorResult = await this._integrator.step(this, t_start, dt, this._solutionVector);
    } catch (error) {
        console.error(`💥 Integrator step failed at t=${t_start}:`, error);
        throw new Error(`Integrator error: ${error}`);
    }
  
    if (!integratorResult.converged) {
      this._logEvent('INTEGRATOR_FAILURE', undefined, `Integrator failed at t=${t_start.toExponential(3)}s`);
      return false; // 告知外部循環需要減小步長重試
    }
    const tentativeSolution = integratorResult.solution;
  
    // 2. 檢測在此時間區間內是否發生了事件
    let events: IEvent[] = [];
    try {
        const eventfulComponents = Array.from(this._devices.values()).filter(d => d.hasEvents && d.hasEvents());
        events = this._eventDetector.detectEvents(
          eventfulComponents,
          t_start, t_end, this._solutionVector, tentativeSolution
        );
    } catch (error) {
        console.error(`💥 Event detection failed at t=${t_start}:`, error);
        throw new Error(`Event detection error: ${error}`);
    }
  
    // 3. 根據是否有事件來決定下一步
    if (events.length === 0) {
      // ----- 情況 A: 沒有事件，接受這一步 -----
      this._currentTime = t_end;
      
      // 🔧 更新解向量並保存為歷史（供下一步使用）
      this._solutionVector = tentativeSolution;
      this._previousSolutionVector = tentativeSolution.clone();  // 保存當前解作為下一步的歷史
      
      await this._updateDeviceStates(); // 更新智能設備的內部狀態
      
      // 使用積分器建議的下一步長
      this._currentTimeStep = this._adaptTimeStep(integratorResult.nextDt); 
      this._logEvent('STEP_ACCEPTED', undefined, `Step to ${t_end.toExponential(3)}s. Next dt: ${this._currentTimeStep.toExponential(3)}s.`);
      return true;
  
    } else {
      // ----- 情況 B: 檢測到事件，精確處理 -----
      const firstEvent = events[0]; // 假設已排序，處理第一個事件
      if (!firstEvent) {
        return true; // Should not happen, but as a safeguard.
      }
  
      // 4. 使用二分法精確定位事件時間
      const eventTime = await this._eventDetector.locateEventTime(
        firstEvent,
        (time: Time) => this._integrator.interpolate(time) // 傳遞插值函數
      );
  
      // 如果事件發生在一個極小的時間步內，先處理事件再說
      if (this._eventDetector.isTimestepTooSmall(eventTime - t_start)) {
        this._handleEvent(firstEvent); // 處理事件會重啟積分器
        return true; // 成功處理，但時間未推進
      }
  
      // 5. 精確積分到事件發生點
      const eventDt = eventTime - t_start;
      const finalResult = await this._integrator.step(this, t_start, eventDt, this._solutionVector);
  
      if (!finalResult.converged) {
        this._logEvent('INTEGRATOR_FAILURE_TO_EVENT', firstEvent.component.name, `Integrator failed to step to event at t=${eventTime.toExponential(3)}s`);
        return false; // 連到事件點都失敗，情況很糟
      }
  
      // 6. 更新狀態到事件點，並處理事件
      this._currentTime = eventTime;
      
      // 🔧 更新解向量並保存為歷史
      this._solutionVector = finalResult.solution;
      this._previousSolutionVector = finalResult.solution.clone();  // 保存當前解作為下一步的歷史
      
      this._handleEvent(firstEvent); // 這個輔助函數會重啟積分器
      
      // 事件處理後，通常將步長重設為一個安全的小值
      this._currentTimeStep = this._config.initialTimeStep; 
      
      return true;
    }
  }

  // Step 3: 新增一個處理事件的輔助方法
  private _handleEvent(event: IEvent): void {
    const device = event.component as ComponentInterface;

    if (device && device.handleEvent) {
      // 創建 AssemblyContext 供 handleEvent 使用
      const context: AssemblyContext = {
        matrix: this._systemMatrix as SparseMatrix,
        rhs: this._rhsVector as Vector,
        nodeMap: this._nodeMapping,
        currentTime: this._currentTime,
        solutionVector: this._solutionVector as Vector,
        dt: this._currentTimeStep,
        //... 傳遞其他必要的上下文
      };
      device.handleEvent(event, context);
    }

    // 關鍵步驟：事件處理後，必須重啟積分器！
    // 因為系統的行為（例如一個開關的狀態）已經改變。
    this._integrator.restart({
      time: this._currentTime,
      solution: this._solutionVector as Vector,
      derivative: Vector.zeros(this._solutionVector.size), // 發生突變，導數重設為0
    });
    
    this._logEvent('INTEGRATOR_RESTART', device.name, `Integrator restarted after event ${event.type}.`);
  }

  /**
   * 🚀 系统矩阵装配 (重构版本)
   * 
   * 使用统一的组装接口，消除 stamp() vs load() 的分裂
   * 所有组件都通过 assemble() 方法提供其 MNA 贡献
   * 
   * @param time - 装配时的仿真时间 (默认使用当前时间)
   * @param gmin - Gmin Stepping 的电导值
   * @param dt - 时间步长 (默认使用当前时间步长，DC 分析时应传入 0)
   */
  private _assembleSystem(time: number = this._currentTime, gmin: number = 0, dt: number = this._currentTimeStep): void {
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
      dt: dt,  // 🎯 使用传入的 dt 参数，DC 分析时为 0
      previousSolutionVector: this._previousSolutionVector as Vector, // 🔧 使用历史解向量
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

    // 🧠 **关键修复：强制执行接地节点 (Node 0) 约束**
    // 这是 MNA 方法中的标准实践，用于消除矩阵的奇异性。
    // 通过将接地节点的行和列清零，并在对角线上放置1，我们强制 V[0] = 0。
    const groundNodeIndex = this._nodeMapping.get('0');
    if (groundNodeIndex !== undefined) {
      // 清除地节点的行和列
      const n = this._systemMatrix.rows;
      for (let j = 0; j < n; j++) {
        this._systemMatrix.set(groundNodeIndex, j, 0);  // 清除行
      }
      for (let i = 0; i < n; i++) {
        this._systemMatrix.set(i, groundNodeIndex, 0);  // 清除列
      }
      this._systemMatrix.set(groundNodeIndex, groundNodeIndex, 1.0);  // 设置对角线
      this._rhsVector.set(groundNodeIndex, 0.0);  // RHS = 0
    }
    
    this._performanceMetrics.matrixAssemblyTime += performance.now() - assemblyStartTime;
  }

  private async _solveLinearSystem(A: ISparseMatrix, b: IVector): Promise<IVector> {
    const groundNodeIndex = this._nodeMapping.get('0');

    if (groundNodeIndex === undefined) {
      console.warn('⚠️ No ground node ("0") found. Matrix may be singular.');
      // Proceed with the original matrix, but it's likely to fail.
      return (A as SparseMatrix).solve(b);
    }

    // 🧠 **The Submatrix Method: The Correct Way to Handle Ground**
    // 1. Extract the submatrix and sub-vector by removing the ground node's row/column.
    const { matrix: subMatrix, mapping: inverseMapping } = A.submatrix([groundNodeIndex], [groundNodeIndex]);
    
    const subRhs = new Vector(b.size - 1);
    let subIndex = 0;
    for (let i = 0; i < b.size; i++) {
      if (i !== groundNodeIndex) {
        subRhs.set(subIndex++, b.get(i));
      }
    }

    // 2. Solve the smaller, non-singular system.
    let subSolution: IVector;
    try {
      subSolution = (subMatrix as SparseMatrix).solve(subRhs);
    } catch (error) {
      console.error(`[Submatrix Solver] ABORT: Linear solver failed on the submatrix. Error: ${error}`);
      const nanVector = new Vector(b.size);
      nanVector.fill(NaN);
      return nanVector;
    }

    // 3. Reconstruct the full solution vector.
    const fullSolution = new Vector(b.size);
    fullSolution.fill(0); // Initialize with zeros, ground node voltage is already 0.

    for (let i = 0; i < subSolution.size; i++) {
      const originalIndex = inverseMapping[i]!
      fullSolution.set(originalIndex, subSolution.get(i));
    }

    return fullSolution;
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
          voltage: this._solutionVector as Vector,
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

// 輔助方法：自適應步長調整
private _adaptTimeStep(suggestedDt: number): number {
    let newDt = suggestedDt;
    // 可以在此加入更多邏輯，例如基於 Newton 迭代次數的調整
    newDt = Math.max(this._config.minTimeStep, Math.min(newDt, this._config.maxTimeStep));
    return newDt;
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
        
        // 🎯 获取实际设备电流
        let current = 0;
        // 对于电感，电流存储在 extraVariable 中
        if (device.type === 'L') {
          const currentIndex = this._extraVariableManager?.getIndex(device.name, ExtraVariableType.INDUCTOR_CURRENT);
          if (currentIndex !== undefined && currentIndex >= 0) {
            current = this._solutionVector.get(currentIndex);
          }
        }
        // 对于电压源，电流也存储在 extraVariable 中
        else if (device.type === 'V') {
          const currentIndex = this._extraVariableManager?.getIndex(device.name, ExtraVariableType.VOLTAGE_SOURCE_CURRENT);
          if (currentIndex !== undefined && currentIndex >= 0) {
            current = this._solutionVector.get(currentIndex);
          }
        }
        // 对于电阻，计算通过的电流 I = (V1 - V2) / R
        else if (device.type === 'R' && 'nodes' in device && 'resistance' in device) {
          const nodes = device.nodes as readonly [string, string];
          const n1 = this._nodeMapping.get(nodes[0]);
          const n2 = this._nodeMapping.get(nodes[1]);
          const v1 = (n1 !== undefined && n1 >= 0) ? this._solutionVector.get(n1) : 0;
          const v2 = (n2 !== undefined && n2 >= 0) ? this._solutionVector.get(n2) : 0;
          const resistance = (device as any).resistance;
          current = (v1 - v2) / resistance;
        }
        // 对于电容，使用伴侣模型计算瞬时电流 I = C * dV/dt
        // 这里简化处理，使用历史电压差除以时间步
        else if (device.type === 'C' && 'nodes' in device) {
          // 电容电流在瞬态中为 I = C * dV/dt
          // 暂时设为 0，需要更复杂的实现
          current = 0;
        }
        
        (this._waveformData.deviceCurrents.get(deviceId) as number[]).push(current);
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

  /**
   * 📊 获取仿真事件日志
   */
  getSimulationEvents(): readonly SimulationEvent[] {
    return this._events;
  }

  /**
   * ♻️ 清理资源 - 对所有组件安全地调用 dispose
   */
  dispose(): void {
    // 对所有组件安全地调用 dispose 方法
    this._devices.forEach(device => {
      // Cast to any to bypass TypeScript's strict check, as dispose is optional.
      if (device && typeof (device as any).dispose === 'function') {
        (device as any).dispose();
      }
    });
    this._devices.clear();
    this._events = [];
    this._state = SimulationState.IDLE;
  }
}