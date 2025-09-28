/**
 * LLC 共振頻率掃描分析器
 * 系統性分析LLC轉換器在不同頻率下的共振特性
 * 1. 掃描頻率範圍：10kHz - 200kHz
 * 2. 分析電壓增益、Q因子、阻抗特性
 * 3. 找出最佳工作點和設計參數
 */

// 引入 AkingSPICE 庫
import AkingSPICE, { VoltageSource, Resistor, Capacitor, Inductor, VoltageControlledMOSFET, MultiWindingTransformer } from './src/index.js';

console.log('🔍 LLC 共振頻率掃描分析 - 開始...\n');

// LLC 電路參數配置
const circuitConfig = {
    // 共振元件 (基於之前的優化配置)
    Lr: 47e-6,      // 共振電感 47μH
    Cr: 470e-9,     // 共振電容 470nF
    Lm: 500e-6,     // 激磁電感 500μH (與變壓器初級並聯)
    
    // 變壓器配置
    transformer: {
        turns_primary: 10,
        turns_secondary_a: 5,  // 1:0.5 降壓比
        turns_secondary_b: 5,
        coupling: 0.95,        // 95% 耦合係數
        Lp: 500e-6,           // 初級電感
        Ls: 125e-6,           // 次級電感 (n²倍關係)
        mutual: 237e-6        // 互感
    },
    
    // 負載和輸出濾波
    R_load: 2.4,              // 48V/20A = 2.4Ω 負載
    C_output: 1000e-6,        // 1000μF 輸出電容
    
    // 開關頻率掃描範圍
    frequency: {
        min: 10000,    // 10kHz
        max: 200000,   // 200kHz
        steps: 50      // 50個頻率點
    },
    
    // 仿真參數
    simulation: {
        duration: 200e-6,     // 200μs (足夠多個週期)
        timeStepsPerCycle: 20 // 每週期20個時間步
    }
};

// 計算理論共振頻率
const f_resonant_theory = 1 / (2 * Math.PI * Math.sqrt(circuitConfig.Lr * circuitConfig.Cr));
console.log(`📊 理論共振頻率: ${(f_resonant_theory/1000).toFixed(2)} kHz\n`);

// 頻率掃描結果存儲
const sweepResults = [];

