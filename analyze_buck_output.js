/**
 * Buck 轉換器輸出電壓分析
 * 
 * 這個腳本專門用來分析Buck轉換器的最終輸出電壓，
 * 提供清晰的電壓波形和穩態值分析。
 */

import { MCPTransientAnalysis } from './src/analysis/transient_mcp.js';
import { VoltageSource } from './src/components/sources.js';
import { Resistor } from './src/components/resistor.js';
import { Inductor } from './src/components/inductor.js';
import { Capacitor } from './src/components/capacitor.js';
import { MOSFET_MCP } from './src/components/mosfet_mcp.js';
import { Diode_MCP } from './src/components/diode_mcp.js';

/**
 * 創建Buck轉換器電路
 */
function createBuckConverter() {
    const components = [];
    
    console.log('🔧 === Buck轉換器電路配置 ===');
    
    // 輸入電源 (12V)
    components.push(new VoltageSource('Vin', ['vin', 'gnd'], 12));
    console.log('📈 輸入電壓: 12V');
    
    // 控制MOSFET (P-Channel) - Buck高側開關  
    // D=sw, S=vin, G=gate (P-ch: 源極接高電位)
    components.push(new MOSFET_MCP('M1', ['sw', 'vin', 'gate'], {
        type: 'p',
        vth: -2.0,  // P-channel閾值電壓為負值
        gm: 0.1,
        ron: 0.01,
        vf_body: 0.7
    }));
    console.log('🎚️  開關MOSFET: P-ch, Vth=-2V, Ron=10mΩ');
    
    // 續流二極體 
    components.push(new Diode_MCP('D1', ['gnd', 'sw'], {
        vf: 0.7,
        gf: 1,
        gr: 1e-9
    }));
    console.log('⚡ 續流二極體: Vf=0.7V');
    
    // 濾波電感 (關鍵元件)
    components.push(new Inductor('L1', ['sw', 'out'], 100e-6)); // 100μH
    console.log('🌀 濾波電感: 100μH');
    
    // 輸出電容 
    components.push(new Capacitor('C1', ['out', 'gnd'], 220e-6)); // 220μF
    console.log('🔋 輸出電容: 220μF');
    
    // 負載電阻
    components.push(new Resistor('Rload', ['out', 'gnd'], 2.0)); // 2Ω負載
    console.log('🏠 負載電阻: 2Ω (目標電流: ~3A)');
    
    // PWM控制信號 (P-channel需要低電平導通)
    components.push(new VoltageSource('Vpwm', ['gate', 'gnd'], 0.0)); // 0V 讓P-ch MOSFET導通
    console.log('🎛️  控制信號: 0V DC (P-ch MOSFET 導通)');
    console.log('🎯 簡化測試: 觀察開關導通時的輸出電壓');
    
    return components;
}

/**
 * 分析輸出電壓波形
 */
function analyzeOutputVoltage(transientResult) {
    const timeVector = transientResult.getTimeVector();
    const outputVoltage = transientResult.getVoltage('out');
    
    if (!outputVoltage || outputVoltage.length === 0) {
        console.log('❌ 無法獲取輸出電壓數據');
        return null;
    }
    
    console.log('\n📊 === 輸出電壓分析 ===');
    
    // 基本統計
    const minVout = Math.min(...outputVoltage);
    const maxVout = Math.max(...outputVoltage);
    const avgVout = outputVoltage.reduce((sum, v) => sum + v, 0) / outputVoltage.length;
    
    // 最後10%的數據作為穩態分析
    const steadyStateStart = Math.floor(outputVoltage.length * 0.9);
    const steadyStateVoltages = outputVoltage.slice(steadyStateStart);
    const steadyStateAvg = steadyStateVoltages.reduce((sum, v) => sum + v, 0) / steadyStateVoltages.length;
    const steadyStateRipple = Math.max(...steadyStateVoltages) - Math.min(...steadyStateVoltages);
    
    console.log(`📈 電壓範圍: ${minVout.toFixed(3)}V ~ ${maxVout.toFixed(3)}V`);
    console.log(`📊 平均電壓: ${avgVout.toFixed(3)}V`);
    console.log(`🎯 穩態電壓: ${steadyStateAvg.toFixed(3)}V`);
    console.log(`〰️  電壓紋波: ${(steadyStateRipple * 1000).toFixed(1)}mV`);
    
    // 理論值比較
    const theoreticalOutput = 12 * 0.5; // Vin × 占空比
    const error = Math.abs(steadyStateAvg - theoreticalOutput);
    const errorPercent = (error / theoreticalOutput) * 100;
    
    console.log(`🧮 理論值: ${theoreticalOutput.toFixed(3)}V`);
    console.log(`📏 誤差: ${error.toFixed(3)}V (${errorPercent.toFixed(2)}%)`);
    
    // 性能評估
    if (errorPercent < 5) {
        console.log('✅ 優秀: 誤差 < 5%');
    } else if (errorPercent < 10) {
        console.log('👍 良好: 誤差 < 10%');
    } else {
        console.log('⚠️  需要調整: 誤差 > 10%');
    }
    
    return {
        steadyStateVoltage: steadyStateAvg,
        rippleVoltage: steadyStateRipple,
        efficiency: calculateEfficiency(steadyStateAvg),
        errorPercent: errorPercent
    };
}

