/**
 * 詳細 MNA 調試
 * 深入檢查矩陣構建和求解過程
 */

import { JSSolverPE } from './src/index.js';

async function debugMNADetailed() {
    console.log('=== 詳細 MNA 調試 ===\n');

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
            console.log(`  ${idx+1}. ${comp.toString()}`);
            if (comp.type === 'V') {
                console.log(`     解析後電壓值: ${comp.value}V`);
                console.log(`     源配置: ${JSON.stringify(comp.sourceConfig)}`);
            }
        });
        
        console.log('\n初始化分析...');
        const success = await solver.initSteppedTransient({
            startTime: 0,
            stopTime: 1e-6,
            timeStep: 100e-9
        });
        
        if (success) {
            console.log('✓ 成功初始化');
            
            // 檢查內部分析器狀態
            if (solver.analysis && solver.analysis.dcAnalysis) {
                const dc = solver.analysis.dcAnalysis;
                console.log('\nDC分析狀態:');
                console.log(`  節點映射: ${JSON.stringify(Object.fromEntries(dc.nodeMap))}`);
                console.log(`  電壓源映射: ${JSON.stringify(Object.fromEntries(dc.voltageSourceMap))}`);
                console.log(`  矩陣大小: ${dc.matrix ? dc.matrix.rows : 'null'}x${dc.matrix ? dc.matrix.cols : 'null'}`);
                
                // 打印矩陣內容
                if (dc.matrix) {
                    console.log('\n矩陣內容:');
                    for (let i = 0; i < dc.matrix.rows; i++) {
                        const row = [];
                        for (let j = 0; j < dc.matrix.cols; j++) {
                            row.push(dc.matrix.get(i, j).toFixed(6));
                        }
                        console.log(`  [${row.join(', ')}]`);
                    }
                }
                
                // 打印右側向量
                if (dc.rhs) {
                    console.log('\n右側向量:');
                    for (let i = 0; i < dc.rhs.size; i++) {
                        console.log(`  [${dc.rhs.get(i).toFixed(6)}]`);
                    }
                }
            }
            
            // 執行一步
            console.log('\n執行時間步...');
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
                
                if (Math.abs(vn1 - expectedVn1) < 0.001) {
                    console.log('  ✓ 分壓計算正確!');
                } else {
                    console.log('  ✗ 分壓計算錯誤!');
                }
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
            console.log(error.stack.split('\n').slice(0, 10).join('\n'));
        }
    }
    
    console.log('\n=== 詳細 MNA 調試完成 ===');
}

debugMNADetailed();