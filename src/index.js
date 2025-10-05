/**
 * AkingSPICE - JavaScript Solver for Power Electronics
 * 主入口文件
 */

import { AkingSPICE } from './core/solver.js';
import { NetlistParser } from './parser/netlist.js';

// 導出主要類別
export { AkingSPICE };
export { NetlistParser };

// 導出元件模型
export { BaseComponent } from './components/base.js';
export { Resistor } from './components/resistor.js';
export { Capacitor } from './components/capacitor.js';
export { Inductor } from './components/inductor.js';
export { VoltageSource, CurrentSource, VCVS, VCCS } from './components/sources.js';
export { ThreePhaseSource } from './components/threephase.js';
export { MOSFET_MCP, createNMOSSwitch, createPMOSSwitch, PWMController } from './components/mosfet_mcp.js';
export { Diode_MCP, createMCPDiode, createSchottkyDiode, createFastRecoveryDiode } from './components/diode_mcp.js';
export { MultiWindingTransformer } from './components/transformer.js';

// 導出分析工具
export { StepwiseSimulator } from './analysis/stepwise_simulation.js';



// 預設導出主求解器
export default AkingSPICE;