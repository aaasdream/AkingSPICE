/**
 * AkingSPICE - JavaScript Solver for Power Electronics
 * 主入口文件 - 現已支持混合互補問題 (MCP) 仿真！
 * 
 * v2.0 新特性：
 * - MCP瞬態分析：專為電力電子開關電路設計
 * - 優化的DC分析策略：Newton優先，Homotopy備用
 * - 互補約束建模：精確處理開關不連續性
 */

import { AkingSPICE } from './core/solver.js';
import { NetlistParser } from './parser/netlist.js';

// 導出主要類別
export { AkingSPICE };
export { NetlistParser };

// === 核心求解器 ===
export { LCPSolver, MCPSolver, createLCPSolver, createMCPSolver } from './core/mcp_solver.js';

// === 傳統元件模型 ===
export { BaseComponent } from './components/base.js';
export { Resistor } from './components/resistor.js';
export { Capacitor } from './components/capacitor_v2.js';
export { Inductor } from './components/inductor_v2.js';
export { VoltageSource, CurrentSource, VCVS, VCCS, CCCS, CCVS } from './components/sources.js';
export { ThreePhaseSource } from './components/threephase.js';
export { MOSFET } from './components/mosfet.js';
export { VoltageControlledMOSFET } from './components/vcmosfet.js';
export { Diode } from './components/diode.js';
export { NonlinearDiode } from './components/nonlinear-diode.js';
export { MultiWindingTransformer } from './components/transformer.js';

// === MCP 元件模型 (v2.0 新增) ===
export { 
    Diode_MCP, 
    createMCPDiode, 
    createFastRecoveryDiode, 
    createSchottkyDiode 
} from './components/diode_mcp.js';

export { 
    MOSFET_MCP, 
    PWMController,
    createNMOSSwitch, 
    createPMOSSwitch, 
    createPowerMOSFET 
} from './components/mosfet_mcp.js';

// === 分析工具 ===
// 傳統分析器
// 位於 src/index.js
export { TransientAnalysis, TransientResult } from './analysis/transient.js';
export { DCAnalysis } from './analysis/dc.js';

// MCP 分析器 (v2.0 新增)
export { 
    MCPTransientAnalysis, 
    createMCPTransientAnalysis 
} from './analysis/transient_mcp.js';

// === 便利導出：快速創建完整的分析環境 ===

/**
 * 創建電力電子分析環境
 * 包含所有必要的 MCP 工具
 */
export function createPowerElectronicsEnvironment(options = {}) {
    return {
        // MCP 分析器
        mcpTransient: createMCPTransientAnalysis(options.mcp || {}),
        
        // 優化的 DC 分析器
        dc: new DCAnalysis(),
        
        // MCP 元件構造函數
        components: {
            // 開關元件
            nmos: (name, d, s, g, params) => createNMOSSwitch(name, d, s, g, params),
            pmos: (name, d, s, g, params) => createPMOSSwitch(name, d, s, g, params), 
            powerMos: (name, d, s, g, params) => createPowerMOSFET(name, d, s, g, params),
            
            // 二極管
            diode: (name, a, c, params) => createMCPDiode(name, a, c, params),
            fastDiode: (name, a, c, params) => createFastRecoveryDiode(name, a, c, params),
            schottky: (name, a, c, params) => createSchottkyDiode(name, a, c, params),
            
            // PWM 控制
            pwm: (freq, duty, phase) => new PWMController(freq, duty, phase),
            
            // 線性元件
            R: (name, n1, n2, value) => new Resistor(name, [n1, n2], value),
            L: (name, n1, n2, value, ic) => new Inductor(name, [n1, n2], value, { ic: ic }),
            C: (name, n1, n2, value, ic) => new Capacitor(name, [n1, n2], value, { ic: ic }),
            V: (name, n1, n2, value) => new VoltageSource(name, [n1, n2], value)
        },
        
        // LCP 求解器
        lcpSolver: createLCPSolver(options.lcp || {}),
        
        // 調試和統計
        debug: options.debug || false
    };
}

/**
 * 創建 Buck 轉換器模板
 */
export function createBuckConverterTemplate(params = {}) {
    const {
        inputVoltage = 12,
        dutyCycle = 0.5,
        frequency = 200e3,
        inductance = 100e-6,
        capacitance = 470e-6,
        loadResistance = 5,
        switchParams = {},
        diodeParams = {}
    } = params;
    
    return {
        components: [
            new VoltageSource('VIN', ['VIN', '0'], inputVoltage),
            createNMOSSwitch('M1', 'SW', 'VIN', 'GATE', switchParams),
            createMCPDiode('D1', '0', 'SW', diodeParams),
            new Inductor('L1', ['SW', 'VOUT'], inductance),
            new Capacitor('C1', ['VOUT', '0'], capacitance), 
            new Resistor('RL', ['VOUT', '0'], loadResistance)
        ],
        pwmController: new PWMController(frequency, dutyCycle),
        expectedOutput: inputVoltage * dutyCycle
    };
}

/**
 * 版本信息
 */
export const VERSION = {
    major: 2,
    minor: 0,
    patch: 0,
    name: 'MCP Edition',
    description: '支持混合互補問題的電力電子專業仿真器',
    features: [
        'MCP瞬態分析',
        '互補約束開關模型', 
        '優化的DC求解策略',
        'Lemke算法LCP求解器',
        '電力電子元件庫'
    ]
};

// 預設導出主求解器
export default AkingSPICE;