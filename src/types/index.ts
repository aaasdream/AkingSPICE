/**
 * 🎯 AkingSPICE 核心類型定義
 * 
 * 基於現代 MNA 架構的類型系統
 * 不包含任何 MCP/LCP 相關類型
 */

// 基礎數值類型
export type NodeId = string | number;
export type ComponentId = string;
export type Time = number;
export type Voltage = number;
export type Current = number;
export type Resistance = number;
export type Capacitance = number;
export type Inductance = number;

// 電路拓撲
export interface INode {
  readonly id: NodeId;
  readonly name?: string;
  voltage: Voltage;
  connections: ComponentId[];
}

export interface ICircuit {
  readonly nodes: Map<NodeId, INode>;
  readonly components: Map<ComponentId, IComponent>;
  readonly groundNode: NodeId;
}

// 組件接口 (基於 MNA)
export interface IComponent {
  readonly id: ComponentId;
  readonly type: ComponentType;
  readonly nodes: NodeId[];
  
  // MNA 戳印方法 (替代 MCP 註冊)
  stamp(system: IMNASystem): void;
  
  // 非線性組件需要更新
  isNonlinear(): boolean;
  updateOperatingPoint?(voltages: Map<NodeId, Voltage>): void;
  
  // 開關組件的事件檢測
  hasEvents(): boolean;
  detectEvents?(t0: Time, t1: Time, v0: VoltageVector, v1: VoltageVector): IEvent[];
}

// 組件類型 (不再包含 MCP 標識)
export enum ComponentType {
  // 被動元件
  RESISTOR = 'R',
  CAPACITOR = 'C', 
  INDUCTOR = 'L',
  
  // 源
  VOLTAGE_SOURCE = 'V',
  CURRENT_SOURCE = 'I',
  
  // 半導體 (事件驅動，非 MCP)
  DIODE = 'D',
  MOSFET = 'M',
  BJT = 'Q',
  IGBT = 'J',
  
  // 控制器
  PWM_CONTROLLER = 'PWM',
  PID_CONTROLLER = 'PID',
  
  // 電力電子模塊
  BUCK_CONVERTER = 'BUCK',
  BOOST_CONVERTER = 'BOOST'
}

// MNA 系統接口
export interface IMNASystem {
  readonly size: number;
  readonly G: ISparseMatrix;  // 電導矩陣
  readonly B: ISparseMatrix;  // 關聯矩陣 
  readonly C: ISparseMatrix;  // 關聯矩陣轉置
  readonly D: ISparseMatrix;  // 支路矩陣
  
  // 右側向量
  readonly i: IVector;  // 節點電流
  readonly e: IVector;  // 支路電壓
  
  // 解向量
  readonly v: IVector;  // 節點電壓
  readonly j: IVector;  // 支路電流
  
  // Generalized-α 积分器需要的方法
  readonly systemMatrix: ISparseMatrix;  // 系統矩陣 (通常是 G)
  getRHS(): IVector;  // 獲取右側向量
  
  // 系統構建
  addNode(id: NodeId): number;
  addBranch(from: NodeId, to: NodeId): number;
  stamp(row: number, col: number, value: number): void;
}

// 稀疏矩陣接口
export interface ISparseMatrix {
  readonly rows: number;
  readonly cols: number;
  readonly nnz: number;  // 非零元素數量
  
  set(row: number, col: number, value: number): void;
  get(row: number, col: number): number;
  add(row: number, col: number, value: number): void;
  multiply(vector: IVector): IVector;
  
  // 求解接口 (支持異步 KLU)
  factorize(): void;
  solve(rhs: IVector): Promise<IVector>;
  clone(): ISparseMatrix;
  
  // 資源管理 (WASM)
  dispose?(): void;
}

// 向量接口
export interface IVector {
  readonly size: number;
  
  get(index: number): number;
  set(index: number, value: number): void;
  add(index: number, value: number): void;
  
  norm(): number;
  dot(other: IVector): number;
  
  // 向量运算 (Generalized-α 积分器需要)
  plus(other: IVector): IVector;
  minus(other: IVector): IVector;
  scale(factor: number): IVector;
  
  toArray(): number[];
  clone(): IVector;
}

export type VoltageVector = IVector;
export type CurrentVector = IVector;

// 事件驅動系統 (替代 MCP)
export interface IEvent {
  readonly time: Time;
  readonly component: ComponentId;
  readonly type: EventType;
  readonly data?: any;
}

