# 🧪 AkingSPICE 2.1 通用测试框架

统一的测试机制，支持一键验证所有系统功能。

## 🎯 快速开始

```bash
# 运行所有测试
npm run test:all

# 快速测试 (跳过性能测试)
npm run test:quick

# 详细输出模式
npm run test:verbose

# 生成测试报告
npm run test:report
```

## 📊 测试类别

### 🏛️ 架构验证 (Architecture)
- 目录结构完整性
- 层次分离验证  
- 组件接口统一性
- 核心算法纯净性
- 依赖关系健康度

### 🔧 组件功能 (Components) 
- 基础组件文件完整性
- 电阻器功能测试 (欧姆定律)
- 电容器功能测试 (微分方程)
- 电感器功能测试 (磁通链)
- 电压源/电流源测试
- 接口一致性验证

### 🧮 核心算法 (Algorithms)
- MNA 算法实现验证
- 线性求解器验证
- 数值精度测试
- 瞬态分析验证
- 收敛性测试

### 🔗 系统集成 (Integration)
- 模块接口集成验证
- 简单电路仿真测试
- 复杂电路仿真测试
- 数据流验证
- 应用层示例测试

### 🚀 性能基准 (Performance)
- 矩阵运算性能
- 内存使用效率
- 可扩展性测试
- 算法复杂度验证
- 实时性能分析

## 🛠️ 命令行选项

```bash
# 基础命令
npm run test:all              # 运行所有测试
npm run test:quick            # 快速测试 (跳过性能测试)
npm run test:verbose          # 详细输出模式
npm run test:report           # 生成 JSON 报告

# 直接使用 node
node test-runner.js           # 运行所有测试
node test-runner.js --help    # 查看帮助
node test-runner.js --quick   # 快速测试
node test-runner.js --verbose # 详细输出
node test-runner.js --report test-report.json  # 自定义报告文件
```

### 详细参数

| 参数 | 简写 | 说明 |
|------|------|------|
| `--verbose` | `-v` | 详细输出模式，显示每个测试的详细信息 |
| `--quick` | `-q` | 快速测试模式，跳过性能测试，减少超时时间 |
| `--report [文件]` | `-r` | 生成详细的 JSON 格式测试报告 |
| `--timeout <毫秒>` | `-t` | 设置测试超时时间 (默认: 30000ms) |
| `--no-performance` | | 禁用性能测试 |
| `--help` | `-h` | 显示帮助信息 |

## 📈 测试报告

### 控制台输出示例
```
🚀 开始执行测试套件...

📂 执行 architecture 类别测试 (1 个模块):
   🧪 架构完整性验证...
      ✅ 5/5 测试通过

📂 执行 components 类别测试 (1 个模块):
   🧪 组件功能验证...
      ✅ 6/6 测试通过

==================================================
🎯 测试执行摘要
==================
总测试数: 25
通过: 23 (92.0%)
失败: 2
跳过: 0
警告: 0
总耗时: 1250ms
总体通过率: 92.0%

📊 分类结果:
   ✅ 架构完整性验证: 100.0% (150ms)
   ✅ 组件功能验证: 100.0% (200ms)
   ✅ 核心算法验证: 100.0% (400ms)
   ⚠️  系统集成验证: 80.0% (300ms)
   ✅ 性能基准测试: 85.0% (200ms)
==================================================
```

### JSON 报告格式
生成的 JSON 报告包含详细的测试结果、性能指标和错误信息：

```json
{
  "timestamp": "2024-01-15T10:30:00.000Z",
  "totalTests": 25,
  "passedTests": 23,
  "failedTests": 2,
  "totalExecutionTime": 1250.5,
  "overallPassRate": 92.0,
  "suites": [
    {
      "suiteId": "architecture-validation",
      "suiteName": "架构完整性验证",
      "category": "architecture",
      "results": [...],
      "passRate": 100.0
    }
  ]
}
```

## 🔧 扩展测试框架

### 添加新测试模块

1. 创建新的测试文件：`tests/modules/yourtest.test.ts`
2. 继承 `BaseTestModule` 类：

```typescript
import { BaseTestModule, TestResult } from '../UniversalTestRunner.ts';

export class YourTestModule extends BaseTestModule {
  readonly moduleId = 'your-test';
  readonly moduleName = '你的测试模块';
  readonly category = 'components' as const;
  readonly description = '测试模块描述';
  
  async runTests(): Promise<TestResult[]> {
    const results: TestResult[] = [];
    
    // 测试逻辑
    const [result, time] = await this.measureTime(() => this.yourTestMethod());
    results.push(this.createResult(
      'test-id',
      '测试名称',
      result.success ? 'passed' : 'failed',
      time,
      result.message
    ));
    
    return results;
  }
  
  private yourTestMethod(): { success: boolean; message: string } {
    // 实现你的测试逻辑
    return { success: true, message: '测试通过' };
  }
}

export default new YourTestModule();
```

3. 框架会自动发现并执行新的测试模块。

### 测试辅助方法

继承 `BaseTestModule` 后可使用以下辅助方法：

- `measureTime(fn)` - 测量执行时间
- `assert(condition, message)` - 断言检查
- `benchmark(name, fn, iterations)` - 性能基准测试
- `createResult(...)` - 创建标准测试结果

## 🎮 持续集成

适用于 CI/CD 管道的测试命令：

```bash
# CI 快速验证
npm run validate

# 或直接使用
node test-runner.js --quick --report ci-report.json
```

测试结果通过退出码反映：
- `0` - 所有测试通过
- `1` - 存在测试失败
- `2` - 测试执行错误

## 📝 测试覆盖范围

| 测试层级 | 覆盖内容 | 目标通过率 |
|----------|----------|-----------|
| 架构层 | 目录结构、接口设计、依赖关系 | 100% |
| 组件层 | 基础电子组件功能正确性 | 95%+ |
| 算法层 | 数值算法精度、稳定性 | 90%+ |  
| 集成层 | 模块协同、完整仿真流程 | 85%+ |
| 性能层 | 运算效率、内存使用、可扩展性 | 80%+ |

## 🚀 下一步计划

- [ ] 添加回归测试支持
- [ ] 集成代码覆盖率统计
- [ ] 添加并行测试执行
- [ ] 支持测试分类过滤
- [ ] 添加性能趋势分析
- [ ] 支持自定义测试配置文件