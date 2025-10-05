/**
 * 验证步骤二：非线性DC-MCP分析
 * 
 * 测试MCP元件的LCP约束建立、Schur补化简和LCP求解器
 * 
 * 测试电路：简单二极管限幅电路
 * V1 1 0 5V
 * R1 1 2 1k
 * D1 2 0 Vf=0.7V Ron=1mΩ
 * 
 * 预期结果：
 * - 二极管应为导通状态
 * - 节点2电压：≈0.7V (二极管导通电压)
 * - 节点1电压：5V
 * - D1电流：≈(5-0.7)/1k = 4.3mA
 */

import { DC_MCP_Solver } from '../src/analysis/dc_mcp_solver.js';
import { VoltageSource } from '../src/components/sources.js';
import { Resistor } from '../src/components/resistor.js';

async function testNonlinearDCMCP() {
    console.log('=== 验证步骤二：非线性DC-MCP分析 ===\n');
    
    try {
        // 1. 首先检查是否有MCP二极管类
        let MCPDiode;
        try {
            const mcpModule = await import('../src/components/diode_mcp.js');
            MCPDiode = mcpModule.Diode_MCP || mcpModule.MCPDiode || mcpModule.default;
        } catch (error) {
            console.log('尝试备用导入路径...');
            try {
                const indexModule = await import('../src/index.js');
                MCPDiode = indexModule.MCPDiode || indexModule.createSchottkyDiode;
            } catch (error2) {
                console.error('❌ 无法找到MCP二极管类:', error2.message);
                return false;
            }
        }
        
        if (!MCPDiode) {
            console.error('❌ MCP二极管类未定义');
            return false;
        }
        
        // 2. 创建电路元件
        const components = [
            new VoltageSource('V1', ['1', '0'], 5),
            new Resistor('R1', ['1', '2'], 1000)
        ];
        
        // 尝试创建二极管
        let diode;
        try {
            if (typeof MCPDiode === 'function') {
                // 如果是构造函数
                diode = new MCPDiode('D1', ['2', '0'], { Vf: 0.7, Ron: 1e-3 });
            } else {
                // 如果是工厂函数
                diode = MCPDiode('D1', '2', '0', { Vf: 0.7, Ron: 1e-3 });
            }
            components.push(diode);
        } catch (error) {
            console.error('❌ 创建二极管失败:', error.message);
            console.log('可用的导出内容:', Object.keys(await import('../src/index.js')));
            return false;
        }
        
        console.log('📋 测试电路元件：');
        components.forEach((comp, index) => {
            console.log(`  ${comp.name}: ${comp.constructor.name} ${comp.nodes.join('→')}`);
            if (comp.getValue) {
                console.log(`    值: ${comp.getValue()}`);
            } else if (comp.value !== undefined) {
                console.log(`    值: ${comp.value}`);
            }
            if (comp.type) {
                console.log(`    类型: ${comp.type}`);
            }
        });
        console.log();
        
        // 3. 理论分析
        console.log('🧮 理论分析：');
        console.log('假设二极管导通：');
        console.log('  V(2) = Vf = 0.7V');
        console.log('  V(1) = 5V (由电压源决定)');
        console.log('  I(R1) = (V(1) - V(2))/R1 = (5-0.7)/1000 = 4.3mA');
        console.log('  I(D1) = I(R1) = 4.3mA > 0 (确实导通)');
        console.log('  互补条件验证: Vd-Vf-Ron*Id ≤ 0 且 Id ≥ 0');
        console.log('    Vd-Vf-Ron*Id = 0.7-0.7-0.001*0.0043 = -0.0000043 ≤ 0 ✅');
        console.log();
        
        // 4. 使用DC_MCP_Solver求解
        console.log('🔧 使用DC_MCP_Solver求解（启用debug）...');
        const dcSolver = new DC_MCP_Solver({
            debug: true,
            gmin: 1e-12,
            maxIterations: 100,
            tolerance: 1e-9
        });
        
        const result = await dcSolver.solve(components);
        
        console.log('\n📊 DC-MCP求解结果：');
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
            
            console.log('\n🔧 MCP元件状态：');
            if (result.componentStates && result.componentStates.size > 0) {
                for (const [name, state] of result.componentStates) {
                    console.log(`  ${name}:`, state);
                }
            } else {
                console.log('  无MCP元件状态信息');
            }
            
            // 5. 验证结果
            console.log('\n✅ 结果验证：');
            const v1 = result.nodeVoltages.get('1');
            const v2 = result.nodeVoltages.get('2');
            const i_v1 = result.branchCurrents.get('V1');
            
            // 理论值
            const v1_expected = 5.0;      // 5V
            const v2_expected = 0.7;      // 0.7V (二极管导通电压)
            const i_v1_expected = -0.0043; // -4.3mA (从正极流出)
            
            const v1_error = Math.abs(v1 - v1_expected);
            const v2_error = Math.abs(v2 - v2_expected);
            const i_v1_error = Math.abs(i_v1 - i_v1_expected);
            
            console.log(`V(1): 实际=${v1.toFixed(6)}V, 期望=${v1_expected}V, 误差=${v1_error.toExponential(2)}`);
            console.log(`V(2): 实际=${v2.toFixed(6)}V, 期望=${v2_expected}V, 误差=${v2_error.toExponential(2)}`);
            console.log(`I(V1): 实际=${(i_v1*1000).toFixed(3)}mA, 期望=${i_v1_expected*1000}mA, 误差=${(i_v1_error*1000).toExponential(2)}mA`);
            
            // 判断通过条件
            const tolerance = 1e-3; // 1mV或1mA的容差
            const v1_pass = v1_error < tolerance;
            const v2_pass = v2_error < tolerance;
            const i_v1_pass = i_v1_error < tolerance;
            const overall_pass = v1_pass && v2_pass && i_v1_pass;
            
            console.log(`\n${overall_pass ? '🎉' : '💥'} 总体测试结果: ${overall_pass ? 'PASS' : 'FAIL'}`);
            
            if (!overall_pass) {
                console.log('❌ 失败项目：');
                if (!v1_pass) console.log('  - 节点1电压不正确');
                if (!v2_pass) console.log('  - 节点2电压不正确（二极管导通电压）');
                if (!i_v1_pass) console.log('  - V1电流不正确');
            } else {
                console.log('✅ 非线性DC-MCP分析工作正常！');
                console.log('  - MCP元件的LCP约束建立正确');
                console.log('  - Schur补化简正确');
                console.log('  - LCP求解器收敛正常');
                console.log('  - 互补约束满足');
            }
            
            return overall_pass;
            
        } else {
            console.log('\n❌ DC-MCP求解失败，无法获得有效结果');
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
testNonlinearDCMCP().then(success => {
    console.log(`\n=== 步骤二测试结果: ${success ? 'PASS' : 'FAIL'} ===`);
    
    if (success) {
        console.log('✅ 可以进行步骤三：线性时域分析验证');
    } else {
        console.log('❌ 需要调试MCP元件或LCP求解器');
    }
    
    process.exit(success ? 0 : 1);
});