export enum EventType {
  SWITCH_ON = 'switch_on',
  SWITCH_OFF = 'switch_off',
  DIODE_FORWARD = 'diode_forward',
  DIODE_REVERSE = 'diode_reverse',
  MOSFET_LINEAR = 'mosfet_linear',
  MOSFET_SATURATION = 'mosfet_saturation',
  MOSFET_CUTOFF = 'mosfet_cutoff'
}

// 事件檢測器
export interface IEventDetector {
  detectEvents(
    components: IComponent[],
    t0: Time, 
    t1: Time, 
    v0: VoltageVector, 
    v1: VoltageVector
  ): IEvent[];
  
  locateEvent(
    component: IComponent,
    event: IEvent,
    t0: Time,
    t1: Time,
    tolerance: number
  ): Time;
}

// 積分器接口 (支援異步 KLU 求解)
export interface IIntegrator {
  readonly order: number;
  readonly history: IntegratorState[];
  
  step(
    system: IMNASystem,
    t: Time,
    dt: Time,
    solution: VoltageVector
  ): Promise<IntegratorResult>;
  
  estimateError(solution: VoltageVector): number;
  adjustTimestep(dt: Time, error: number): Time;
}

export interface IntegratorState {
  readonly time: Time;
  readonly solution: VoltageVector;
  readonly derivative: VoltageVector;
}

export interface IntegratorResult {
  readonly solution: VoltageVector;
  readonly nextDt: Time;
  readonly error: number;
  readonly converged: boolean;
}

// 非線性求解器 (Newton-Raphson)
export interface INonlinearSolver {
  solve(
    system: IMNASystem,
    initialGuess: VoltageVector,
    tolerance: number,
    maxIterations: number
  ): NonlinearResult;
}

export interface NonlinearResult {
  readonly solution: VoltageVector;
  readonly residual: IVector;
  readonly jacobian: ISparseMatrix;
  readonly iterations: number;
  readonly converged: boolean;
}

// 分析類型
export enum AnalysisType {
  DC = 'dc',
  TRANSIENT = 'tran',
  AC = 'ac',
  NOISE = 'noise'
}

export interface IAnalysisOptions {
  readonly type: AnalysisType;
  readonly startTime?: Time;
  readonly endTime?: Time;
  readonly timeStep?: Time;
  readonly tolerance?: number;
  readonly maxIterations?: number;
}

export interface IAnalysisResult {
  readonly type: AnalysisType;
  readonly timePoints: Time[];
  readonly nodeVoltages: Map<NodeId, Voltage[]>;
  readonly branchCurrents: Map<ComponentId, Current[]>;
  readonly events: IEvent[];
  readonly statistics: SimulationStatistics;
}

export interface SimulationStatistics {
  readonly totalTime: number;
  readonly matrixSolves: number;
  readonly newtonIterations: number;
  readonly events: number;
  readonly timestepReductions: number;
}

// 器件參數類型
export interface ResistorParams {
  readonly R: Resistance;
  readonly temp?: number;
  readonly tc1?: number;  // 溫度係數
  readonly tc2?: number;
}

export interface CapacitorParams {
  readonly C: Capacitance;
  readonly ic?: Voltage;  // 初始電壓
  readonly temp?: number;
}

export interface InductorParams {
  readonly L: Inductance;
  readonly ic?: Current;  // 初始電流
  readonly Rs?: Resistance;  // 串聯電阻
}

export interface DiodeParams {
  readonly Vf: Voltage;    // 導通電壓
  readonly Ron: Resistance; // 導通電阻
  readonly Roff?: Resistance; // 截止電阻
  readonly Is?: Current;    // 飽和電流 (Shockley 模型)
  readonly n?: number;      // 理想因子
}

export interface MOSFETParams {
  readonly type: 'NMOS' | 'PMOS';
  readonly Vth: Voltage;    // 閾值電壓
  readonly Ron: Resistance; // 導通電阻
  readonly Roff?: Resistance; // 截止電阻
  readonly Cgs?: Capacitance; // 閘源電容
  readonly Cgd?: Capacitance; // 閘漏電容
  readonly Cds?: Capacitance; // 漏源電容
}

// 模擬器配置
export interface SimulatorConfig {
  readonly tolerance: number;
  readonly maxIterations: number;
  readonly minTimestep: Time;
  readonly maxTimestep: Time;
  readonly initialTimestep: Time;
  readonly eventTolerance: number;
  readonly debug: boolean;
}

// 默認配置
export const DEFAULT_CONFIG: SimulatorConfig = {
  tolerance: 1e-9,
  maxIterations: 50,
  minTimestep: 1e-15,
  maxTimestep: 1e-3,
  initialTimestep: 1e-9,
  eventTolerance: 1e-12,
  debug: false
};