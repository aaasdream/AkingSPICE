#!/usr/bin/env node

/**
 * JavaScript 自動調試測試腳本
 * 可以在 Node.js 環境中運行
 */

class NodeDebugLogger {
    constructor() {
        this.colors = {
            reset: '\x1b[0m',
            bright: '\x1b[1m',
            red: '\x1b[31m',
            green: '\x1b[32m',
            yellow: '\x1b[33m',
            blue: '\x1b[34m',
            cyan: '\x1b[36m'
        };
        this.setupErrorHandling();
    }

    // 設置全局錯誤處理
    setupErrorHandling() {
        process.on('uncaughtException', (error) => {
            this.logError(`未捕獲的異常: ${error.message}`, error.stack);
            process.exit(1);
        });

        process.on('unhandledRejection', (reason, promise) => {
            this.logError(`未處理的Promise拒絕: ${reason}`);
        });
    }

    // 記錄訊息
    log(message, type = 'INFO') {
        const timestamp = new Date().toLocaleTimeString();
        const color = this.getColor(type);
        console.log(`${color}[${timestamp}] ${type}:${this.colors.reset} ${message}`);
    }

    // 記錄錯誤
    logError(message, stack = '') {
        const timestamp = new Date().toLocaleTimeString();
        console.error(`${this.colors.red}[${timestamp}] ERROR:${this.colors.reset} ${message}`);
        if (stack) {
            console.error(`${this.colors.red}堆疊追踪:${this.colors.reset}\n${stack}`);
        }
    }

    // 記錄成功
    logSuccess(message) {
        this.log(message, 'SUCCESS');
    }

    // 記錄警告
    logWarning(message) {
        this.log(message, 'WARNING');
    }

    // 獲取顏色
    getColor(type) {
        switch (type) {
            case 'ERROR': return this.colors.red;
            case 'SUCCESS': return this.colors.green;
            case 'WARNING': return this.colors.yellow;
            case 'INFO': return this.colors.blue;
            default: return this.colors.cyan;
        }
    }
}

// 初始化日誌記錄器
const logger = new NodeDebugLogger();

// 安全執行函數
async function safeExecute(fn, description) {
    try {
        logger.log(`開始執行: ${description}`);
        const startTime = Date.now();
        
        const result = await fn();
        const endTime = Date.now();
        
        logger.logSuccess(`✅ ${description} 成功完成 (耗時: ${endTime - startTime}ms)`);
        logger.log(`結果: ${JSON.stringify(result, null, 2)}`);
        
        return result;
    } catch (error) {
        logger.logError(`❌ ${description} 失敗: ${error.message}`, error.stack);
        return null;
    }
}

// 測試函數 1: 基本運算和類型檢查
async function testBasicOperations() {
    return safeExecute(() => {
        const numbers = [42, 3.14, -7, 0];
        const strings = ['Hello', 'World', '123', ''];
        const booleans = [true, false];
        const objects = [null, undefined, {}, []];

        return {
            數字運算: {
                加法: numbers.reduce((a, b) => a + b, 0),
                乘法: numbers.reduce((a, b) => a * b, 1),
                最大值: Math.max(...numbers),
                最小值: Math.min(...numbers)
            },
            字串操作: {
                合併: strings.join(' '),
                長度總和: strings.reduce((sum, str) => sum + str.length, 0),
                包含數字: strings.filter(str => !isNaN(str))
            },
            類型檢查: {
                numbers: numbers.map(n => ({ value: n, type: typeof n })),
                objects: objects.map(o => ({ value: o, type: typeof o, isNull: o === null }))
            }
        };
    }, '基本運算和類型檢查');
}

