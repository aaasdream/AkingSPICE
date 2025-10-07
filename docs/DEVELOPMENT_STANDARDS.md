# 🔥 AkingSPICE 現代化開發規範 (放棄 MCP 架構)

## ⚠️ 重大架構決策

### 🚫 完全放棄 MCP-LCP 架構

**棄用原因：**
1. **概念錯誤**：將離散開關事件建模為連續互補問題
2. **性能災難**：每個時間步都要求解 NP-hard 的組合優化問題
3. **數值不穩定**：開關抖動、收斂失敗頻繁發生
4. **維護噩夢**：LCP 求解器調試極其困難
5. **擴展性差**：無法有效處理大規模電路

### ✅ 新架構：現代 MNA + 事件驅動

**核心原理：**
- **Modified Nodal Analysis**: 工業標準的電路方程建立
- **事件驅動狀態機**: 顯式處理開關狀態轉換
- **零交叉檢測**: 精確定位開關時刻
- **自適應積分**: BDF/Gear 方法優化時間步進

這是 **SPICE、Cadence Spectre、Ngspice** 經過數十年驗證的主流架構。

---

## 🎯 設計原則

### 1. 簡潔性原則 (KISS)
- 開關就是開關，不要過度建模
- 理想 + 平滑非線性混合，避免互補約束
- 優先使用成熟算法，不要重新發明輪子

### 2. 性能優先原則
- 稀疏矩陣技術：KLU、UMFPACK
- 事件檢測最小化計算量
- WebAssembly 加速關鍵路徑

### 3. 可維護性原則
- 模塊化設計，職責分離
- 詳細的單元測試和集成測試
- 清晰的調試和日志系統

### 4. 擴展性原則
- 插件化器件模型
- 微服務架構
- 水平擴展能力

---

## 🔧 技術棧選擇

### 核心引擎
```typescript
// 新架構示例：MNA + 事件驅動
class ModernCircuitSimulator {
  private mnaEngine: MNAEngine;
  private eventDetector: EventDetector;
  private integrator: BDFIntegrator;
  
  simulate(circuit: Circuit, timeSpan: TimeSpan): Results {
    // 1. 構建 MNA 矩陣
    const system = this.mnaEngine.buildSystem(circuit);
    
    // 2. 自適應時間步進
    while (t < timeSpan.end) {
      // 3. 檢測開關事件
      const events = this.eventDetector.scan(system, t, dt);
      
      if (events.length > 0) {
        // 4. 精確定位事件時刻
        const exactTime = this.locateEvent(events[0]);
        // 5. 處理狀態轉換
        this.handleStateTransition(events[0]);
      }
      
      // 6. 數值積分
      const solution = this.integrator.step(system, t, dt);
      t += dt;
    }
  }
}
```

### 開發工具鏈
- **語言**: TypeScript 5.0+ (嚴格模式)
- **構建**: Vite + esbuild
- **測試**: Vitest + Playwright
- **代碼質量**: ESLint + Prettier + Husky
- **CI/CD**: GitHub Actions

### 性能工具
- **分析器**: Chrome DevTools + Performance API
- **基準測試**: Benchmark.js
- **內存監控**: heap snapshots

---

## 📏 代碼規範

### TypeScript 配置
```json
{
  "compilerOptions": {
    "strict": true,
    "noImplicitReturns": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitOverride": true,
    "noPropertyAccessFromIndexSignature": true
  }
}
```

### 命名約定
- **類名**: PascalCase (e.g., `MNAEngine`)
- **方法名**: camelCase (e.g., `buildMatrix`)
- **常數**: SCREAMING_SNAKE_CASE (e.g., `MAX_ITERATIONS`)
- **接口**: 前綴 `I` (e.g., `IComponent`)
- **類型**: 後綴 `Type` (e.g., `ComponentType`)

### 文檔標準
```typescript
/**
 * Modified Nodal Analysis 引擎
 * 
 * 負責構建和求解電路的 MNA 方程組：
 * [G B] [v]   [i]
 * [C D] [j] = [e]
 * 
 * @example
 * ```typescript
 * const engine = new MNAEngine();
 * const system = engine.buildSystem(circuit);
 * const solution = engine.solve(system);
 * ```
 */
class MNAEngine {
  /**
   * 構建 MNA 系統矩陣
   * @param circuit 電路描述
   * @returns MNA 系統對象
   * @throws {InvalidCircuitError} 當電路拓撲無效時
   */
  buildSystem(circuit: Circuit): MNASystem {
    // 實現...
  }
}
```

---

## 🧪 測試策略

### 測試金字塔
1. **單元測試 (70%)**
   - 每個類和方法獨立測試
   - 覆蓋率 ≥ 90%
   - 快速執行 (<1s)

2. **集成測試 (20%)**
   - 模塊間交互測試
   - 典型電路仿真驗證
   - 性能回歸測試

