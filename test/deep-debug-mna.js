/**
 * 深度调试MNA矩阵建立过程
 * 专门检查电压源的stamp过程
 */

import { DC_MCP_Solver } from '../src/analysis/dc_mcp_solver.js';
import { VoltageSource } from '../src/components/sources.js';
import { Resistor } from '../src/components/resistor.js';

async function deepDebugMNA() {
    console.log('=== 深度调试MNA矩阵建立过程 ===\n');
    
    try {
        // 创建最简单的电路：一个电压源和一个电阻
        const components = [
            new VoltageSource('V1', ['1', '0'], 10),  // 10V电压源：节点1到节点0 
            new Resistor('R1', ['1', '0'], 1000)      // 1kΩ电阻：节点1到节点0
        ];
        
        console.log('📋 测试电路：');
        components.forEach(comp => {
            console.log(`  ${comp.name}: ${comp.constructor.name}`);
            console.log(`    nodes: ${comp.nodes.join('→')}`);
            console.log(`    type: ${comp.type}`);
            
            if (comp.getValue) {
                console.log(`    getValue(): ${comp.getValue()}`);
            }
            if (comp.value !== undefined) {
                console.log(`    value: ${comp.value}`);
            }
            if (comp.needsCurrentVariable) {
                console.log(`    needsCurrentVariable(): ${comp.needsCurrentVariable()}`);
            }
        });
        console.log();
        
        // 手动创建并调试MNA Builder
        console.log('🔧 手动创建MNA Builder调试...\n');
        
        const { MNA_LCP_Builder } = await import('../src/analysis/transient_mcp.js');
        const builder = new MNA_LCP_Builder({ debug: true, gmin: 1e-12 });
        
        // 分析电路
        console.log('📊 分析电路...');
        builder.analyzeCircuit(components);
        
        console.log('\n🗂️ 节点映射：');
        for (const [node, index] of builder.nodeMap) {
            console.log(`  节点 ${node} -> 矩阵索引 ${index}`);
        }
        
        console.log('\n⚡ 电压源映射：');
        for (const [vs, index] of builder.voltageSourceMap) {
            console.log(`  电压源 ${vs} -> 电流变量索引 ${index}`);
        }
        
        console.log(`\n📏 矩阵维度: ${builder.matrixSize}x${builder.matrixSize}`);
        console.log(`  节点数: ${builder.nodeCount}`);
        console.log(`  电压源数: ${builder.voltageSourceCount}`);
        
        // 建立MNA系统
        console.log('\n🏗️ 建立MNA系统...');
        const result = builder.buildMNA_LCP_System(components, 0);
        
        console.log('\n📈 最终矩阵 (MNA + gmin):');
        console.log('  矩阵维度:', builder.matrix.rows, 'x', builder.matrix.cols);
        
        // 打印完整矩阵
        console.log('\n🔍 完整MNA矩阵:');
        for (let i = 0; i < builder.matrix.rows; i++) {
            const row = [];
            for (let j = 0; j < builder.matrix.cols; j++) {
                const val = builder.matrix.get(i, j);
                row.push(val.toExponential(2));
            }
            console.log(`  行 ${i}: [${row.join(', ')}]`);
        }
        
        console.log('\n📋 RHS向量:');
        for (let i = 0; i < builder.rhs.size; i++) {
            const val = builder.rhs.get(i);
            console.log(`  RHS[${i}] = ${val.toExponential(2)}`);
        }
        
        // 期望的矩阵分析
        console.log('\n🧮 理论分析:');
        console.log('对于电路：V1(10V): 1→0, R1(1kΩ): 1→0');
        console.log('节点1索引=0, V1电流变量索引=1');
        console.log('');
        console.log('MNA方程组应该是:');
        console.log('  G*V(1) + I(V1) = 0           (节点1的KCL)');  
        console.log('  V(1) = 10                    (V1的电压约束)');
        console.log('其中 G = 1/R1 = 1/1000 = 0.001 S');
        console.log('');
        console.log('期望矩阵:');
        console.log('  [G  1] [V1]   [0 ]');
        console.log('  [1  0] [I1] = [10]');
        console.log('  即:');
        console.log('  [0.001  1] [V1]   [0 ]');
        console.log('  [1      0] [I1] = [10]');
        console.log('');
        console.log('解应该是: V1=10V, I1=-0.01A');
        
    } catch (error) {
        console.error('❌ 调试执行失败：', error);
        console.error('错误堆栈：', error.stack);
    }
}

// 运行调试
deepDebugMNA();