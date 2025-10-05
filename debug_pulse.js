// 調試 PULSE 源解析問題
import { VoltageSource } from './src/components/sources.js';

function debugPulseSource() {
    console.log('=== 調試 PULSE 源解析 ===');
    
    const originalSource = 'PULSE(0V 5V 0s 10ns 10ns 5us 10us)';
    console.log('原始輸入:', originalSource);
    
    try {
        const voltageSource = new VoltageSource('VDRIVE', ['drive', '0'], originalSource, {});
        console.log('解析的源配置:', JSON.stringify(voltageSource.sourceConfig, null, 2));
        
        // 測試手動清理版本
        const cleanSource = 'PULSE(0 5 0 10e-9 10e-9 5e-6 10e-6)';
        console.log('\n手動清理版本:', cleanSource);
        
        const cleanVoltageSource = new VoltageSource('VDRIVE_CLEAN', ['drive', '0'], cleanSource, {});
        console.log('清理版本解析:', JSON.stringify(cleanVoltageSource.sourceConfig, null, 2));
        
        // 測試時間點
        console.log('\n時間測試 (清理版本):');
        const testTimes = [0, 2.5e-6, 5e-6, 7.5e-6, 10e-6, 12.5e-6];
        testTimes.forEach(t => {
            const value = cleanVoltageSource.getValue(t);
            console.log(`t=${(t*1e6).toFixed(1)}µs: ${value.toFixed(3)}V`);
        });
        
    } catch (error) {
        console.error('解析錯誤:', error.message);
        console.error('錯誤堆疊:', error.stack);
    }
}

// 測試正則表達式
function testRegexPatterns() {
    console.log('\n=== 測試 PULSE 正則表達式 ===');
    
    const testCases = [
        'PULSE(0V 5V 0s 10ns 10ns 5us 10us)',
        'PULSE(0 5 0 10e-9 10e-9 5e-6 10e-6)',
        'pulse(0v 5v 0s 10ns 10ns 5us 10us)',
        'PULSE(0.0 5.0 0.0 1e-8 1e-8 5e-6 1e-5)'
    ];
    
    // 原始的正則表達式
    const originalRegex = /^PULSE\(\s*([-\d.]+(?:[eE][-+]?\d+)?)\s+([-\d.]+(?:[eE][-+]?\d+)?)\s*([-\d.]+(?:[eE][-+]?\d+)?)?\s*([-\d.]+(?:[eE][-+]?\d+)?)?\s*([-\d.]+(?:[eE][-+]?\d+)?)?\s*([-\d.]+(?:[eE][-+]?\d+)?)?\s*([-\d.]+(?:[eE][-+]?\d+)?)?\s*\)$/;
    
    // 修正的正則表達式（支持單位）
    const improvedRegex = /^PULSE\(\s*([-\d.]+(?:[eE][-+]?\d+)?)[VvAaMmUuNnPp]*\s+([-\d.]+(?:[eE][-+]?\d+)?)[VvAaMmUuNnPp]*\s*([-\d.]+(?:[eE][-+]?\d+)?[SsMmUuNnPp]*\s*)?\s*([-\d.]+(?:[eE][-+]?\d+)?[SsMmUuNnPp]*\s*)?\s*([-\d.]+(?:[eE][-+]?\d+)?[SsMmUuNnPp]*\s*)?\s*([-\d.]+(?:[eE][-+]?\d+)?[SsMmUuNnPp]*\s*)?\s*([-\d.]+(?:[eE][-+]?\d+)?[SsMmUuNnPp]*\s*)?\s*\)$/;
    
    testCases.forEach(testCase => {
        const upperCase = testCase.toUpperCase();
        
        console.log(`\n測試: "${testCase}"`);
        console.log(`大寫: "${upperCase}"`);
        
        const originalMatch = upperCase.match(originalRegex);
        console.log('原始匹配:', originalMatch ? '✓ 成功' : '✗ 失敗');
        if (originalMatch) {
            console.log('  參數:', originalMatch.slice(1));
        }
        
        const improvedMatch = upperCase.match(improvedRegex);
        console.log('改進匹配:', improvedMatch ? '✓ 成功' : '✗ 失敗');
        if (improvedMatch) {
            console.log('  參數:', improvedMatch.slice(1));
        }
    });
}

debugPulseSource();
testRegexPatterns();