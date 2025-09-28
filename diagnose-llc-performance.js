/**
 * LLC模擬性能診斷工具
 * 檢查每一步是否真的在執行MNA求解
 */

import { AkingSPICE, VoltageSource, Resistor, Inductor, Capacitor, VoltageControlledMOSFET } from './src/index.js';

async function diagnoseLLCPerformance() {
    console.log("🔍 LLC模擬性能診斷");
    console.log("=" .repeat(50));
    
    const solver = new AkingSPICE();
    solver.setDebug(false);
    
    // 建立一個簡化的LLC電路用於診斷
    solver.components = [
        new VoltageSource('Vin', ['vin', '0'], 400),
        new VoltageControlledMOSFET('Q1', ['vin', 'G1', 'sw'], { Ron: 0.05 }),
        new VoltageControlledMOSFET('Q2', ['sw', 'G2', '0'], { Ron: 0.05 }),
        new VoltageSource('VG1', ['G1', '0'], 0),
        new VoltageSource('VG2', ['G2', '0'], 0),
        new Inductor('L', ['sw', 'lc'], 25e-6),
        new Capacitor('C', ['lc', '0'], 207e-9),
        new Resistor('Rload', ['lc', '0'], 10)
    ];
    solver.isInitialized = true;
    
    console.log("\n⏱️ 性能基準測試");
    
    // 測試1: 短時間高精度
    console.log("\n測試1: 短時間高頻模擬 (100μs, 1000步)");
    const test1Start = Date.now();
    
    const shortSim = await solver.runSteppedSimulation(() => ({
        'VG1': Math.random() > 0.5 ? 12 : 0,
        'VG2': Math.random() > 0.5 ? 12 : 0
    }), {
        stopTime: 100e-6,  // 100μs
        timeStep: 100e-9   // 100ns = 1000步
    });
    
    const test1Duration = Date.now() - test1Start;
    console.log(`   完成: ${shortSim.steps.length}步 in ${test1Duration}ms`);
    console.log(`   速度: ${(shortSim.steps.length/test1Duration*1000).toFixed(0)} steps/sec`);
    
    // 測試2: 檢查每一步是否有變化
    console.log("\n測試2: 檢查模擬數據變化");
    const steps = shortSim.steps.slice(0, 20); // 前20步
    
    let hasVariation = false;
    let lastVoltage = null;
    
    for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        const currentVoltage = step.nodeVoltages['lc'] || 0;
        
        if (i > 0 && Math.abs(currentVoltage - lastVoltage) > 1e-6) {
            hasVariation = true;
        }
        
        if (i < 5) {
            console.log(`   步驟${i}: V(lc)=${currentVoltage.toFixed(6)}V, t=${(step.time*1e6).toFixed(2)}μs`);
        }
        
        lastVoltage = currentVoltage;
    }
    
    console.log(`   數據變化: ${hasVariation ? '✅ 有變化，真實模擬' : '❌ 無變化，可能假數據'}`);
    
    // 測試3: 長時間模擬性能
    console.log("\n測試3: 長時間模擬 (10ms, 4000步)");
    const test3Start = Date.now();
    
    const longSim = await solver.runSteppedSimulation(() => ({
        'VG1': Math.sin(Date.now() * 0.001) > 0 ? 12 : 0,
        'VG2': Math.sin(Date.now() * 0.001) < 0 ? 12 : 0
    }), {
        stopTime: 10e-3,   // 10ms
        timeStep: 2.5e-6   // 2.5μs = 4000步
    });
    
    const test3Duration = Date.now() - test3Start;
    console.log(`   完成: ${longSim.steps.length}步 in ${test3Duration}ms`);
    console.log(`   速度: ${(longSim.steps.length/test3Duration*1000).toFixed(0)} steps/sec`);
    
    // 分析結果
    console.log("\n📊 性能分析:");
    console.log(`   短模擬速度: ${(shortSim.steps.length/test1Duration*1000).toFixed(0)} steps/sec`);
    console.log(`   長模擬速度: ${(longSim.steps.length/test3Duration*1000).toFixed(0)} steps/sec`);
    
    // 檢查速度是否過快 (可能表示沒有真正計算)
    const expectedSpeed = 1000; // 合理的步數/秒
    const actualSpeed = longSim.steps.length/test3Duration*1000;
    
    if (actualSpeed > expectedSpeed * 10) {
        console.log("⚠️  警告: 模擬速度過快，可能沒有執行完整的MNA求解!");
        console.log(`   實際速度: ${actualSpeed.toFixed(0)} steps/sec`);
        console.log(`   預期速度: ~${expectedSpeed} steps/sec`);
        console.log("   建議檢查求解器實現");
    } else {
        console.log("✅ 模擬速度合理，似乎在執行真實計算");
    }
    
    // 檢查數值變化幅度
    const allVoltages = longSim.steps.map(s => s.nodeVoltages['lc'] || 0);
    const maxV = Math.max(...allVoltages);
    const minV = Math.min(...allVoltages);
    const rangeV = maxV - minV;
    
    console.log(`\n🔬 數值範圍分析:`);
    console.log(`   V(lc) 範圍: ${minV.toFixed(3)}V → ${maxV.toFixed(3)}V`);
    console.log(`   電壓變化幅度: ${rangeV.toFixed(3)}V`);
    
    if (rangeV < 1e-6) {
        console.log("⚠️  警告: 電壓變化過小，可能沒有真正模擬動態行為");
    } else {
        console.log("✅ 電壓有合理變化，模擬可能是真實的");
    }
}

diagnoseLLCPerformance();