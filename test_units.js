// 測試單位轉換
import { VoltageSource } from './src/components/sources.js';

function testUnitConversion() {
    console.log('=== 測試單位轉換 ===');
    
    const testSource = new VoltageSource('TEST', ['a', 'b'], 'PULSE(0V 5V 0s 10ns 10ns 5us 10us)', {});
    
    // 直接測試 parseValueWithUnit 方法
    const testCases = [
        '0V', '5V', '0s', '10ns', '5us', '10us',
        '1ms', '1MHz', '1kHz', '100uF'
    ];
    
    testCases.forEach(testCase => {
        try {
            const result = testSource.parseValueWithUnit(testCase);
            console.log(`"${testCase}" -> ${result}`);
        } catch (error) {
            console.error(`解析 "${testCase}" 失敗:`, error.message);
        }
    });
    
    console.log('\n=== PULSE 源配置 ===');
    console.log(JSON.stringify(testSource.sourceConfig, null, 2));
    
    console.log('\n=== 時間測試 ===');
    const testTimes = [0, 2.5e-6, 5e-6, 7.5e-6, 10e-6, 12.5e-6, 15e-6];
    testTimes.forEach(t => {
        const value = testSource.getValue(t);
        console.log(`t=${(t*1e6).toFixed(1)}µs: ${value.toFixed(3)}V`);
    });
}

testUnitConversion();