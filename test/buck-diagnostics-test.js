/**
 * Buck 轉換器逐步調試測試
 * 針對數值發散問題進行深度診斷和根源分析
 */

import MCPTransientAnalysis from '../src/analysis/transient_mcp.js';
import { Resistor } from '../src/components/resistor.js';
import { Capacitor } from '../src/components/capacitor.js';
import { Inductor } from '../src/components/inductor.js';
import { VoltageSource } from '../src/components/sources.js';

console.log('='.repeat(70));
console.log('Buck 轉換器數值發散問題逐步調試');
console.log('='.repeat(70));

/**
 * 測試案例 1: 極簡電路測試 (純電阻)
 */
async function testSimpleResistiveCircuit() {
    console.log('\n📋 測試案例 1: 純電阻電路基線測試');
    console.log('-'.repeat(50));
    
    const components = [
        new VoltageSource('V1', ['vin', 'gnd'], 12.0),
        new Resistor('R1', ['vin', 'vout'], 1.0),
        new Resistor('Rload', ['vout', 'gnd'], 5.0)
    ];
    
    console.log('🔧 電路: Vin(12V) -> R1(1Ω) -> Rload(5Ω) -> GND');
    
    const analyzer = new MCPTransientAnalysis({
        enablePredictor: false,
        enableNodeDamping: false,
        debug: false,
        collectStatistics: true
    });
    
    try {
        const result = await analyzer.run(components, {
            startTime: 0,
            stopTime: 1e-4,  // 100µs
            timeStep: 1e-6   // 1µs
        });
        
        const finalTime = result.timePoints[result.timePoints.length - 1];
        const finalVout = result.nodeVoltages[finalTime]?.get('vout') || 0;
        
        console.log(`✅ 純電阻電路測試成功`);
        console.log(`  最終輸出電壓: ${finalVout.toFixed(3)}V (理論值: ${(12*5/6).toFixed(3)}V)`);
        console.log(`  總時間步數: ${analyzer.statistics.totalTimeSteps}`);
        
        return true;
        
    } catch (error) {
        console.log(`❌ 純電阻電路測試失敗: ${error.message}`);
        return false;
    }
}

/**
 * 測試案例 2: 添加電容器 (RC 電路)
 */
async function testRCCircuit() {
    console.log('\n📋 測試案例 2: RC 電路測試');
    console.log('-'.repeat(50));
    
    const components = [
        new VoltageSource('V1', ['vin', 'gnd'], 12.0),
        new Resistor('R1', ['vin', 'vout'], 1.0),
        new Capacitor('C1', ['vout', 'gnd'], 100e-6), // 100µF
        new Resistor('Rload', ['vout', 'gnd'], 10.0)  // 增加負載阻抗
    ];
    
    console.log('🔧 電路: Vin(12V) -> R1(1Ω) -> [C1(100µF) || Rload(10Ω)] -> GND');
    
    const analyzer = new MCPTransientAnalysis({
        enablePredictor: false,
        enableNodeDamping: false,
        debug: false,
        collectStatistics: true
    });
    
    try {
        const result = await analyzer.run(components, {
            startTime: 0,
            stopTime: 5e-4,  // 500µs
            timeStep: 1e-6   // 1µs
        });
        
        const times = result.timePoints;
        const finalTime = times[times.length - 1];
        const finalVout = result.nodeVoltages[finalTime]?.get('vout') || 0;
        
        // 檢查電壓穩定性
        let maxVoltage = 0;
        let minVoltage = Infinity;
        for (let i = Math.max(0, times.length - 50); i < times.length; i++) {
            const time = times[i];
            const voltage = result.nodeVoltages[time]?.get('vout') || 0;
            maxVoltage = Math.max(maxVoltage, voltage);
            minVoltage = Math.min(minVoltage, voltage);
        }
        
        console.log(`✅ RC 電路測試成功`);
        console.log(`  最終輸出電壓: ${finalVout.toFixed(3)}V`);
        console.log(`  最後50步電壓範圍: ${minVoltage.toFixed(3)}V - ${maxVoltage.toFixed(3)}V`);
        console.log(`  電壓變化: ${(maxVoltage - minVoltage).toFixed(3)}V`);
        console.log(`  總時間步數: ${analyzer.statistics.totalTimeSteps}`);
        
        // 檢查數值穩定性
        const voltageVariation = maxVoltage - minVoltage;
        if (voltageVariation < 0.1) {
            console.log(`✅ RC 電路數值穩定`);
            return true;
        } else {
            console.log(`⚠️ RC 電路電壓波動較大: ${voltageVariation.toFixed(3)}V`);
            return false;
        }
        
    } catch (error) {
        console.log(`❌ RC 電路測試失敗: ${error.message}`);
        return false;
    }
}

