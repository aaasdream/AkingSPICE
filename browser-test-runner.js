// 瀏覽器端測試執行器
// 這個檔案包含適合在瀏覽器環境中執行的測試

class BrowserTestRunner {
  constructor() {
    this.testResults = {
      total: 0,
      passed: 0,
      failed: 0,
      running: 0
    };
    this.tests = [];
  }

  // 註冊測試
  addTest(name, category, testFunction) {
    this.tests.push({
      name,
      category,
      func: testFunction,
      status: 'pending'
    });
    this.testResults.total++;
  }

  // 執行所有測試
  async runAllTests() {
    console.log('🚀 開始執行所有測試...');

    for (let i = 0; i < this.tests.length; i++) {
      await this.runSingleTest(i);
    }

    console.log(`🎉 測試完成! 通過: ${this.testResults.passed}/${this.testResults.total}`);
    return this.testResults;
  }

  // 執行單個測試
  async runSingleTest(index) {
    const test = this.tests[index];
    console.log(`📝 執行測試: ${test.name}`);

    test.status = 'running';
    this.testResults.running = 1;

    try {
      const startTime = performance.now();
      const result = await test.func();
      const endTime = performance.now();
      const duration = (endTime - startTime).toFixed(2);

      if (result.passed) {
        test.status = 'passed';
        test.duration = duration;
        this.testResults.passed++;
        console.log(`✅ ${test.name} - 通過 (${duration}ms)`);

        if (result.note) {
          console.log(`   📝 ${result.note}`);
        }
      } else {
        test.status = 'failed';
        test.error = result.error;
        this.testResults.failed++;
        console.log(`❌ ${test.name} - 失敗: ${result.error}`);
      }
    } catch (error) {
      test.status = 'failed';
      test.error = error.message;
      this.testResults.failed++;
      console.log(`💥 ${test.name} - 錯誤: ${error.message}`);
    }

    this.testResults.running = 0;
  }

  // 按分類執行測試
  async runTestsByCategory(category) {
    const categoryTests = this.tests.filter(test => test.category === category);
    console.log(`🎯 執行 ${category} 類別測試 (${categoryTests.length}個)`);

    for (const test of categoryTests) {
      const index = this.tests.indexOf(test);
      await this.runSingleTest(index);
    }
  }

  // 獲取測試報告
  getReport() {
    return {
      summary: this.testResults,
      details: this.tests.map(test => ({
        name: test.name,
        category: test.category,
        status: test.status,
        duration: test.duration,
        error: test.error
      }))
    };
  }
}

// 匯出給網頁使用
if (typeof window !== 'undefined') {
  window.BrowserTestRunner = BrowserTestRunner;
}

// Node.js環境匯出
if (typeof module !== 'undefined' && module.exports) {
  module.exports = BrowserTestRunner;
}