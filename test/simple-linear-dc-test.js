/**
 * 最简单的DC线性分析测试
 * 使用DC_MCP_Solver验证简单电路
 */

import { DC_MCP_Solver } from '../src/analysis/dc_mcp_solver.js';
import { VoltageSource } from '../src/components/sources.js';
import { Resistor } from '../src/components/resistor.js';
import { LUSolver } from '../src/core/linalg.js';

async function simpleLinearDCTest() {
    console.log('=== 最简单的DC线性分析测试 ===\n');
    
    try {
        // 创建最简单的电路：10V电压源 + 1kΩ电阻
        const components = [
            new VoltageSource('V1', ['1', '0'], 10),
            new Resistor('R1', ['1', '0'], 1000)
        ];
        
        console.log('📋 测试电路：');
        console.log('V1: 10V电压源 (节点1→节点0)');
        console.log('R1: 1kΩ电阻 (节点1→节点0)');
        console.log();
        
        // 理论分析
        console.log('🧮 理论分析：');
        console.log('根据欧姆定律：I = V/R = 10V/1kΩ = 10mA');
        console.log('节点1电压 = 10V (由电压源决定)');
        console.log('V1电流 = -10mA (从正端流出)');
        console.log();
        
        // 使用DC_MCP_Solver求解
        console.log('🔧 使用DC_MCP_Solver求解...');
        const dcSolver = new DC_MCP_Solver({
            debug: false, // 关闭debug减少输出
            gmin: 1e-12
        });
        
        const result = await dcSolver.solve(components);
        
        console.log('📊 求解结果：');
        console.log(`收敛状态: ${result.converged ? '✅ 收敛' : '❌ 未收敛'}`);
        
        if (result.converged && result.nodeVoltages && result.branchCurrents) {
            console.log('\n🔋 节点电压：');
            for (const [node, voltage] of result.nodeVoltages) {
                console.log(`  V(${node}) = ${voltage.toFixed(6)}V`);
            }
            
            console.log('\n⚡ 支路电流：');
            for (const [branch, current] of result.branchCurrents) {
                const currentmA = current * 1000;
                console.log(`  I(${branch}) = ${currentmA.toFixed(3)}mA`);
            }
            
            // 验证结果
            console.log('\n✅ 结果验证：');
            const v1 = result.nodeVoltages.get('1');
            const i_v1 = result.branchCurrents.get('V1');
            
            // 理论值
            const v1_expected = 10.0;      // 10V
            const i_v1_expected = -0.010;  // -10mA
            
            const v1_error = Math.abs(v1 - v1_expected);
            const i_v1_error = Math.abs(i_v1 - i_v1_expected);
            
            console.log(`V(1): 实际=${v1.toFixed(6)}V, 期望=${v1_expected}V, 误差=${v1_error.toExponential(2)}`);
            console.log(`I(V1): 实际=${(i_v1*1000).toFixed(3)}mA, 期望=${i_v1_expected*1000}mA, 误差=${(i_v1_error*1000).toExponential(2)}mA`);
            
            // 判断通过条件
            const tolerance = 1e-6;
            const v1_pass = v1_error < tolerance;
            const i_v1_pass = i_v1_error < tolerance;
            const overall_pass = v1_pass && i_v1_pass;
            
            console.log(`\n${overall_pass ? '🎉' : '💥'} 总体测试结果: ${overall_pass ? 'PASS' : 'FAIL'}`);
            
            if (!overall_pass) {
                console.log('❌ 失败项目：');
                if (!v1_pass) console.log('  - 节点1电压不正确');
                if (!i_v1_pass) console.log('  - V1电流不正确');
            }
            
            return overall_pass;
            
        } else {
            console.log('\n❌ 求解失败，无法获得有效结果');
            if (result.error) {
                console.log(`错误信息: ${result.error}`);
            }
            return false;
        }
        
    } catch (error) {
        console.error('❌ 测试执行失败：', error.message);
        console.error('错误堆栈：', error.stack);
        return false;
    }
}

// 运行测试
simpleLinearDCTest().then(success => {
    console.log(`\n=== 最终结果: ${success ? 'PASS' : 'FAIL'} ===`);
    
    if (success) {
        console.log('✅ 线性DC分析工作正常！可以进行下一步验证。');
    } else {
        console.log('❌ 线性DC分析有问题，需要进一步调试。');
    }
    
    process.exit(success ? 0 : 1);
});