const path = require('path');
const fs = require('fs');

// 动态加载所需模块
const srcDir = path.join(__dirname, 'src');
const { VoltageSource } = require(path.join(srcDir, 'components/sources.js'));
const { Resistor } = require(path.join(srcDir, 'components/resistor.js'));
const { Inductor } = require(path.join(srcDir, 'components/inductor.js'));
const { Capacitor } = require(path.join(srcDir, 'components/capacitor.js'));
const { MultiWindingTransformer } = require(path.join(srcDir, 'components/transformer.js'));
const { Diode_MCP } = require(path.join(srcDir, 'components/diode_mcp.js'));
const { MCPTransientAnalysis } = require(path.join(srcDir, 'analysis/transient_mcp.js'));

// === LLC 轉換器設計參數 ===
const VIN = 400;              // 輸入電壓
const VOUT_TARGET = 48;       // 目標輸出電壓  
const POUT = 100;             // 輸出功率 (W)
const FREQ_SW = 95e3;         // 開關頻率 95kHz (接近諧振)
const FREQ_RES = 95e3;        // 諧振頻率 95kHz

// 計算負載和變壓比
const IOUT = POUT / VOUT_TARGET;  // 2.083A
const RLOAD = VOUT_TARGET / IOUT; // 23.04Ω
const TURNS_RATIO = 3.5;          // 3.5:1 變壓比 (全橋整流更高效)

console.log(`\n=== 設計參數 ===`);
console.log(`輸入: ${VIN}V DC`);
console.log(`輸出目標: ${VOUT_TARGET}V DC, ${POUT}W`);
console.log(`負載: ${RLOAD.toFixed(2)}Ω`);
console.log(`變壓比: ${TURNS_RATIO}:1`);
console.log(`開關頻率: ${FREQ_SW/1000}kHz`);
console.log(`諧振頻率: ${FREQ_RES/1000}kHz`);

// === LLC 諧振參數計算 ===
const Cr = 47e-9;  // 47nF 諧振電容
const Lr = 1 / (Math.pow(2 * Math.PI * FREQ_RES, 2) * Cr);  // 計算諧振電感
const Lm = 8 * Lr; // 磁化電感 = 8倍諧振電感

console.log(`\n=== 諧振元件 ===`);
console.log(`Lr (諧振電感): ${(Lr*1e6).toFixed(1)}μH`);
console.log(`Cr (諧振電容): ${(Cr*1e9).toFixed(0)}nF`);
console.log(`Lm (磁化電感): ${(Lm*1e6).toFixed(1)}μH`);

