// 改良版返馳轉換器 - 使用耦合變壓器和正確的PWM控制
const path = require('path');
const srcDir = path.join(__dirname, 'src');

const { MCPTransientAnalysis } = require(path.join(srcDir, 'analysis/transient_mcp.js'));
const { Resistor } = require(path.join(srcDir, 'components/resistor.js'));
const { Capacitor } = require(path.join(srcDir, 'components/capacitor_v2.js'));
const { VoltageSource } = require(path.join(srcDir, 'components/sources.js'));
const { createNMOSSwitch } = require(path.join(srcDir, 'components/mosfet_mcp.js'));
const { createMCPDiode } = require(path.join(srcDir, 'components/diode_mcp.js'));
const { MultiWindingTransformer } = require(path.join(srcDir, 'components/transformer.js'));

console.log('🚀 啟動改良版返馳轉換器仿真...');

// 節點定義 (用於文檔和理解)
// - input: 輸入24V
// - sw_drain: MOSFET漏極
// - sw_gate: MOSFET閘極
// - pri_dot: 變壓器初級同名端
// - sec_dot: 變壓器次級同名端
// - sec_cathode: 二極管陰極
// - output: 輸出12V
// - gnd: 接地
// - pwm: PWM控制

// 組件參數
const parameters = {
    // 電源參數
    inputVoltage: 24.0,        // 輸入電壓 24V
    targetOutput: 12.0,        // 目標輸出 12V
    
    // 開關參數  
    switchingFreq: 50000,      // 開關頻率 50kHz
    dutyCycle: 0.3,            // 占空比 30%
    period: 1/50000,           // 周期 20μs
    onTime: 0.3 * (1/50000),   // 導通時間 6μs
    
    // 變壓器參數
    primaryInductance: 100e-6,  // 初級電感 100μH
    secondaryInductance: 25e-6, // 次級電感 25μH (匝數比 2:1)
    coupling: 0.98,            // 耦合係數
    
    // 輸出濾波
    outputCap: 100e-6,         // 輸出電容 100μF
    outputRes: 10.0,           // 負載電阻 10Ω
    
    // MOSFET參數
    mosVth: 3.0,               // 閾值電壓
    mosKn: 1e-3,               // 跨導參數
    pwmHigh: 10.0,             // PWM高電平 10V
    pwmLow: 0.0,               // PWM低電平 0V
    
    // 二極管參數
    diodeIs: 1e-12,            // 飽和電流
    diodeN: 1.0                // 理想因子
};

console.log('📋 電路參數:');
console.log(`  輸入電壓: ${parameters.inputVoltage}V`);
console.log(`  目標輸出: ${parameters.targetOutput}V`);
console.log(`  開關頻率: ${parameters.switchingFreq/1000}kHz`);
console.log(`  占空比: ${(parameters.dutyCycle*100).toFixed(1)}%`);
console.log(`  變壓器比: ${Math.sqrt(parameters.primaryInductance/parameters.secondaryInductance).toFixed(1)}:1`);

// PWM信號函數
function pwmSignal(t) {
    const cycleTime = t % parameters.period;
    return (cycleTime < parameters.onTime) ? parameters.pwmHigh : parameters.pwmLow;
}

// 創建電路組件陣列
const components = [
    // 1. 輸入直流電源
    new VoltageSource('DC_INPUT', ['input', 'gnd'], parameters.inputVoltage),
    
    // 2. PWM控制電壓源
    new VoltageSource('PWM_CONTROL', ['pwm', 'gnd'], {
        type: 'PULSE',
        v1: parameters.pwmLow,
        v2: parameters.pwmHigh,
        td: 0,
        tr: 1e-9,
        tf: 1e-9,
        pw: parameters.onTime,
        period: parameters.period
    }),
    
    // 3. PWM到閘極的驅動電阻
    new Resistor('R_GATE', ['pwm', 'sw_gate'], 1.0),
    
    // 4. 功率MOSFET開關
    createNMOSSwitch('M_SWITCH', 'sw_drain', 'gnd', 'sw_gate', {
        Vth: parameters.mosVth,
        gm: parameters.mosKn
    }),
    
    // 5. 耦合變壓器 (關鍵組件)
    new MultiWindingTransformer('T_FLYBACK', {
        windings: [
            {
                // 初級繞組
                nodes: ['input', 'sw_drain'],
                inductance: parameters.primaryInductance,
                resistance: 0.1,  // 很小的串聯電阻
                name: 'PRIMARY'
            },
            {
                // 次級繞組 - 注意極性反向(返馳特性)
                nodes: ['sec_dot', 'gnd'], 
                inductance: parameters.secondaryInductance,
                resistance: 0.05,
                name: 'SECONDARY'
            }
        ],
        couplingMatrix: [
            [1.0, parameters.coupling],
            [parameters.coupling, 1.0]
        ]
    }),
    
    // 6. 整流二極管
    createMCPDiode('D_RECT', 'sec_dot', 'sec_cathode', {
        Is: parameters.diodeIs,
        n: parameters.diodeN,
        Vf: 0.7  // 正向壓降
    }),
    
    // 7. 輸出濾波電容
    new Capacitor('C_OUTPUT', ['sec_cathode', 'output'], parameters.outputCap, { ic: 0.0 }),
    
    // 8. 負載電阻  
    new Resistor('R_LOAD', ['output', 'gnd'], parameters.outputRes)
];

