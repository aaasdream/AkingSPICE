/**
 * 檢查 MNA 矩陣構建的詳細內容
 * 找出雅可比奇異的根本原因
 */

import { EnhancedDCAnalysis } from './src/analysis/enhanced-dc-clean.js';
import { VoltageSource } from './src/components/sources.js';
import { Resistor } from './src/components/resistor.js';
import { NonlinearDiode } from './src/components/nonlinear-diode.js';
import { Vector, Matrix } from './src/core/linalg.js';

/**
 * 檢查 MNA 矩陣構建
 */
async function inspectMNAMatrices() {
    console.log('🔍 MNA 矩陣詳細檢查');
    console.log('='.repeat(50));
    
    // 創建測試電路
    const components = [];
    const V1 = new VoltageSource('V1', ['vdd', 'gnd'], 5.0);
    const R1 = new Resistor('R1', ['vdd', 'cathode'], 1000);
    const D1 = new NonlinearDiode('D1', ['cathode', 'gnd']);
    
    components.push(V1, R1, D1);
    
    console.log('📋 測試電路: V1(5V) - R1(1kΩ) - D1 - GND');
    console.log();
    
    // 創建 DC 分析器
    const dcAnalysis = new EnhancedDCAnalysis();
    dcAnalysis.classifyComponents(components);
    
    // 構建 MNA
    dcAnalysis.mnaBuilder.reset();
    dcAnalysis.mnaBuilder.analyzeCircuit(components);
    
    const nodeMap = dcAnalysis.mnaBuilder.getNodeMap();
    const matrixSize = dcAnalysis.mnaBuilder.getMatrixSize();
    
    console.log(`📍 節點映射:`, nodeMap);
    console.log(`📏 矩陣大小: ${matrixSize}×${matrixSize}`);
    console.log();
    
    // 檢查線性部分的 MNA 矩陣
    console.log('🔧 步驟 1: 線性部分 MNA 矩陣');
    const { matrix: linearMatrix, rhs: linearRhs } = dcAnalysis.mnaBuilder.buildMNAMatrix(dcAnalysis.linearComponents, 0);
    
    console.log('📊 線性 A 矩陣:');
    printMatrix(linearMatrix);
    console.log();
    
    console.log('📊 線性 b 向量:');
    printVector(linearRhs);
    console.log();
    
    // 檢查完整 MNA 矩陣（包含所有元件）
    console.log('🔧 步驟 2: 完整 MNA 矩陣');
    const { matrix: fullMatrix, rhs: fullRhs } = dcAnalysis.mnaBuilder.buildMNAMatrix(components, 0);
    
    console.log('📊 完整 A 矩陣:');
    printMatrix(fullMatrix);
    console.log();
    
    console.log('📊 完整 b 向量:');
    printVector(fullRhs);
    console.log();
    
    // 測試不同解點的雅可比矩陣
    console.log('🔧 步驟 3: 不同解點的雅可比矩陣');
    
    const testPoints = [
        { name: '零點', values: [0, 0, 0] },
        { name: '合理點', values: [5.0, 0.7, 0.0043] }
    ];
    
    for (const point of testPoints) {
        console.log(`\n  測試點: ${point.name}`);
        
        const x = Vector.zeros(matrixSize);
        for (let i = 0; i < Math.min(point.values.length, matrixSize); i++) {
            x.set(i, point.values[i]);
        }
        
        const jacobian = dcAnalysis.computeJacobian(x, components, nodeMap, matrixSize);
        const residual = dcAnalysis.computeResidual(x, components, nodeMap, matrixSize);
        
        console.log('  雅可比矩陣:');
        printMatrix(jacobian);
        
        console.log('  殘差向量:');
        printVector(residual);
        
        // 檢查矩陣的行列式和條件數
        const det = calculateDeterminant3x3(jacobian);
        console.log(`  行列式: ${det.toExponential(3)}`);
        
        const rankDef = checkRankDeficiency(jacobian);
        if (rankDef > 0) {
            console.log(`  ❌ 矩陣秩虧損: ${rankDef}`);
            
            // 找出線性相關的行
            const dependencies = findLinearDependencies(jacobian);
            if (dependencies.length > 0) {
                console.log(`  線性相關的行: ${dependencies.join(', ')}`);
            }
        }
        
        console.log();
    }
    
    // 檢查二極體 stamping 的實際效果
    console.log('🔧 步驟 4: 檢查二極體 stamping');
    
    const testJac = Matrix.zeros(3, 3);
    const testRes = Vector.zeros(3);
    const testX = Vector.zeros(3);
    testX.set(0, 0.7); // cathode
    testX.set(1, 5.0); // vdd  
    testX.set(2, 0.0043); // I_V1
    
    console.log('測試解向量:');
    printVector(testX);
    
    // 手動調用二極體的 stamping 方法
    try {
        D1.stampJacobian(testJac, testX, nodeMap);
        D1.stampResidual(testRes, testX, nodeMap);
        
        console.log('二極體 Jacobian 貢獻:');
        printMatrix(testJac);
        
        console.log('二極體 Residual 貢獻:');
        printVector(testRes);
        
    } catch (error) {
        console.log(`❌ 二極體 stamping 失敗: ${error.message}`);
    }
}