// 主要的掃描函數
async function runFrequencySweep() {
// 進行頻率掃描
console.log('🔄 開始頻率掃描...\n');

for (let i = 0; i < circuitConfig.frequency.steps; i++) {
    const frequency = circuitConfig.frequency.min + 
        (circuitConfig.frequency.max - circuitConfig.frequency.min) * i / (circuitConfig.frequency.steps - 1);
    
    console.log(`📍 測試頻率: ${(frequency/1000).toFixed(1)} kHz`);
    
    try {
        // 創建LLC電路
        const circuit = new AkingSPICE();
        
        // 輸入電壓源 (方波，模擬半橋輸出)
        const vin = new VoltageSource('Vin', ['n_half_bridge', 'GND'], {
            type: 'square',
            amplitude: 200,  // 400V輸入的一半 (半橋)
            frequency: frequency,
            offset: 0,
            phase: 0
        });
        circuit.addComponent(vin);
        
        // 共振電路
        const Lr = new Inductor('Lr', ['n_half_bridge', 'n_resonant'], circuitConfig.Lr);
        const Cr = new Capacitor('Cr', ['n_resonant', 'n_primary'], circuitConfig.Cr);
        circuit.addComponent(Lr);
        circuit.addComponent(Cr);
        
        // 變壓器 (包含激磁電感) - 簡化為單一變壓器
        const transformer = new MultiWindingTransformer('T1', {
            windings: [
                {
                    name: 'primary',
                    nodes: ['n_primary', 'GND'],
                    inductance: circuitConfig.transformer.Lp,
                    resistance: 0.01
                },
                {
                    name: 'secondary',
                    nodes: ['n_sec_a', 'n_sec_b'],
                    inductance: circuitConfig.transformer.Ls,
                    resistance: 0.01
                }
            ],
            couplingMatrix: [
                [1.0, circuitConfig.transformer.coupling],
                [circuitConfig.transformer.coupling, 1.0]
            ]
        });
        
        // 將變壓器的個別電感添加到電路中
        for (const inductor of transformer.getComponents()) {
            circuit.addComponent(inductor);
        }
        
        // 整流二極體 (用阻性模型簡化) - 半橋整流
        const D1 = new Resistor('D1', ['n_sec_a', 'n_output'], 0.01);  // 順向電阻
        const D2 = new Resistor('D2', ['n_sec_b', 'n_output'], 0.01);
        circuit.addComponent(D1);
        circuit.addComponent(D2);
        
        // 輸出濾波和負載
        const C_out = new Capacitor('C_out', ['n_output', 'GND'], circuitConfig.C_output);
        const R_load = new Resistor('R_load', ['n_output', 'GND'], circuitConfig.R_load);
        circuit.addComponent(C_out);
        circuit.addComponent(R_load);
        
        // 執行仿真
        const period = 1 / frequency;
        const timeStep = period / circuitConfig.simulation.timeStepsPerCycle;
        const numSteps = Math.floor(circuitConfig.simulation.duration / timeStep);
        
        // 建構SPICE格式的暫態分析命令
        const tranCommand = `.tran ${timeStep * 1e6}us ${circuitConfig.simulation.duration * 1e6}us`;
        const results = await circuit.runTransientAnalysis(tranCommand);
        
        if (results && results.timeVector && results.timeVector.length > 0) {
            // 分析最後幾個週期的穩態數據
            const totalPoints = results.timeVector.length;
            const steadyStateStart = Math.floor(totalPoints * 0.7); // 後30%為穩態
            
            // 計算平均輸出電壓
            let avgVout = 0;
            let maxVout = -Infinity;
            let minVout = Infinity;
            let avgIresonant = 0;
            let maxIresonant = -Infinity;
            let count = 0;
            
            for (let i = steadyStateStart; i < totalPoints; i++) {
                const time = results.timeVector[i];
                const vout = results.voltageMatrix['n_output'] ? results.voltageMatrix['n_output'][i] : 0;
                
                avgVout += vout;
                maxVout = Math.max(maxVout, vout);
                minVout = Math.min(minVout, vout);
                
                // 共振電流估算 (通過Lr的電壓)
                const vLr_plus = results.voltageMatrix['n_half_bridge'] ? results.voltageMatrix['n_half_bridge'][i] : 0;
                const vLr_minus = results.voltageMatrix['n_resonant'] ? results.voltageMatrix['n_resonant'][i] : 0;
                const iResonant = Math.abs((vLr_plus - vLr_minus) / (2 * Math.PI * frequency * circuitConfig.Lr));
                avgIresonant += iResonant;
                maxIresonant = Math.max(maxIresonant, iResonant);
                count++;
            }
            
            avgVout /= count;
            avgIresonant /= count;
            const ripple = maxVout - minVout;
            
            // 計算電壓增益 (相對於輸入RMS)
            const inputRMS = 200 / Math.sqrt(2); // 方波RMS約為峰值/√2
            const voltageGain = avgVout / inputRMS;
            
            // 計算Q因子估算 (基於共振電流和輸出功率)
            const outputPower = (avgVout * avgVout) / circuitConfig.R_load;
            const resonantPower = maxIresonant * maxIresonant * Math.sqrt(circuitConfig.Lr / circuitConfig.Cr);
            const Q_factor = resonantPower > 0 ? resonantPower / (outputPower + 1e-9) : 0;
            
            // 存儲結果
            const result = {
                frequency: frequency,
                frequencyKHz: frequency / 1000,
                avgVout: avgVout,
                maxVout: maxVout,
                minVout: minVout,
                ripple: ripple,
                voltageGain: voltageGain,
                avgIresonant: avgIresonant,
                maxIresonant: maxIresonant,
                outputPower: outputPower,
                Q_factor: Q_factor,
                efficiency: outputPower / (inputRMS * avgIresonant + 1e-9) * 100
            };
            
            sweepResults.push(result);
            
            console.log(`   ✅ Vout=${avgVout.toFixed(2)}V, 增益=${voltageGain.toFixed(3)}, Q=${Q_factor.toFixed(3)}, 功率=${outputPower.toFixed(1)}W`);
            
        } else {
            console.log(`   ❌ 仿真失敗`);
            sweepResults.push({
                frequency: frequency,
                frequencyKHz: frequency / 1000,
                error: true
            });
        }
        
    } catch (error) {
        console.log(`   ❌ 錯誤: ${error.message}`);
        sweepResults.push({
            frequency: frequency,
            frequencyKHz: frequency / 1000,
            error: true,
            errorMessage: error.message
        });
    }
}

console.log('\n📈 頻率掃描完成！正在分析結果...\n');

// 分析掃描結果
const validResults = sweepResults.filter(r => !r.error);

if (validResults.length === 0) {
    console.log('❌ 沒有有效的仿真結果');
    process.exit(1);
}

// 找出關鍵工作點
const maxGainResult = validResults.reduce((max, r) => r.voltageGain > max.voltageGain ? r : max);
const maxPowerResult = validResults.reduce((max, r) => r.outputPower > max.outputPower ? r : max);
const minRippleResult = validResults.reduce((min, r) => r.ripple < min.ripple ? r : min);
const highestVoutResult = validResults.reduce((max, r) => r.avgVout > max.avgVout ? r : max);

// 找出接近理論共振頻率的結果
const resonantResult = validResults.reduce((closest, r) => 
    Math.abs(r.frequency - f_resonant_theory) < Math.abs(closest.frequency - f_resonant_theory) ? r : closest
);

console.log('🎯 關鍵工作點分析:\n');

console.log('📊 最高電壓增益點:');
console.log(`   頻率: ${maxGainResult.frequencyKHz.toFixed(1)} kHz`);
console.log(`   輸出電壓: ${maxGainResult.avgVout.toFixed(2)} V`);
console.log(`   電壓增益: ${maxGainResult.voltageGain.toFixed(3)}`);
console.log(`   Q因子: ${maxGainResult.Q_factor.toFixed(3)}`);
console.log(`   輸出功率: ${maxGainResult.outputPower.toFixed(1)} W\n`);

console.log('⚡ 最高功率點:');
console.log(`   頻率: ${maxPowerResult.frequencyKHz.toFixed(1)} kHz`);
console.log(`   輸出電壓: ${maxPowerResult.avgVout.toFixed(2)} V`);
console.log(`   輸出功率: ${maxPowerResult.outputPower.toFixed(1)} W`);
console.log(`   電壓增益: ${maxPowerResult.voltageGain.toFixed(3)}`);
console.log(`   Q因子: ${maxPowerResult.Q_factor.toFixed(3)}\n`);

console.log('📈 最高輸出電壓點:');
console.log(`   頻率: ${highestVoutResult.frequencyKHz.toFixed(1)} kHz`);
console.log(`   輸出電壓: ${highestVoutResult.avgVout.toFixed(2)} V`);
console.log(`   電壓增益: ${highestVoutResult.voltageGain.toFixed(3)}`);
console.log(`   漣波: ${highestVoutResult.ripple.toFixed(3)} V`);
console.log(`   效率估算: ${highestVoutResult.efficiency.toFixed(1)}%\n`);

console.log('🎵 理論共振頻率附近:');
console.log(`   理論頻率: ${(f_resonant_theory/1000).toFixed(2)} kHz`);
console.log(`   實際測試: ${resonantResult.frequencyKHz.toFixed(1)} kHz`);
console.log(`   輸出電壓: ${resonantResult.avgVout.toFixed(2)} V`);
console.log(`   Q因子: ${resonantResult.Q_factor.toFixed(3)}`);
console.log(`   電壓增益: ${resonantResult.voltageGain.toFixed(3)}\n`);

console.log('🏆 建議工作點 (綜合考量):');
// 選擇在高電壓增益和合理功率之間平衡的點
const recommendedResult = validResults.find(r => 
    r.voltageGain > maxGainResult.voltageGain * 0.8 && 
    r.outputPower > maxPowerResult.outputPower * 0.6 &&
    r.avgVout > highestVoutResult.avgVout * 0.8
) || maxGainResult;

console.log(`   推薦頻率: ${recommendedResult.frequencyKHz.toFixed(1)} kHz`);
console.log(`   輸出電壓: ${recommendedResult.avgVout.toFixed(2)} V`);
console.log(`   電壓增益: ${recommendedResult.voltageGain.toFixed(3)}`);
console.log(`   Q因子: ${recommendedResult.Q_factor.toFixed(3)}`);
console.log(`   輸出功率: ${recommendedResult.outputPower.toFixed(1)} W`);
console.log(`   效率估算: ${recommendedResult.efficiency.toFixed(1)}%\n`);

// 變壓器設計建議
console.log('🔧 變壓器設計建議:');
const targetVout = 48; // 目標48V輸出
const currentMaxVout = highestVoutResult.avgVout;
const requiredTurnsRatio = targetVout / currentMaxVout;

console.log(`   當前最高輸出: ${currentMaxVout.toFixed(2)} V`);
console.log(`   目標輸出: ${targetVout} V`);
console.log(`   建議匝數比調整: ${requiredTurnsRatio.toFixed(2)}:1 (次級:初級)`);
console.log(`   或初級:次級 = 1:${requiredTurnsRatio.toFixed(2)}\n`);

// 控制器設計提示
console.log('🎮 控制器設計提示:');
console.log(`   標稱工作頻率: ${recommendedResult.frequencyKHz.toFixed(1)} kHz`);
console.log(`   頻率調節範圍: ${(recommendedResult.frequencyKHz * 0.8).toFixed(1)} - ${(recommendedResult.frequencyKHz * 1.2).toFixed(1)} kHz`);
console.log(`   負載調節特性: 需要根據輸出電壓調整頻率`);
console.log(`   軟開關範圍: 建議在 ${(recommendedResult.frequencyKHz * 0.9).toFixed(1)} - ${(recommendedResult.frequencyKHz * 1.1).toFixed(1)} kHz 內工作\n`);

// 輸出詳細數據表
console.log('📋 詳細掃描數據:');
console.log('頻率(kHz) | 輸出電壓(V) | 電壓增益 | Q因子 | 功率(W) | 漣波(V) | 效率(%)');
console.log('---------|-------------|---------|-------|---------|---------|--------');

for (const result of validResults) {
    if (!result.error) {
        console.log(
            `${result.frequencyKHz.toFixed(1).padStart(8)} | ` +
            `${result.avgVout.toFixed(2).padStart(10)} | ` +
            `${result.voltageGain.toFixed(3).padStart(7)} | ` +
            `${result.Q_factor.toFixed(3).padStart(5)} | ` +
            `${result.outputPower.toFixed(1).padStart(6)} | ` +
            `${result.ripple.toFixed(3).padStart(6)} | ` +
            `${result.efficiency.toFixed(1).padStart(6)}`
        );
    }
}

console.log('\n✅ 頻率掃描分析完成！');
console.log('📝 請根據以上分析結果進行變壓器設計和控制器開發。');

}

// 運行掃描
runFrequencySweep().catch(error => {
    console.error('頻率掃描失敗:', error);
    process.exit(1);
});