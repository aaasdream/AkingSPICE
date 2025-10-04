/**
 * AkingSPICE v2.0 - 返馳式變換器 (Flyback Converter) 模擬範例
 * 
 * 本範例將展示如何使用您編寫的模擬器核心來搭建並模擬一個完整的返馳變換器。
 * 
 * 電路拓撲:
 * - 輸入電壓源 (VIN)
 * - 主開關 (MOSFET_MCP)
 * - 耦合電感/變壓器 (MultiWindingTransformer)
 * - 次級整流二極體 (Diode_MCP)
 * - 輸出濾波電容 (Capacitor)
 * - 負載電阻 (Resistor)
 * 
 * 控制方式:
 * - 定頻、定佔空比的 PWM 控制 (PWMController)
 * 
 * 分析方法:
 * - 使用專為電力電子設計的 MCP 瞬態分析 (MCPTransientAnalysis)
 */

// 直接導入需要的組件，避開 index.js 的問題
import { MCPTransientAnalysis, createMCPTransientAnalysis } from './src/analysis/transient_mcp.js';
import { VoltageSource } from './src/components/sources.js';
import { Resistor } from './src/components/resistor.js';
import { Capacitor } from './src/components/capacitor_v2.js';
import { Inductor } from './src/components/inductor_v2.js';
import { createMCPDiode } from './src/components/diode_mcp.js';
import { createNMOSSwitch, PWMController } from './src/components/mosfet_mcp.js';
import { MultiWindingTransformer } from './src/components/transformer.js';

// -------------------------------------------------
// 1. 模擬參數定義
// -------------------------------------------------
console.log('--- 返馳變換器模擬參數 ---');
const params = {
    // 電源參數
    inputVoltage: 24,       // 輸入電壓 (V)

    // 控制參數
    switchingFrequency: 100e3, // 開關頻率 (100 kHz)
    dutyCycle: 0.33,          // 佔空比 (D)

    // 核心元件參數
    primaryInductance: 50e-6, // 主線圈電感 (50 uH)
    turnsRatio: 1,            // 匝數比 Np/Ns = 1
    couplingFactor: 0.99,     // 耦合係數 (k)

    // 輸出參數
    outputCapacitance: 220e-6,// 輸出電容 (220 uF)
    loadResistance: 12,       // 負載電阻 (Ω)

    // 模擬時間參數
    simulationTime: 1e-3,     // 總模擬時間 (1 ms, 約100個開關週期)
    timeStep: 100e-9,         // 時間步長 (100 ns)
};

// 根據參數計算次級電感和預期輸出電壓
params.secondaryInductance = params.primaryInductance * Math.pow(1 / params.turnsRatio, 2);
params.expectedOutputVoltage = params.inputVoltage * (params.dutyCycle / (1 - params.dutyCycle)) * (1 / params.turnsRatio);

console.log(`輸入電壓: ${params.inputVoltage}V`);
console.log(`開關頻率: ${params.switchingFrequency / 1e3}kHz`);
console.log(`佔空比: ${params.dutyCycle * 100}%`);
console.log(`預期輸出電壓 (理想): ${params.expectedOutputVoltage.toFixed(2)}V`);
console.log('--------------------------------\n');

// -------------------------------------------------
// 2. 創建電力電子模擬環境
// -------------------------------------------------
// 直接創建分析器，避開工廠函數的問題
const mcpAnalyzer = createMCPTransientAnalysis({
    debug: false,      
    lcpDebug: false,
    gmin: 1e-12        
});

// 創建元件構造函數對象
const componentFactory = {
    V: (name, n1, n2, value) => new VoltageSource(name, [n1, n2], value),
    R: (name, n1, n2, value) => new Resistor(name, [n1, n2], value),
    C: (name, n1, n2, value) => new Capacitor(name, [n1, n2], value),
    L: (name, n1, n2, value) => new Inductor(name, [n1, n2], value),
    nmos: (name, d, s, g, params) => createNMOSSwitch(name, d, s, g, params),
    fastDiode: (name, a, c, params) => createMCPDiode(name, a, c, params),
    pwm: (freq, duty, phase) => new PWMController(freq, duty, phase)
};

// -------------------------------------------------
// 3. 創建電路元件
// -------------------------------------------------
console.log('⚡ 正在建立電路元件...');

// --- 變壓器 (耦合電感) - 返馳拓撲 ---
// 返馳變換器的關鍵：次級整流在MOSFET關閉時導通
const transformer = new MultiWindingTransformer('T1', {
    windings: [
        { name: 'Lp', nodes: ['VIN', 'sw_drain'], inductance: params.primaryInductance, resistance: 1e-3 },
        { name: 'Ls', nodes: ['diode_anode', '0'], inductance: params.secondaryInductance, resistance: 1e-3 } // 注意極性
    ],
    couplingMatrix: [
        [1.0, -params.couplingFactor],  // 負耦合實現返馳
        [-params.couplingFactor, 1.0]
    ]
});

console.log(`✅ 返馳變壓器設置: Lp=${params.primaryInductance*1e6}µH, Ls=${params.secondaryInductance*1e6}µH, k=${params.couplingFactor}`);

