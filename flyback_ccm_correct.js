// 正確的CCM返馳轉換器設計 - 基於TI技術文章
const path = require('path');
const srcDir = path.join(__dirname, 'src');

const { MCPTransientAnalysis } = require(path.join(srcDir, 'analysis/transient_mcp.js'));
const { Resistor } = require(path.join(srcDir, 'components/resistor.js'));
const { Capacitor } = require(path.join(srcDir, 'components/capacitor_v2.js'));
const { VoltageSource } = require(path.join(srcDir, 'components/sources.js'));
const { createNMOSSwitch } = require(path.join(srcDir, 'components/mosfet_mcp.js'));
const { createMCPDiode } = require(path.join(srcDir, 'components/diode_mcp.js'));
const { MultiWindingTransformer } = require(path.join(srcDir, 'components/transformer.js'));

console.log('🚀 啟動正確CCM返馳轉換器仿真 (基於TI標準)...');

// 根據TI技術文章的CCM設計參數
const parameters = {
    // 電源參數 - 調整為合適的CCM功率級
    inputVoltage: 48.0,        // 48V輸入 (接近TI的51V)
    targetOutput: 12.0,        // 12V輸出
    outputCurrent: 3.0,        // 3A輸出電流 → 36W功率
    
    // 開關參數 - 使用TI推薦的高頻
    switchingFreq: 200000,     // 200kHz (接近TI的250kHz)
    dutyCycle: 0.45,           // 45% (接近TI的50%最大值)
    period: 1/200000,          // 5μs周期
    onTime: 0.45 * (1/200000), // 導通時間 2.25μs
    
    // 變壓器參數 - 根據TI公式計算
    // Nps = Vinmin/(Vout+Vd) × dmax/(1-dmax) = 48/(12+0.5) × 0.45/0.55 = 3.14 ≈ 3:1
    turnsRatio: 3.0,           // 3:1匝數比
    primaryInductance: 60e-6,   // 60μH (根據TI公式9計算)
    secondaryInductance: 60e-6/9, // Lsec = Lpri/N² = 60μH/9 = 6.7μH
    coupling: 0.98,            // 高耦合係數
    
    // 輸出濾波 - 根據TI公式計算
    outputCap: 100e-6,         // 100μF (TI推薦83μF以上)
    outputRes: 4.0,            // 4Ω負載 (12V/3A)
    
    // MOSFET參數
    mosVth: 3.0,               
    mosKn: 5e-3,               // 更高的跨導
    pwmHigh: 12.0,             // 更高的驅動電壓
    pwmLow: 0.0,               
    
    // 二極管參數
    diodeIs: 1e-12,
    diodeN: 1.0,
    diodeVf: 0.5               // TI文章中的Vd值
};

// 設計驗證計算
console.log('📋 CCM設計驗證:');
console.log(`  輸入電壓: ${parameters.inputVoltage}V`);
console.log(`  輸出功率: ${(parameters.targetOutput * parameters.outputCurrent).toFixed(1)}W`);
console.log(`  開關頻率: ${parameters.switchingFreq/1000}kHz`);
console.log(`  占空比: ${(parameters.dutyCycle*100).toFixed(1)}%`);
console.log(`  變壓器比: ${parameters.turnsRatio.toFixed(1)}:1`);

// CCM條件驗證 (TI公式9)
const Pout = parameters.targetOutput * parameters.outputCurrent;
const eta = 0.88; // 預期效率
const LminRequired = (parameters.inputVoltage * parameters.inputVoltage * 
                     parameters.dutyCycle * parameters.dutyCycle * eta) /
                     (2 * parameters.switchingFreq * Pout * 0.3); // 30%負載進入DCM

console.log(`  所需最小電感: ${(LminRequired*1e6).toFixed(1)}μH`);
console.log(`  實際電感: ${(parameters.primaryInductance*1e6).toFixed(1)}μH`);
console.log(`  CCM條件: ${parameters.primaryInductance > LminRequired ? '✅滿足' : '❌不滿足'}`);

// 峰值電流計算 (TI公式10)
const IpriPeak = (parameters.outputCurrent / (1 - parameters.dutyCycle)) * parameters.turnsRatio +
                 (parameters.inputVoltage * parameters.dutyCycle) / 
                 (2 * parameters.primaryInductance * parameters.switchingFreq);

console.log(`  峰值初級電流: ${IpriPeak.toFixed(2)}A`);

// 創建電路組件
const components = [
    // 1. 輸入直流電源
    new VoltageSource('DC_INPUT', ['input', 'gnd'], parameters.inputVoltage),
    
    // 2. PWM控制電壓源 (更高頻率)
    new VoltageSource('PWM_CONTROL', ['pwm', 'gnd'], {
        type: 'PULSE',
        v1: parameters.pwmLow,
        v2: parameters.pwmHigh,
        td: 0,
        tr: 1e-9,        // 快速邊沿
        tf: 1e-9,
        pw: parameters.onTime,
        period: parameters.period
    }),
    
    // 3. 驅動電阻
    new Resistor('R_GATE', ['pwm', 'sw_gate'], 0.5),
    
    // 4. 功率MOSFET (更高性能)
    createNMOSSwitch('M_SWITCH', 'sw_drain', 'gnd', 'sw_gate', {
        Vth: parameters.mosVth,
        gm: parameters.mosKn
    }),
    
    // 5. CCM變壓器 (正確的電感值)
    new MultiWindingTransformer('T_CCM', {
        windings: [
            {
                // 初級繞組: input → sw_drain
                nodes: ['input', 'sw_drain'],
                inductance: parameters.primaryInductance,
                resistance: 0.05,  
                name: 'PRIMARY'
            },
            {
                // 次級繞組: sec_dot → gnd (返馳極性)
                nodes: ['sec_dot', 'gnd'], 
                inductance: parameters.secondaryInductance,
                resistance: 0.02,
                name: 'SECONDARY'
            }
        ],
        couplingMatrix: [
            [1.0, parameters.coupling],
            [parameters.coupling, 1.0]
        ]
    }),
    
    // 6. 高效整流二極管
    createMCPDiode('D_RECT', 'sec_dot', 'sec_cathode', {
        Is: parameters.diodeIs,
        n: parameters.diodeN,
        Vf: parameters.diodeVf
    }),
    
    // 7. 輸出電容 (根據TI公式14)
    new Capacitor('C_OUTPUT', ['sec_cathode', 'output'], parameters.outputCap, { ic: 0.0 }),
    
    // 8. 負載電阻 (CCM功率級)
    new Resistor('R_LOAD', ['output', 'gnd'], parameters.outputRes)
];

