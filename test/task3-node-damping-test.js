/**
 * Task 3 驗證：節點阻尼機制測試
 * 測試節點阻尼對電壓變化的限制效果和數值穩定性改善
 */

import MCPTransientAnalysis from '../src/analysis/transient_mcp.js';
import { Resistor } from '../src/components/resistor.js';
import { Capacitor } from '../src/components/capacitor.js';
import { Inductor } from '../src/components/inductor.js';
import { VoltageSource } from '../src/components/sources.js';

console.log('='.repeat(60));
console.log('Task 3: 節點阻尼機制測試');
console.log('='.repeat(60));

/**
 * 測試案例 1: 阻尼選項驗證
 */
function testDampingOptions() {
    console.log('\n📋 測試案例 1: 阻尼選項驗證');
    console.log('-'.repeat(40));
    
    // 測試默認設置
    const analyzerDefault = new MCPTransientAnalysis({
        debug: true
    });
    
    // 測試自定義阻尼設置
    const analyzerCustom = new MCPTransientAnalysis({
        enableNodeDamping: true,
        maxVoltageStep: 2.0,
        dampingFactor: 0.6,
        debug: true
    });
    
    // 測試禁用阻尼
    const analyzerNoDamping = new MCPTransientAnalysis({
        enableNodeDamping: false,
        debug: true
    });
    
    console.log('默認設置：');
    console.log(`  enableNodeDamping: ${analyzerDefault.enableNodeDamping}`);
    console.log(`  maxVoltageStep: ${analyzerDefault.maxVoltageStep}V`);
    console.log(`  dampingFactor: ${analyzerDefault.dampingFactor}`);
    
    console.log('\n自定義設置：');
    console.log(`  enableNodeDamping: ${analyzerCustom.enableNodeDamping}`);
    console.log(`  maxVoltageStep: ${analyzerCustom.maxVoltageStep}V`);
    console.log(`  dampingFactor: ${analyzerCustom.dampingFactor}`);
    
    console.log('\n禁用阻尼：');
    console.log(`  enableNodeDamping: ${analyzerNoDamping.enableNodeDamping}`);
    
    // 驗證默認值
    const expectedDefaults = {
        enableNodeDamping: true,
        maxVoltageStep: 5.0,
        dampingFactor: 0.8
    };
    
    let allCorrect = true;
    for (const [key, expected] of Object.entries(expectedDefaults)) {
        if (analyzerDefault[key] !== expected) {
            console.log(`❌ 默認值錯誤: ${key} = ${analyzerDefault[key]}, 期望 ${expected}`);
            allCorrect = false;
        }
    }
    
    if (allCorrect) {
        console.log('✅ 所有阻尼選項設置正確');
    }
    
    return allCorrect;
}

/**
 * 測試案例 2: 阻尼數學邏輯驗證
 */
function testDampingMathematics() {
    console.log('\n📋 測試案例 2: 阻尼數學邏輯驗證');
    console.log('-'.repeat(40));
    
    const analyzer = new MCPTransientAnalysis({
        enableNodeDamping: true,
        maxVoltageStep: 2.0,
        dampingFactor: 0.8,
        debug: false
    });
    
    // 設置前一個解
    analyzer.previousSolution = {
        'n1': 5.0,  // 上一步 5V
        'n2': 10.0  // 上一步 10V
    };
    
    // 模擬當前求解結果（有大幅變化）
    const mockNodeVoltages = new Map([
        ['gnd', 0.0],      // 地節點
        ['n1', 12.0],      // 變化 7V (超過 maxVoltageStep=2V)
        ['n2', 7.5]        // 變化 -2.5V (超過 maxVoltageStep=2V)
    ]);
    
    // 應用阻尼
    const dampedVoltages = analyzer._applyNodeDamping(mockNodeVoltages, 0.001);
    
    console.log('阻尼前後比較:');
    console.log(`地節點 gnd: ${mockNodeVoltages.get('gnd')}V → ${dampedVoltages.get('gnd')}V (無變化)`);
    
    const n1_original = mockNodeVoltages.get('n1');
    const n1_damped = dampedVoltages.get('n1');
    const n1_expected = 5.0 + 2.0 * 0.8; // previousVoltage + maxStep * dampingFactor
    
    console.log(`節點 n1: ${n1_original}V → ${n1_damped}V (期望 ${n1_expected}V)`);
    
    const n2_original = mockNodeVoltages.get('n2');
    const n2_damped = dampedVoltages.get('n2');
    const n2_expected = 10.0 - 2.0 * 0.8; // previousVoltage - maxStep * dampingFactor
    
    console.log(`節點 n2: ${n2_original}V → ${n2_damped}V (期望 ${n2_expected}V)`);
    
    // 驗證數學正確性
    const n1_error = Math.abs(n1_damped - n1_expected);
    const n2_error = Math.abs(n2_damped - n2_expected);
    
    console.log(`\n數學驗證:`)
    console.log(`n1 誤差: ${n1_error.toExponential(3)}`);
    console.log(`n2 誤差: ${n2_error.toExponential(3)}`);
    
    if (n1_error < 1e-12 && n2_error < 1e-12) {
        console.log('✅ 阻尼數學邏輯正確!');
        return true;
    } else {
        console.log('❌ 阻尼數學邏輯有誤!');
        return false;
    }
}

/**
 * 測試案例 3: 小變化無阻尼測試
 */
