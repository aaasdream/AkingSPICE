/**
 * =================================================================
 *         驗證RLC時間步長優化確實有效，然後逐步構建LLC
 * =================================================================
 */

import { AkingSPICE, VoltageSource, Inductor, Capacitor, Resistor } from './src/index.js';

async function testRLCTimeStepValidation() {
    console.log("🔬 首先驗證RLC時間步長優化確實有效...\n");
    
    const L = 25e-6; // 25μH
    const C = 207e-9; // 207nF
    const R = 10; // 10Ω
    const frequency = 35000; // 35kHz
    const period = 1.0 / frequency;
    
    // 測試兩種時間步長
    const configs = [
        { name: "20步/週期 (最佳)", steps: 20, expected: 0.5187 },
        { name: "100步/週期 (過精)", steps: 100, expected: 0.6314 }
    ];
    
    for (const config of configs) {
        console.log(`\n📊 ${config.name}:`);
        
        const solver = new AkingSPICE();
        const timeStep = period / config.steps;
        
        solver.components = [
            new VoltageSource('V1', ['in', '0'], `SINE(0 10 ${frequency})`),
            new Inductor('L1', ['in', 'n1'], L),
            new Capacitor('C1', ['n1', 'out'], C),
            new Resistor('R1', ['out', '0'], R)
        ];
        
        solver.isInitialized = true;
        
        const results = await solver.runSteppedSimulation(() => ({}), {
            stopTime: period * 20,
            timeStep: timeStep
        });
        
        const steadyStart = Math.floor(results.steps.length * 0.8);
        const steadyVoltages = results.steps.slice(steadyStart).map(s => s.nodeVoltages['out']);
        const outputAmplitude = (Math.max(...steadyVoltages) - Math.min(...steadyVoltages)) / 2;
        const gain = outputAmplitude / 10.0;
        
        const error = Math.abs(gain - config.expected) / config.expected * 100;
        console.log(`  時間步長: ${(timeStep*1e6).toFixed(2)}μs`);
        console.log(`  實際增益: ${gain.toFixed(4)} (預期: ${config.expected.toFixed(4)})`);
        console.log(`  誤差: ${error.toFixed(1)}%`);
        
        if (error < 10) console.log(`  ✅ 符合預期!`);
        else console.log(`  ❌ 與預期差異過大`);
    }
}

async function testSimpleHalfBridge() {
    console.log("\n🔧 測試簡單半橋開關 (無MOSFET)...\n");
    
    // 用PWL電壓源模擬半橋
    const frequency = 35000;
    const period = 1.0 / frequency;
    const timeStep = period / 20; // 用最佳時間步長
    
    const solver = new AkingSPICE();
    
    solver.components = [
        // PULSE方波電壓源 (0-400V, 50% duty)
        new VoltageSource('Vbridge', ['bridge', '0'], `PULSE(0 400 0 1e-9 1e-9 ${period*0.5} ${period})`),
        
        // 諧振電路
        new Inductor('Llr', ['bridge', 'cr_a'], 25e-6),
        new Capacitor('Cr', ['cr_a', 'cr_b'], 207e-9),
        new Resistor('Rload', ['cr_b', '0'], 10)
    ];
    
    solver.isInitialized = true;
    
    const results = await solver.runSteppedSimulation(() => ({}), {
        stopTime: period * 10,
        timeStep: timeStep
    });
    
    // 分析結果
    const steadyStart = Math.floor(results.steps.length * 0.5);
    const steadySteps = results.steps.slice(steadyStart);
    
    const bridgeVoltages = steadySteps.map(s => s.nodeVoltages['bridge'] || 0);
    const resonantVoltages = steadySteps.map(s => s.nodeVoltages['cr_a'] || 0);
    const outputVoltages = steadySteps.map(s => s.nodeVoltages['cr_b'] || 0);
    
    console.log(`  橋接電壓: ${Math.min(...bridgeVoltages).toFixed(1)}V ~ ${Math.max(...bridgeVoltages).toFixed(1)}V`);
    console.log(`  諧振節點cr_a: 峰值=${Math.max(...resonantVoltages.map(Math.abs)).toFixed(1)}V`);
    console.log(`  輸出cr_b: 平均=${(outputVoltages.reduce((a,b)=>a+b,0)/outputVoltages.length).toFixed(1)}V`);
    console.log(`  輸出cr_b: 峰值=${Math.max(...outputVoltages.map(Math.abs)).toFixed(1)}V`);
    
    if (Math.max(...outputVoltages.map(Math.abs)) > 1) {
        console.log(`  ✅ 諧振電路有響應!`);
        return true;
    } else {
        console.log(`  ❌ 諧振電路無響應`);
        return false;
    }
}

async function main() {
    await testRLCTimeStepValidation();
    const halfBridgeWorks = await testSimpleHalfBridge();
    
    if (halfBridgeWorks) {
        console.log("\n🎯 半橋諧振電路工作正常，可以進入下一步優化！");
    } else {
        console.log("\n❌ 基礎電路有問題，需要修正");
    }
}

main();