console.log('\n🔧 構建CCM電路...');
components.forEach((component, index) => {
    console.log(`  ${index+1}. ✅ ${component.name || component.constructor.name}`);
});

// 創建瞬態分析器 (針對CCM優化)
const analyzer = new MCPTransientAnalysis({
    debug: false,
    gmin: 1e-12,
    maxIterations: 500,    // 增加迭代次數
    tolerance: 1e-9        // 提高精度
});

// 仿真參數 (CCM需要較長時間達穩態)
const simParams = {
    startTime: 0.0,
    stopTime: 10 * parameters.period,  // 10個開關周期
    timeStep: parameters.period / 100   // 每周期100點
};

console.log(`\n⏱️ CCM仿真設定:`);
console.log(`  仿真時間: ${(simParams.stopTime*1e6).toFixed(1)}μs`);
console.log(`  時間步長: ${(simParams.timeStep*1e6).toFixed(2)}μs`);
console.log(`  總步數: ${Math.ceil((simParams.stopTime - simParams.startTime) / simParams.timeStep)}`);

async function runCCMSimulation() {
    console.log('\n🚀 開始CCM瞬態分析...');
    const startTime = Date.now();

    try {
        const results = await analyzer.run(components, simParams);
        
        const endTime = Date.now();
        const duration = (endTime - startTime) / 1000;
        
        console.log(`\n⏱️ 仿真耗時: ${duration.toFixed(3)}秒`);
        
        if (results && results.success && results.timePoints) {
            console.log('✅ CCM仿真成功!');
            console.log(`📈 獲得 ${results.timePoints.length} 個數據點`);
            
            // 分析穩態結果 (最後20%數據)
            const timePoints = results.timePoints;
            const steadyStart = Math.floor(timePoints.length * 0.8);
            const steadyResults = timePoints.slice(steadyStart);
            
            console.log('\n📊 CCM穩態分析:');
            
            // 輸出電壓分析
            const outputVoltages = steadyResults.map(point => point.nodeVoltages?.output || 0);
            const avgOutput = outputVoltages.reduce((a, b) => a + b, 0) / outputVoltages.length;
            const rippleOutput = (Math.max(...outputVoltages) - Math.min(...outputVoltages)) / avgOutput * 100;
            
            console.log(`  📈 輸出電壓:`);
            console.log(`     平均值: ${avgOutput.toFixed(2)}V (目標: ${parameters.targetOutput}V)`);
            console.log(`     漣波: ${rippleOutput.toFixed(2)}%`);
            console.log(`     精度: ${((avgOutput/parameters.targetOutput)*100).toFixed(1)}%`);
            
            // 輸入電流分析
            const inputCurrents = steadyResults.map(point => Math.abs(point.componentCurrents?.DC_INPUT || 0));
            const avgInputCurrent = inputCurrents.reduce((a, b) => a + b, 0) / inputCurrents.length;
            const maxInputCurrent = Math.max(...inputCurrents);
            
            console.log(`\n  ⚡ 電流分析:`);
            console.log(`     平均輸入電流: ${(avgInputCurrent*1000).toFixed(2)}mA`);
            console.log(`     峰值輸入電流: ${(maxInputCurrent*1000).toFixed(2)}mA`);
            console.log(`     理論峰值: ${(IpriPeak*1000).toFixed(0)}mA`);
            
            // 功率和效率
            const outputPower = (avgOutput * avgOutput) / parameters.outputRes;
            const inputPower = parameters.inputVoltage * avgInputCurrent;
            const efficiency = inputPower > 0 ? (outputPower / inputPower) * 100 : 0;
            
            console.log(`\n  🔋 功率分析:`);
            console.log(`     輸出功率: ${outputPower.toFixed(2)}W`);
            console.log(`     輸入功率: ${inputPower.toFixed(2)}W`);
            console.log(`     轉換效率: ${efficiency.toFixed(1)}%`);
            
            // CCM工作確認
            const isValidCCM = avgOutput > (parameters.targetOutput * 0.9) && 
                              efficiency > 60 && rippleOutput < 10;
            
            console.log(`\n  ✅ CCM工作狀態:`);
            console.log(`     電壓調節: ${avgOutput > (parameters.targetOutput * 0.9) ? '✅' : '❌'}`);
            console.log(`     效率合格: ${efficiency > 60 ? '✅' : '❌'}`);
            console.log(`     漣波控制: ${rippleOutput < 10 ? '✅' : '❌'}`);
            console.log(`     整體評價: ${isValidCCM ? '🎉 CCM工作成功!' : '⚠️ 需要參數調整'}`);
            
        } else {
            console.log('❌ CCM仿真失敗');
            if (results && results.error) {
                console.log(`錯誤: ${results.error}`);
            }
        }
        
    } catch (error) {
        console.error('💥 CCM仿真錯誤:', error.message);
    }
}

// 執行CCM仿真
runCCMSimulation();