console.log('\n🔧 正在構建電路...');
components.forEach(component => {
    console.log(`  ✅ 已添加: ${component.name || component.constructor.name}`);
});

console.log(`\n🔌 電路包含 ${components.length} 個組件`);

// 創建瞬態分析器 
const analyzer = new MCPTransientAnalysis({
    debug: false,
    gmin: 1e-12,
    maxIterations: 1000  // 限制最大迭代次數
});

// 設定仿真參數 - 仿真多個開關周期
const simParams = {
    startTime: 0.0,
    stopTime: 3 * parameters.period,  // 3個開關周期 (60μs)
    timeStep: 1e-6  // 1μs時間步長 (與LLC一致)
};

console.log(`\n⏱️ 仿真設定:`);
console.log(`  起始時間: ${simParams.startTime}s`);
console.log(`  結束時間: ${(simParams.stopTime*1000).toFixed(3)}ms`);
console.log(`  時間步長: ${(simParams.timeStep*1e6).toFixed(2)}μs`);
console.log(`  總步數: ${Math.ceil((simParams.stopTime - simParams.startTime) / simParams.timeStep)}`);

async function runFlybackSimulation() {
    console.log('\n🚀 開始瞬態分析...');
    const startTime = Date.now();

    try {
    // 執行瞬態分析
    const results = await analyzer.run(components, {
        startTime: simParams.startTime,
        stopTime: simParams.stopTime,
        timeStep: simParams.timeStep
    });
    
    const endTime = Date.now();
    const duration = (endTime - startTime) / 1000;
    
    console.log(`\n⏱️ 仿真耗時: ${duration.toFixed(3)}秒`);
    
    if (results && results.success && results.timePoints) {
        console.log('✅ 仿真成功完成!');
        console.log(`📈 獲得 ${results.timePoints.length} 個數據點`);
        
        // 分析最後幾個周期的結果
        const timePoints = results.timePoints;
        const lastCycleStart = Math.floor(timePoints.length * 0.8); // 最後20%的數據
        const lastCycleResults = timePoints.slice(lastCycleStart);
        
        console.log('\n📊 最終穩態分析:');
        
        // 輸出電壓分析  
        const outputVoltages = lastCycleResults.map(point => point.nodeVoltages?.output || 0);
        const avgOutput = outputVoltages.reduce((a, b) => a + b, 0) / outputVoltages.length;
        const maxOutput = Math.max(...outputVoltages);
        const minOutput = Math.min(...outputVoltages);
        
        console.log(`  🎯 輸出電壓:`);
        console.log(`     平均值: ${avgOutput.toFixed(3)}V`);
        console.log(`     最大值: ${maxOutput.toFixed(3)}V`);
        console.log(`     最小值: ${minOutput.toFixed(3)}V`);
        console.log(`     目標值: ${parameters.targetOutput}V`);
        console.log(`     效率: ${((avgOutput/parameters.targetOutput)*100).toFixed(1)}%`);
        
        // 輸入電流分析
        const inputCurrents = lastCycleResults.map(point => Math.abs(point.componentCurrents?.DC_INPUT || 0));
        const avgInputCurrent = inputCurrents.reduce((a, b) => a + b, 0) / inputCurrents.length;
        const maxInputCurrent = Math.max(...inputCurrents);
        
        console.log(`\n  ⚡ 輸入電流:`);
        console.log(`     平均值: ${(avgInputCurrent*1000).toFixed(2)}mA`);
        console.log(`     峰值: ${(maxInputCurrent*1000).toFixed(2)}mA`);
        
        // 輸出功率計算
        const outputPower = (avgOutput * avgOutput) / parameters.outputRes;
        const inputPower = parameters.inputVoltage * avgInputCurrent;
        const efficiency = inputPower > 0 ? (outputPower / inputPower) * 100 : 0;
        
        console.log(`\n  🔋 功率分析:`);
        console.log(`     輸出功率: ${(outputPower*1000).toFixed(2)}mW`);
        console.log(`     輸入功率: ${(inputPower*1000).toFixed(2)}mW`);
        console.log(`     轉換效率: ${efficiency.toFixed(1)}%`);
        
        // MOSFET開關狀態分析
        const gateVoltages = lastCycleResults.map(point => point.nodeVoltages?.sw_gate || 0);
        const drainVoltages = lastCycleResults.map(point => point.nodeVoltages?.sw_drain || 0);
        
        console.log(`\n  🔄 開關分析:`);
        console.log(`     閘極電壓範圍: ${Math.min(...gateVoltages).toFixed(2)}V ~ ${Math.max(...gateVoltages).toFixed(2)}V`);
        console.log(`     漏極電壓範圍: ${Math.min(...drainVoltages).toFixed(2)}V ~ ${Math.max(...drainVoltages).toFixed(2)}V`);
        
        if (avgOutput > 1.0) {
            console.log('\n🎉 返馳轉換器運行成功!');
        } else {
            console.log('\n⚠️  輸出電壓偏低，需要優化電路參數');
        }
        
    } else {
        console.log('❌ 仿真失敗或無結果');
        if (results && results.error) {
            console.log(`錯誤信息: ${results.error}`);
        }
    }
    
    } catch (error) {
        console.error('💥 仿真過程中發生錯誤:', error.message);
        console.error('詳細錯誤:', error);
    }
}

// 執行仿真
runFlybackSimulation();