# 🚀 AkingSPICE 2.1 - 次世代模擬架構革新

## ⚡ 架構升級：從經典 SPICE 到現代 DAE 求解器

### 🎯 核心理念轉變

我們正在進行一場**根本性的技術革命**：

| 傳統架構 (AkingSPICE 2.0) | 次世代架構 (AkingSPICE 2.1) |
|-------------------------|---------------------------|
| BDF 積分器 (數值過阻尼) | **廣義 Alpha 方法** (可控阻尼) |
| 簡單稀疏矩陣求解 | **SuiteSparse:KLU + WASM** |
| 基礎 Newton-Raphson | **穩健非線性求解策略** |
| 簡單 `stamp()` 介面 | **智能 DeviceModel API** |
| 電路模擬器 | **工業級 DAE 求解平台** |

### 🏗️ 次世代架構藍圖

```
┌─────────────────────────────────────────────────────────────────┐
│  🎛️ 模擬協調器 (Simulation Coordinator)                        │
│  • 分析類型控制 (Transient, HB, AC, Noise)                     │
│  • 全局狀態管理與工作流編排                                      │
│  • 多核並行任務調度                                             │
└─────────────────────┬───────────────────────────────────────────┘
                      │
    ┌─────────────────▼─────────────────────────────────────────┐
    │  🔬 高級積分引擎 (Advanced Integration Engine)             │
    │  • 廣義 α 法 (Generalized-α Method)                      │
    │  • TR-BDF2 混合策略                                        │
    │  • 局部截斷誤差 + 穩定性控制                                │
    │  • 智能事件定位 (零交叉檢測)                                │
    └─────────────────┬─────────────────────────────────────────┘
                      │
    ┌─────────────────▼─────────────────────────────────────────┐
    │  🧮 非線性 DAE 求解器 (Nonlinear DAE Solver)               │
    │  • Newton-Raphson with Advanced Strategies                │
    │  • Source/Gmin Stepping                                   │
    │  • Pseudo-Transient Continuation                          │
    │  • 自適應步長限制 (Step Limiting)                          │
    └─────────────────┬─────────────────────────────────────────┘
                      │
┌─────────────────────▼──────┐    ┌─────────────────▼──────────────┐
│  🏭 工業級 MNA 系統         │    │  🎯 穩健設備模型 API            │
│  • CSC 稀疏矩陣格式         │    │  • load(op) 電流/雅可比計算     │
│  • 動態拓撲重組             │    │  • checkConvergence() 收斂檢查   │
│  • 符號因式分解緩存         │    │  • limitUpdate() 步長限制       │
└─────────────┬──────────────┘    │  • stamp() MNA 矩陣戳印        │
              │                   └─────────────────▲──────────────┘
    ┌─────────▼──────────────────────────────────────────────┐  │
    │  ⚡ 超高性能數學核心 (Ultra-Performance Math Core)      │  │
    │  • SuiteSparse:KLU (WASM 編譯)                        │  │
    │  • 符號預排序 (AMD/COLAMD)                            │  │
    │  • 數值透視 (Numerical Pivoting)                      │  │
    │  • 迭代精化 (Iterative Refinement)                    │  │
    │  • BLAS Level 3 優化                                  │  │
    └────────────────────────────────────────────────────────┘  │
                                                                 │
┌────────────────────────────────────────────────────────────────┘
│  🧠 智能模型庫 (Intelligent Model Library)
│  • 參數化 SPICE 模型 (.MODEL 卡)
│  • 自動微分 (Automatic Differentiation)
│  • 模型參數估計與優化
│  • 溫度/工藝角落變化
└─────────────────────────────────────────────────────────────────┘
```

## 🔬 關鍵技術創新

### 1. 廣義 Alpha 積分器 - 淘汰過時的 BDF

**問題**: BDF 方法雖然穩定，但產生**過度數值阻尼**，會抹殺電力電子中的重要高頻暫態。

**解決方案**: **廣義 α 方法** - 現代剛性系統積分的黃金標準

