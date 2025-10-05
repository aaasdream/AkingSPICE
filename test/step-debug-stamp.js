/**
 * 单步调试电阻和电压源的stamp过程
 */

import { VoltageSource } from '../src/components/sources.js';
import { Resistor } from '../src/components/resistor.js';
import { Matrix, Vector } from '../src/core/linalg.js';

function stepByStepStampDebug() {
    console.log('=== 单步调试Stamp过程 ===\n');
    
    // 创建电路元件
    const V1 = new VoltageSource('V1', ['1', '0'], 10);
    const R1 = new Resistor('R1', ['1', '0'], 1000);
    
    console.log('📋 电路元件信息：');
    console.log(`V1: ${V1.constructor.name}, nodes: ${V1.nodes.join('→')}, value: ${V1.getValue()}`);
    console.log(`R1: ${R1.constructor.name}, nodes: ${R1.nodes.join('→')}, value: ${R1.value}`);
    console.log(`R1电导: ${R1.getConductance()} S`);
    console.log();
    
    // 手动建立节点映射和电压源映射
    const nodeMap = new Map();
    nodeMap.set('1', 0);  // 节点1 -> 矩阵索引0
    
    const voltageSourceMap = new Map();
    voltageSourceMap.set('V1', 1);  // V1电流变量 -> 矩阵索引1
    
    console.log('🗂️ 映射关系：');
    console.log(`节点映射: ${Array.from(nodeMap.entries()).map(([k,v]) => `${k}→${v}`).join(', ')}`);
    console.log(`电压源映射: ${Array.from(voltageSourceMap.entries()).map(([k,v]) => `${k}→${v}`).join(', ')}`);
    console.log();
    
    // 初始化2x2矩阵和RHS向量
    const matrix = Matrix.zeros(2, 2);
    const rhs = Vector.zeros(2);
    
    console.log('📐 初始化2x2零矩阵和零向量');
    console.log('初始矩阵:');
    console.log('  [0.000  0.000]');
    console.log('  [0.000  0.000]');
    console.log('初始RHS: [0.000, 0.000]');
    console.log();
    
    // 添加gmin (如果需要)
    const gmin = 1e-12;
    matrix.addAt(0, 0, gmin);
    console.log(`⚡ 添加gmin=${gmin.toExponential(2)} 到节点0对角线`);
    console.log('矩阵 (添加gmin后):');
    console.log(`  [${matrix.get(0,0).toExponential(2)}  ${matrix.get(0,1).toExponential(2)}]`);
    console.log(`  [${matrix.get(1,0).toExponential(2)}  ${matrix.get(1,1).toExponential(2)}]`);
    console.log();
    
    // 步骤1：电阻R1的stamp
    console.log('🔧 步骤1: 电阻R1的stamp');
    console.log('电阻连接: 1→0');
    console.log('节点1索引=0, 节点0索引=-1(接地)');
    console.log(`电导G = 1/${R1.value} = ${R1.getConductance()}`);
    
    // 手动执行电阻stamp逻辑
    const G = R1.getConductance();
    const n1 = 0;  // 节点1的索引
    const n2 = -1; // 节点0的索引(接地)
    
    console.log('电阻stamp规则：');
    console.log('  如果n1>=0: G[n1][n1] += G');
    console.log('  如果n2>=0: G[n2][n2] += G, G[n1][n2] -= G, G[n2][n1] -= G'); 
    console.log('  如果n1>=0 && n2>=0: G[n1][n2] -= G, G[n2][n1] -= G');
    
    if (n1 >= 0) {
        matrix.addAt(n1, n1, G);
        console.log(`  执行: matrix[${n1}][${n1}] += ${G}`);
        if (n2 >= 0) {
            matrix.addAt(n1, n2, -G);
            console.log(`  执行: matrix[${n1}][${n2}] += ${-G}`);
        }
    }
    if (n2 >= 0) {
        matrix.addAt(n2, n2, G);
        console.log(`  执行: matrix[${n2}][${n2}] += ${G}`);
        if (n1 >= 0) {
            matrix.addAt(n2, n1, -G);
            console.log(`  执行: matrix[${n2}][${n1}] += ${-G}`);
        }
    } else {
        console.log('  节点0接地，跳过相关项');
    }
    
    console.log('矩阵 (电阻stamp后):');
    console.log(`  [${matrix.get(0,0).toFixed(6)}  ${matrix.get(0,1).toFixed(6)}]`);
    console.log(`  [${matrix.get(1,0).toFixed(6)}  ${matrix.get(1,1).toFixed(6)}]`);
    console.log();
    
    // 步骤2：电压源V1的stamp
    console.log('🔧 步骤2: 电压源V1的stamp');
    console.log('电压源连接: 1→0, 电压=10V');
    console.log('节点1索引=0, 节点0索引=-1(接地), 电流变量索引=1');
    
    const v1_n1 = 0;   // 正端节点索引
    const v1_n2 = -1;  // 负端节点索引(接地)
    const currIndex = 1; // 电流变量索引
    const voltage = V1.getValue(0);
    
    console.log('电压源stamp规则：');
    console.log('  如果n1>=0: G[n1][currIndex] += 1, G[currIndex][n1] += 1');
    console.log('  如果n2>=0: G[n2][currIndex] += -1, G[currIndex][n2] += -1');
    console.log('  RHS[currIndex] += voltage');
    
    if (v1_n1 >= 0) {
        matrix.addAt(v1_n1, currIndex, 1);
        matrix.addAt(currIndex, v1_n1, 1);
        console.log(`  执行: matrix[${v1_n1}][${currIndex}] += 1`);
        console.log(`  执行: matrix[${currIndex}][${v1_n1}] += 1`);
    }
    if (v1_n2 >= 0) {
        matrix.addAt(v1_n2, currIndex, -1);
        matrix.addAt(currIndex, v1_n2, -1);
        console.log(`  执行: matrix[${v1_n2}][${currIndex}] += -1`);
        console.log(`  执行: matrix[${currIndex}][${v1_n2}] += -1`);
    } else {
        console.log('  节点0接地，跳过相关项');
    }
    
    rhs.addAt(currIndex, voltage);
    console.log(`  执行: RHS[${currIndex}] += ${voltage}`);
    
    console.log('最终矩阵:');
    console.log(`  [${matrix.get(0,0).toFixed(6)}  ${matrix.get(0,1).toFixed(6)}]`);
    console.log(`  [${matrix.get(1,0).toFixed(6)}  ${matrix.get(1,1).toFixed(6)}]`);
    console.log('最终RHS:');
    console.log(`  [${rhs.get(0).toFixed(6)}, ${rhs.get(1).toFixed(6)}]`);
    console.log();
    
    // 理论验证
    console.log('🧮 理论验证：');
    console.log('期望矩阵应该是:');
    console.log('  [0.001000  1.000000]  (G + gmin, 1)');
    console.log('  [1.000000  0.000000]  (1, 0)');
    console.log('期望RHS应该是:');
    console.log('  [0.000000, 10.000000]  (0, voltage)');
    console.log();
    
    // 验证方程组
    console.log('🔍 方程组验证：');
    console.log('方程1 (节点1 KCL): (G + gmin)*V(1) + 1*I(V1) = 0');
    console.log('方程2 (V1约束): 1*V(1) + 0*I(V1) = 10');
    console.log();
    console.log('求解：从方程2得到 V(1) = 10V');
    console.log('代入方程1：(0.001 + 1e-12)*10 + I(V1) = 0');
    console.log('所以：I(V1) = -0.001*10 = -0.01A = -10mA');
    
    const actualMatrix = [
        [matrix.get(0,0), matrix.get(0,1)],
        [matrix.get(1,0), matrix.get(1,1)]
    ];
    const actualRHS = [rhs.get(0), rhs.get(1)];
    
    console.log('\n✅ 实际结果与理论对比：');
    console.log(`实际矩阵[0][0] = ${actualMatrix[0][0].toFixed(6)} (期望: 0.001000)`);
    console.log(`实际矩阵[0][1] = ${actualMatrix[0][1].toFixed(6)} (期望: 1.000000)`);
    console.log(`实际矩阵[1][0] = ${actualMatrix[1][0].toFixed(6)} (期望: 1.000000)`);  
    console.log(`实际矩阵[1][1] = ${actualMatrix[1][1].toFixed(6)} (期望: 0.000000)`);
    console.log(`实际RHS[0] = ${actualRHS[0].toFixed(6)} (期望: 0.000000)`);
    console.log(`实际RHS[1] = ${actualRHS[1].toFixed(6)} (期望: 10.000000)`);
    
    // 判断是否匹配
    const tolerance = 1e-9;
    const matches = [
        Math.abs(actualMatrix[0][0] - (0.001 + gmin)) < tolerance,
        Math.abs(actualMatrix[0][1] - 1.0) < tolerance,
        Math.abs(actualMatrix[1][0] - 1.0) < tolerance,
        Math.abs(actualMatrix[1][1] - 0.0) < tolerance,
        Math.abs(actualRHS[0] - 0.0) < tolerance,
        Math.abs(actualRHS[1] - 10.0) < tolerance
    ];
    
    const allMatch = matches.every(m => m);
    console.log(`\n${allMatch ? '✅' : '❌'} 矩阵stamp结果：${allMatch ? '正确' : '错误'}`);
    
    if (!allMatch) {
        console.log('❌ 不匹配的项：');
        const labels = ['[0][0]', '[0][1]', '[1][0]', '[1][1]', 'RHS[0]', 'RHS[1]'];
        matches.forEach((match, i) => {
            if (!match) {
                console.log(`  ${labels[i]} 不匹配`);
            }
        });
    }
}

// 运行调试
stepByStepStampDebug();