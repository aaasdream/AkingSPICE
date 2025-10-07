/**
 * 🧪 AkingSPICE 2.1 通用测试框架
 * 
 * 统一的测试机制，支持：
 * - 自动发现和注册测试模块
 * - 并行/串行执行控制
 * - 详细的结果报告
 * - 性能基准测试
 * - 持续集成支持
 * 
 * 🎯 使用方法：
 *   npm run test:all      - 运行所有测试
 *   npm run test:quick    - 快速测试（跳过性能测试）
 *   npm run test:verbose  - 详细输出模式
 */

import fs from 'fs';
import path from 'path';
import { performance } from 'perf_hooks';

// === 测试结果类型定义 ===

export interface TestResult {
  testId: string;
  testName: string;
  category: string;
  status: 'passed' | 'failed' | 'skipped' | 'warning';
  executionTime: number;
  details?: string;
  error?: Error;
  metrics?: Record<string, number>;
}

export interface TestSuite {
  suiteId: string;
  suiteName: string;
  category: string;
  description: string;
  results: TestResult[];
  totalTime: number;
  passRate: number;
}

export interface TestReport {
  timestamp: Date;
  totalTests: number;
  passedTests: number;
  failedTests: number;
  skippedTests: number;
  warningTests: number;
  totalExecutionTime: number;
  overallPassRate: number;
  suites: TestSuite[];
  summary: string;
}

// === 测试模块接口 ===

export interface TestModule {
  /** 测试模块ID */
  readonly moduleId: string;
  
  /** 测试模块名称 */
  readonly moduleName: string;
  
  /** 测试类别 */
  readonly category: 'architecture' | 'components' | 'algorithms' | 'integration' | 'performance';
  
  /** 模块描述 */
  readonly description: string;
  
  /** 是否启用 */
  readonly enabled: boolean;
  
  /** 执行测试 */
  runTests(): Promise<TestResult[]>;
  
  /** 清理资源 */
  cleanup?(): Promise<void>;
}

// === 测试执行器 ===

export class UniversalTestRunner {
  private modules: Map<string, TestModule> = new Map();
  private config: TestConfig;
  
  constructor(config: Partial<TestConfig> = {}) {
    this.config = {
      maxConcurrency: 4,
      timeoutMs: 30000,
      verbose: false,
      enablePerformanceTests: true,
      skipSlowTests: false,
      outputFormat: 'console',
      reportFile: null,
      ...config
    };
  }
  
  /**
   * 📝 注册测试模块
   */
  registerModule(module: TestModule): void {
    if (this.modules.has(module.moduleId)) {
      console.warn(`⚠️  测试模块 ${module.moduleId} 已存在，将被覆盖`);
    }
    
    this.modules.set(module.moduleId, module);
    
    if (this.config.verbose) {
      console.log(`📦 注册测试模块: ${module.moduleName} (${module.category})`);
    }
  }
  
  /**
   * 🔍 自动发现并注册测试模块
   */
  async discoverModules(testDir: string = './tests/modules'): Promise<void> {
    if (!fs.existsSync(testDir)) {
      console.warn(`⚠️  测试目录不存在: ${testDir}`);
      return;
    }
    
    const files = fs.readdirSync(testDir, { recursive: true });
    const testFiles = files
      .filter(file => typeof file === 'string' && (file.endsWith('.test.js') || file.endsWith('.test.ts')))
      .map(file => path.join(testDir, file as string));
    
    console.log(`🔍 发现 ${testFiles.length} 个测试文件`);
    
    for (const testFile of testFiles) {
      try {
        const module = await import(path.resolve(testFile));
        if (module.default && typeof module.default.runTests === 'function') {
          this.registerModule(module.default);
        }
      } catch (error) {
        console.warn(`⚠️  加载测试模块失败: ${testFile}`, error);
      }
    }
  }
  
