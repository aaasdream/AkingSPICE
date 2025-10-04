/**
 * AkingSPICE v2.0 - 返馳式變換器 (Flyback Converter) 模擬範例 - CommonJS版本
 */

const path = require('path');
const srcDir = path.join(__dirname, 'src');

// 使用 CommonJS 導入
const { createPowerElectronicsEnvironment, MultiWindingTransformer } = require(path.join(srcDir, 'index.js'));

// -------------------------------------------------
// 1. 模擬參數定義
// -------------------------------------------------
console.log('--- 返馳變換器模擬參數 ---');
const params = {
    // 電源參數
    inputVoltage: 24,       // 輸入電壓 (V)

    // 控制參數
    switchingFrequency: 100e3, // 開關頻率 (100 kHz)
    dutyCycle: 0.33,          // 佔空比 (D)

    // 核心元件參數
    primaryInductance: 50e-6, // 主線圈電感 (50 uH)
    turnsRatio: 1,            // 匝數比 Np/Ns = 1
    couplingFactor: 0.99,     // 耦合係數 (k)

    // 輸出參數
    outputCapacitance: 220e-6,// 輸出電容 (220 uF)
    loadResistance: 12,       // 負載電阻 (Ω)

    // 模擬時間參數
    simulationTime: 1e-3,     // 總模擬時間 (1 ms, 約100個開關週期)
    timeStep: 100e-9,         // 時間步長 (100 ns)
};

// 根據參數計算次級電感和預期輸出電壓
params.secondaryInductance = params.primaryInductance * Math.pow(1 / params.turnsRatio, 2);
params.expectedOutputVoltage = params.inputVoltage * (params.dutyCycle / (1 - params.dutyCycle)) * (1 / params.turnsRatio);

console.log(`輸入電壓: ${params.inputVoltage}V`);
console.log(`開關頻率: ${params.switchingFrequency / 1e3}kHz`);
console.log(`佔空比: ${params.dutyCycle * 100}%`);
console.log(`預期輸出電壓 (理想): ${params.expectedOutputVoltage.toFixed(2)}V`);
console.log('--------------------------------\n');

// -------------------------------------------------
// 2. 創建電力電子模擬環境
// -------------------------------------------------
console.log('⚡ 正在創建電力電子模擬環境...');

try {
    const pe = createPowerElectronicsEnvironment({ 
        debug: false,      
        lcpDebug: false,
        mcp: { gmin: 1e-12 }
    });

    console.log('✅ 環境創建成功');
    console.log('⚡ 正在建立電路元件...');

    // -------------------------------------------------
    // 3. 創建電路元件
    // -------------------------------------------------

    // 基本元件
    const components = [
        // 輸入直流電壓源
        pe.components.V('VIN_SRC', 'VIN', '0', params.inputVoltage),

        // 主開關 MOSFET (NMOS)
        pe.components.nmos('M1', 'sw_drain', '0', 'gate'),

        // 次級快速恢復二極體
        pe.components.fastDiode('D1', 'diode_anode', 'VOUT', { Vf: 0.8 }),

        // 輸出濾波電容和負載
        pe.components.C('COUT', 'VOUT', '0', params.outputCapacitance),
        pe.components.R('RLOAD', 'VOUT', '0', params.loadResistance),
    ];

    console.log(`✅ 基本元件創建完成: ${components.length} 個`);

    // 變壓器 (耦合電感) - 簡化版本使用兩個獨立電感
    const primaryInductor = pe.components.L('Lp', 'VIN', 'sw_drain', params.primaryInductance);
    const secondaryInductor = pe.components.L('Ls', '0', 'diode_anode', params.secondaryInductance);
    
    components.push(primaryInductor, secondaryInductor);

    console.log(`✅ 電路建立完成，共 ${components.length} 個元件。\n`);

    // PWM 控制器
    const pwm = pe.components.pwm(params.switchingFrequency, params.dutyCycle);
    console.log('✅ PWM 控制器創建完成');

    // 將 PWM 控制器與 MOSFET 關聯
    const mosfet = components.find(c => c.name === 'M1');
    if (mosfet && mosfet.setPWMController) {
        mosfet.setPWMController(pwm);
        console.log('✅ PWM 控制器已關聯到 MOSFET');
    } else {
        console.log('⚠️  MOSFET 不支援 PWM 控制，將使用固定電壓源代替');
        // 添加固定的閘極驅動電壓源
        components.push(pe.components.V('VGATE', 'gate', '0', {
            type: 'PULSE',
            v1: 0,
            v2: 12,
            td: 0,
            tr: 10e-9,
            tf: 10e-9,
            pw: params.dutyCycle / params.switchingFrequency,
            per: 1 / params.switchingFrequency
        }));
        console.log('✅ 添加了脈衝電壓源作為閘極驅動');
    }

    // -------------------------------------------------
    // 4. 執行 MCP 瞬態分析
    // -------------------------------------------------
    async function runSimulation() {
        console.log('🚀 開始 MCP 瞬態分析...');
        const startTime = Date.now();

        try {
            const result = await pe.mcpTransient.run(components, {
                startTime: 0,
                stopTime: params.simulationTime,
                timeStep: params.timeStep,
            });

            const endTime = Date.now();
            console.log(`\n✅ 模擬完成！耗時: ${endTime - startTime} ms`);
            
            // -------------------------------------------------
            // 5. 處理並顯示結果
            // -------------------------------------------------
            if (result && result.timePoints && result.timePoints.length > 0) {
                console.log('\n--- 模擬結果 ---');
                console.log(`模擬總點數: ${result.timePoints.length}`);
                console.log(`預期輸出電壓: ${params.expectedOutputVoltage.toFixed(3)} V`);
                
                // 嘗試獲取輸出電壓
                const lastPoint = result.timePoints[result.timePoints.length - 1];
                if (lastPoint && lastPoint.nodeVoltages && lastPoint.nodeVoltages['VOUT'] !== undefined) {
                    console.log(`最終輸出電壓: ${lastPoint.nodeVoltages['VOUT'].toFixed(3)} V`);
                } else {
                    console.log('⚠️  無法取得輸出電壓數據');
                }
                
            } else {
                console.error('❌ 模擬未產生任何結果。');
            }

        } catch (error) {
            console.error('❌ 模擬過程中發生錯誤:', error.message);
            if (error.stack) {
                console.error('錯誤堆疊:', error.stack);
            }
        }
    }

    // 運行模擬
    runSimulation().catch(console.error);

} catch (error) {
    console.error('❌ 環境創建失敗:', error.message);
    if (error.stack) {
        console.error('錯誤堆疊:', error.stack);
    }
}