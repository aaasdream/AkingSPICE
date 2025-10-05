/**
 * 验证步骤一：纯线性DC分析
 * 
 * 测试MNA矩阵建立器、LU求解器和DC_MCP_Solver的线性路径
 * 
 * 测试电路：简单电阻分压器
 * V1 1 0 10V
 * R1 1 2 1k
 * R2 2 0 1k  
 * 
 * 预期结果：
 * - 节点1电压：10V
 * - 节点2电压：5V  
 * - V1电流：-5mA (从正极流出)
 */

import { DC_MCP_Solver } from '../src/analysis/dc_mcp_solver.js';
import { VoltageSource } from '../src/components/sources.js';
import { Resistor } from '../src/components/resistor.js';

async function testLinearDC() {
    console.log('=== 验证步骤一：纯线性DC分析 ===\n');
    
    try {
        // 1. 创建电路元件
        const components = [
            new VoltageSource('V1', ['1', '0'], 10),
            new Resistor('R1', ['1', '2'], 1000),
            new Resistor('R2', ['2', '0'], 1000)
        ];
        
        console.log('📋 电路元件：');
        components.forEach(comp => {
            console.log(`  ${comp.name}: ${comp.constructor.name} ${comp.nodes.join('→')} ${comp.getValue ? comp.getValue() : comp.value}`);
        });
        console.log();
        
        // 2. 创建DC求解器（启用debug）
        const dcSolver = new DC_MCP_Solver({ 
            debug: true, 
            gmin: 1e-12,
            maxIterations: 100,
            tolerance: 1e-9
        });
        
        console.log('🔧 开始DC-MCP求解...\n');
        
        // 3. 求解DC工作点
        const result = await dcSolver.solve(components);
        
        console.log('\n📊 DC求解结果：');
        console.log(`收敛状态: ${result.converged ? '✅ 收敛' : '❌ 未收敛'}`);
        console.log(`迭代次数: ${result.iterations || 'N/A'}`);
        
        if (result.converged && result.nodeVoltages && result.branchCurrents) {
            console.log('\n🔋 节点电压：');
            for (const [node, voltage] of result.nodeVoltages) {
                console.log(`  V(${node}) = ${voltage.toFixed(6)}V`);
            }
            
            console.log('\n⚡ 支路电流：');
            for (const [branch, current] of result.branchCurrents) {
                console.log(`  I(${branch}) = ${(current * 1000).toFixed(3)}mA`);
            }
            
            // 4. 验证结果
            console.log('\n✅ 结果验证：');
            const v1 = result.nodeVoltages.get('1');
            const v2 = result.nodeVoltages.get('2');
            const i_v1 = result.branchCurrents.get('V1');
            
            // 理论值：节点1=10V, 节点2=5V, V1电流=-5mA
            const v1_expected = 10.0;
            const v2_expected = 5.0; 
            const i_v1_expected = -0.005; // -5mA
            
            const v1_error = Math.abs(v1 - v1_expected);
            const v2_error = Math.abs(v2 - v2_expected);
            const i_v1_error = Math.abs(i_v1 - i_v1_expected);
            
            console.log(`  V(1): ${v1.toFixed(6)}V (预期: ${v1_expected}V, 误差: ${v1_error.toExponential(2)})`);
            console.log(`  V(2): ${v2.toFixed(6)}V (预期: ${v2_expected}V, 误差: ${v2_error.toExponential(2)})`);
            console.log(`  I(V1): ${(i_v1*1000).toFixed(3)}mA (预期: ${i_v1_expected*1000}mA, 误差: ${(i_v1_error*1000).toExponential(2)}mA)`);
            
            // 判断是否通过测试
            const tolerance = 1e-6;
            const passed = v1_error < tolerance && v2_error < tolerance && i_v1_error < tolerance;
            
            if (passed) {
                console.log('\n🎉 测试通过！线性DC分析正常工作');
                return true;
            } else {
                console.log('\n❌ 测试失败！结果误差超出容许范围');
                return false;
            }
            
        } else {
            console.log('\n❌ DC求解失败，无法获得有效结果');
            if (result.error) {
                console.log(`错误信息: ${result.error}`);
            }
            return false;
        }
        
    } catch (error) {
        console.error('❌ 测试执行失败：', error);
        console.error('错误堆栈：', error.stack);
        return false;
    }
}

// 运行测试
testLinearDC().then(success => {
    console.log(`\n=== 测试结果: ${success ? 'PASS' : 'FAIL'} ===`);
    process.exit(success ? 0 : 1);
});