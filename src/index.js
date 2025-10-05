/**
 * AkingSPICE - JavaScript SPICE Solver for Power Electronics
 * 核心引擎入口 - 僅包含必要的核心組件導出
 * 
 * 職責：
 * - 導出核心求解器和分析引擎
 * - 導出基礎組件類別
 * - 提供統一的模組接口
 * 
 * 不包含：
 * - 便利函數和工具 (見 utils/)
 * - 電路模板 (見 templates/) 
 * - 高階封裝 (見 environments/)
 */

// === 核心引擎 ===
export { AkingSPICE } from './core/solver.js';
export { NetlistParser } from './parser/netlist.js';

// === 求解器 ===
export { LCPSolver, MCPSolver, createLCPSolver, createMCPSolver } from './core/mcp_solver.js';

// === 分析引擎 (MCP 專用) ===
export { MCPTransientAnalysis, createMCPTransientAnalysis, TransientResult } from './analysis/transient_mcp.js';
export { DC_MCP_Solver, createDC_MCP_Solver } from './analysis/dc_mcp_solver.js';

// === 步進式仿真 API ===
export { StepwiseSimulator, createStepwiseSimulator } from './analysis/stepwise_simulation.js';

// === 基礎組件 ===
export { BaseComponent } from './components/base.js';

// === 線性組件 (MCP 兼容版本) ===
export { Resistor } from './components/resistor.js';
export { Capacitor } from './components/capacitor.js'; // 重命名後的 v2 版本
export { Inductor } from './components/inductor.js';   // 重命名後的 v2 版本

// === 信號源 ===
export { VoltageSource, CurrentSource, VCVS, VCCS, CCCS, CCVS } from './components/sources.js';
export { ThreePhaseSource } from './components/threephase.js';

// === MCP 組件 (唯一支援的非線性元件) ===

export { 
    Diode_MCP as MCPDiode,
    createMCPDiode, 
    createFastRecoveryDiode, 
    createSchottkyDiode 
} from './components/diode_mcp.js';

export { 
    MOSFET_MCP as MCPMOSFET,
    PWMController,
    createNMOSSwitch, 
    createPMOSSwitch, 
    createPowerMOSFET 
} from './components/mosfet_mcp.js';

// 複雜組件
export { MultiWindingTransformer } from './components/transformer.js';

// === 版本信息 ===
export const VERSION = {
    major: 2,
    minor: 1,
    patch: 0,
    name: 'Refactored Edition',
    description: 'Clean Architecture SPICE Engine'
};

// 預設導出主求解器
export { AkingSPICE as default } from './core/solver.js';