import { ExplicitStateSolver, GPUExplicitStateSolver, VoltageSource, Resistor, Capacitor } from '../lib-dist/AkingSPICE.es.js';

console.log('🔍 簡化GPU問題分析');
console.log('='.repeat(50));

async function analyzeGPUProblem() {
    // 創建RC電路組件
    const components = [
        new VoltageSource('V1', ['in', 'gnd'], 5),   // 5V電壓源
        new Resistor('R1', ['in', 'out'], 1000),     // 1kΩ電阻
        new Capacitor('C1', ['out', 'gnd'], 1e-6, { ic: 0 })  // 1μF電容, 初值0V
    ];
    
    const dt = 1e-5;
    const steps = 5;
    
    console.log('\n📋 電路配置:');
    console.log('  - 電壓源: V1 = 5V');  
    console.log('  - 電阻: R1 = 1kΩ');
    console.log('  - 電容: C1 = 1μF, 初值=0V');
    console.log('  - 時間步長: dt =', dt);
    
    // CPU測試
    console.log('\n💻 CPU求解器結果:');
    const cpuSolver = new ExplicitStateSolver();
    await cpuSolver.initialize(components, dt, { debug: false });
    
    const cpuResults = [];
    for (let i = 0; i < steps; i++) {
        const result = await cpuSolver.step();
        const vcap = result.stateVector[0];  // C1的電壓
        cpuResults.push(vcap);
        console.log(`  步驟${i}: Vc = ${vcap.toFixed(6)}V`);
    }
    
    // GPU測試  
    console.log('\n🚀 GPU求解器結果:');
    const gpuSolver = new GPUExplicitStateSolver();
    await gpuSolver.initialize(components, dt, { debug: false });
    
    const gpuResults = [];
    for (let i = 0; i < steps; i++) {
        const result = await gpuSolver.step();
        const vcap = result.stateVector[0];  // C1的電壓
        gpuResults.push(vcap);
        console.log(`  步驟${i}: Vc = ${vcap.toFixed(6)}V`);
    }
    
    // 比較分析
    console.log('\n📊 CPU vs GPU 比較:');
    let maxError = 0;
    for (let i = 0; i < steps; i++) {
        const error = Math.abs((gpuResults[i] - cpuResults[i]) / cpuResults[i] * 100);
        maxError = Math.max(maxError, error);
        const status = error < 1 ? '✅' : error < 10 ? '⚠️' : '❌';
        console.log(`  步驟${i}: CPU=${cpuResults[i].toFixed(6)}V, GPU=${gpuResults[i].toFixed(6)}V, 誤差=${error.toFixed(2)}% ${status}`);
    }
    
    console.log('\n🎯 問題診斷結果:');
    if (maxError < 1) {
        console.log('  ✅ CPU和GPU結果高度一致 (誤差<1%)');
    } else if (maxError < 10) {
        console.log('  ⚠️ CPU和GPU存在輕微差異 (誤差1-10%)'); 
        console.log('  💡 可能原因: 浮點精度差異 (f32 vs f64)');
    } else {
        console.log('  ❌ CPU和GPU存在顯著差異 (誤差>10%)');
        console.log('  🔧 需要進一步調查算法實現');
    }
    
    return { cpuResults, gpuResults, maxError };
}

analyzeGPUProblem().catch(error => {
    console.error('❌ 測試過程中發生錯誤:', error);
    console.error('錯誤詳情:', error.stack);
});