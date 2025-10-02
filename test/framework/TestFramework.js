/**
 * AkingSPICE 模組化測試框架
 * 支援散檔案掛勾，無需修改主測試檔案
 */

class TestFramework {
    constructor() {
        this.testSuites = new Map();
        this.results = {
            total: 0,
            passed: 0,
            failed: 0,
            errors: [],
            suites: []
        };
        this.config = {
            verbose: true,
            stopOnFirstError: false,
            timeout: 30000
        };
    }

    /**
     * 註冊測試套件 - 供外部檔案掛勾使用
     * @param {string} suiteName - 測試套件名稱
     * @param {Function} setupFn - 設定函數
     * @param {Object} tests - 測試案例物件
     */
    registerTestSuite(suiteName, setupFn, tests) {
        if (this.testSuites.has(suiteName)) {
            throw new Error(`Test suite '${suiteName}' already registered`);
        }

        this.testSuites.set(suiteName, {
            name: suiteName,
            setup: setupFn,
            tests: tests,
            registered: new Date()
        });

        if (this.config.verbose) {
            console.log(`✓ Registered test suite: ${suiteName}`);
        }
    }

    /**
     * 執行單一測試案例
     */
    async runTest(testName, testFn, context = {}) {
        try {
            const startTime = Date.now();

            // 設定測試超時
            const timeoutPromise = new Promise((_, reject) => {
                setTimeout(() => reject(new Error(`Test timeout: ${testName}`)), this.config.timeout);
            });

            // 執行測試
            await Promise.race([testFn(context), timeoutPromise]);

            const duration = Date.now() - startTime;

            this.results.passed++;
            if (this.config.verbose) {
                console.log(`  ✓ ${testName} (${duration}ms)`);
            }

            return { success: true, duration, error: null };
        } catch (error) {
            this.results.failed++;
            this.results.errors.push({
                test: testName,
                error: error.message,
                stack: error.stack
            });

            if (this.config.verbose) {
                console.error(`  ✗ ${testName}: ${error.message}`);
            }

            return { success: false, duration: 0, error };
        }
    }

    /**
     * 執行測試套件
     */
    async runTestSuite(suiteName) {
        const suite = this.testSuites.get(suiteName);
        if (!suite) {
            throw new Error(`Test suite '${suiteName}' not found`);
        }

        console.log(`\n🧪 Running test suite: ${suiteName}`);

        const suiteResults = {
            name: suiteName,
            passed: 0,
            failed: 0,
            tests: []
        };

        try {
            // 執行設定函數
            const context = suite.setup ? await suite.setup() : {};

            // 執行所有測試
            for (const [testName, testFn] of Object.entries(suite.tests)) {
                this.results.total++;
                const result = await this.runTest(testName, testFn, context);

                suiteResults.tests.push({
                    name: testName,
                    ...result
                });

                if (result.success) {
                    suiteResults.passed++;
                } else {
                    suiteResults.failed++;
                    if (this.config.stopOnFirstError) {
                        break;
                    }
                }
            }
        } catch (error) {
            console.error(`Setup failed for suite ${suiteName}:`, error.message);
            suiteResults.setupError = error.message;
        }

        this.results.suites.push(suiteResults);
        return suiteResults;
    }

    /**
     * 執行所有註冊的測試套件
     */
    async runAllTests() {
        console.log(`\n🚀 Starting AkingSPICE Test Framework`);
        console.log(`📊 Found ${this.testSuites.size} test suites`);

        this.results = {
            total: 0,
            passed: 0,
            failed: 0,
            errors: [],
            suites: []
        };

        const startTime = Date.now();

        for (const suiteName of this.testSuites.keys()) {
            await this.runTestSuite(suiteName);
        }

        const totalDuration = Date.now() - startTime;

        // 輸出測試報告
        this.printSummary(totalDuration);

        return this.results;
    }

    /**
     * 列印測試摘要
     */
    printSummary(duration) {
        console.log(`\n📋 Test Summary`);
        console.log('='.repeat(50));
        console.log(`Total Tests: ${this.results.total}`);
        console.log(`✓ Passed: ${this.results.passed}`);
        console.log(`✗ Failed: ${this.results.failed}`);
        console.log(`⏱ Duration: ${duration}ms`);

        if (this.results.failed > 0) {
            console.log(`\n❌ Failed Tests:`);
            this.results.errors.forEach((error, index) => {
                console.log(`${index + 1}. ${error.test}`);
                console.log(`   Error: ${error.error}`);
            });
        }

        console.log(`\n🏆 Test Result: ${this.results.failed === 0 ? 'PASS' : 'FAIL'}`);
    }

    /**
     * 設定框架選項
     */
    configure(options) {
        this.config = { ...this.config, ...options };
    }

    /**
     * 清除所有註冊的測試套件
     */
    clearTestSuites() {
        this.testSuites.clear();
    }

    /**
     * 取得測試統計資訊
     */
    getStats() {
        return {
            suiteCount: this.testSuites.size,
            results: { ...this.results }
        };
    }
}

// 建立全域測試框架實例
const testFramework = new TestFramework();

// 導出便利函數
export function registerTest(suiteName, setupFn, tests) {
    testFramework.registerTestSuite(suiteName, setupFn, tests);
}

export function runTests() {
    return testFramework.runAllTests();
}

export function configure(options) {
    testFramework.configure(options);
}

export { testFramework as TestFramework };

// 便利的斷言函數
export const assert = {
    equal: (actual, expected, message = '') => {
        if (actual !== expected) {
            throw new Error(`Assertion failed: ${message}\nExpected: ${expected}\nActual: ${actual}`);
        }
    },

    notEqual: (actual, expected, message = '') => {
        if (actual === expected) {
            throw new Error(`Assertion failed: ${message}\nExpected not: ${expected}\nActual: ${actual}`);
        }
    },

    approximately: (actual, expected, tolerance = 1e-10, message = '') => {
        if (Math.abs(actual - expected) > tolerance) {
            throw new Error(`Assertion failed: ${message}\nExpected: ${expected} ± ${tolerance}\nActual: ${actual}`);
        }
    },

    isTrue: (value, message = '') => {
        if (value !== true) {
            throw new Error(`Assertion failed: ${message}\nExpected: true\nActual: ${value}`);
        }
    },

    isFalse: (value, message = '') => {
        if (value !== false) {
            throw new Error(`Assertion failed: ${message}\nExpected: false\nActual: ${value}`);
        }
    },

    throws: async (fn, expectedError = null, message = '') => {
        try {
            await fn();
            throw new Error(`Assertion failed: ${message}\nExpected function to throw`);
        } catch (error) {
            if (expectedError && !error.message.includes(expectedError)) {
                throw new Error(`Assertion failed: ${message}\nExpected error containing: ${expectedError}\nActual error: ${error.message}`);
            }
        }
    }
};