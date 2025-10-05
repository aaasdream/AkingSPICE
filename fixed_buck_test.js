/**
 * 修復後的 Buck 轉換器網表驗證
 * 解決 MCP 系統奇異性問題
 */

console.log('🔧 修復後的 Buck 轉換器網表驗證');

try {
    const { AkingSPICE } = await import('./src/core/solver.js');
    
    // 修復版本1: 使用更大的電感和電容值來改善數值條件
    console.log('\n1. 測試修復版本1 - 改善數值條件');
    
    const fixedBuckV1 = `
* Buck Converter - 修復版本1
VIN 1 0 DC 24V
M1 1 2 3 NMOS Ron=50m Vth=2V
D1 0 2 Vf=0.7 Ron=50m  
L1 2 4 1mH IC=0
C1 4 0 1mF IC=0
RLOAD 4 0 10
VDRIVE 3 0 DC 5V
.TRAN 1u 10u
.END
`;

    let solver = new AkingSPICE();
    solver.setDebug(false);
    
    try {
        solver.loadNetlist(fixedBuckV1);
        console.log('   ✅ 網表載入成功');
        
        const validation = solver.validateCircuit();
        console.log(`   電路驗證: ${validation.valid ? '✅ 通過' : '❌ 失敗'}`);
        
        if (validation.issues.length > 0) {
            console.log('   問題:');
            validation.issues.forEach(issue => console.log(`     - ${issue}`));
        }
        
        const result = await solver.runAnalysis('.TRAN 1u 10u');
        
        if (result.success) {
            console.log('   ✅ 模擬成功！');
            console.log(`   時間點: ${result.timeVector?.length || 'N/A'}`);
        } else {
            console.log(`   ❌ 模擬失敗: ${result.error}`);
        }
        
    } catch (error) {
        console.log(`   ❌ 版本1失敗: ${error.message}`);
    }
    
    // 修復版本2: 簡化電路，先確保基本開關工作
    console.log('\n2. 測試修復版本2 - 簡化電路');
    
    const fixedBuckV2 = `
* Buck Converter - 簡化版本
VIN 1 0 DC 12V
M1 1 2 3 NMOS Ron=100m Vth=2V  
D1 0 2 Vf=0.7 Ron=100m
RLOAD 2 0 10
VDRIVE 3 0 DC 5V
.END
`;

    solver = new AkingSPICE();
    solver.setDebug(false);
    
    try {
        solver.loadNetlist(fixedBuckV2);
        console.log('   ✅ 簡化網表載入成功');
        
        const result = await solver.runAnalysis();
        
        if (result.success) {
            console.log('   ✅ 簡化電路模擬成功！');
            
            if (result.nodeVoltages) {
                console.log('   節點電壓:');
                for (const [node, voltage] of result.nodeVoltages) {
                    console.log(`     V(${node}) = ${voltage.toFixed(3)}V`);
                }
            }
        } else {
            console.log(`   ❌ 簡化電路失敗: ${result.error}`);
        }
        
    } catch (error) {
        console.log(`   ❌ 版本2失敗: ${error.message}`);
    }
    
    // 修復版本3: 漸進式添加元件
    console.log('\n3. 測試修復版本3 - 漸進式方法');
    
    // 步驟3a: 只有電阻負載 
    const step3a = `
VIN 1 0 DC 12V
RLOAD 1 0 10
.END
`;

    solver = new AkingSPICE();
    try {
        solver.loadNetlist(step3a);
        const result = await solver.runAnalysis();
        console.log(`   步驟3a (電阻): ${result.success ? '✅ 成功' : '❌ 失敗'}`);
        if (result.success && result.nodeVoltages) {
            const v1 = result.nodeVoltages.get('1') || 0;
            console.log(`     V(1) = ${v1.toFixed(2)}V`);
        }
    } catch (error) {
        console.log(`   步驟3a失敗: ${error.message}`);
    }
    
    // 步驟3b: 添加 MOSFET (開啟狀態)
    const step3b = `
VIN 1 0 DC 12V  
M1 1 2 3 NMOS Ron=100m Vth=2V
RLOAD 2 0 10
VDRIVE 3 0 DC 5V
.END
`;

    solver = new AkingSPICE();
    try {
        solver.loadNetlist(step3b);
        const result = await solver.runAnalysis();
        console.log(`   步驟3b (+MOSFET): ${result.success ? '✅ 成功' : '❌ 失敗'}`);
        if (result.success && result.nodeVoltages) {
            const v1 = result.nodeVoltages.get('1') || 0;
            const v2 = result.nodeVoltages.get('2') || 0;
            const v3 = result.nodeVoltages.get('3') || 0;
            console.log(`     V(1)=${v1.toFixed(2)}V, V(2)=${v2.toFixed(2)}V, V(3)=${v3.toFixed(2)}V`);
        }
    } catch (error) {
        console.log(`   步驟3b失敗: ${error.message}`);
    }
    
    // 步驟3c: 添加二極體
    const step3c = `
VIN 1 0 DC 12V
M1 1 2 3 NMOS Ron=100m Vth=2V
D1 0 2 Vf=0.7 Ron=100m
RLOAD 2 0 10  
VDRIVE 3 0 DC 5V
.END
`;

    solver = new AkingSPICE();
    solver.setDebug(true); // 開啟調試以查看問題
    
    try {
        solver.loadNetlist(step3c);
        const result = await solver.runAnalysis();
        console.log(`   步驟3c (+二極體): ${result.success ? '✅ 成功' : '❌ 失敗'}`);
        if (result.success && result.nodeVoltages) {
            const v1 = result.nodeVoltages.get('1') || 0;
            const v2 = result.nodeVoltages.get('2') || 0; 
            console.log(`     V(1)=${v1.toFixed(2)}V, V(2)=${v2.toFixed(2)}V`);
            console.log(`     MOSFET 應該導通，二極體應該截止`);
        }
    } catch (error) {
        console.log(`   步驟3c失敗: ${error.message}`);
    }
    
    console.log('\n4. 根因分析總結:');
    console.log('   - Gear2/BDF2 積分器本身沒問題');
    console.log('   - 問題出現在 MCP 求解器的舒爾補階段'); 
    console.log('   - 二極體 LCP 建模可能有數值奇異性');
    console.log('   - 需要檢查二極體的約束矩陣建構');
    
} catch (error) {
    console.error('❌ 測試失敗:', error.message);
    console.error(error.stack);
}

console.log('\n驗證完成！');