  /**
   * 🚀 执行所有测试
   */
  async runAllTests(): Promise<TestReport> {
    const startTime = performance.now();
    const report: TestReport = {
      timestamp: new Date(),
      totalTests: 0,
      passedTests: 0,
      failedTests: 0,
      skippedTests: 0,
      warningTests: 0,
      totalExecutionTime: 0,
      overallPassRate: 0,
      suites: [],
      summary: ''
    };
    
    console.log('🚀 开始执行测试套件...\n');
    
    // 按类别分组测试模块
    const modulesByCategory = this._groupModulesByCategory();
    
    for (const [category, modules] of modulesByCategory) {
      console.log(`📂 执行 ${category} 类别测试 (${modules.length} 个模块):`);
      
      const categoryResults = await this._runModulesInCategory(modules);
      report.suites.push(...categoryResults);
      
      // 统计结果
      for (const suite of categoryResults) {
        report.totalTests += suite.results.length;
        for (const result of suite.results) {
          switch (result.status) {
            case 'passed': report.passedTests++; break;
            case 'failed': report.failedTests++; break;
            case 'skipped': report.skippedTests++; break;
            case 'warning': report.warningTests++; break;
          }
        }
      }
      
      console.log(''); // 空行分隔
    }
    
    // 计算总体指标
    const endTime = performance.now();
    report.totalExecutionTime = endTime - startTime;
    report.overallPassRate = report.totalTests > 0 ? 
      (report.passedTests / report.totalTests) * 100 : 0;
    
    // 生成摘要
    report.summary = this._generateSummary(report);
    
    // 输出报告
    this._outputReport(report);
    
    return report;
  }
  
  /**
   * 📊 按类别分组模块
   */
  private _groupModulesByCategory(): Map<string, TestModule[]> {
    const groups = new Map<string, TestModule[]>();
    
    for (const module of this.modules.values()) {
      if (!module.enabled) continue;
      
      if (!groups.has(module.category)) {
        groups.set(module.category, []);
      }
      groups.get(module.category)!.push(module);
    }
    
    // 按优先级排序类别
    const orderedCategories = ['architecture', 'components', 'algorithms', 'integration', 'performance'];
    const orderedGroups = new Map<string, TestModule[]>();
    
    for (const category of orderedCategories) {
      if (groups.has(category)) {
        orderedGroups.set(category, groups.get(category)!);
      }
    }
    
    return orderedGroups;
  }
  
  /**
   * 🏃 执行类别内的测试模块
   */
  private async _runModulesInCategory(modules: TestModule[]): Promise<TestSuite[]> {
    const suites: TestSuite[] = [];
    
    for (const module of modules) {
      const suite = await this._runModule(module);
      suites.push(suite);
    }
    
    return suites;
  }
  
  /**
   * 🎯 执行单个测试模块
   */
  private async _runModule(module: TestModule): Promise<TestSuite> {
    const startTime = performance.now();
    
    console.log(`   🧪 ${module.moduleName}...`);
    
    const suite: TestSuite = {
      suiteId: module.moduleId,
      suiteName: module.moduleName,
      category: module.category,
      description: module.description,
      results: [],
      totalTime: 0,
      passRate: 0
    };
    
    try {
      // 设置超时
      const timeoutPromise = new Promise<TestResult[]>((_, reject) => {
        setTimeout(() => reject(new Error('测试超时')), this.config.timeoutMs);
      });
      
      const testPromise = module.runTests();
      const results = await Promise.race([testPromise, timeoutPromise]);
      
      suite.results = results;
      
      // 计算通过率
      const passedCount = results.filter(r => r.status === 'passed').length;
      suite.passRate = results.length > 0 ? (passedCount / results.length) * 100 : 0;
      
      // 输出结果摘要
      const passedTests = results.filter(r => r.status === 'passed').length;
      const failedTests = results.filter(r => r.status === 'failed').length;
      const skippedTests = results.filter(r => r.status === 'skipped').length;
      
      const status = failedTests === 0 ? '✅' : '❌';
      console.log(`      ${status} ${passedTests}/${results.length} 测试通过` + 
                 (skippedTests > 0 ? ` (${skippedTests} 跳过)` : ''));
      
      if (this.config.verbose && failedTests > 0) {
        results.filter(r => r.status === 'failed').forEach(r => {
          console.log(`         ❌ ${r.testName}: ${r.details || r.error?.message}`);
        });
      }
      
    } catch (error) {
      console.log(`      ❌ 模块执行失败: ${error}`);
      suite.results = [{
        testId: 'module_error',
        testName: 'Module Execution',
        category: module.category,
        status: 'failed',
        executionTime: 0,
        error: error as Error
      }];
    } finally {
      // 清理资源
      if (module.cleanup) {
        try {
          await module.cleanup();
        } catch (cleanupError) {
          console.warn(`⚠️  清理资源失败: ${cleanupError}`);
        }
      }
    }
    
    suite.totalTime = performance.now() - startTime;
    return suite;
  }
  
