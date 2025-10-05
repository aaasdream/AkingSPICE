/**
 * 对比MNA_LCP_Builder和手动stamp的结果
 */

import { VoltageSource } from '../src/components/sources.js';
import { Resistor } from '../src/components/resistor.js';
import { Matrix, Vector } from '../src/core/linalg.js';

async function compareStampResults() {
    console.log('=== 对比MNA_LCP_Builder和手动stamp的结果 ===\n');
    
    // 创建相同的电路元件
    const components = [
        new VoltageSource('V1', ['1', '0'], 10),
        new Resistor('R1', ['1', '0'], 1000)
    ];
    
    console.log('📋 测试电路：');
    console.log('V1: 10V电压源 (1→0)');
    console.log('R1: 1kΩ电阻 (1→0)');
    console.log();
    
    // ===== 方法1: 手动stamp =====
    console.log('🔧 方法1: 手动stamp');
    
    const nodeMap1 = new Map();
    nodeMap1.set('1', 0);
    
    const voltageSourceMap1 = new Map();
    voltageSourceMap1.set('V1', 1);
    
    const matrix1 = Matrix.zeros(2, 2);
    const rhs1 = Vector.zeros(2);
    
    // 添加gmin
    const gmin = 1e-12;
    matrix1.addAt(0, 0, gmin);
    
    // 手动执行stamp
    for (const component of components) {
        component.stamp(matrix1, rhs1, nodeMap1, voltageSourceMap1, 0);
    }
    
    console.log('手动stamp结果:');
    console.log('矩阵:');
    for (let i = 0; i < 2; i++) {
        const row = [];
        for (let j = 0; j < 2; j++) {
            row.push(matrix1.get(i, j).toExponential(6));
        }
        console.log(`  行${i}: [${row.join(', ')}]`);
    }
    console.log('RHS:');
    for (let i = 0; i < 2; i++) {
        console.log(`  RHS[${i}] = ${rhs1.get(i).toExponential(6)}`);
    }
    console.log();
    
    // ===== 方法2: MNA_LCP_Builder =====
    console.log('🔧 方法2: MNA_LCP_Builder');
    
    const { MNA_LCP_Builder } = await import('../src/analysis/transient_mcp.js');
    const builder = new MNA_LCP_Builder({ 
        debug: false,  // 关闭debug减少输出
        isDcMode: true,
        gmin: gmin
    });
    
    try {
        const result = builder.buildMNA_LCP_System(components, 0);
        
        console.log('MNA_LCP_Builder结果:');
        console.log('矩阵:');
        for (let i = 0; i < builder.matrix.rows; i++) {
            const row = [];
            for (let j = 0; j < builder.matrix.cols; j++) {
                row.push(builder.matrix.get(i, j).toExponential(6));
            }
            console.log(`  行${i}: [${row.join(', ')}]`);
        }
        console.log('RHS:');
        for (let i = 0; i < builder.rhs.size; i++) {
            console.log(`  RHS[${i}] = ${builder.rhs.get(i).toExponential(6)}`);
        }
        console.log();
        
        // ===== 对比结果 =====
        console.log('📊 结果对比：');
        
        let allMatch = true;
        const tolerance = 1e-15;
        
        // 对比矩阵
        for (let i = 0; i < 2; i++) {
            for (let j = 0; j < 2; j++) {
                const manual = matrix1.get(i, j);
                const builder_val = builder.matrix.get(i, j);
                const diff = Math.abs(manual - builder_val);
                
                if (diff > tolerance) {
                    console.log(`❌ 矩阵[${i}][${j}]: 手动=${manual.toExponential(6)}, Builder=${builder_val.toExponential(6)}, 差异=${diff.toExponential(2)}`);
                    allMatch = false;
                } else {
                    console.log(`✅ 矩阵[${i}][${j}]: 匹配 (${manual.toExponential(6)})`);
                }
            }
        }
        
        // 对比RHS
        for (let i = 0; i < 2; i++) {
            const manual = rhs1.get(i);
            const builder_val = builder.rhs.get(i);
            const diff = Math.abs(manual - builder_val);
            
            if (diff > tolerance) {
                console.log(`❌ RHS[${i}]: 手动=${manual.toExponential(6)}, Builder=${builder_val.toExponential(6)}, 差异=${diff.toExponential(2)}`);
                allMatch = false;
            } else {
                console.log(`✅ RHS[${i}]: 匹配 (${manual.toExponential(6)})`);
            }
        }
        
        console.log(`\n${allMatch ? '🎉' : '💥'} 总体结果: ${allMatch ? '完全匹配' : '存在差异'}`);
        
        // 如果有差异，进一步调试
        if (!allMatch) {
            console.log('\n🔍 进一步调试信息：');
            console.log('Builder的节点映射:');
            for (const [node, index] of builder.nodeMap) {
                console.log(`  ${node} → ${index}`);
            }
            console.log('Builder的电压源映射:');
            for (const [vs, index] of builder.voltageSourceMap) {
                console.log(`  ${vs} → ${index}`);
            }
        }
        
    } catch (error) {
        console.error('❌ MNA_LCP_Builder失败:', error.message);
        console.error('错误堆栈:', error.stack);
    }
}

// 运行对比
compareStampResults();