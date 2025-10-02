/**
 * 深度診斷 Newton-Raphson 求解器問題
 * 檢查雅可比矩陣、殘差函數和收斂性問題
 */

import { EnhancedDCAnalysis } from './src/analysis/enhanced-dc-clean.js';
import { VoltageSource } from './src/components/sources.js';
import { Resistor } from './src/components/resistor.js';
import { NonlinearDiode } from './src/components/nonlinear-diode.js';
import { Vector, Matrix } from './src/core/linalg.js';

/**
 * 深度診斷 Newton-Raphson 問題
 */
async function deepDiagnosis() {
    console.log('🔬 Newton-Raphson 深度診斷');
    console.log('='.repeat(60));
    
    // 創建簡化的測試電路
    const components = [];
    const V1 = new VoltageSource('V1', ['vdd', 'gnd'], 5.0);
    const R1 = new Resistor('R1', ['vdd', 'cathode'], 1000);
    const D1 = new NonlinearDiode('D1', ['cathode', 'gnd']);
    
    components.push(V1, R1, D1);
    
    console.log('📋 測試電路: V1(5V) - R1(1kΩ) - D1 - GND');
    console.log(`  預期結果: V(cathode) ≈ 0.7V, I ≈ 4.3mA`);
    console.log();
    
    // 創建 DC 分析器
    const dcAnalysis = new EnhancedDCAnalysis();
    dcAnalysis.debug = false; // 關閉詳細日誌以便分析
    
    // 手動執行分析步驟
    console.log('🔧 步驟 1: 元件分類');
    dcAnalysis.classifyComponents(components);
    console.log(`  線性元件: ${dcAnalysis.linearComponents.map(c => c.name).join(', ')}`);
    console.log(`  非線性元件: ${dcAnalysis.nonlinearComponents.map(c => c.name).join(', ')}`);
    
    // 構建 MNA
    console.log('\n🔧 步驟 2: 構建 MNA 矩陣');
    dcAnalysis.mnaBuilder.reset();
    dcAnalysis.mnaBuilder.analyzeCircuit(components);
    
    const nodeMap = dcAnalysis.mnaBuilder.getNodeMap();
    console.log('  節點映射:', nodeMap);
    
    // 創建初始解向量
    console.log('\n🔧 步驟 3: 測試不同的初始猜測');
    const matrixSize = dcAnalysis.mnaBuilder.getMatrixSize();
    console.log(`  解向量大小: ${matrixSize}`);
    
    const initialGuesses = [
        { name: '零向量', values: [0, 0, 0] },
        { name: '合理猜測', values: [5.0, 0.7, 0.0043] }, // Vdd, Vcathode, Isource
        { name: '小擾動', values: [0.1, 0.1, 0.001] },
        { name: 'SPICE默認', values: [0, 0, 0] }
    ];
    
    for (const guess of initialGuesses) {
        console.log(`\n  測試初始猜測: ${guess.name}`);
        console.log(`  值: [${guess.values.join(', ')}]`);
        
        const x = Vector.zeros(matrixSize);
        for (let i = 0; i < Math.min(guess.values.length, matrixSize); i++) {
            x.set(i, guess.values[i]);
        }
        
        try {
            // 計算殘差 (使用正確的參數)
            const residual = dcAnalysis.computeResidual(x, components, nodeMap, matrixSize);
            console.log(`  殘差範數: ${calculateVectorNorm(residual).toExponential(3)}`);
            
            // 檢查殘差中的異常值
            const residualValues = [];
            for (let i = 0; i < residual.size; i++) {
                const val = residual.get(i);
                residualValues.push(val);
                if (Math.abs(val) > 1e10) {
                    console.log(`    ⚠️  殘差第 ${i} 項異常大: ${val.toExponential(3)}`);
                }
                if (isNaN(val)) {
                    console.log(`    ❌ 殘差第 ${i} 項為 NaN`);
                }
            }
            
            // 計算雅可比 (使用正確的參數)
            const jacobian = dcAnalysis.computeJacobian(x, components, nodeMap, matrixSize);
            console.log(`  雅可比矩陣 ${jacobian.rows}×${jacobian.cols}:`);
            
            // 檢查雅可比矩陣特性
            const jacCondition = estimateConditionNumber(jacobian);
            console.log(`  雅可比條件數估計: ${jacCondition.toExponential(2)}`);
            
            const jacDet = estimateDeterminant(jacobian);
            console.log(`  雅可比行列式估計: ${jacDet.toExponential(3)}`);
            
            // 檢查雅可比中的異常值
            let hasNaN = false;
            let hasInf = false;
            for (let i = 0; i < jacobian.rows; i++) {
                for (let j = 0; j < jacobian.cols; j++) {
                    const val = jacobian.get(i, j);
                    if (isNaN(val)) hasNaN = true;
                    if (!isFinite(val)) hasInf = true;
                }
            }
            
            if (hasNaN) console.log(`    ❌ 雅可比包含 NaN`);
            if (hasInf) console.log(`    ❌ 雅可比包含無限值`);
            
            // 嘗試單步 Newton 迭代
            console.log(`  測試單步 Newton 迭代...`);
            const { LUSolver } = await import('./src/core/linalg.js');
            
            try {
                const delta = LUSolver.solve(jacobian, residual.scale(-1));
                console.log(`  Newton 步驟成功，最大修正: ${findMaxAbsValue(delta).toExponential(3)}`);
                
                // 檢查新解
                const x_new = x.add(delta);
                const residual_new = dcAnalysis.computeResidual(x_new, components, nodeMap, matrixSize);
                const newNorm = calculateVectorNorm(residual_new);
                console.log(`  新殘差範數: ${newNorm.toExponential(3)}`);
                
                if (newNorm < calculateVectorNorm(residual)) {
                    console.log(`    ✅ 誤差減小，Newton 步驟有效`);
                } else {
                    console.log(`    ❌ 誤差增大，需要阻尼或改進猜測`);
                }
                
            } catch (luError) {
                console.log(`    ❌ LU 求解失敗: ${luError.message}`);
                console.log(`       可能原因: 雅可比矩陣奇異或條件數過大`);
            }
            
        } catch (error) {
            console.log(`    ❌ 計算失敗: ${error.message}`);
        }
    }
    
    console.log('\n🔧 步驟 4: 檢查元件 stamping 方法');
    
    // 測試二極體的 stamping 方法
    console.log('\n  測試 NonlinearDiode stamping:');
    const testV = 0.7; // 測試電壓
    
    console.log(`    測試電壓: ${testV}V`);
    console.log(`    Is = ${D1.Is}, Vt = ${D1.Vt}`);
    
    // 手動計算二極體電流和導納
    const current = D1.Is * (Math.exp(testV / D1.Vt) - 1);
    const conductance = (D1.Is / D1.Vt) * Math.exp(testV / D1.Vt);
    
    console.log(`    計算電流: ${current.toExponential(3)}A`);
    console.log(`    計算導納: ${conductance.toExponential(3)}S`);
    
    if (isNaN(current)) {
        console.log(`    ❌ 電流計算得到 NaN`);
    }
    if (isNaN(conductance)) {
        console.log(`    ❌ 導納計算得到 NaN`);
    }
    if (!isFinite(current)) {
        console.log(`    ❌ 電流無限大，可能指數溢出`);
    }
    if (!isFinite(conductance)) {
        console.log(`    ❌ 導納無限大，可能指數溢出`);
    }
}

