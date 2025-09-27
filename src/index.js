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
export { VoltageSource, CurrentSource } from './components/sources.js';
export { MOSFET } from './components/mosfet.js';
export { Diode } from './components/diode.js';

// 導出分析工具
export { TransientAnalysis } from './analysis/transient.js';
export { DCAnalysis } from './analysis/dc.js';

// 預設導出主求解器
export default AkingSPICE;