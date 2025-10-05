/**
 * 無界射線診斷測試
 * 
 * 這個測試腳本創建一個容易產生無界射線的簡單電路，
 * 驗證我們的診斷工具和修復機制。
 */

import { createDC_MCP_Solver } from './src/analysis/dc_mcp_solver.js';
import { VoltageSource } from './src/components/sources.js';
import { Resistor } from './src/components/resistor.js';
import { MOSFET_MCP } from './src/components/mosfet_mcp.js';
import { Diode_MCP } from './src/components/diode_mcp.js';

/**
 * 創建測試電路：
 * 
 * 這是一個極簡的電路，容易觸發數值不穩定：
 * - 只有一個 MOSFET 和一個二極體
 * - 較小的電阻值，可能導致 M 矩陣條件數差
 */
function createUnstableTestCircuit() {
    const components = [];
    
    // 電壓源：12V
    components.push(new VoltageSource('V1', ['vdd', 'gnd'], 12));
    
    // 小電阻 (容易導致數值問題)
    components.push(new Resistor('R1', ['vdd', 'drain'], 0.01)); // 10mΩ
    
    // MOSFET (關鍵的 MCP 元件)
    components.push(new MOSFET_MCP('M1', ['drain', 'source', 'gate'], {
        type: 'n',
        vth: 2.0,
        gm: 0.1,
        ron: 0.001,  // 極小的導通電阻
        vf_body: 0.7
    }));
    
    // 二極體 (另一個 MCP 元件)
    components.push(new Diode_MCP('D1', ['source', 'gnd'], {
        vf: 0.7,
        gf: 100,  // 高導通電導
        gr: 1e-9
    }));
    
    // 閘極電壓 (控制 MOSFET)
    components.push(new VoltageSource('Vg', ['gate', 'gnd'], 5)); // ON 狀態
    
    console.log('📋 創建不穩定測試電路:');
    console.log('  - V1: 12V 電源');
    console.log('  - R1: 10mΩ 小電阻 (數值挑戰)');  
    console.log('  - M1: N-MOSFET, Vth=2V, Ron=1mΩ');
    console.log('  - D1: 二極體, Vf=0.7V');
    console.log('  - Vg: 5V 閘極電壓 (MOSFET ON)');
    
    return components;
}

/**
 * 測試不同的 gmin 設定
 */
async function testGminEffects() {
    console.log('\n🧪 === 測試 Gmin 效果 ===');
    
    const components = createUnstableTestCircuit();
    const gminValues = [1e-12, 1e-9, 1e-6, 1e-3];
    
    for (const gmin of gminValues) {
        console.log(`\n🔬 測試 gmin = ${gmin.toExponential()}`);
        
        try {
            const solver = createDC_MCP_Solver({ 
                debug: true, 
                gmin: gmin,
                maxLcpIterations: 1000
            });
            
            const startTime = Date.now();
            const result = await solver.solve(components);
            const endTime = Date.now();
            
            if (result.converged) {
                console.log(`✅ 成功收斂 (${endTime - startTime}ms)`);
                console.log('📊 關鍵節點電壓:');
                for (const [node, voltage] of result.nodeVoltages.entries()) {
                    if (node !== 'gnd' && Math.abs(voltage) > 1e-9) {
                        console.log(`     ${node}: ${voltage.toFixed(6)}V`);
                    }
                }
            } else {
                console.log('❌ 求解失敗');
            }
            
        } catch (error) {
            console.log(`💥 異常: ${error.message}`);
        }
    }
}

/**
 * 測試 QP 備用求解器
 */
async function testQPFallback() {
    console.log('\n🚀 === 測試 QP 備用求解器 ===');
    
    const components = createUnstableTestCircuit();
    
    // 使用強健求解器 (會自動回退到 QP)
    const solver = createDC_MCP_Solver({ 
        debug: true, 
        gmin: 1e-12,  // 故意使用小 gmin 觸發數值問題
        useRobustSolver: true,  // 啟用 QP 備用
        maxLcpIterations: 100   // 限制 Lemke 迭代，強制切換
    });
    
    try {
        console.log('🎯 嘗試觸發 QP 備用求解...');
        const result = await solver.solve(components);
        
        if (result.converged) {
            console.log('✅ QP 備用求解器成功！');
        } else {
            console.log('❌ 連 QP 也失敗了');
        }
        
    } catch (error) {
        console.log(`💥 QP 測試異常: ${error.message}`);
    }
}

/**
 * 主測試函數
 */
async function main() {
    console.log('🔬 === 無界射線診斷測試 ===');
    console.log('目標：驗證數學診斷工具和現代求解方法');
    
    try {
        await testGminEffects();
        await testQPFallback();
        
        console.log('\n🎉 === 診斷測試完成 ===');
        console.log('💡 觀察要點:');
        console.log('  1. M 矩陣診斷信息是否準確識別風險因子');
        console.log('  2. 對角擾動是否改善數值穩定性');  
        console.log('  3. QP 方法是否在 Lemke 失敗時成功救援');
        console.log('  4. 不同 gmin 值對收斂性的影響');
        
    } catch (error) {
        console.error('🔥 測試過程異常:', error);
    }
}

// 運行測試
main().catch(console.error);