function testSmallChangeNoDamping() {
    console.log('\n📋 測試案例 3: 小變化無阻尼測試');
    console.log('-'.repeat(40));
    
    const analyzer = new MCPTransientAnalysis({
        enableNodeDamping: true,
        maxVoltageStep: 5.0,
        dampingFactor: 0.8,
        debug: false
    });
    
    // 設置前一個解
    analyzer.previousSolution = {
        'n1': 3.0,
        'n2': -1.5
    };
    
    // 模擬小幅變化（在閾值內）
    const mockNodeVoltages = new Map([
        ['n1', 4.2],   // 變化 1.2V < 5V
        ['n2', -0.8]   // 變化 0.7V < 5V  
    ]);
    
    // 應用阻尼
    const dampedVoltages = analyzer._applyNodeDamping(mockNodeVoltages, 0.001);
    
    console.log('小變化測試:');
    console.log(`節點 n1: 3.0V → 4.2V (變化 1.2V) → ${dampedVoltages.get('n1')}V`);
    console.log(`節點 n2: -1.5V → -0.8V (變化 0.7V) → ${dampedVoltages.get('n2')}V`);
    
    // 小變化應該不被阻尼
    const n1_unchanged = Math.abs(dampedVoltages.get('n1') - 4.2) < 1e-12;
    const n2_unchanged = Math.abs(dampedVoltages.get('n2') - (-0.8)) < 1e-12;
    
    if (n1_unchanged && n2_unchanged) {
        console.log('✅ 小變化正確未被阻尼!');
        return true;
    } else {
        console.log('❌ 小變化被錯誤阻尼!');
        return false;
    }
}

/**
 * 測試案例 4: 地節點特殊處理
 */
function testGroundNodeHandling() {
    console.log('\n📋 測試案例 4: 地節點特殊處理');
    console.log('-'.repeat(40));
    
    const analyzer = new MCPTransientAnalysis({
        enableNodeDamping: true,
        maxVoltageStep: 1.0,
        dampingFactor: 0.5,
        debug: false
    });
    
    analyzer.previousSolution = {
        'gnd': 0.0,
        '0': 0.0
    };
    
    // 模擬地節點有非零值（不應該發生，但測試容錯性）
    const mockNodeVoltages = new Map([
        ['gnd', 0.1],   // 地節點本應為 0
        ['0', -0.05]    // 另一種地節點命名
    ]);
    
    const dampedVoltages = analyzer._applyNodeDamping(mockNodeVoltages, 0.001);
    
    console.log('地節點處理:');
    console.log(`gnd: ${mockNodeVoltages.get('gnd')}V → ${dampedVoltages.get('gnd')}V`);
    console.log(`0: ${mockNodeVoltages.get('0')}V → ${dampedVoltages.get('0')}V`);
    
    // 地節點應該保持原值（不被阻尼修改）
    const gnd_preserved = dampedVoltages.get('gnd') === mockNodeVoltages.get('gnd');
    const zero_preserved = dampedVoltages.get('0') === mockNodeVoltages.get('0');
    
    if (gnd_preserved && zero_preserved) {
        console.log('✅ 地節點特殊處理正確!');
        return true;
    } else {
        console.log('❌ 地節點處理有誤!');
        return false;
    }
}

/**
 * 主測試函數
 */
async function runTask3Tests() {
    console.log('🚀 開始 Task 3 節點阻尼機制測試...\n');
    
    try {
        // 測試 1: 選項驗證
        const optionsCorrect = testDampingOptions();
        
        // 測試 2: 數學邏輯
        const mathCorrect = testDampingMathematics();
        
        // 測試 3: 小變化處理
        const smallChangeCorrect = testSmallChangeNoDamping();
        
        // 測試 4: 地節點處理
        const groundHandlingCorrect = testGroundNodeHandling();
        
        console.log('\n' + '='.repeat(60));
        console.log('Task 3 測試結果總結:');
        console.log('='.repeat(60));
        
        if (optionsCorrect) {
            console.log('✅ 阻尼選項設置正確');
        } else {
            console.log('❌ 阻尼選項設置有問題');
        }
        
        if (mathCorrect) {
            console.log('✅ 阻尼數學邏輯正確');
        } else {
            console.log('❌ 阻尼數學邏輯有問題');
        }
        
        if (smallChangeCorrect) {
            console.log('✅ 小變化處理正確');
        } else {
            console.log('❌ 小變化處理有問題');
        }
        
        if (groundHandlingCorrect) {
            console.log('✅ 地節點處理正確');
        } else {
            console.log('❌ 地節點處理有問題');
        }
        
        const allPassed = optionsCorrect && mathCorrect && smallChangeCorrect && groundHandlingCorrect;
        
        if (allPassed) {
            console.log('\n🎯 Task 3 實現完成！');
            return true;
        } else {
            console.log('\n💥 Task 3 實現有問題！');
            return false;
        }
        
    } catch (error) {
        console.error('❌ Task 3 測試失敗:', error.message);
        console.error('詳細錯誤:', error.stack);
        return false;
    }
}

// 運行測試
runTask3Tests().then(success => {
    if (success) {
        console.log('\n🎉 Task 3 測試通過！');
        process.exit(0);
    } else {
        console.log('\n💥 Task 3 測試失敗！');
        process.exit(1);
    }
}).catch(error => {
    console.error('💥 測試運行錯誤:', error);
    process.exit(1);
});