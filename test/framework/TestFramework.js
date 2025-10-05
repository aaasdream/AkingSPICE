/**
 * AkingSPICE 測試框架
 * 
 * 提供統一的測試結構、斷言功能和結果報告
 */

export class TestFramework {
    constructor() {
        this.tests = [];
        this.results = {};
        this.currentSuite = null;
        this.verbose = true;
    }

    /**
     * 創建測試套件
     * @param {string} suiteName 測試套件名稱
     * @param {Function} testFunction 測試函數
     */
    describe(suiteName, testFunction) {
        this.currentSuite = suiteName;
        this.results[suiteName] = { tests: [], passed: 0, failed: 0, errors: [] };
        
        if (this.verbose) {
            console.log(`\n📋 測試套件: ${suiteName}`);
        }
        
        try {
            testFunction();
        } catch (error) {
            this.results[suiteName].errors.push({
                type: 'suite_error',
                message: error.message,
                stack: error.stack
            });
        }
    }

    /**
     * 定義單個測試案例
     * @param {string} testName 測試名稱
     * @param {Function} testFunction 測試函數
     */
    it(testName, testFunction) {
        const suite = this.currentSuite;
        if (!suite) {
            throw new Error('測試必須在 describe() 塊內定義');
        }

        this.results[suite].tests.push(testName);

        return {
            run: async () => {
                try {
                    if (this.verbose) {
                        console.log(`  🔍 執行: ${testName}`);
                    }

                    await testFunction();
                    
                    this.results[suite].passed++;
                    if (this.verbose) {
                        console.log(`    ✅ 通過: ${testName}`);
                    }
                    return true;

                } catch (error) {
                    this.results[suite].failed++;
                    this.results[suite].errors.push({
                        test: testName,
                        message: error.message,
                        stack: error.stack
                    });

                    if (this.verbose) {
                        console.log(`    ❌ 失敗: ${testName}`);
                        console.log(`       錯誤: ${error.message}`);
                    }
                    return false;
                }
            }
        };
    }

    /**
     * 斷言函數集合
     */
    assert = {
        /**
         * 斷言值為真
         */
        isTrue: (value, message = '預期值為 true') => {
            if (value !== true) {
                throw new Error(`${message}, 但得到: ${value}`);
            }
        },

        /**
         * 斷言值為假
         */
        isFalse: (value, message = '預期值為 false') => {
            if (value !== false) {
                throw new Error(`${message}, 但得到: ${value}`);
            }
        },

        /**
         * 斷言相等
         */
        equal: (actual, expected, message = '預期值相等') => {
            if (actual !== expected) {
                throw new Error(`${message}, 預期: ${expected}, 實際: ${actual}`);
            }
        },

        /**
         * 斷言近似相等 (用於浮點數比較)
         */
        approximately: (actual, expected, tolerance = 1e-6, message = '預期值近似相等') => {
            const diff = Math.abs(actual - expected);
            if (diff > tolerance) {
                throw new Error(`${message}, 預期: ${expected}, 實際: ${actual}, 誤差: ${diff}, 容差: ${tolerance}`);
            }
        },

        /**
         * 斷言存在 (不為 null 或 undefined)
         */
        exists: (value, message = '預期值存在') => {
            if (value === null || value === undefined) {
                throw new Error(`${message}, 但得到: ${value}`);
            }
        },

        /**
         * 斷言為數字
         */
        isNumber: (value, message = '預期值為數字') => {
            if (typeof value !== 'number' || isNaN(value)) {
                throw new Error(`${message}, 但得到: ${value} (類型: ${typeof value})`);
            }
        },

        /**
         * 斷言陣列長度
         */
        arrayLength: (array, expectedLength, message = '預期陣列長度') => {
            if (!Array.isArray(array)) {
                throw new Error(`${message}, 但得到非陣列: ${array}`);
            }
            if (array.length !== expectedLength) {
                throw new Error(`${message}: ${expectedLength}, 實際: ${array.length}`);
            }
        },

        /**
         * 斷言拋出錯誤
         */
        throws: async (fn, expectedMessage = null, message = '預期拋出錯誤') => {
            try {
                await fn();
                throw new Error(`${message}, 但函數正常執行完成`);
            } catch (error) {
                if (expectedMessage && !error.message.includes(expectedMessage)) {
                    throw new Error(`${message} 包含 "${expectedMessage}", 但得到: "${error.message}"`);
                }
            }
        },

        /**
         * 斷言 Map 包含鍵值
         */
        mapHasKey: (map, key, message = '預期 Map 包含鍵') => {
            if (!(map instanceof Map)) {
                throw new Error(`${message}, 但得到非 Map: ${map}`);
            }
            if (!map.has(key)) {
                throw new Error(`${message}: "${key}", 但 Map 只包含: [${Array.from(map.keys()).join(', ')}]`);
            }
        },

        /**
         * 斷言電壓值合理 (電子電路中的典型值)
         */
        reasonableVoltage: (voltage, maxVoltage = 1000, message = '預期合理電壓值') => {
            if (typeof voltage !== 'number' || isNaN(voltage)) {
                throw new Error(`${message}, 但得到非數字: ${voltage}`);
            }
            if (Math.abs(voltage) > maxVoltage) {
                throw new Error(`${message} (< ${maxVoltage}V), 但得到: ${voltage}V`);
            }
        },

        /**
         * 斷言電流值合理
         */
        reasonableCurrent: (current, maxCurrent = 100, message = '預期合理電流值') => {
            if (typeof current !== 'number' || isNaN(current)) {
                throw new Error(`${message}, 但得到非數字: ${current}`);
            }
            if (Math.abs(current) > maxCurrent) {
                throw new Error(`${message} (< ${maxCurrent}A), 但得到: ${current}A`);
            }
        }
    };

