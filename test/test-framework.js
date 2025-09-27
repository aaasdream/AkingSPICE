/**
 * JSSolver-PE 測試框架
 * 
 * 提供單元測試和集成測試功能，驗證求解器的正確性
 */

import chalk from 'chalk';

/**
 * 測試結果類
 */
class TestResult {
    constructor(name) {
        this.name = name;
        this.passed = 0;
        this.failed = 0;
        this.skipped = 0;
        this.errors = [];
        this.warnings = [];
        this.startTime = Date.now();
        this.endTime = null;
    }

    /**
     * 記錄測試通過
     * @param {string} testName 測試名稱
     */
    pass(testName) {
        this.passed++;
        console.log(`  ${chalk.green('✓')} ${testName}`);
    }

    /**
     * 記錄測試失敗
     * @param {string} testName 測試名稱
     * @param {string} error 錯誤信息
     */
    fail(testName, error) {
        this.failed++;
        this.errors.push({ test: testName, error });
        console.log(`  ${chalk.red('✗')} ${testName}`);
        console.log(`    ${chalk.gray(error)}`);
    }

    /**
     * 記錄測試跳過
     * @param {string} testName 測試名稱
     * @param {string} reason 跳過原因
     */
    skip(testName, reason) {
        this.skipped++;
        console.log(`  ${chalk.yellow('○')} ${testName} (${reason})`);
    }

    /**
     * 添加警告
     * @param {string} warning 警告信息
     */
    warn(warning) {
        this.warnings.push(warning);
        console.log(`  ${chalk.yellow('⚠')} ${warning}`);
    }

    /**
     * 完成測試
     */
    finish() {
        this.endTime = Date.now();
    }

    /**
     * 獲取測試摘要
     */
    getSummary() {
        const duration = this.endTime ? (this.endTime - this.startTime) : 0;
        const total = this.passed + this.failed + this.skipped;
        
        return {
            name: this.name,
            total,
            passed: this.passed,
            failed: this.failed,
            skipped: this.skipped,
            successRate: total > 0 ? (this.passed / total * 100).toFixed(1) : 0,
            duration: duration,
            errors: this.errors,
            warnings: this.warnings
        };
    }
}

/**
 * 測試斷言工具
 */
export class Assert {
    /**
     * 檢查值是否為真
     */
    static isTrue(value, message = 'Expected true') {
        if (value !== true) {
            throw new Error(`${message}: got ${value}`);
        }
    }

    /**
     * 檢查值是否為假
     */
    static isFalse(value, message = 'Expected false') {
        if (value !== false) {
            throw new Error(`${message}: got ${value}`);
        }
    }

    /**
     * 檢查值是否相等
     */
    static equal(actual, expected, message = 'Values not equal') {
        if (actual !== expected) {
            throw new Error(`${message}: expected ${expected}, got ${actual}`);
        }
    }

    /**
     * 檢查數值是否接近 (考慮浮點誤差)
     */
    static closeTo(actual, expected, tolerance = 1e-10, message = 'Values not close') {
        const diff = Math.abs(actual - expected);
        if (diff > tolerance) {
            throw new Error(`${message}: expected ${expected} ± ${tolerance}, got ${actual} (diff: ${diff})`);
        }
    }

    /**
     * 檢查數組是否接近
     */
    static arrayCloseTo(actual, expected, tolerance = 1e-10, message = 'Arrays not close') {
        if (!Array.isArray(actual) || !Array.isArray(expected)) {
            throw new Error(`${message}: both values must be arrays`);
        }
        
        if (actual.length !== expected.length) {
            throw new Error(`${message}: array lengths differ (${actual.length} vs ${expected.length})`);
        }
        
        for (let i = 0; i < actual.length; i++) {
            const diff = Math.abs(actual[i] - expected[i]);
            if (diff > tolerance) {
                throw new Error(`${message}: element ${i} differs: expected ${expected[i]} ± ${tolerance}, got ${actual[i]} (diff: ${diff})`);
            }
        }
    }

    /**
     * 檢查是否拋出異常
     */
    static throws(fn, message = 'Expected function to throw') {
        let thrown = false;
        try {
            fn();
        } catch (e) {
            thrown = true;
        }
        
        if (!thrown) {
            throw new Error(message);
        }
    }

    /**
     * 檢查對象是否包含屬性
     */
    static hasProperty(obj, property, message = 'Object does not have property') {
        if (!(property in obj)) {
            throw new Error(`${message}: ${property}`);
        }
    }

    /**
     * 檢查數組長度
     */
    static lengthEqual(array, expectedLength, message = 'Array length not equal') {
        if (array.length !== expectedLength) {
            throw new Error(`${message}: expected ${expectedLength}, got ${array.length}`);
        }
    }
}

/**
 * 測試運行器
 */
export class TestRunner {
    constructor() {
        this.testSuites = [];
        this.globalSetup = null;
        this.globalTeardown = null;
    }