#### 核心優勢
- **用戶可控阻尼**: 通過參數 `ρ_∞` (0 ≤ ρ_∞ ≤ 1) 精確控制數值阻尼
- **二階精度**: 比一階 BDF 更準確
- **優異高頻特性**: 有效抑制數值振盪，保留真實響應
- **A-穩定性**: 適合剛性電力電子系統

#### 技術實現
```typescript
/**
 * 廣義 Alpha 積分器 - 次世代暫態分析核心
 * 
 * 基於以下遞歸關係：
 * M * a_{n+1-α_m} + C * v_{n+1-α_f} + K * d_{n+1-α_f} = F_{n+1-α_f}
 * 
 * 其中：α_m, α_f, β, γ 由 ρ_∞ 計算得出
 */
export class GeneralizedAlphaIntegrator implements IAdvancedIntegrator {
  private readonly α_m: number;
  private readonly α_f: number; 
  private readonly β: number;
  private readonly γ: number;

  constructor(
    private ρ_∞: number = 0.2,  // 高頻耗散因子
    private maxOrder: number = 2
  ) {
    // 根據 ρ_∞ 計算最優參數
    this.α_m = (2 * ρ_∞ - 1) / (ρ_∞ + 1);
    this.α_f = ρ_∞ / (ρ_∞ + 1);
    this.γ = 0.5 - this.α_m + this.α_f;
    this.β = 0.25 * Math.pow(this.γ + 0.5, 2);
  }

  /**
   * 電容/電感的等效電導/電流離散化
   */
  discretizeReactive(
    value: number,        // L 或 C 值
    history: StateHistory,
    timeStep: number
  ): EquivalentCircuit {
    const h = timeStep;
    const { v_n, i_n, v_dot_n, i_dot_n } = history;

    if (value > 0) { // 電容 C*dv/dt = i
      const G_eq = this.γ / (this.β * h) * value;
      const I_eq = value * (
        v_dot_n + 
        (this.γ / this.β - 1) / h * (v_n - v_n_prev) +
        (this.γ / (2 * this.β) - 1) * h * v_dot_n_prev
      );
      
      return { conductance: G_eq, current: I_eq };
    } else { // 電感 L*di/dt = v
      const R_eq = this.γ / (this.β * h) * Math.abs(value);
      const V_eq = Math.abs(value) * (
        i_dot_n + 
        (this.γ / this.β - 1) / h * (i_n - i_n_prev) +
        (this.γ / (2 * this.β) - 1) * h * i_dot_n_prev
      );
      
      return { resistance: R_eq, voltage: V_eq };
    }
  }

  /**
   * 預測-校正步驟
   */
  async step(
    system: IDAESystem,
    t: Time,
    h: Time,
    state: SystemState
  ): Promise<IntegrationResult> {
    // 1. 預測步 (顯式)
    const predicted = this.predict(state, h);
    
    // 2. 校正步 (隱式 Newton-Raphson)
    const corrected = await this.correct(system, t + h, h, predicted);
    
    // 3. 誤差估計與步長控制
    const error = this.estimateError(corrected, predicted);
    const nextH = this.controlTimestep(h, error);
    
    // 4. 更新歷史狀態
    if (error < this.tolerance) {
      this.updateHistory(corrected);
      return {
        accepted: true,
        state: corrected,
        nextTimestep: nextH,
        error,
        iterations: corrected.newtonIterations
      };
    } else {
      return {
        accepted: false,
        state,
        nextTimestep: nextH * 0.5,
        error,
        iterations: 0
      };
    }
  }
}
```

### 2. SuiteSparse:KLU + WebAssembly - 超高性能稀疏求解

**問題**: 傳統 JavaScript 矩陣運算性能不足，無法處理大規模電路。

**解決方案**: 將工業級 C++ 稀疏求解器編譯為 WebAssembly

#### 為什麼選擇 KLU？
- **專為電路設計**: Tim Davis 專門為 SPICE 類應用優化
- **極致性能**: 比通用 LU 分解快 10-100倍
- **數值穩定**: 部分透視策略平衡速度與精度
- **工業驗證**: MATLAB、Ngspice 等都在使用

