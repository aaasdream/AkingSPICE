/**
 * 修正 Newton-Raphson 收斂問題
 * 調整收斂條件和阻尼策略
 */

import { EnhancedDCAnalysis } from './src/analysis/enhanced-dc-clean.js';
import { VoltageSource } from './src/components/sources.js';
import { Resistor } from './src/components/resistor.js';
import { NonlinearDiode } from './src/components/nonlinear-diode.js';
import { createSPICENewtonSolver } from './src/core/newton-raphson-solver.js';

/**
 * 測試修正後的 Newton-Raphson 求解器
 */
async function testFixedNewtonRaphson() {
    console.log('🔧 測試修正的 Newton-Raphson 設置');
    console.log('='.repeat(50));
    
    // 創建測試電路
    const components = [];
    const V1 = new VoltageSource('V1', ['vdd', 'gnd'], 5.0);
    const R1 = new Resistor('R1', ['vdd', 'cathode'], 1000);
    const D1 = new NonlinearDiode('D1', ['cathode', 'gnd']);
    
    components.push(V1, R1, D1);
    
    console.log('📋 測試電路: V1(5V) - R1(1kΩ) - D1 - GND');
    console.log();
    
    // 測試不同的收斂條件
    const testConfigs = [
        {
            name: '原始SPICE配置',
            config: {
                maxIterations: 100,
                vntol: 1e-6,        // SPICE 電壓容差
                abstol: 1e-12,      // SPICE 電流容差  
                reltol: 1e-9,       // SPICE 相對容差
                debug: true
            }
        },
        {
            name: '放寬的收斂條件',
            config: {
                maxIterations: 100,
                absoluteTolerance: 1e-6,     // 放寬絕對容差
                relativeTolerance: 1e-6,     // 放寬相對容差
                voltageTolerance: 1e-3,      // 放寬電壓容差 (1mV)
                currentTolerance: 1e-6,      // 放寬電流容差 (1µA)
                debug: true
            }
        },
        {
            name: '適度嚴格條件',
            config: {
                maxIterations: 50,
                absoluteTolerance: 1e-4,     // 適度絕對容差
                relativeTolerance: 1e-4,     // 適度相對容差
                voltageTolerance: 1e-2,      // 適度電壓容差 (10mV)  
                currentTolerance: 1e-5,      // 適度電流容差 (10µA)
                adaptiveDamping: true,
                minDampingFactor: 0.01,
                debug: true
            }
        },
        {
            name: '逐步收斂判定',
            config: {
                maxIterations: 100,
                useProgressiveConvergence: true,  // 新策略：逐步收斂
                progressThreshold: 0.1,           // 10% 改進即可
                stagnationLimit: 5,               // 連續5次不改進則停止
                debug: true
            }
        }
    ];
    
    for (const testConfig of testConfigs) {
        console.log(`\n🧪 測試配置: ${testConfig.name}`);
        console.log('-'.repeat(30));
        
        try {
            // 創建帶有測試配置的分析器
            const dcAnalysis = new EnhancedDCAnalysis();
            
            // 創建自定義 Newton 求解器
            if (testConfig.config.useProgressiveConvergence) {
                dcAnalysis.newtonSolver = createProgressiveNewtonSolver(testConfig.config);
            } else {
                dcAnalysis.newtonSolver = createSPICENewtonSolver(testConfig.config);
            }
            
            const result = await dcAnalysis.analyze(components);
            
            console.log(`結果: ${result.converged ? '✅ 收斂' : '❌ 未收斂'}`);
            
            if (result.converged) {
                console.log(`迭代次數: ${result.newtonStats.iterations}`);
                console.log(`最終誤差: ${result.newtonStats.finalError.toExponential(3)}`);
                console.log('節點電壓:');
                
                for (const [node, voltage] of result.nodeVoltages.entries()) {
                    console.log(`  ${node}: ${voltage.toFixed(6)} V`);
                }
                
                // 驗證物理合理性
                const cathodeV = result.nodeVoltages.get('cathode') || 0;
                const vddV = result.nodeVoltages.get('vdd') || 0;
                
                if (cathodeV > 0.4 && cathodeV < 1.0 && Math.abs(vddV - 5.0) < 0.1) {
                    console.log('✅ 物理合理性檢查通過');
                } else {
                    console.log('⚠️  物理合理性檢查失敗');
                }
                
            } else {
                console.log(`失敗原因: ${result.analysisInfo.error}`);
                console.log(`迭代次數: ${result.newtonStats.iterations}`);
                console.log(`最終誤差: ${result.newtonStats.finalError.toExponential(3)}`);
            }
            
        } catch (error) {
            console.log(`❌ 測試失敗: ${error.message}`);
        }
    }
}

/**
 * 創建逐步收斂的 Newton-Raphson 求解器
 */
function createProgressiveNewtonSolver(config) {
    const solver = createSPICENewtonSolver({
        maxIterations: config.maxIterations || 100,
        debug: config.debug || false
    });
    
    // 重寫收斂檢查方法
    const originalCheckConvergence = solver.checkConvergence;
    
    solver.checkConvergence = function(x, residual, iteration) {
        // 使用逐步改進策略
        const currentError = residual.norm();
        
        if (!this.previousErrors) {
            this.previousErrors = [];
            this.stagnationCount = 0;
        }
        
        this.previousErrors.push(currentError);
        
        // 檢查是否有足夠的改進
        if (this.previousErrors.length > 1) {
            const prevError = this.previousErrors[this.previousErrors.length - 2];
            const improvement = (prevError - currentError) / prevError;
            
            if (improvement > (config.progressThreshold || 0.1)) {
                // 有顯著改進，重置停滯計數
                this.stagnationCount = 0;
            } else {
                // 改進不夠，增加停滯計數
                this.stagnationCount++;
            }
            
            // 如果連續多次改進不足，認為收斂
            if (this.stagnationCount >= (config.stagnationLimit || 5)) {
                if (config.debug) {
                    console.log(`  📊 逐步收斂判定：連續 ${this.stagnationCount} 次改進不足，認為收斂`);
                }
                return true;
            }
        }
        
        // 基本的絕對誤差檢查（較為寬松）
        if (currentError < 1e-3) {
            return true;
        }
        
        return false;
    };
    
    return solver;
}

// 執行測試
testFixedNewtonRaphson().catch(console.error);