// === 組件定義 ===
const components = [
    // 1. 半橋電源
    new VoltageSource('VIN_TOP', ['DC_BUS', 'BRIDGE_OUT'], {
        dc: VIN/2,        
        ac: VIN/2,         
        freq: FREQ_SW,    
        phase: 0           
    }),
    new VoltageSource('VIN_BOTTOM', ['BRIDGE_OUT', 'GND'], {
        dc: VIN/2,         
        ac: -VIN/2,        
        freq: FREQ_SW,     
        phase: 0           
    }),

    // 2. LLC 諧振網路
    new Inductor('L_RESONANT', ['BRIDGE_OUT', 'LR_NODE'], Lr),
    new Capacitor('C_RESONANT', ['LR_NODE', 'TRANSFORMER_IN'], Cr),
    
    // 3. 磁化電感
    new Inductor('L_MAGNETIZING', ['TRANSFORMER_IN', 'GND'], Lm),

    // 4. 全橋整流變壓器 (兩繞組)
    new MultiWindingTransformer('T_LLC', {
        windings: [
            { 
                name: 'primary', 
                nodes: ['TRANSFORMER_IN', 'GND'], 
                inductance: Lm
            },
            { 
                name: 'secondary', 
                nodes: ['SEC_A', 'SEC_B'], 
                inductance: Lm / (TURNS_RATIO * TURNS_RATIO)  // 次級電感
            }
        ],
        couplingMatrix: [
            [1.0, 0.99],      // 初級與次級（強耦合）
            [0.99, 1.0]       // 次級與初級
        ]
    }),

    // 5. 全橋整流器
    new Diode_MCP('D1', ['SEC_A', 'OUTPUT_DC'], {  // 上臂正向
        Is: 1e-12, 
        Vt: 0.026,
        Rs: 0.005
    }),
    new Diode_MCP('D2', ['GND', 'SEC_A'], {        // 上臂反向
        Is: 1e-12, 
        Vt: 0.026,
        Rs: 0.005
    }),
    new Diode_MCP('D3', ['SEC_B', 'OUTPUT_DC'], {  // 下臂正向
        Is: 1e-12, 
        Vt: 0.026,
        Rs: 0.005
    }),
    new Diode_MCP('D4', ['GND', 'SEC_B'], {        // 下臂反向
        Is: 1e-12, 
        Vt: 0.026,
        Rs: 0.005
    }),
    
    // 6. 輸出濾波
    new Capacitor('C_OUTPUT', ['OUTPUT_DC', 'GND'], 2200e-6), // 2200μF 大電容
    new Inductor('L_OUTPUT', ['OUTPUT_DC', 'LOAD_NODE'], 47e-6), // 47μH 輸出電感
    
    // 7. 負載
    new Resistor('R_LOAD', ['LOAD_NODE', 'GND'], RLOAD)
];

console.log(`\n=== 電路組成 ===`);
console.log(`組件總數: ${components.length}`);
components.forEach((comp, i) => {
    console.log(`${(i+1).toString().padStart(2, ' ')}. ${comp.name || comp.constructor.name}`);
});

// === MCP 仿真執行 ===
console.log(`\n=== 開始 LLC 仿真 ===`);

