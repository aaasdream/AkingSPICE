/**
 * 基本 MNA 測試
 * 測試最簡單的電阻分壓電路
 */

import { JSSolverPE } from './src/index.js';

async function debugBasicMNA() {
    console.log('=== 基本 MNA 矩陣測試 ===\n');

    const solver = new JSSolverPE();
    
    // 最簡單的分壓電路
    const netlist = `
* 基本分壓電路
V1 VIN 0 DC(5)
R1 VIN N1 1K
R2 N1 0 2K
.END
    `;
    
    try {
        solver.loadNetlist(netlist);
        console.log(`載入的元件:`);
        solver.components.forEach((comp, idx) => {
            console.log(`  ${idx+1}. ${comp.name} (${comp.type}): ${comp.nodes.join(', ')}`);
            if (comp.type === 'V') {
                console.log(`     電壓值: ${comp.value}V`);
            }
            if (comp.type === 'R') {
                console.log(`     電阻值: ${comp.value}Ω`);
            }
        });
        
        console.log('\n嘗試初始化步進式模擬...');
        const success = await solver.initSteppedTransient({
            startTime: 0,
            stopTime: 1e-6,
            timeStep: 100e-9
        });
        
        if (success) {
            console.log('✓ 成功初始化');
            
            // 執行一步
            const result = solver.step({});
            if (result) {
                console.log('\n節點電壓:');
                Object.entries(result.nodeVoltages).forEach(([node, voltage]) => {
                    console.log(`  ${node}: ${voltage.toFixed(4)}V`);
                });
                
                console.log('\n支路電流:');
                Object.entries(result.branchCurrents).forEach(([branch, current]) => {
                    console.log(`  ${branch}: ${current.toFixed(6)}A`);
                });
                
                // 驗證分壓結果
                const vn1 = result.nodeVoltages['N1'] || 0;
                const expectedVn1 = 5 * 2000 / (1000 + 2000); // 分壓公式
                console.log(`\n分壓驗證:`);
                console.log(`  期望 N1 電壓: ${expectedVn1.toFixed(4)}V`);
                console.log(`  實際 N1 電壓: ${vn1.toFixed(4)}V`);
                console.log(`  誤差: ${Math.abs(vn1 - expectedVn1).toFixed(6)}V`);
            } else {
                console.log('✗ 步驟執行失敗');
            }
        } else {
            console.log('✗ 初始化失敗');
        }
        
    } catch (error) {
        console.log(`✗ 錯誤: ${error.message}`);
        if (error.stack) {
            console.log('\n錯誤詳情:');
            console.log(error.stack.split('\n').slice(0, 8).join('\n'));
        }
    }
    
    console.log('\n=== 基本 MNA 矩陣測試完成 ===');
}

debugBasicMNA();