#### 實現架構
```cpp
// C++ WASM 接口層 (klu_interface.cpp)
#include <emscripten/bind.h>
#include "klu.h"
#include "amd.h"

class KLUSolverWASM {
private:
    klu_symbolic* symbolic;
    klu_numeric* numeric;
    klu_common common;
    
public:
    struct SolveResult {
        bool success;
        std::vector<double> solution;
        std::string error;
        int iterations;
        double conditionNumber;
    };

    // 符號分析 (只需做一次)
    bool analyze(int n, const std::vector<int>& Ap, const std::vector<int>& Ai) {
        klu_defaults(&common);
        symbolic = klu_analyze(n, Ap.data(), Ai.data(), &common);
        return symbolic != nullptr;
    }

    // 數值分解 (每次矩陣值變化時調用)
    bool factorize(const std::vector<double>& Ax) {
        if (numeric) klu_free_numeric(&numeric, &common);
        numeric = klu_factor(Ap.data(), Ai.data(), Ax.data(), symbolic, &common);
        return numeric != nullptr;
    }

    // 求解 Ax = b
    SolveResult solve(const std::vector<double>& b) {
        std::vector<double> x = b;  // 複製 RHS
        
        int status = klu_solve(symbolic, numeric, n, 1, x.data(), &common);
        
        return {
            .success = (status == 1),
            .solution = std::move(x),
            .error = status == 1 ? "" : "KLU solve failed",
            .iterations = 1,
            .conditionNumber = klu_condest(symbolic, numeric, &common)
        };
    }
};

// Emscripten 綁定
EMSCRIPTEN_BINDINGS(klu_module) {
    emscripten::class_<KLUSolverWASM>("KLUSolver")
        .constructor<>()
        .function("analyze", &KLUSolverWASM::analyze)
        .function("factorize", &KLUSolverWASM::factorize)  
        .function("solve", &KLUSolverWASM::solve);
        
    emscripten::value_object<KLUSolverWASM::SolveResult>("SolveResult")
        .field("success", &KLUSolverWASM::SolveResult::success)
        .field("solution", &KLUSolverWASM::SolveResult::solution)
        .field("error", &KLUSoluverWASM::SolveResult::error);
}
```

```typescript
// TypeScript 接口層 (klu_solver.ts)
export class UltraPerformanceSolver implements ISparseLinearSolver {
  private wasmModule: any;
  private kluSolver: any;
  private isAnalyzed = false;

  async initialize(): Promise<void> {
    // 異步加載 WASM 模組
    this.wasmModule = await import('./klu_solver.wasm');
    this.kluSolver = new this.wasmModule.KLUSolver();
  }

  async solve(matrix: CSCMatrix, rhs: Float64Array): Promise<SolverResult> {
    // 1. 符號分析 (僅在拓撲變化時執行)
    if (!this.isAnalyzed) {
      const analyzed = this.kluSolver.analyze(
        matrix.n, 
        matrix.colPointers, 
        matrix.rowIndices
      );
      
      if (!analyzed) {
        throw new Error('KLU symbolic analysis failed');
      }
      this.isAnalyzed = true;
    }

    // 2. 數值分解
    const factorized = this.kluSolver.factorize(matrix.values);
    if (!factorized) {
      throw new Error('KLU factorization failed - matrix may be singular');
    }

    // 3. 前向/後向替換求解
    const result = this.kluSolver.solve(Array.from(rhs));
    
    if (!result.success) {
      throw new Error(`KLU solve failed: ${result.error}`);
    }

    return {
      solution: new Float64Array(result.solution),
      conditionNumber: result.conditionNumber,
      iterations: result.iterations,
      residualNorm: this.computeResidual(matrix, rhs, result.solution)
    };
  }
}
```

### 3. 智能 DeviceModel API - 穩健非線性求解

**問題**: 傳統 `stamp()` 方法過於簡單，缺乏收斂控制。

**解決方案**: 全新的智能設備模型介面