// --- 其他元件 ---
// 使用從 pe 環境中獲取的便捷構造函數
const components = [
    // 輸入直流電壓源
    componentFactory.V('VIN_SRC', 'VIN', '0', params.inputVoltage),

    // 主開關 MOSFET (NMOS)
    componentFactory.nmos('M1', 'sw_drain', '0', 'gate'),

    // 次級快速恢復二極體
    componentFactory.fastDiode('D1', 'diode_anode', 'VOUT', { Vf: 0.8 }),

    // 輸出濾波電容和負載
    componentFactory.C('COUT', 'VOUT', '0', params.outputCapacitance),
    componentFactory.R('RLOAD', 'VOUT', '0', params.loadResistance),
];

// --- 組合所有元件 ---
// 您的 transformer 是一個 "元元件"，需要使用 getComponents() 獲取其實際的電感子元件
const allComponents = [
    ...components,
    ...transformer.getComponents() 
];

// --- PWM 控制 - 使用脈衝電壓源直接驅動 ---
const period = 1 / params.switchingFrequency;
const onTime = period * params.dutyCycle;

// 添加閘極驅動電壓源
components.push(
    componentFactory.V('VGATE', 'gate', '0', {
        type: 'PULSE',
        v1: 0,        // 低電平 (關閉)
        v2: 12,       // 高電平 (開啟) 
        td: 0,        // 延遲
        tr: 1e-9,     // 上升時間
        tf: 1e-9,     // 下降時間
        pw: onTime,   // 脈寬
        per: period   // 週期
    })
);

console.log(`✅ PWM驅動設置完成: 頻率=${params.switchingFrequency/1e3}kHz, 佔空比=${params.dutyCycle*100}%`);

console.log(`✅ 電路建立完成，共 ${allComponents.length} 個基礎元件。\n`);

// -------------------------------------------------
// 4. 執行 MCP 瞬態分析
// -------------------------------------------------
// 定義一個異步函數來運行模擬
async function runSimulation() {
    console.log('🚀 開始 MCP 瞬態分析...');
    const startTime = performance.now();

    try {
        // 調用您的 MCP 瞬態分析器
        const result = await mcpAnalyzer.run(allComponents, {
            startTime: 0,
            stopTime: params.simulationTime,
            timeStep: params.timeStep,
        });

        const endTime = performance.now();
        console.log(`\n✅ 模擬完成！耗時: ${(endTime - startTime).toFixed(2)} ms`);
        
        // -------------------------------------------------
        // 5. 處理並顯示結果
        // -------------------------------------------------
        if (result && result.success && result.timePoints && result.timePoints.length > 0) {
            const timePoints = result.timePoints;
            console.log(`模擬數據點數: ${timePoints.length}`);
            
            // 提取輸出電壓數據
            const voutData = [];
            const iLpData = [];
            
            for (let i = 0; i < timePoints.length; i++) {
                const point = timePoints[i];
                if (point.nodeVoltages && point.nodeVoltages['VOUT'] !== undefined) {
                    voutData.push(point.nodeVoltages['VOUT']);
                }
                if (point.branchCurrents && point.branchCurrents['T1_Lp'] !== undefined) {
                    iLpData.push(Math.abs(point.branchCurrents['T1_Lp']));
                }
            }

            console.log('\n--- 模擬結果 ---');
            console.log(`模擬總點數: ${timePoints.length}`);
            console.log(`預期輸出電壓: ${params.expectedOutputVoltage.toFixed(3)} V`);
            
            if (voutData.length > 0) {
                // 計算穩態輸出電壓 (取最後 20% 數據的平均值)
                const steadyStateStartIndex = Math.floor(voutData.length * 0.8);
                const steadyStateVout = voutData.slice(steadyStateStartIndex);
                const averageVout = steadyStateVout.reduce((sum, v) => sum + v, 0) / steadyStateVout.length;
                const maxVout = Math.max(...voutData);
                const minVout = Math.min(...voutData);
                
                console.log(`穩態平均輸出電壓: ${averageVout.toFixed(3)} V`);
                console.log(`最大輸出電壓: ${maxVout.toFixed(3)} V`);
                console.log(`最小輸出電壓: ${minVout.toFixed(3)} V`);
                
                const ripple = maxVout > 0 ? ((maxVout - minVout) / averageVout * 100) : 0;
                console.log(`電壓紋波: ${ripple.toFixed(1)}%`);
            } else {
                console.log('⚠️  無法提取輸出電壓數據');
            }
            
            if (iLpData.length > 0) {
                const peakLpCurrent = Math.max(...iLpData);
                console.log(`主線圈峰值電流: ${peakLpCurrent.toFixed(3)} A`);
            }
            
            console.log('分析統計:');
            console.log(`  總步數: ${timePoints.length}`);
            console.log(`  執行時間: ${((endTime - startTime)/1000).toFixed(3)} s`);

        } else {
            console.error('❌ 模擬未產生任何結果。');
        }

    } catch (error) {
        console.error('❌ 模擬過程中發生錯誤:', error);
    }
}

// 運行模擬
runSimulation();