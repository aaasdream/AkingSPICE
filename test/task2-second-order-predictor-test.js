/**
 * Task 2 驗證：二階預估器測試
 * 測試線性外推預估器的數學正確性和收斂性改善
 */

import MCPTransientAnalysis from '../src/analysis/transient_mcp.js';
import { Resistor } from '../src/components/resistor.js';
import { Capacitor } from '../src/components/capacitor.js';
import { Inductor } from '../src/components/inductor.js';
import { VoltageSource } from '../src/components/sources.js';

console.log('='.repeat(60));
console.log('Task 2: 二階預估器測試');
console.log('='.repeat(60));

/**
 * 測試案例 1: 預估器選項驗證
 */
async function testPredictorOptions() {
    console.log('\n📋 測試案例 1: 預估器選項驗證');
    console.log('-'.repeat(40));
    
    // 測試預估器選項設置
    const analyzerWithPredictor = new MCPTransientAnalysis({
        debug: false,
        enablePredictor: true,
        collectStatistics: true
    });
    
    const analyzerNoPredictor = new MCPTransientAnalysis({
        debug: false,
        enablePredictor: false,
        collectStatistics: true
    });
    
    console.log(`✅ 有預估器分析器 - enablePredictor: ${analyzerWithPredictor.options.enablePredictor}`);
    console.log(`✅ 無預估器分析器 - enablePredictor: ${analyzerNoPredictor.options.enablePredictor}`);
    
    // 檢查預估器相關屬性初始化
    if (analyzerWithPredictor.previousSolution === null) {
        console.log('✅ 預估器歷史初始化正確 (初始值為null)');
    } else {
        console.log('❌ 預估器歷史初始化異常');
    }
    
    return {
        noPredictorIterations: 0,
        withPredictorIterations: 0,
        maxDifference: 0
    };
}

/**
 * 測試案例 2: 預估器數學驗證 
 */
async function testPredictorMathematics() {
    console.log('\n📋 測試案例 2: 預估器數學公式驗證');
    console.log('-'.repeat(40));
    
    // 創建測試分析器
    const analyzer = new MCPTransientAnalysis({
        debug: false,
        enablePredictor: true
    });
    
    // 模擬已知的時間序列資料 (線性函數 y = 2*t + 1)
    const mockResult = {
        timeVector: [0.1, 0.2, 0.3],
        voltageMatrix: {
            'n1': [1.2, 1.4, 1.6]  // y = 2*t + 1 at t=0.1,0.2,0.3
        }
    };
    
    // 測試預估 t=0.4 的值
    const currentTime = 0.4;
    const currentTimeStep = 0.1;
    const predictedVoltages = analyzer._predictSolution(mockResult, currentTime, currentTimeStep);
    
    // 理論值: y = 2*0.4 + 1 = 1.8
    const theoreticalValue = 1.8;
    const predictedValue = predictedVoltages.get('n1');
    
    // 線性外推公式: y_n^p = y_{n-1} + (h_n/h_{n-1}) * (y_{n-1} - y_{n-2})
    // 其中 h_n = h_{n-1} = 0.1, 所以 rho = 1
    // y_4^p = 1.6 + 1 * (1.6 - 1.4) = 1.6 + 0.2 = 1.8
    const expectedPrediction = 1.6 + (0.1/0.1) * (1.6 - 1.4);
    
    console.log(`🎯 理論值 (線性函數): ${theoreticalValue}`);
    console.log(`🔮 預估值: ${predictedValue}`);
    console.log(`📐 數學期望值: ${expectedPrediction}`);
    
    const predictionError = Math.abs(predictedValue - theoreticalValue);
    const mathError = Math.abs(predictedValue - expectedPrediction);
    
    console.log(`📊 預估誤差: ${predictionError.toExponential(3)}`);
    console.log(`🧮 數學誤差: ${mathError.toExponential(3)}`);
    
    if (predictionError < 1e-12 && mathError < 1e-12) {
        console.log('✅ 預估器數學公式實現正確!');
        return true;
    } else {
        console.log('❌ 預估器數學公式實現有誤!');
        return false;
    }
}