function printMatrix(matrix) {
    const rows = matrix.rows;
    const cols = matrix.cols;
    
    for (let i = 0; i < rows; i++) {
        let row = '  [';
        for (let j = 0; j < cols; j++) {
            const val = matrix.get(i, j);
            row += `${formatNumber(val).padStart(12)}`;
            if (j < cols - 1) row += ', ';
        }
        row += ']';
        console.log(row);
    }
}

function printVector(vector) {
    let output = '  [';
    for (let i = 0; i < vector.size; i++) {
        const val = vector.get(i);
        output += `${formatNumber(val).padStart(12)}`;
        if (i < vector.size - 1) output += ', ';
    }
    output += ']';
    console.log(output);
}

function formatNumber(num) {
    if (Math.abs(num) < 1e-10) return '0.000e+0';
    if (Math.abs(num) > 1e6 || Math.abs(num) < 1e-3) {
        return num.toExponential(3);
    }
    return num.toFixed(6);
}

function calculateDeterminant3x3(matrix) {
    if (matrix.rows !== 3 || matrix.cols !== 3) return NaN;
    
    const a11 = matrix.get(0, 0), a12 = matrix.get(0, 1), a13 = matrix.get(0, 2);
    const a21 = matrix.get(1, 0), a22 = matrix.get(1, 1), a23 = matrix.get(1, 2);
    const a31 = matrix.get(2, 0), a32 = matrix.get(2, 1), a33 = matrix.get(2, 2);
    
    return a11 * (a22 * a33 - a23 * a32) 
         - a12 * (a21 * a33 - a23 * a31) 
         + a13 * (a21 * a32 - a22 * a31);
}

function checkRankDeficiency(matrix) {
    // 簡單的秩檢查：計算非零行數
    let nonZeroRows = 0;
    
    for (let i = 0; i < matrix.rows; i++) {
        let hasNonZero = false;
        for (let j = 0; j < matrix.cols; j++) {
            if (Math.abs(matrix.get(i, j)) > 1e-12) {
                hasNonZero = true;
                break;
            }
        }
        if (hasNonZero) nonZeroRows++;
    }
    
    return Math.max(0, matrix.rows - nonZeroRows);
}

function findLinearDependencies(matrix) {
    const dependencies = [];
    
    // 簡單檢查：找出全零行
    for (let i = 0; i < matrix.rows; i++) {
        let isZeroRow = true;
        for (let j = 0; j < matrix.cols; j++) {
            if (Math.abs(matrix.get(i, j)) > 1e-12) {
                isZeroRow = false;
                break;
            }
        }
        if (isZeroRow) {
            dependencies.push(i);
        }
    }
    
    return dependencies;
}

// 執行檢查
inspectMNAMatrices().catch(console.error);