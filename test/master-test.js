#!/usr/bin/env node

/**
 * AkingSPICE 主要測試執行器
 * 
 * 這個檔案是所有測試的統一入口點
 * 所有新功能測試都應該掛勾到這個檔案，而不需要修改這個檔案本身
 * 
 * 使用方式：
 * - Node.js: node master-test.js
 * - 瀏覽器: 直接引入並執行 runMasterTest()
 */

import { runTests, configure } from './framework/TestFramework.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 設定測試框架
configure({
    verbose: true,
    stopOnFirstError: false,
    timeout: 30000
});

/**
 * 自動載入所有測試檔案
 * 掃描 test/ 目錄下所有 test-*.js 檔案並自動載入
 */
async function autoLoadTests() {
    console.log('🔍 Auto-loading test files...');

    const testDir = __dirname;
    const testFiles = [];

    // 遞迴掃描測試檔案
    function scanDirectory(dir) {
        const items = fs.readdirSync(dir);

        for (const item of items) {
            const fullPath = join(dir, item);
            const stat = fs.statSync(fullPath);

            if (stat.isDirectory() && item !== 'framework' && item !== 'node_modules') {
                scanDirectory(fullPath);
            } else if (stat.isFile() && item.match(/^test-.*\.js$/)) {
                testFiles.push(fullPath);
            }
        }
    }

    scanDirectory(testDir);

    console.log(`📁 Found ${testFiles.length} test files:`);
    testFiles.forEach(file => {
        const relativePath = file.replace(__dirname + '\\', '').replace(/\\/g, '/');
        console.log(`   - ${relativePath}`);
    });

    // 動態載入所有測試檔案
    for (const testFile of testFiles) {
        try {
            const relativePath = './' + testFile.replace(__dirname + '\\', '').replace(/\\/g, '/');
            await import(relativePath);
            console.log(`✓ Loaded: ${relativePath}`);
        } catch (error) {
            console.error(`✗ Failed to load ${testFile}:`, error.message);
        }
    }
}

/**
 * 執行環境檢查
 */
function checkEnvironment() {
    const env = {
        platform: process?.platform || 'browser',
        nodeVersion: process?.version || 'N/A',
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'N/A'
    };

    console.log('🔧 Environment Check:');
    console.log(`   Platform: ${env.platform}`);
    console.log(`   Node.js: ${env.nodeVersion}`);

    if (env.platform === 'browser') {
        console.log(`   Browser: ${env.userAgent}`);
    }

    return env;
}

/**
 * 執行核心功能檢查
 */
async function coreSystemCheck() {
    console.log('⚙️  Core System Check...');

    const checks = {
        moduleSystem: false,
        mathFunctions: false,
        arrayOperations: false,
        timePerformance: false
    };

    try {
        // 檢查 ES6 模組系統
        checks.moduleSystem = true;

        // 檢查數學函數
        const testMath = Math.sin(Math.PI / 2);
        checks.mathFunctions = Math.abs(testMath - 1) < 1e-10;

        // 檢查陣列操作
        const testArray = new Float64Array(1000);
        testArray.fill(1.0);
        const sum = testArray.reduce((a, b) => a + b, 0);
        checks.arrayOperations = sum === 1000;

        // 檢查效能測試
        const start = performance.now ? performance.now() : Date.now();
        for (let i = 0; i < 10000; i++) {
            Math.sqrt(i);
        }
        const end = performance.now ? performance.now() : Date.now();
        checks.timePerformance = (end - start) >= 0;

    } catch (error) {
        console.error('Core system check failed:', error.message);
    }

    console.log('   Results:');
    Object.entries(checks).forEach(([check, passed]) => {
        console.log(`   ${passed ? '✓' : '✗'} ${check}`);
    });

    const allPassed = Object.values(checks).every(Boolean);
    if (!allPassed) {
        throw new Error('Core system checks failed');
    }
}

/**
 * 主要測試執行函數
 */
export async function runMasterTest() {
    console.log('🚀 AkingSPICE Master Test Runner');
    console.log('='.repeat(50));

    try {
        // 環境檢查
        const env = checkEnvironment();

        // 核心系統檢查
        await coreSystemCheck();

        // 自動載入測試檔案
        await autoLoadTests();

        // 執行所有測試
        console.log('\n🧪 Starting Test Execution...');
        const results = await runTests();

        // 產生報告
        console.log('\n📊 Generating Test Report...');

        const report = {
            timestamp: new Date().toISOString(),
            environment: env,
            results: results,
            summary: {
                totalSuites: results.suites.length,
                totalTests: results.total,
                passed: results.passed,
                failed: results.failed,
                successRate: results.total > 0 ? (results.passed / results.total * 100).toFixed(2) + '%' : 'N/A'
            }
        };

        // 儲存測試報告 (僅在 Node.js 環境)
        if (typeof process !== 'undefined') {
            const reportPath = join(__dirname, '../test-report.json');
            fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
            console.log(`📄 Report saved to: ${reportPath}`);
        }

        // 最終結果
        console.log('\n' + '='.repeat(50));
        console.log(`🎯 Final Result: ${results.failed === 0 ? '✅ ALL TESTS PASSED' : '❌ SOME TESTS FAILED'}`);
        console.log(`📈 Success Rate: ${report.summary.successRate}`);

        // 如果有測試失敗，返回錯誤代碼 (Node.js 環境)
        if (typeof process !== 'undefined' && results.failed > 0) {
            process.exit(1);
        }

        return results;

    } catch (error) {
        console.error('\n💥 Master test execution failed:', error.message);
        console.error(error.stack);

        if (typeof process !== 'undefined') {
            process.exit(1);
        }

        throw error;
    }
}

/**
 * 如果直接執行此檔案，則啟動測試
 */
if (import.meta.url === new URL(process.argv[1], 'file:').href) {
    runMasterTest().catch(error => {
        console.error('Failed to run master test:', error);
        process.exit(1);
    });
}

export default runMasterTest;