    /**
     * 添加測試套件
     */
    addSuite(name, testFunction) {
        this.testSuites.push({ name, testFunction });
    }

    /**
     * 設置全局初始化
     */
    setGlobalSetup(setupFunction) {
        this.globalSetup = setupFunction;
    }

    /**
     * 設置全局清理
     */
    setGlobalTeardown(teardownFunction) {
        this.globalTeardown = teardownFunction;
    }

    /**
     * 運行所有測試
     */
    async runAll() {
        console.log(chalk.blue.bold('\\n🧪 Running JSSolver-PE Tests\\n'));
        
        const overallStart = Date.now();
        const allResults = [];
        
        try {
            // 執行全局初始化
            if (this.globalSetup) {
                console.log('Running global setup...');
                await this.globalSetup();
            }
            
            // 運行每個測試套件
            for (const suite of this.testSuites) {
                const result = await this.runSuite(suite.name, suite.testFunction);
                allResults.push(result);
            }
            
            // 執行全局清理
            if (this.globalTeardown) {
                console.log('Running global teardown...');
                await this.globalTeardown();
            }
            
        } catch (error) {
            console.error(chalk.red('Global setup/teardown failed:'), error);
        }
        
        // 打印總結
        this.printOverallSummary(allResults, Date.now() - overallStart);
        
        // 返回是否所有測試都通過
        return allResults.every(result => result.failed === 0);
    }

    /**
     * 運行單個測試套件
     */
    async runSuite(name, testFunction) {
        console.log(chalk.cyan.bold(`\\n📋 ${name}`));
        
        const result = new TestResult(name);
        
        try {
            // 創建測試上下文
            const context = this.createTestContext(result);
            
            // 執行測試函數
            await testFunction(context);
            
        } catch (error) {
            result.fail('Suite execution', error.message);
        }
        
        result.finish();
        return result.getSummary();
    }

    /**
     * 創建測試上下文
     */
    createTestContext(result) {
        return {
            /**
             * 執行單個測試
             */
            test: async (name, testFunction) => {
                try {
                    await testFunction();
                    result.pass(name);
                } catch (error) {
                    result.fail(name, error.message);
                }
            },
            
            /**
             * 跳過測試
             */
            skip: (name, reason = 'Skipped') => {
                result.skip(name, reason);
            },
            
            /**
             * 添加警告
             */
            warn: (message) => {
                result.warn(message);
            },
            
            // 斷言工具
            assert: Assert,
            
            // 實用工具
            setTimeout: (ms) => new Promise(resolve => setTimeout(resolve, ms))
        };
    }

    /**
     * 打印總體測試摘要
     */
    printOverallSummary(results, totalDuration) {
        console.log(chalk.blue.bold('\\n📊 Test Summary'));
        console.log('='.repeat(50));
        
        let totalPassed = 0;
        let totalFailed = 0;
        let totalSkipped = 0;
        
        for (const result of results) {
            const status = result.failed === 0 ? 
                chalk.green('PASS') : 
                chalk.red('FAIL');
                
            console.log(`${status} ${result.name}: ${result.passed}/${result.total} passed (${result.duration}ms)`);
            
            totalPassed += result.passed;
            totalFailed += result.failed;
            totalSkipped += result.skipped;
        }
        
        console.log('='.repeat(50));
        
        const totalTests = totalPassed + totalFailed + totalSkipped;
        const successRate = totalTests > 0 ? (totalPassed / totalTests * 100).toFixed(1) : 0;
        
        console.log(`Total: ${totalTests} tests`);
        console.log(`${chalk.green('Passed:')} ${totalPassed}`);
        console.log(`${chalk.red('Failed:')} ${totalFailed}`);
        console.log(`${chalk.yellow('Skipped:')} ${totalSkipped}`);
        console.log(`Success rate: ${successRate}%`);
        console.log(`Total time: ${totalDuration}ms`);
        
        // 顯示錯誤詳情
        const allErrors = results.flatMap(r => r.errors);
        if (allErrors.length > 0) {
            console.log(chalk.red.bold('\\n❌ Failed Tests:'));
            allErrors.forEach((error, index) => {
                console.log(`${index + 1}. ${error.test}: ${error.error}`);
            });
        }
        
        // 顯示警告
        const allWarnings = results.flatMap(r => r.warnings);
        if (allWarnings.length > 0) {
            console.log(chalk.yellow.bold('\\n⚠️  Warnings:'));
            allWarnings.forEach((warning, index) => {
                console.log(`${index + 1}. ${warning}`);
            });
        }
        
        const finalStatus = totalFailed === 0 ? 
            chalk.green.bold('\\n✅ All tests passed!') :
            chalk.red.bold(`\\n❌ ${totalFailed} test(s) failed!`);
            
        console.log(finalStatus);
        console.log('');
    }
}