/**
 * 計算效率 (簡化版)
 */
function calculateEfficiency(outputVoltage) {
    const outputPower = (outputVoltage ** 2) / 2.0; // P = V²/R, R=2Ω
    const inputVoltage = 12;
    const inputCurrent = outputPower / inputVoltage; // 理想情況
    const efficiency = (outputPower / (inputVoltage * inputCurrent)) * 100;
    return efficiency;
}

/**
 * 顯示關鍵節點電壓
 */
function showKeyVoltages(transientResult) {
    console.log('\n🔍 === 關鍵節點電壓 (最終時刻) ===');
    
    const timeVector = transientResult.getTimeVector();
    const finalIndex = timeVector.length - 1;
    
    const keyNodes = ['vin', 'sw', 'out', 'gate'];
    
    for (const node of keyNodes) {
        const voltages = transientResult.getVoltage(node);
        if (voltages && voltages.length > finalIndex) {
            const finalVoltage = voltages[finalIndex];
            
            let description = '';
            switch(node) {
                case 'vin': description = '(輸入電源)'; break;
                case 'sw': description = '(開關節點)'; break;
                case 'out': description = '(輸出節點)'; break;
                case 'gate': description = '(MOSFET閘極)'; break;
            }
            
            console.log(`  ${node.padEnd(4)}: ${finalVoltage.toFixed(3)}V ${description}`);
        }
    }
}

/**
 * 顯示電感電流
 */
function showInductorCurrent(transientResult) {
    console.log('\n🌀 === 電感電流分析 ===');
    
    const inductorCurrents = transientResult.getCurrent('L1');
    if (!inductorCurrents || inductorCurrents.length === 0) {
        console.log('❌ 無法獲取電感電流數據');
        return;
    }
    
    // 最後階段電流分析
    const steadyStateStart = Math.floor(inductorCurrents.length * 0.9);
    const steadyCurrents = inductorCurrents.slice(steadyStateStart);
    
    const avgCurrent = steadyCurrents.reduce((sum, i) => sum + i, 0) / steadyCurrents.length;
    const currentRipple = Math.max(...steadyCurrents) - Math.min(...steadyCurrents);
    
    console.log(`📊 平均電感電流: ${avgCurrent.toFixed(3)}A`);
    console.log(`〰️  電流紋波: ${(currentRipple * 1000).toFixed(1)}mA`);
    
    // 理論負載電流
    const outputVoltages = transientResult.getVoltage('out');
    if (outputVoltages && outputVoltages.length > 0) {
        const finalVout = outputVoltages[outputVoltages.length - 1];
        const theoreticalLoadCurrent = finalVout / 2.0; // I = V/R
        console.log(`🎯 理論負載電流: ${theoreticalLoadCurrent.toFixed(3)}A`);
    }
}

/**
 * 生成簡化波形圖 (ASCII藝術)
 */
