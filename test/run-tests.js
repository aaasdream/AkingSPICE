/**
 * AkingSPICE 測試主程序
 * 
 * 運行所有測試套件，驗證求解器功能
 */

import { TestRunner } from './test-framework.js';
import { runLinAlgTests } from './test-linalg.js';
import { runComponentTests } from './test-components.js';
import { runCircuitTests } from './test-circuits.js';
import { runParserTests } from './test-parser.js';

/**
 * 主測試程序
 */
async function main() {
    const runner = new TestRunner();
    
    // 添加測試套件
    runner.addSuite('Linear Algebra', runLinAlgTests);
    runner.addSuite('Component Models', runComponentTests);  
    runner.addSuite('Circuit Analysis', runCircuitTests);
    runner.addSuite('Netlist Parser', runParserTests);
    
    // 設置全局初始化和清理
    runner.setGlobalSetup(async () => {
        console.log('Initializing AkingSPICE test environment...');
        // 可以在這裡設置全局測試環境
    });
    
    runner.setGlobalTeardown(async () => {
        console.log('Cleaning up test environment...');
        // 可以在這裡清理資源
    });
    
    // 運行所有測試
    const allPassed = await runner.runAll();
    
    // 設置程序退出碼
    process.exit(allPassed ? 0 : 1);
}

// 捕獲未處理的異常
process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    process.exit(1);
});

// 運行測試
main().catch(error => {
    console.error('Test runner failed:', error);
    process.exit(1);
});