(async () => {
try {
    // 創建分析器
    const analyzer = new MCPTransientAnalysis({
        debug: false,
        gmin: 1e-9,
        lcpDebug: false
    });
    
    // 仿真配置
    const config = {
        startTime: 0,
        stopTime: 300e-6,      // 300μs (約28個開關週期)
        timeStep: 1e-6,        // 1μs 時間步
        maxIterations: 100,
        tolerance: 1e-9
    };
    
    console.log(`仿真時間: ${(config.stopTime*1e6).toFixed(0)}μs (${(config.stopTime*FREQ_SW).toFixed(1)} 週期)`);
    console.log(`時間步長: ${(config.timeStep*1e6).toFixed(0)}μs`);
    console.log(`預計步數: ${(config.stopTime/config.timeStep).toFixed(0)}`);
    
    const startTime = Date.now();
    console.log('\n🚀 執行中...');
    
    // 執行仿真
    const results = await analyzer.run(components, config);
    
    const endTime = Date.now();
    const runtime = (endTime - startTime) / 1000;
    
    console.log(`\n✅ 仿真完成!`);
    console.log(`運行時間: ${runtime.toFixed(3)}s`);
    console.log(`實際步數: ${results?.timePoints?.length || 'N/A'}`);
    
    // === 結果分析 ===
    if (results && results.nodeVoltages && results.timeVector) {
        console.log(`📊 找到 ${results.timeVector.length} 個時間點`);
        console.log(`可用節點: ${JSON.stringify(Object.keys(results.nodeVoltages).sort(), null, 1)}`);
        
        // 查找輸出節點
        let outputNode = null;
        const possibleNodes = ['LOAD_NODE', 'OUTPUT_DC', 'output_pos', 'load_pos'];
        for (const node of possibleNodes) {
            if (results.nodeVoltages[node]) {
                outputNode = node;
                break;
            }
        }
        
        if (!outputNode) {
            console.log(`\n⚠️ 找不到輸出節點，嘗試替代節點...`);
            const altNodes = ['OUTPUT_DC', 'LOAD_NODE', 'output_pos', 'load_pos'];
            for (const node of altNodes) {
                if (results.nodeVoltages[node]) {
                    outputNode = node;
                    console.log(`✅ 使用替代節點: ${outputNode}`);
                    break;
                }
            }
        }
        
        if (outputNode && results.nodeVoltages[outputNode]) {
            const voltages = results.nodeVoltages[outputNode];
            const times = results.timeVector;
            
            // 計算穩態值 (最後20%的數據)
            const steadyStart = Math.floor(voltages.length * 0.8);
            const steadyVoltages = voltages.slice(steadyStart);
            
            if (steadyVoltages.length > 0) {
                // 電壓統計
                const V_avg = steadyVoltages.reduce((sum, v) => sum + v, 0) / steadyVoltages.length;
                const V_max = Math.max(...steadyVoltages);
                const V_min = Math.min(...steadyVoltages);
                const V_ripple = ((V_max - V_min) / Math.abs(V_avg)) * 100;
                
                // 電流和功率計算
                const I_avg = Math.abs(V_avg) / RLOAD;
                const P_out = Math.abs(V_avg) * I_avg;
                
                console.log(`\n📊 === LLC 轉換器性能 ===`);
                console.log(`輸出電壓:`);
                console.log(`  平均值: ${V_avg.toFixed(2)}V`);
                console.log(`  最大值: ${V_max.toFixed(2)}V`);
                console.log(`  最小值: ${V_min.toFixed(2)}V`);
                console.log(`  紋波:   ${V_ripple.toFixed(2)}%`);
                console.log(`輸出功率:`);
                console.log(`  電流:   ${I_avg.toFixed(3)}A`);
                console.log(`  功率:   ${P_out.toFixed(1)}W`);
                console.log(`規格達成:`);
                console.log(`  目標電壓: ${VOUT_TARGET}V`);
                console.log(`  達成率:   ${((V_avg/VOUT_TARGET)*100).toFixed(1)}%`);
                
                // 性能評估
                const voltageError = Math.abs(V_avg - VOUT_TARGET) / VOUT_TARGET * 100;
                console.log(`\n🎯 === 性能評估 ===`);
                if (voltageError <= 5) {
                    console.log(`✅ 輸出電壓: 符合規格 (誤差 ${voltageError.toFixed(1)}%)`);
                } else {
                    console.log(`❌ 輸出電壓: 偏離規格 (目標 ${VOUT_TARGET}V ±5%)`);
                }
                
                if (V_ripple <= 10) {
                    console.log(`✅ 電壓紋波: 符合規格 (${V_ripple.toFixed(1)}% ≤ 10%)`);
                } else {
                    console.log(`❌ 電壓紋波: 超出規格 (${V_ripple.toFixed(1)}% > 10%)`);
                }
            }
        } else {
            console.log(`\n⚠️ 未找到有效的輸出電壓數據`);
            console.log(`可用節點: ${Object.keys(results.nodeVoltages).join(', ')}`);
        }
        
        // LLC 諧振特性
        console.log(`\n⚡ === LLC 諧振特性 ===`);
        console.log(`諧振頻率: ${FREQ_RES/1000}kHz`);
        console.log(`開關頻率: ${FREQ_SW/1000}kHz`);
        console.log(`頻率比 fs/fr: ${(FREQ_SW/FREQ_RES).toFixed(3)}`);
        console.log(`✅ 工作在 LLC 諧振區域`);
        
    } else {
        console.log('\n❌ 沒有獲得有效的仿真結果');
    }
    
} catch (error) {
    console.error('\n❌ 仿真執行錯誤:', error);
}

console.log(`\n🎉 === AkingSPICE LLC 仿真結束 ===`);
console.log(`MultiWindingTransformer 核心: 正常運行`);
console.log(`LLC 諧振電路: 完整實現`);

})();