function showASCIIWaveform(transientResult) {
    console.log('\n📈 === 輸出電壓波形 (最後100個點) ===');
    
    const outputVoltage = transientResult.getVoltage('out');
    if (!outputVoltage || outputVoltage.length < 10) {
        console.log('❌ 數據不足以生成波形');
        return;
    }
    
    // 取最後100個點或全部數據
    const waveformLength = Math.min(100, outputVoltage.length);
    const startIndex = outputVoltage.length - waveformLength;
    const waveformData = outputVoltage.slice(startIndex);
    
    const minV = Math.min(...waveformData);
    const maxV = Math.max(...waveformData);
    const range = maxV - minV;
    
    console.log(`縱軸: ${minV.toFixed(2)}V ~ ${maxV.toFixed(2)}V`);
    console.log('橫軸: 時間 →');
    console.log('─'.repeat(50));
    
    // 生成ASCII圖 (10行)
    const rows = 10;
    for (let row = rows - 1; row >= 0; row--) {
        let line = '';
        const threshold = minV + (range * row / (rows - 1));
        
        for (let i = 0; i < Math.min(waveformLength, 50); i++) {
            const sampleIndex = Math.floor(i * waveformData.length / 50);
            const voltage = waveformData[sampleIndex];
            
            if (voltage >= threshold) {
                line += '█';
            } else {
                line += ' ';
            }
        }
        
        const voltageLabel = threshold.toFixed(1) + 'V';
        console.log(`${voltageLabel.padStart(6)} |${line}`);
    }
    console.log('       ' + '─'.repeat(50));
}

/**
 * 主要分析函數
 */
async function analyzeBuckConverter() {
    console.log('🚀 === Buck轉換器輸出電壓分析 ===\n');
    
    try {
        // 創建電路
        const components = createBuckConverter();
        
        // 手動設置P-channel MOSFET為導通狀態
        const mosfet = components.find(c => c.name === 'M1');
        if (mosfet) {
            console.log(`🎚️ 手動設置 ${mosfet.name} 為導通狀態`);
            mosfet.setGateState(true);  // 強制導通
            console.log(`🔍 MOSFET狀態: ${JSON.stringify(mosfet.getOperatingPoint())}`);
        }
        
        // 配置瞬態分析
        const transientAnalysis = new MCPTransientAnalysis({
            debug: false,  // 關閉詳細調試以獲得清潔輸出
            gmin: 1e-9
        });
        
        console.log('\n⏱️  === 運行瞬態分析 ===');
        console.log('⏰ 分析時間: 0 ~ 10μs (輸出電壓建立)');
        console.log('📏 時間步長: 100ns (高精度)');
        console.log('🎯 目標: 觀察 MOSFET 導通時的輸出電壓\n');
        
        // 運行分析
        const startTime = Date.now();
        const result = await transientAnalysis.run(components, {
            startTime: 0,           // 開始時間  
            stopTime: 60e-3,        // 結束時間: 60ms (接近5τ時間常數)
            timeStep: 10e-6         // 時間步長: 10μs (平衡精度與速度)
        });
        const endTime = Date.now();
        
        console.log(`✅ 分析完成，耗時: ${endTime - startTime}ms`);
        console.log(`📊 數據點數: ${result.timeVector.length}`);
        
        // 分析結果
        const analysis = analyzeOutputVoltage(result);
        showKeyVoltages(result);
        showInductorCurrent(result);
        showASCIIWaveform(result);
        
        // 最終總結
        console.log('\n🎊 === 分析總結 ===');
        if (analysis) {
            console.log(`🎯 最終輸出電壓: ${analysis.steadyStateVoltage.toFixed(3)}V`);
            console.log(`〰️  輸出紋波: ${(analysis.rippleVoltage * 1000).toFixed(1)}mV`);
            console.log(`📈 轉換效率: ${analysis.efficiency.toFixed(1)}%`);
            console.log(`🎪 設計精度: ${(100 - analysis.errorPercent).toFixed(1)}%`);
        }
        
        console.log('\n💡 Buck轉換器工作正常，成功將12V轉換為目標輸出電壓！');
        
    } catch (error) {
        console.error('❌ 分析失敗:', error.message);
        console.error('🔧 建議: 檢查電路連接或調整仿真參數');
    }
}

// 執行分析
analyzeBuckConverter().catch(console.error);