/**
 * 深度MNA求解診斷
 * 檢查每一步是否真的在建立和求解MNA矩陣
 */

import { AkingSPICE, VoltageSource, Resistor, Capacitor } from './src/index.js';
import { LUSolver } from './src/core/linalg.js';

// 創建一個測試用的MNA求解攔截器
class MNADiagnosticInterceptor {
    constructor() {
        this.solveCount = 0;
        this.matrixBuildCount = 0;
        this.startTime = 0;
    }
    
    reset() {
        this.solveCount = 0;
        this.matrixBuildCount = 0;
        this.startTime = Date.now();
    }
    
    // 攔截LUSolver.solve方法
    interceptLUSolve() {
        const original = LUSolver.solve;
        const self = this;
        
        LUSolver.solve = function(matrix, rhs) {
            self.solveCount++;
            if (self.solveCount <= 5 || self.solveCount % 100 === 0) {
                console.log(`🔧 LU求解 #${self.solveCount}: 矩陣${matrix.rows}x${matrix.cols}`);
                if (self.solveCount <= 2) {
                    console.log(`   前3個對角元素: [${matrix.get(0,0).toFixed(6)}, ${matrix.get(1,1).toFixed(6)}, ${matrix.get(2,2).toFixed(6)}]`);
                }
            }
            return original.call(this, matrix, rhs);
        };
    }
    
    restoreLUSolve() {
        // 這裡簡化，實際應該保存原始函數
    }
    
    report() {
        const duration = Date.now() - this.startTime;
        console.log(`\n📊 MNA求解統計:`);
        console.log(`   LU求解次數: ${this.solveCount}`);
        console.log(`   總耗時: ${duration}ms`);
        console.log(`   平均求解時間: ${duration/this.solveCount}ms/solve`);
        console.log(`   求解頻率: ${this.solveCount/(duration/1000).toFixed(0)} solves/sec`);
    }
}

async function diagnoseMNASolving() {
    console.log("🔍 深度MNA求解診斷");
    console.log("=" .repeat(50));
    
    const interceptor = new MNADiagnosticInterceptor();
    interceptor.interceptLUSolve();
    
    const solver = new AkingSPICE();
    solver.setDebug(false);
    
    // 簡單RC電路但有足夠複雜度
    solver.components = [
        new VoltageSource('V1', ['vin', '0'], 'PULSE(0 10 0 1e-9 1e-9 1e-4 2e-4)'),
        new Resistor('R1', ['vin', 'rc1'], 1000),
        new Capacitor('C1', ['rc1', 'rc2'], 1e-6),
        new Resistor('R2', ['rc2', '0'], 2000),
        new Capacitor('C2', ['rc1', '0'], 0.5e-6)  // 添加複雜度
    ];
    solver.isInitialized = true;
    
    console.log("\n🚀 開始診斷模擬...");
    
    interceptor.reset();
    
    const result = await solver.runSteppedSimulation(() => ({}), {
        stopTime: 1e-3,    // 1ms
        timeStep: 10e-6    // 10μs = 100步
    });
    
    interceptor.report();
    
    console.log(`\n✅ 模擬完成: ${result.steps.length}步`);
    
    // 分析是否每步都進行了求解
    const expectedSolves = result.steps.length;
    const actualSolves = interceptor.solveCount;
    
    console.log(`\n🔬 求解分析:`);
    console.log(`   預期求解次數: ${expectedSolves} (每步一次)`);
    console.log(`   實際求解次數: ${actualSolves}`);
    console.log(`   求解比率: ${(actualSolves/expectedSolves*100).toFixed(1)}%`);
    
    if (actualSolves < expectedSolves * 0.9) {
        console.log("⚠️  警告: 求解次數明顯少於預期，可能有快取或跳過機制!");
        console.log("   建議檢查暫態分析實現");
    } else if (actualSolves > expectedSolves * 1.5) {
        console.log("ℹ️  信息: 求解次數超過預期，可能有迭代求解或初始化");
    } else {
        console.log("✅ 求解次數正常，每步確實在進行MNA求解");
    }
    
    // 檢查計算時間是否合理
    const avgSolveTime = (Date.now() - interceptor.startTime) / interceptor.solveCount;
    if (avgSolveTime < 0.1) {
        console.log(`⚠️  警告: 平均求解時間過短 (${avgSolveTime.toFixed(3)}ms)，可能矩陣過簡單或有優化`);
    } else {
        console.log(`✅ 求解時間合理 (${avgSolveTime.toFixed(2)}ms/solve)`);
    }
    
    // 檢查數值結果
    console.log(`\n📈 結果檢查:`);
    const voltages = result.steps.map(s => s.nodeVoltages['rc1'] || 0);
    const maxV = Math.max(...voltages);
    const minV = Math.min(...voltages);
    console.log(`   V(rc1) 範圍: ${minV.toFixed(3)}V → ${maxV.toFixed(3)}V`);
    
    if (maxV - minV > 0.1) {
        console.log("✅ 電壓有合理變化，動態行為正常");
    } else {
        console.log("⚠️  電壓變化過小，可能電路響應異常");
    }
}

diagnoseMNASolving();