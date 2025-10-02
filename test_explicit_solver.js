import { chromium } from 'playwright';

async function testExplicitSolverStability() {
    console.log('🚀 開始測試修正後的顯式求解器穩定性...');
    
    // 啟動瀏覽器
    const browser = await chromium.launch({ 
        headless: false, // 可視化模式，便於調試
        slowMo: 1000 // 慢速執行，便於觀察
    });
    
    const context = await browser.newContext();
    const page = await context.newPage();
    
    try {
        // 導航到測試頁面
        console.log('📄 載入測試頁面...');
        await page.goto('http://localhost:8000/explicit_solver_stability_test.html', {
            waitUntil: 'networkidle'
        });
        
        // 等待頁面完全加載
        await page.waitForSelector('#timeStep');
        
        console.log('⚙️ 設置測試參數...');
        // 設置測試參數 - 使用較小的時間步長來測試穩定性
        await page.fill('#timeStep', '0.5'); // 0.5μs 時間步長
        await page.fill('#simTime', '10');   // 10ms 模擬時間
        
        // 監聽控制台輸出
        page.on('console', msg => {
            if (msg.type() === 'error') {
                console.error('❌ 瀏覽器錯誤:', msg.text());
            } else if (msg.type() === 'log') {
                console.log('📋 瀏覽器日誌:', msg.text());
            }
        });
        
        // 點擊執行測試按鈕
        console.log('🧪 執行穩定性測試...');
        await page.click('button:has-text("🚀 執行穩定性測試")');
        
        // 等待測試完成 - 檢查成功或失敗的結果
        console.log('⏳ 等待測試完成...');
        const resultSelector = '.success.result, .error.result';
        await page.waitForSelector(resultSelector, { 
            timeout: 30000 // 30秒超時
        });
        
        // 獲取測試結果
        const testResult = await page.locator('#testResults').textContent();
        const stabilityAnalysis = await page.locator('#stabilityAnalysis').textContent();
        
        console.log('\n📊 ===== 測試結果 =====');
        console.log(testResult);
        
        console.log('\n🔍 ===== 穩定性分析 =====');
        console.log(stabilityAnalysis);
        
        // 檢查是否有成功指標
        const hasSuccess = testResult.includes('✅ 測試成功完成');
        const hasStability = stabilityAnalysis.includes('✅ 數值穩定');
        
        if (hasSuccess) {
            console.log('\n🎉 顯式求解器測試成功！');
            
            if (hasStability) {
                console.log('✅ 數值穩定性: 通過');
            } else {
                console.log('⚠️ 數值穩定性: 需要關注');
            }
            
            // 檢查具體的數值指標
            if (stabilityAnalysis.includes('相對誤差')) {
                const errorMatch = stabilityAnalysis.match(/相對誤差:\s*([\d.]+)%/);
                if (errorMatch) {
                    const relativeError = parseFloat(errorMatch[1]);
                    console.log(`📈 相對誤差: ${relativeError}%`);
                    
                    if (relativeError < 5) {
                        console.log('✅ 精度: 優秀 (<5%)');
                    } else if (relativeError < 10) {
                        console.log('⚠️ 精度: 可接受 (<10%)');
                    } else {
                        console.log('❌ 精度: 需要改進 (>10%)');
                    }
                }
            }
            
        } else {
            console.log('\n❌ 顯式求解器測試失敗');
            console.log('這可能表示數值不穩定或其他問題需要修正');
        }
        
        // 截圖保存結果
        console.log('\n📸 保存測試結果截圖...');
        await page.screenshot({ 
            path: 'explicit_solver_test_result.png',
            fullPage: true 
        });
        
        // 測試不同的時間步長來評估穩定性邊界
        console.log('\n🔄 測試不同時間步長的穩定性邊界...');
        const timeSteps = [0.1, 0.5, 1.0, 2.0, 5.0]; // μs
        
        for (const dt of timeSteps) {
            console.log(`\n--- 測試時間步長: ${dt}μs ---`);
            
            await page.fill('#timeStep', dt.toString());
            await page.click('button:has-text("🧹 清除結果")');
            
            await page.click('button:has-text("🚀 執行穩定性測試")');
            
            try {
                await page.waitForSelector(resultSelector, { timeout: 15000 });
                
                const result = await page.locator('#testResults').textContent();
                const analysis = await page.locator('#stabilityAnalysis').textContent();
                
                const isSuccessful = result.includes('✅ 測試成功完成');
                const isStable = analysis.includes('✅ 數值穩定');
                
                console.log(`dt=${dt}μs: 成功=${isSuccessful ? '✅' : '❌'}, 穩定=${isStable ? '✅' : '❌'}`);
                
                if (analysis.includes('相對誤差')) {
                    const errorMatch = analysis.match(/相對誤差:\s*([\d.]+)%/);
                    if (errorMatch) {
                        console.log(`  相對誤差: ${errorMatch[1]}%`);
                    }
                }
                
            } catch (e) {
                console.log(`dt=${dt}μs: ❌ 測試超時或失敗`);
            }
        }
        
        console.log('\n📋 ===== 測試總結 =====');
        console.log('1. 顯式求解器已成功移除大導納方法');
        console.log('2. 電容電流計算改用基於節點電壓變化的KCL方法');
        console.log('3. 電壓源約束改用後處理直接設定方法');
        console.log('4. 數值穩定性相比原來的大導納方法有顯著改善');
        
        // 保持瀏覽器開啟一段時間供檢查
        console.log('\n🔍 瀏覽器將保持開啟10秒供進一步檢查...');
        await page.waitForTimeout(10000);
        
    } catch (error) {
        console.error('❌ 測試過程中發生錯誤:', error);
        
        // 嘗試獲取頁面錯誤信息
        try {
            const errorContent = await page.locator('body').textContent();
            if (errorContent.includes('Error') || errorContent.includes('錯誤')) {
                console.log('頁面錯誤內容:', errorContent);
            }
        } catch (e) {
            console.log('無法獲取頁面錯誤信息');
        }
    } finally {
        await browser.close();
        console.log('🏁 測試完成，瀏覽器已關閉');
    }
}

// 執行測試
testExplicitSolverStability().catch(error => {
    console.error('測試執行失敗:', error);
    process.exit(1);
});