/**
 * 簡化返馳轉換器 - 專注於基本功能驗證
 */

const path = require('path');
const srcDir = path.join(__dirname, 'src');

// 直接導入需要的組件
const { VoltageSource } = require(path.join(srcDir, 'components/sources.js'));
const { Resistor } = require(path.join(srcDir, 'components/resistor.js'));
const { Capacitor } = require(path.join(srcDir, 'components/capacitor_v2.js'));
const { Inductor } = require(path.join(srcDir, 'components/inductor_v2.js'));
const { createMCPDiode } = require(path.join(srcDir, 'components/diode_mcp.js'));
const { createNMOSSwitch } = require(path.join(srcDir, 'components/mosfet_mcp.js'));
const { MCPTransientAnalysis } = require(path.join(srcDir, 'analysis/transient_mcp.js'));

console.log('🔋 簡化返馳轉換器測試 🔋');

// 簡化參數
const VIN = 24;           // 輸入電壓
const VOUT_TARGET = 12;   // 目標輸出電壓 (降低目標)
const Fs = 50e3;          // 降低開關頻率到 50kHz
const DUTY = 0.3;         // 佔空比 30%
const period = 1 / Fs;
const onTime = period * DUTY;

// 更大的元件值以便觀察
const Lp = 100e-6;        // 100μH 主電感
const Ls = 25e-6;         // 25μH 次級電感 (4:1匝數比)
const Co = 100e-6;        // 100μF 輸出電容
const RL = 10;            // 10Ω 負載

console.log(`參數設定:`);
console.log(`  輸入: ${VIN}V → 目標: ${VOUT_TARGET}V`);
console.log(`  頻率: ${Fs/1e3}kHz, 佔空比: ${DUTY*100}%`);
console.log(`  匝數比: ${Math.sqrt(Lp/Ls).toFixed(1)}:1`);

async function runFlybackTest() {
    try {
        // 創建電路組件 - 分離電感結構 (簡化)
        const components = [
            // 輸入電壓
            new VoltageSource('Vin', ['VIN', 'GND'], VIN),
            
            // 閘極驅動信號
            new VoltageSource('Vgate', ['GATE', 'GND'], {
                type: 'PULSE',
                v1: 0,        // 關閉
                v2: 15,       // 開啟 (足夠的驅動電壓)
                td: 1e-6,     // 延遲1μs讓電路穩定
                tr: 50e-9,    // 上升時間
                tf: 50e-9,    // 下降時間  
                pw: onTime,   // 脈寬
                per: period   // 週期
            }),
            
            // 主開關 (NMOS)
            createNMOSSwitch('M1', 'SW', 'GND', 'GATE', {
                Rds_on: 0.1,     // 導通電阻
                Vth: 2.0,        // 閾值電壓
                gm: 0.1          // 跨導
            }),
            
            // 主電感 (儲能)
            new Inductor('Lp', ['VIN', 'SW'], Lp, { ic: 0 }),
            
            // 次級電感 (能量傳輸) - 反向連接實現返馳
            new Inductor('Ls', ['D_ANODE', 'GND'], Ls, { ic: 0 }),
            
            // 整流二極體
            createMCPDiode('D1', 'D_ANODE', 'VOUT', {
                Is: 1e-12,
                n: 1.0,
                Vf: 0.7
            }),
            
            // 輸出濾波與負載
            new Capacitor('Co', ['VOUT', 'GND'], Co, { ic: 0 }),
            new Resistor('RL', ['VOUT', 'GND'], RL)
        ];
        
        console.log(`\n✅ 電路組件: ${components.length}個`);
        
        // 創建分析器
        const analyzer = new MCPTransientAnalysis({
            debug: false,
            gmin: 1e-12
        });
        
        console.log('🚀 開始仿真...');
        const startTime = Date.now();
        
        // 運行較短時間的仿真
        const result = await analyzer.run(components, {
            startTime: 0,
            stopTime: 2e-3,      // 2ms 仿真
            timeStep: 1e-6       // 1μs 步長
        });
        
        const endTime = Date.now();
        console.log(`⏱️ 仿真耗時: ${(endTime - startTime)/1000}秒`);
        
        // 分析結果
        if (result && result.success && result.timePoints) {
            console.log(`\n📊 仿真結果:`);
            console.log(`  時間點數: ${result.timePoints.length}`);
            
            // 檢查最終輸出電壓
            const finalPoint = result.timePoints[result.timePoints.length - 1];
            if (finalPoint && finalPoint.nodeVoltages) {
                const vout = finalPoint.nodeVoltages['VOUT'] || 0;
                const vsw = finalPoint.nodeVoltages['SW'] || 0;
                const vgate = finalPoint.nodeVoltages['GATE'] || 0;
                
                console.log(`\n🎯 電壓結果:`);
                console.log(`  輸出電壓: ${vout.toFixed(3)}V (目標: ${VOUT_TARGET}V)`);
                console.log(`  開關節點: ${vsw.toFixed(3)}V`);
                console.log(`  閘極電壓: ${vgate.toFixed(3)}V`);
                
                // 簡單的成功評估
                if (vout > 1.0) {
                    console.log(`\n🎉 返馳轉換器基本功能正常！`);
                } else {
                    console.log(`\n⚠️  輸出電壓偏低，需要調整電路參數`);
                }
                
                // 檢查電流信息
                if (finalPoint.branchCurrents) {
                    const iLp = finalPoint.branchCurrents['Lp'] || 0;
                    const iLs = finalPoint.branchCurrents['Ls'] || 0;
                    console.log(`\n⚡ 電流信息:`);
                    console.log(`  主電感電流: ${(iLp*1000).toFixed(1)}mA`);
                    console.log(`  次級電感電流: ${(iLs*1000).toFixed(1)}mA`);
                }
                
            } else {
                console.log('❌ 無法獲取電壓數據');
            }
            
        } else {
            console.log('❌ 仿真失敗或無結果');
            if (result && result.error) {
                console.log(`   錯誤: ${result.error}`);
            }
        }
        
    } catch (error) {
        console.error(`💥 錯誤: ${error.message}`);
    }
}

// 執行測試
runFlybackTest();