    /**
     * 工具函數集合
     */
    utils = {
        /**
         * 創建簡單的 RC 電路組件
         */
        createRCCircuit: (Vdc = 5, R = 1000, C = 1e-6) => {
            const { VoltageSource, Resistor, Capacitor } = require('../src/index.js');
            return [
                new VoltageSource('V1', ['vin', 'gnd'], Vdc),
                new Resistor('R1', ['vin', 'vout'], R),
                new Capacitor('C1', ['vout', 'gnd'], C)
            ];
        },

        /**
         * 等待指定時間 (用於異步測試)
         */
        sleep: (ms) => {
            return new Promise(resolve => setTimeout(resolve, ms));
        },

        /**
         * 生成測試數據
         */
        generateSineWave: (amplitude = 1, frequency = 1, samples = 100, duration = 1) => {
            const data = [];
            const dt = duration / samples;
            for (let i = 0; i < samples; i++) {
                const t = i * dt;
                data.push({
                    time: t,
                    value: amplitude * Math.sin(2 * Math.PI * frequency * t)
                });
            }
            return data;
        }
    };

    /**
     * 運行所有測試
     */
    async runAllTests() {
        console.log(`\n🚀 開始執行 AkingSPICE 測試套件`);
        console.log(`測試套件數量: ${Object.keys(this.results).length}`);

        let allTestsRun = [];

        // 收集所有測試
        for (const [suiteName, suiteData] of Object.entries(this.results)) {
            for (const testName of suiteData.tests) {
                // 測試實際運行需要在具體的測試文件中處理
                // 這裡我們只是準備框架
            }
        }

        await this.generateReport();
        return this.getOverallResults();
    }

    /**
     * 生成測試報告
     */
    async generateReport() {
        console.log('\n' + '='.repeat(80));
        console.log('📊 AkingSPICE 測試結果報告');
        console.log('='.repeat(80));

        let totalPassed = 0;
        let totalFailed = 0;
        let totalTests = 0;

        for (const [suiteName, result] of Object.entries(this.results)) {
            console.log(`\n📋 ${suiteName}:`);
            console.log(`  ✅ 通過: ${result.passed}`);
            console.log(`  ❌ 失敗: ${result.failed}`);
            console.log(`  📊 總計: ${result.passed + result.failed}`);

            if (result.errors.length > 0) {
                console.log(`  🚨 錯誤詳情:`);
                for (const error of result.errors) {
                    if (error.test) {
                        console.log(`    - ${error.test}: ${error.message}`);
                    } else {
                        console.log(`    - 套件錯誤: ${error.message}`);
                    }
                }
            }

            totalPassed += result.passed;
            totalFailed += result.failed;
            totalTests += result.passed + result.failed;
        }

        console.log('\n' + '='.repeat(80));
        console.log('📈 總體統計:');
        console.log(`✅ 通過: ${totalPassed}/${totalTests} (${((totalPassed/totalTests)*100).toFixed(1)}%)`);
        console.log(`❌ 失敗: ${totalFailed}/${totalTests} (${((totalFailed/totalTests)*100).toFixed(1)}%)`);

        if (totalFailed === 0) {
            console.log('\n🎉 所有測試通過！AkingSPICE 功能正常。');
        } else {
            console.log('\n⚠️  存在測試失敗，需要檢查相關功能。');
        }

        console.log('='.repeat(80));
    }

    /**
     * 獲取總體測試結果
     */
    getOverallResults() {
        let totalPassed = 0;
        let totalFailed = 0;

        for (const result of Object.values(this.results)) {
            totalPassed += result.passed;
            totalFailed += result.failed;
        }

        return {
            passed: totalPassed,
            failed: totalFailed,
            total: totalPassed + totalFailed,
            success: totalFailed === 0
        };
    }
}

// 創建全局測試實例
export const testFramework = new TestFramework();

// 導出便利函數
export const { describe, it, assert, utils } = testFramework;