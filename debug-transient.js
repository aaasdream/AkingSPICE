/**
 * 暫態分析解析測試
 */

import { TransientUtils } from './src/analysis/transient.js';

console.log('=== Transient Analysis Command Parsing Test ===');

const testCommands = [
    '.tran 1us 5ms',
    '.tran 1ns 1ms',
    '.tran 1ms 50ms',
    '.TRAN 10us 2ms'
];

testCommands.forEach(cmd => {
    console.log(`\nTesting: "${cmd}"`);
    try {
        const result = TransientUtils.parseTranCommand(cmd);
        console.log('✓ Success:', result);
    } catch (error) {
        console.log('✗ Error:', error.message);
    }
});