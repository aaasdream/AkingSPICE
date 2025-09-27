/**
 * AkingSPICE 使用範例
 * 
 * 展示基本的電路分析功能
 */

import { AkingSPICE } from './src/index.js';

console.log('=== AkingSPICE v0.1 範例 ===\n');

// 範例1: 簡單的電阻分壓電路 - DC分析
console.log('1. 電阻分壓電路 DC分析');
console.log('----------------------------');

const dividerNetlist = `
* 電壓分壓電路
VIN 1 0 DC(12)
R1  1 2 10K
R2  2 0 5K
`;

try {
    const solver1 = new AkingSPICE(dividerNetlist);
    console.log('電路資訊:', solver1.getCircuitInfo());
    
    const dcResult = await solver1.runDCAnalysis();
    
    if (dcResult.converged) {
        console.log(`節點電壓:`);
        console.log(`  V(1) = ${dcResult.getNodeVoltage('1').toFixed(3)} V`);
        console.log(`  V(2) = ${dcResult.getNodeVoltage('2').toFixed(3)} V`);
        console.log(`電源電流:`);
        console.log(`  I(VIN) = ${(dcResult.getBranchCurrent('VIN') * 1000).toFixed(3)} mA`);
        
        // 理論值驗證: V(2) = 12 * 5K/(10K+5K) = 4V
        const expectedV2 = 12 * 5000 / (10000 + 5000);
        console.log(`理論值: V(2) = ${expectedV2} V (誤差: ${Math.abs(dcResult.getNodeVoltage('2') - expectedV2).toExponential(2)})`);
    }
} catch (error) {
    console.error('DC分析錯誤:', error.message);
}

console.log('\n');

// 範例2: RC充電電路 - 暫態分析
console.log('2. RC充電電路 暫態分析');
console.log('----------------------------');

const rcNetlist = `
* RC充電電路
VIN 1 0 DC(5)
R1  1 2 1K
C1  2 0 1u
.tran 0.1ms 5ms
`;

try {
    const solver2 = new AkingSPICE(rcNetlist);
    const transResult = await solver2.runAnalysis('.tran 0.1ms 5ms');
    
    const timeVector = transResult.getTimeVector();
    const voltageVector = transResult.getVoltageVector('2');
    
    console.log(`暫態分析完成: ${timeVector.length} 個時間點`);
    console.log(`時間範圍: ${timeVector[0]*1000}ms 到 ${timeVector[timeVector.length-1]*1000}ms`);
    
    // 顯示關鍵時間點的電壓
    const tau = 1000 * 1e-6; // RC時間常數 = 1ms
    console.log(`RC時間常數 τ = ${tau*1000}ms`);
    
    // 找到接近各個時間常數的點
    const keyTimes = [0, tau, 2*tau, 3*tau, 5*tau];
    keyTimes.forEach(targetTime => {
        let closestIndex = 0;
        let minDiff = Math.abs(timeVector[0] - targetTime);
        
        for (let i = 1; i < timeVector.length; i++) {
            const diff = Math.abs(timeVector[i] - targetTime);
            if (diff < minDiff) {
                minDiff = diff;
                closestIndex = i;
            }
        }
        
        const actualTime = timeVector[closestIndex];
        const voltage = voltageVector[closestIndex];
        const theoretical = 5 * (1 - Math.exp(-actualTime / tau));
        
        console.log(`t = ${(actualTime*1000).toFixed(2)}ms: V(2) = ${voltage.toFixed(3)}V (理論值: ${theoretical.toFixed(3)}V)`);
    });
    
} catch (error) {
    console.error('暫態分析錯誤:', error.message);
}

console.log('\n');

// 範例3: RLC諧振電路
console.log('3. RLC諧振電路分析');
console.log('----------------------------');

const rlcNetlist = `
* RLC諧振電路
VAC 1 0 SINE(0 10 1000)
R1  1 2 10
L1  2 3 10m
C1  3 0 2.533e-6
.tran 10u 5m
`;

try {
    const solver3 = new AkingSPICE(rlcNetlist);
    
    // 計算理論諧振頻率
    const L = 10e-3;  // 10mH
    const C = 2.533e-6;  // 2.533μF
    const resonantFreq = 1 / (2 * Math.PI * Math.sqrt(L * C));
    
    console.log(`電路參數:`);
    console.log(`  R = 10 Ω`);
    console.log(`  L = ${L*1000} mH`);
    console.log(`  C = ${C*1e6} μF`);
    console.log(`理論諧振頻率: ${resonantFreq.toFixed(1)} Hz`);
    console.log(`激勵頻率: 1000 Hz`);
    
    const validation = solver3.validateCircuit();
    if (validation.valid) {
        console.log('電路驗證通過');
        if (validation.warnings.length > 0) {
            console.log('警告:', validation.warnings);
        }
        
        // 進行DC分析檢查初始條件
        const dcResult = await solver3.runDCAnalysis();
        if (dcResult.converged) {
            console.log('DC工作點計算完成');
        }
        
        console.log('執行暫態分析...');
        // 注意：完整的暫態分析可能需要一些時間
        
    } else {
        console.log('電路驗證失敗:', validation.errors);
    }
    
} catch (error) {
    console.error('RLC分析錯誤:', error.message);
}

console.log('\n');

// 範例4: 電路驗證功能展示
console.log('4. 電路驗證功能');
console.log('----------------------------');

const invalidNetlist = `
* 無效的電路範例
V1 1 2 DC(10)
R1 1 2 1K
* 沒有接地節點
`;

try {
    const solver4 = new AkingSPICE(invalidNetlist);
    const validation = solver4.validateCircuit();
    
    console.log('電路驗證結果:');
    console.log(`  有效: ${validation.valid}`);
    
    if (validation.warnings.length > 0) {
        console.log('  警告:');
        validation.warnings.forEach(warning => {
            console.log(`    - ${warning}`);
        });
    }
    
    if (validation.errors.length > 0) {
        console.log('  錯誤:');
        validation.errors.forEach(error => {
            console.log(`    - ${error}`);
        });
    }
    
} catch (error) {
    console.error('驗證錯誤:', error.message);
}

console.log('\n=== 範例執行完畢 ===');