/**
 * 測試案例 3: 添加電感器 (RLC 電路，小電感)
 */
async function testRLCCircuitSmallInductor() {
    console.log('\n📋 測試案例 3: RLC 電路測試 (小電感值)');
    console.log('-'.repeat(50));
    
    const components = [
        new VoltageSource('V1', ['vin', 'gnd'], 12.0),
        new Inductor('L1', ['vin', 'vout'], 10e-6),     // 10µH (小值)
        new Capacitor('C1', ['vout', 'gnd'], 100e-6),   // 100µF
        new Resistor('Rload', ['vout', 'gnd'], 10.0)
    ];
    
    console.log('🔧 電路: Vin(12V) -> L1(10µH) -> [C1(100µF) || Rload(10Ω)] -> GND');
    
    const analyzer = new MCPTransientAnalysis({
        enablePredictor: false,
        enableNodeDamping: false,
        debug: true,  // 啟用調試查看詳細信息
        collectStatistics: true
    });
    
    try {
        const result = await analyzer.run(components, {
            startTime: 0,
            stopTime: 2e-4,  // 200µs (較短時間)
            timeStep: 1e-6   // 1µs
        });
        
        const times = result.timePoints;
        const finalTime = times[times.length - 1];
        const finalVout = result.nodeVoltages[finalTime]?.get('vout') || 0;
        
        // 檢查電感電流
        const finalIL = result.branchCurrents[finalTime]?.get('L1') || 0;
        
        console.log(`✅ 小電感 RLC 電路測試完成`);
        console.log(`  最終輸出電壓: ${finalVout.toFixed(3)}V`);
        console.log(`  最終電感電流: ${finalIL.toExponential(3)}A`);
        console.log(`  總時間步數: ${analyzer.statistics.totalTimeSteps}`);
        
        // 檢查是否有數值發散
        if (Math.abs(finalIL) > 100) {
            console.log(`❌ 電感電流發散: ${finalIL.toExponential(3)}A`);
            return false;
        } else {
            console.log(`✅ 電感電流在合理範圍: ${finalIL.toExponential(3)}A`);
            return true;
        }
        
    } catch (error) {
        console.log(`❌ 小電感 RLC 電路測試失敗: ${error.message}`);
        return false;
    }
}

/**
 * 測試案例 4: 原始 Buck 轉換器參數 (問題重現)
 */