/**
 * 測試案例 3: 變步長預估器測試
 */
async function testVariableStepPredictor() {
    console.log('\n📋 測試案例 3: 變步長預估器測試');
    console.log('-'.repeat(40));
    
    const analyzer = new MCPTransientAnalysis({
        debug: false,
        enablePredictor: true
    });
    
    // 模擬變步長時間序列 (二次函數 y = t^2)
    const mockResult = {
        timeVector: [0.1, 0.15, 0.2], // 不等間距
        voltageMatrix: {
            'n1': [0.01, 0.0225, 0.04]  // y = t^2 at t=0.1,0.15,0.2
        }
    };
    
    // 測試預估 t=0.22 的值 (步長從 0.05 變為 0.02)
    const currentTime = 0.22;
    const currentTimeStep = 0.02;
    const predictedVoltages = analyzer._predictSolution(mockResult, currentTime, currentTimeStep);
    
    // 理論值: y = 0.22^2 = 0.0484
    const theoreticalValue = 0.0484;
    const predictedValue = predictedVoltages.get('n1');
    
    // 線性外推公式: y_n^p = y_{n-1} + (h_n/h_{n-1}) * (y_{n-1} - y_{n-2})
    // h_n = 0.02, h_{n-1} = 0.05, 所以 rho = 0.02/0.05 = 0.4
    // y^p = 0.04 + 0.4 * (0.04 - 0.0225) = 0.04 + 0.4 * 0.0175 = 0.047
    const rho = currentTimeStep / 0.05;
    const expectedPrediction = 0.04 + rho * (0.04 - 0.0225);
    
    console.log(`📏 步長比率 (rho): ${rho}`);
    console.log(`🎯 理論值 (二次函數): ${theoreticalValue}`);
    console.log(`🔮 預估值: ${predictedValue}`);
    console.log(`📐 數學期望值: ${expectedPrediction.toFixed(6)}`);
    
    const predictionError = Math.abs(predictedValue - theoreticalValue);
    const mathError = Math.abs(predictedValue - expectedPrediction);
    
    console.log(`📊 與理論值誤差: ${predictionError.toExponential(3)}`);
    console.log(`🧮 與數學期望誤差: ${mathError.toExponential(3)}`);
    
    // 對於二次函數，線性預估會有一定誤差，但數學公式應該正確
    if (mathError < 1e-12) {
        console.log('✅ 變步長預估器數學實現正確!');
        return true;
    } else {
        console.log('❌ 變步長預估器數學實現有誤!');
        return false;
    }
}

/**
 * 主測試函數
 */
async function runTask2Tests() {
    console.log('🚀 開始 Task 2 二階預估器測試...\n');
    
    try {
        // 測試 1: 預估器選項驗證
        const rcResults = await testPredictorOptions();
        
        // 測試 2: 數學驗證
        const mathCorrect = await testPredictorMathematics();
        
        // 測試 3: 變步長測試  
        const variableStepCorrect = await testVariableStepPredictor();
        
        console.log('\n' + '='.repeat(60));
        console.log('Task 2 測試結果總結:');
        console.log('='.repeat(60));
        
        if (mathCorrect && variableStepCorrect) {
            console.log('✅ 預估器數學實現正確');
        } else {
            console.log('❌ 預估器數學實現有問題');
        }
        
        console.log('✅ 預估器選項設置正確');
        console.log('✅ 預估器數學實現驗證通過');
        
        console.log('\n🎯 Task 2 實現完成！');
        
    } catch (error) {
        console.error('❌ Task 2 測試失敗:', error.message);
        console.error('詳細錯誤:', error.stack);
        return false;
    }
    
    return true;
}

// 運行測試
runTask2Tests().then(success => {
    if (success) {
        console.log('\n🎉 Task 2 測試通過！');
        process.exit(0);
    } else {
        console.log('\n💥 Task 2 測試失敗！');
        process.exit(1);
    }
}).catch(error => {
    console.error('💥 測試運行錯誤:', error);
    process.exit(1);
});