/**
 * MOSFET 連接測試
 * 檢查 MOSFET 印花是否正確
 */

import { JSSolverPE } from './src/index.js';

async function debugMOSFET() {
    console.log('=== MOSFET 連接調試 ===\n');

    const solver = new JSSolverPE();
    
    // 非常簡單的電路：只有電壓源、電阻和MOSFET
    const netlist = `
* 最簡單的MOSFET測試
V1 VIN 0 DC(5)
R1 VIN N1 1K
M1 N1 0 PWM Ron=0.001 Roff=10K
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
            if (comp.type === 'M') {
                console.log(`     Ron: ${comp.Ron}, Roff: ${comp.Roff}`);
                console.log(`     閘極狀態: ${comp.getGateState() ? 'ON' : 'OFF'}`);
                console.log(`     等效電阻: ${comp.getEquivalentResistance(0)}Ω`);
            }
        });
        
        console.log(`\n解析統計: ${solver.parser.stats.totalLines} 行, ${solver.parser.stats.errors.length} 錯誤`);
        if (solver.parser.stats.errors.length > 0) {
            console.log('解析錯誤:');
            solver.parser.stats.errors.forEach((err, idx) => {
                console.log(`  ${idx+1}. ${JSON.stringify(err)}`);
            });
        }
        
        console.log('\n嘗試初始化步進式模擬...');
        const success = await solver.initSteppedTransient({
            startTime: 0,
            stopTime: 1e-6,
            timeStep: 100e-9
        });
        
        if (success) {
            console.log('✓ 成功初始化');
            
            // 嘗試執行一步
            console.log('\n執行測試步驟:');
            for (let i = 0; i < 3; i++) {
                const gateState = i % 2 === 0;
                console.log(`\n步驟 ${i}: 設置 M1 = ${gateState ? 'ON' : 'OFF'}`);
                
                try {
                    const result = solver.step({ 'M1': gateState });
                    if (result) {
                        console.log(`  時間: ${result.time * 1e9}ns`);
                        console.log(`  節點電壓:`);
                        Object.entries(result.nodeVoltages).forEach(([node, voltage]) => {
                            console.log(`    ${node}: ${voltage.toFixed(4)}V`);
                        });
                        
                        const m1Status = result.componentStates['M1'];
                        if (m1Status) {
                            console.log(`  M1 狀態: ${m1Status.gateState}, 電阻: ${m1Status.currentResistance}Ω`);
                        }
                    }
                } catch (error) {
                    console.log(`  ✗ 步驟失敗: ${error.message}`);
                    break;
                }
            }
        } else {
            console.log('✗ 初始化失敗');
        }
        
    } catch (error) {
        console.log(`✗ 錯誤: ${error.message}`);
        if (error.stack) {
            console.log('\n錯誤堆疊:');
            console.log(error.stack.split('\n').slice(0, 10).join('\n'));
        }
    }
    
    console.log('\n=== MOSFET 連接調試完成 ===');
}

debugMOSFET();