3. **E2E 測試 (10%)**
   - 用戶完整工作流
   - 瀏覽器兼容性
   - 真實場景模擬

### 基準電路庫
```typescript
// 標準測試電路
const BENCHMARK_CIRCUITS = {
  // 基礎電路
  RC_LOWPASS: './benchmarks/rc-lowpass.cir',
  RLC_SERIES: './benchmarks/rlc-series.cir',
  
  // 電力電子電路
  BUCK_CONVERTER: './benchmarks/buck-converter.cir',
  BOOST_CONVERTER: './benchmarks/boost-converter.cir',
  FLYBACK_CONVERTER: './benchmarks/flyback.cir',
  
  // 複雜電路
  THREE_PHASE_RECTIFIER: './benchmarks/3ph-rectifier.cir',
  PFC_CIRCUIT: './benchmarks/pfc.cir'
};

// 精度測試：與 LTSpice 結果對比
test('Buck converter accuracy vs LTSpice', async () => {
  const ourResult = await simulate(BENCHMARK_CIRCUITS.BUCK_CONVERTER);
  const ltspiceResult = loadReference('./references/buck-ltspice.csv');
  
  expect(ourResult).toMatchReference(ltspiceResult, {
    tolerance: 1e-6,  // 1ppm 精度要求
    timePoints: 10000
  });
});
```

---

## 🚀 性能目標

### 計算性能
- **小電路** (< 100 nodes): 實時仿真 (1ms/step)
- **中型電路** (100-1000 nodes): < 1s (DC 分析)
- **大型電路** (> 1000 nodes): < 10s (1萬步暫態)

### Web 性能
- **首屏渲染**: < 2s (3G 網絡)
- **交互延遲**: < 16ms (60fps)
- **包大小**: 核心引擎 < 500KB gzipped

### 內存使用
- **稀疏矩陣**: 僅存非零元素
- **歷史數據**: 滑動窗口管理
- **WebWorker**: 避免主線程阻塞

---

## 🔄 開發流程

### Git 工作流
```bash
# 功能開發
git checkout -b feature/mna-engine
git commit -m "feat(core): implement MNA matrix builder"
git push origin feature/mna-engine
# 創建 Pull Request

# 提交信息規範 (Conventional Commits)
feat: 新功能
fix: Bug 修復  
docs: 文檔更新
style: 代碼格式
refactor: 重構
test: 測試相關
chore: 構建/工具相關
```

### Code Review 清單
- [ ] 是否遵循 TypeScript 嚴格模式
- [ ] 是否有足夠的單元測試
- [ ] 是否有性能回歸風險
- [ ] 是否符合架構設計原則
- [ ] 是否有清晰的文檔和注釋

### 發布流程
1. **Alpha 版本**: 內部測試，快速迭代
2. **Beta 版本**: 早期用戶反饋
3. **RC 版本**: 發布候選，穩定性測試
4. **正式版本**: 生產就緒

---

## 📊 質量保證

### 自動化檢查
- **類型檢查**: TypeScript 編譯
- **代碼質量**: ESLint + SonarQube  
- **安全漏洞**: npm audit + Snyk
- **性能監控**: Lighthouse CI

### 持續集成
```yaml
# .github/workflows/ci.yml
name: CI/CD Pipeline
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
      - name: Install dependencies
        run: npm ci
      - name: Type check
        run: npm run type-check
      - name: Lint
        run: npm run lint
      - name: Unit tests
        run: npm run test:unit
      - name: Integration tests  
        run: npm run test:integration
      - name: E2E tests
        run: npm run test:e2e
      - name: Performance tests
        run: npm run test:performance
```

---

## 🎯 里程碑規劃

### Phase 1: 核心引擎 (4-6 週)
- [ ] MNA 矩陣構建器
- [ ] Newton-Raphson 求解器  
- [ ] BDF 積分器
- [ ] 事件檢測系統
- [ ] 基礎器件模型 (R, L, C, V, I)

### Phase 2: 開關器件 (3-4 週)
- [ ] 理想二極體 + 事件檢測
- [ ] 理想 MOSFET 開關
- [ ] PWM 控制器
- [ ] Buck 轉換器完整驗證

### Phase 3: 高級功能 (4-5 週)
- [ ] Shockley 二極體模型
- [ ] BSIM MOSFET 模型
- [ ] 變壓器和耦合電感
- [ ] 三相電路支持

### Phase 4: Web 平台 (6-8 週)
- [ ] 電路編輯器 UI
- [ ] 實時波形顯示
- [ ] 協作編輯功能
- [ ] 雲端計算服務

---

**總結**: 放棄 MCP-LCP 是正確的戰略決策。新的 MNA + 事件驅動架構將為 AkingSPICE 提供工業級的穩定性和性能，成為真正實用的電力電子模擬平台。