```typescript
/**
 * 次世代設備模型介面
 * 每個非線性器件提供完整的收斂控制能力
 */
interface IIntelligentDeviceModel {
  /**
   * 計算器件在當前工作點的電流和雅可比
   */
  load(op: OperatingPoint): DeviceResponse;

  /**
   * 檢查器件是否在當前迭代中收斂
   */
  checkConvergence(
    currentOp: OperatingPoint,
    previousOp: OperatingPoint,
    tolerance: number
  ): ConvergenceStatus;

  /**
   * 限制 Newton 更新步長，防止發散
   */
  limitUpdate(
    proposedDelta: VoltageUpdate,
    currentOp: OperatingPoint
  ): VoltageUpdate;

  /**
   * 提供器件的特徵尺度，用於歸一化
   */
  getCharacteristicScales(): DeviceScales;

  /**
   * 戳印到 MNA 系統
   */
  stamp(system: IMNASystem, op: OperatingPoint): void;

  /**
   * 事件檢測 (對開關器件)
   */
  detectEvents?(
    t0: Time, t1: Time,
    op0: OperatingPoint, op1: OperatingPoint
  ): DeviceEvent[];
}

/**
 * 現代化二極體模型實現
 */
export class IntelligentDiode implements IIntelligentDeviceModel {
  constructor(
    private anode: NodeId,
    private cathode: NodeId, 
    private params: DiodeParameters
  ) {}

  load(op: OperatingPoint): DeviceResponse {
    const Vd = op.getVoltage(this.anode) - op.getVoltage(this.cathode);
    
    // Shockley 方程：Id = Is * (exp(Vd/Vt) - 1)
    const Vt = this.params.Vt;
    const Is = this.params.Is;
    
    // 數值穩定的指數計算
    let expTerm: number;
    if (Vd > 10 * Vt) {
      // 防止溢出：使用線性近似
      expTerm = Math.exp(10) * (1 + (Vd - 10*Vt) / Vt);
    } else if (Vd < -10 * Vt) {
      // 深度反偏：近似為 -Is
      expTerm = 0;
    } else {
      expTerm = Math.exp(Vd / Vt);
    }
    
    const Id = Is * (expTerm - 1);
    const Gd = Is * expTerm / Vt;  // dId/dVd
    
    return {
      current: Id,
      jacobian: Gd,
      isLinear: false,
      powerDissipation: Vd * Id
    };
  }

  checkConvergence(
    current: OperatingPoint,
    previous: OperatingPoint, 
    tolerance: number
  ): ConvergenceStatus {
    const Vd_curr = current.getVoltage(this.anode) - current.getVoltage(this.cathode);
    const Vd_prev = previous.getVoltage(this.anode) - previous.getVoltage(this.cathode);
    
    const deltaVd = Math.abs(Vd_curr - Vd_prev);
    const relativeChange = deltaVd / Math.max(Math.abs(Vd_curr), 0.001);
    
    return {
      converged: deltaVd < tolerance && relativeChange < 0.001,
      residual: deltaVd,
      relativeChange,
      limitingFactor: deltaVd > 0.1 ? 'voltage_step' : 'none'
    };
  }

  limitUpdate(
    delta: VoltageUpdate,
    current: OperatingPoint
  ): VoltageUpdate {
    const Vd = current.getVoltage(this.anode) - current.getVoltage(this.cathode);
    const deltaVd = delta.get(this.anode) - delta.get(this.cathode);
    
    // 限制單次電壓變化，防止指數函數溢出
    const maxDelta = 0.2;  // 200mV 限制
    
    if (Math.abs(deltaVd) > maxDelta) {
      const scale = maxDelta / Math.abs(deltaVd);
      return delta.scale(scale);
    }
    
    return delta;
  }

  stamp(system: IMNASystem, op: OperatingPoint): void {
    const response = this.load(op);
    
    // Norton 等效電路戳印
    const Geq = response.jacobian;
    const Ieq = response.current - response.jacobian * 
                 (op.getVoltage(this.anode) - op.getVoltage(this.cathode));
    
    // 戳印電導
    system.stamp(this.anode, this.anode, Geq);
    system.stamp(this.cathode, this.cathode, Geq);
    system.stamp(this.anode, this.cathode, -Geq);
    system.stamp(this.cathode, this.anode, -Geq);
    
    // 戳印等效電流源
    system.stampCurrent(this.anode, Ieq);
    system.stampCurrent(this.cathode, -Ieq);
  }
}
```

## 🏗️ 實施藍圖 - Phase by Phase

### Phase 1: 數學核心與 WASM 集成 (2-3 週) 🎯