// 測試函數 2: 陣列和物件操作
async function testDataStructures() {
    return safeExecute(() => {
        const users = [
            { id: 1, name: 'Alice', age: 30, active: true },
            { id: 2, name: 'Bob', age: 25, active: false },
            { id: 3, name: 'Charlie', age: 35, active: true }
        ];

        const products = [
            { name: 'Laptop', price: 1000, category: 'Electronics' },
            { name: 'Book', price: 20, category: 'Education' },
            { name: 'Phone', price: 800, category: 'Electronics' }
        ];

        return {
            用戶統計: {
                活躍用戶: users.filter(u => u.active),
                平均年齡: users.reduce((sum, u) => sum + u.age, 0) / users.length,
                用戶名稱: users.map(u => u.name)
            },
            產品分析: {
                總價值: products.reduce((sum, p) => sum + p.price, 0),
                電子產品: products.filter(p => p.category === 'Electronics'),
                價格排序: products.sort((a, b) => b.price - a.price)
            },
            資料轉換: {
                用戶對映: users.reduce((acc, user) => {
                    acc[user.id] = user.name;
                    return acc;
                }, {}),
                分類分組: products.reduce((acc, product) => {
                    if (!acc[product.category]) acc[product.category] = [];
                    acc[product.category].push(product.name);
                    return acc;
                }, {})
            }
        };
    }, '資料結構操作');
}

// 測試函數 3: 異步操作和Promise
async function testAsyncOperations() {
    return safeExecute(async () => {
        // 模擬異步函數
        const delay = (ms, value) => new Promise(resolve => 
            setTimeout(() => resolve(value), ms)
        );

        const fetchUserData = async (userId) => {
            await delay(Math.random() * 500, null); // 隨機延遲
            return {
                id: userId,
                name: `User${userId}`,
                email: `user${userId}@example.com`,
                timestamp: new Date().toISOString()
            };
        };

        // 並發執行
        const userIds = [1, 2, 3, 4, 5];
        const startTime = Date.now();
        
        // Promise.all 並發執行
        const usersParallel = await Promise.all(
            userIds.map(id => fetchUserData(id))
        );
        
        const parallelTime = Date.now() - startTime;

        // 序列執行對比
        const sequentialStart = Date.now();
        const usersSequential = [];
        for (const id of userIds) {
            usersSequential.push(await fetchUserData(id));
        }
        const sequentialTime = Date.now() - sequentialStart;

        return {
            並發結果: usersParallel,
            序列結果: usersSequential,
            性能比較: {
                並發時間: `${parallelTime}ms`,
                序列時間: `${sequentialTime}ms`,
                效率提升: `${Math.round((sequentialTime / parallelTime) * 100) / 100}x`
            }
        };
    }, '異步操作測試');
}

// 測試函數 4: 錯誤處理
async function testErrorHandling() {
    logger.log('開始測試各種錯誤情況...');

    // 測試 1: 同步錯誤
    await safeExecute(() => {
        throw new Error('這是一個測試同步錯誤');
    }, '同步錯誤處理');

    // 測試 2: 異步錯誤
    await safeExecute(async () => {
        await new Promise((resolve, reject) => {
            setTimeout(() => reject(new Error('異步操作失敗')), 100);
        });
    }, '異步錯誤處理');

    // 測試 3: 類型錯誤
    await safeExecute(() => {
        const obj = null;
        return obj.someProperty;
    }, '類型錯誤處理');

    // 測試 4: JSON 解析錯誤
    await safeExecute(() => {
        return JSON.parse('invalid json string');
    }, 'JSON解析錯誤');

    return { message: '錯誤處理測試完成' };
}

// 主執行函數
async function main() {
    logger.log('JavaScript 自動調試系統啟動', 'INFO');
    logger.log('========================================');

    const tests = [
        testBasicOperations,
        testDataStructures,
        testAsyncOperations,
        testErrorHandling
    ];

    for (const test of tests) {
        await test();
        logger.log('----------------------------------------');
    }

    logger.logSuccess('所有測試完成！');
}

// 如果直接執行此腳本
if (require.main === module) {
    main().catch(error => {
        logger.logError('主程序執行失敗', error.stack);
        process.exit(1);
    });
}

// 導出函數供其他模組使用
module.exports = {
    NodeDebugLogger,
    safeExecute,
    testBasicOperations,
    testDataStructures,
    testAsyncOperations,
    testErrorHandling
};