async function testOriginalBuckParameters() {
    console.log('\n📋 測試案例 4: 原始 Buck 轉換器參數 (問題重現)');
    console.log('-'.repeat(50));
    
    const components = [
        new VoltageSource('Vin', ['vin', 'gnd'], 12.0),
        new Inductor('L1', ['vin', 'vout'], 100e-6),    // 100µH (原始值)
        new Capacitor('C1', ['vout', 'gnd'], 220e-6),   // 220µF (原始值)  
        new Resistor('Rload', ['vout', 'gnd'], 5.0)     // 5Ω (原始值)
    ];
    
    console.log('🔧 電路: Vin(12V) -> L1(100µH) -> [C1(220µF) || Rload(5Ω)] -> GND');
    
    const analyzer = new MCPTransientAnalysis({
        enablePredictor: false,
        enableNodeDamping: false,
        debug: false,
        collectStatistics: true
    });
    
    try {
        const result = await analyzer.run(components, {
            startTime: 0,
            stopTime: 1e-4,  // 只運行100µs來觀察初始行為
            timeStep: 1e-6   // 1µs步長
        });
        
        const times = result.timePoints;
        
        // 檢查前10步的電感電流變化
        console.log('\n📊 前10步電感電流變化:');
        for (let i = 0; i < Math.min(10, times.length); i++) {
            const time = times[i];
            const current = result.branchCurrents[time]?.get('L1') || 0;
            const voltage = result.nodeVoltages[time]?.get('vout') || 0;
            console.log(`  步驟 ${i}: t=${(time*1e6).toFixed(1)}µs, IL=${current.toExponential(3)}A, Vout=${voltage.toFixed(3)}V`);
            
            if (Math.abs(current) > 1e6) {
                console.log(`❌ 第${i}步出現電流發散!`);
                break;
            }
        }
        
        const finalTime = times[times.length - 1];
        const finalIL = result.branchCurrents[finalTime]?.get('L1') || 0;
        const finalVout = result.nodeVoltages[finalTime]?.get('vout') || 0;
        
        console.log(`\n📈 最終狀態:`);
        console.log(`  時間: ${finalTime*1e6}µs`);
        console.log(`  電感電流: ${finalIL.toExponential(3)}A`);
        console.log(`  輸出電壓: ${finalVout.toFixed(3)}V`);
        
        if (Math.abs(finalIL) > 1e6) {
            console.log(`❌ 原始參數確認數值發散問題`);
            return false;
        } else {
            console.log(`✅ 原始參數意外穩定`);
            return true;
        }
        
    } catch (error) {
        console.log(`❌ 原始 Buck 轉換器測試失敗: ${error.message}`);
        return false;
    }
}

/**
 * 主測試函數
 */
async function runBuckDiagnostics() {
    console.log('🚀 開始 Buck 轉換器逐步診斷...\n');
    
    const testResults = {
        resistive: false,
        rc: false,
        rlcSmall: false,
        originalBuck: false
    };
    
    try {
        // 測試 1: 純電阻電路
        testResults.resistive = await testSimpleResistiveCircuit();
        
        // 測試 2: RC 電路
        if (testResults.resistive) {
            testResults.rc = await testRCCircuit();
        }
        
        // 測試 3: 小電感 RLC 電路
        if (testResults.rc) {
            testResults.rlcSmall = await testRLCCircuitSmallInductor();
        }
        
        // 測試 4: 原始參數 Buck 轉換器
        testResults.originalBuck = await testOriginalBuckParameters();
        
        console.log('\n' + '='.repeat(70));
        console.log('Buck 轉換器診斷結果總結:');
        console.log('='.repeat(70));
        
        console.log(`📊 測試結果:`);
        console.log(`  純電阻電路: ${testResults.resistive ? '✅ 通過' : '❌ 失敗'}`);
        console.log(`  RC 電路: ${testResults.rc ? '✅ 通過' : '❌ 失敗'}`);
        console.log(`  小電感 RLC: ${testResults.rlcSmall ? '✅ 通過' : '❌ 失敗'}`);
        console.log(`  原始 Buck 參數: ${testResults.originalBuck ? '✅ 通過' : '❌ 失敗'}`);
        
        // 分析問題根源
        if (testResults.resistive && testResults.rc && !testResults.rlcSmall) {
            console.log('\n🔍 問題根源分析:');
            console.log('❌ 電感器相關的數值問題');
            console.log('   可能原因:');
            console.log('   1. 電感 BDF2 伴隨模型實現有問題');
            console.log('   2. 電感電流初始化不當');
            console.log('   3. 時間步長對電感太大');
        } else if (testResults.resistive && !testResults.rc) {
            console.log('\n🔍 問題根源分析:');
            console.log('❌ 電容器相關的數值問題');
        } else if (!testResults.resistive) {
            console.log('\n🔍 問題根源分析:');
            console.log('❌ 基本電路求解有問題');
        }
        
        return testResults;
        
    } catch (error) {
        console.error('❌ 診斷過程失敗:', error.message);
        return testResults;
    }
}

// 運行診斷測試
runBuckDiagnostics().then(results => {
    const allPassed = Object.values(results).every(r => r);
    if (allPassed) {
        console.log('\n🎉 所有診斷測試通過！');
        process.exit(0);
    } else {
        console.log('\n🔧 發現問題，需要進一步調查！');
        process.exit(1);
    }
}).catch(error => {
    console.error('💥 診斷測試運行錯誤:', error);
    process.exit(1);
});