function calculateVectorNorm(vector) {
    let sum = 0;
    for (let i = 0; i < vector.size; i++) {
        const val = vector.get(i);
        sum += val * val;
    }
    return Math.sqrt(sum);
}

function findMaxAbsValue(vector) {
    let max = 0;
    for (let i = 0; i < vector.size; i++) {
        const abs = Math.abs(vector.get(i));
        if (abs > max) max = abs;
    }
    return max;
}

function estimateConditionNumber(matrix) {
    // 簡化估算：最大值與最小值的比率
    let max = 0;
    let min = Infinity;
    
    for (let i = 0; i < matrix.rows; i++) {
        for (let j = 0; j < matrix.cols; j++) {
            const abs = Math.abs(matrix.get(i, j));
            if (abs > 0) {
                if (abs > max) max = abs;
                if (abs < min) min = abs;
            }
        }
    }
    
    return min > 0 ? max / min : Infinity;
}

function estimateDeterminant(matrix) {
    // 對於小矩陣，計算對角線元素乘積作為粗略估計
    if (matrix.rows !== matrix.cols) return 0;
    
    let det = 1;
    for (let i = 0; i < Math.min(matrix.rows, 3); i++) {
        det *= matrix.get(i, i);
    }
    
    return det;
}

// 執行診斷
deepDiagnosis().catch(console.error);