這是整個現代化架構的**基石**，必須首先建立：

```bash
# 目標結構
wasm/
├── cpp/
│   ├── klu_interface.cpp        # C++ WASM 接口
│   ├── CMakeLists.txt          # 編譯配置
│   └── build_wasm.sh           # 自動化編譯腳本
├── js/
│   ├── klu_solver.wasm         # 編譯產物
│   ├── klu_solver.js           # WASM 載入器
│   └── types.d.ts              # TypeScript 定義
└── tests/
    ├── matrix_benchmark.ts      # 性能測試
    └── accuracy_validation.ts   # 精度驗證
```

**關鍵里程碑:**
- [ ] 建立 Emscripten 開發環境
- [ ] 成功編譯 SuiteSparse KLU 為 WASM
- [ ] TypeScript 成功調用 WASM KLU 求解 1000×1000 稀疏矩陣
- [ ] 性能驗證：比純 JS 實現快 10x+

### Phase 2: 廣義 Alpha 積分器 (1-2 週) 🔬

取代過時的 BDF 方法：

```bash
src/core/integrators/
├── generalized_alpha.ts        # 核心積分器
├── timestep_controller.ts      # 自適應步長控制  
├── error_estimator.ts          # LTE 估計器
└── integration_benchmarks.ts   # 與 BDF/梯形法對比
```

**驗證測試:**
- [ ] RLC 諧振電路：無數值阻尼
- [ ] Buck 轉換器：開關瞬間精確捕捉
- [ ] 剛性測試問題：范德波爾方程

### Phase 3: 智能設備模型 (2 週) 🧠

實現穩健的非線性求解：

```bash
src/devices/intelligent/
├── base_device.ts              # 智能設備基類
├── diode_intelligent.ts        # 智能二極體
├── mosfet_intelligent.ts       # 智能 MOSFET
└── convergence_analyzer.ts     # 收斂分析器
```

**驗證目標:**
- [ ] 二極體整流器：零收斂失敗
- [ ] MOSFET 開關：平滑狀態轉換
- [ ] 極端條件：溫度、電壓變化穩定性

### Phase 4: Buck 轉換器完美驗證 (1 週) 🏆

**終極目標**: 在新架構下實現「開箱即用」的精確模擬

```typescript
// 目標：這段代碼應該完美運行
const buck = new BuckConverter({
  inputVoltage: 12,
  outputVoltage: 5, 
  switchingFrequency: 100e3,
  loadCurrent: 2
});

const simulator = new AkingSPICE21({
  integrator: 'generalized-alpha',
  solver: 'klu-wasm',
  tolerance: 1e-9
});

const result = await simulator.transient({
  circuit: buck,
  timeSpan: [0, 100e-6],  // 100μs
  maxTimestep: 1e-7
});

// 期望結果：
// ✅ 仿真時間：< 50ms (vs 舊架構 >10s)  
// ✅ 零數值振盪
// ✅ 精確的開關瞬間
// ✅ 穩定的輸出電壓紋波
console.log(`仿真完成: ${result.statistics.totalTime}ms`);
console.log(`事件數量: ${result.events.length}`);
console.log(`矩陣求解: ${result.statistics.matrixSolves}`);
```

## 🎯 成功指標

### 技術指標 (vs AkingSPICE 2.0)
- **性能提升**: 100x (Buck 轉換器 10s → <100ms)
- **數值穩定性**: 零開關抖動 vs 頻繁抖動
- **精度提升**: 相對誤差 <1ppm vs >1%
- **記憶體效率**: 稀疏存儲節約 90%+

### 開發效率指標
- **調試時間**: -95% (清晰錯誤信息)
- **新器件開發**: 1小時 vs 數天
- **代碼可讀性**: 現代 TypeScript vs 複雜 MCP

---

## 🚀 立即行動

**我強烈建議我們立即啟動 Phase 1**，這是整個革命性架構的基石。一旦我們掌握了 WASM + KLU 的超高性能稀疏求解，後續的廣義 Alpha 積分器和智能設備模型就能在穩固的基礎上快速實現。

您準備好開始這場**電力電子模擬的技術革命**了嗎？🔥