  /**
   * 📋 生成测试摘要
   */
  private _generateSummary(report: TestReport): string {
    const lines = [
      '🎯 测试执行摘要',
      '==================',
      `总测试数: ${report.totalTests}`,
      `通过: ${report.passedTests} (${((report.passedTests/report.totalTests)*100).toFixed(1)}%)`,
      `失败: ${report.failedTests}`,
      `跳过: ${report.skippedTests}`,
      `警告: ${report.warningTests}`,
      `总耗时: ${report.totalExecutionTime.toFixed(0)}ms`,
      `总体通过率: ${report.overallPassRate.toFixed(1)}%`,
      '',
      '📊 分类结果:',
    ];
    
    for (const suite of report.suites) {
      const status = suite.passRate >= 100 ? '✅' : 
                    suite.passRate >= 80 ? '⚠️' : '❌';
      lines.push(`   ${status} ${suite.suiteName}: ${suite.passRate.toFixed(1)}% (${suite.totalTime.toFixed(0)}ms)`);
    }
    
    return lines.join('\n');
  }
  
  /**
   * 📤 输出测试报告
   */
  private _outputReport(report: TestReport): void {
    console.log('\n' + '='.repeat(50));
    console.log(report.summary);
    console.log('='.repeat(50));
    
    // 如果指定了报告文件，保存详细报告
    if (this.config.reportFile) {
      const jsonReport = JSON.stringify(report, null, 2);
      fs.writeFileSync(this.config.reportFile, jsonReport);
      console.log(`📁 详细报告已保存到: ${this.config.reportFile}`);
    }
    
    // 根据结果返回适当的退出码
    if (report.failedTests > 0) {
      console.log('\n❌ 存在测试失败，请检查并修复问题');
      process.exitCode = 1;
    } else if (report.warningTests > 0) {
      console.log('\n⚠️  存在测试警告，建议检查');
    } else {
      console.log('\n🎉 所有测试通过！');
    }
  }
}

// === 配置接口 ===

export interface TestConfig {
  maxConcurrency: number;
  timeoutMs: number;
  verbose: boolean;
  enablePerformanceTests: boolean;
  skipSlowTests: boolean;
  outputFormat: 'console' | 'json' | 'junit';
  reportFile: string | null;
}

// === 便捷测试基类 ===

export abstract class BaseTestModule implements TestModule {
  abstract readonly moduleId: string;
  abstract readonly moduleName: string;
  abstract readonly category: 'architecture' | 'components' | 'algorithms' | 'integration' | 'performance';
  abstract readonly description: string;
  readonly enabled: boolean = true;
  
  abstract runTests(): Promise<TestResult[]>;
  
  /**
   * 🛠️ 创建测试结果的便捷方法
   */
  protected createResult(
    testId: string, 
    testName: string, 
    status: TestResult['status'],
    executionTime: number = 0,
    details?: string,
    error?: Error,
    metrics?: Record<string, number>
  ): TestResult {
    return {
      testId,
      testName,
      category: this.category,
      status,
      executionTime,
      details,
      error,
      metrics
    };
  }
  
  /**
   * ⏱️ 执行并测量时间的便捷方法
   */
  protected async measureTime<T>(fn: () => Promise<T> | T): Promise<[T, number]> {
    const start = performance.now();
    const result = await fn();
    const executionTime = performance.now() - start;
    return [result, executionTime];
  }
  
  /**
   * 🔍 断言帮助方法
   */
  protected assert(condition: boolean, message: string): void {
    if (!condition) {
      throw new Error(`Assertion failed: ${message}`);
    }
  }
  
  /**
   * 📊 性能基准测试帮助方法
   */
  protected async benchmark(
    name: string,
    fn: () => Promise<void> | void,
    iterations: number = 100
  ): Promise<{ avgTime: number; minTime: number; maxTime: number; totalTime: number }> {
    const times: number[] = [];
    
    for (let i = 0; i < iterations; i++) {
      const [_, time] = await this.measureTime(fn);
      times.push(time);
    }
    
    return {
      avgTime: times.reduce((a, b) => a + b, 0) / times.length,
      minTime: Math.min(...times),
      maxTime: Math.max(...times),
      totalTime: times.reduce((a, b) => a + b, 0)
    };
  }
}

export default UniversalTestRunner;