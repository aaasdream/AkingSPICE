# AkingSPICE 2.1 嚴謹測試策略與驗證框架

## 目錄
1. [測試哲學與目標](#1-測試哲學與目標)
2. [測試金字塔架構](#2-測試金字塔架構)
3. [測試分層策略](#3-測試分層策略)
4. [驗證基準與通過標準](#4-驗證基準與通過標準)
5. [測試實施路線圖](#5-測試實施路線圖)
6. [持續集成與回歸測試](#6-持續集成與回歸測試)

---

## 1. 測試哲學與目標

### 1.1 核心問題分析
過去測試失敗的根本原因：
- ❌ **孤立測試陷阱**: 單元測試只驗證元件能"填充矩陣"，未驗證矩陣是否"可求解"
- ❌ **缺乏物理驗證**: 未檢查仿真結果是否符合電路基本定律（KCL、KVL、能量守恆）
- ❌ **無漸進式驗證**: 直接跳到複雜電路，無法定位問題根源
- ❌ **忽略數值穩定性**: 未測試極端工況（剛性、快速開關、大時間步長）

### 1.2 新測試哲學
```
單元正確性 → 集成可求解性 → 物理準確性 → 數值魯棒性 → 工程可用性
```

每一層都必須**量化驗證**，不能僅憑"沒報錯"就通過。

---

## 2. 測試金字塔架構

```
                    ┌─────────────────┐
                    │  L5: 工業標準   │  (LTspice/PSIM 對比)
                    │   基準測試      │  
                    └─────────────────┘
                  ┌───────────────────────┐
                  │  L4: 典型應用電路     │  (Buck/Boost/Flyback)
                  │    系統級測試         │  (10-20 個測試)
                  └───────────────────────┘
              ┌─────────────────────────────┐
              │  L3: 子系統集成測試          │  (RC/RL/RLC/非線性組合)
              │   (多元件協同驗證)            │  (50-100 個測試)
              └─────────────────────────────┘
          ┌───────────────────────────────────┐
          │  L2: 核心算法集成測試              │  (MNA求解/積分器/事件檢測)
          │   (可求解性與收斂性)                │  (100-200 個測試)
          └───────────────────────────────────┘
      ┌─────────────────────────────────────────┐
      │  L1: 單元測試                            │  (元件接口/矩陣裝配/數學工具)
      │   (接口正確性與基本功能)                  │  (200-300 個測試)
      └─────────────────────────────────────────┘
```

---

## 3. 測試分層策略

### Layer 1: 單元測試 (Unit Tests)
**目標**: 驗證每個模塊的接口契約與基本功能。

#### 3.1.1 數學庫測試 (`src/math/`)
```typescript
// 測試文件: tests/unit/math/sparse_matrix.test.ts
describe('SparseMatrix', () => {
  test('基本操作: add/get/set', () => {
    const mat = new SparseMatrix(3);
    mat.add(0, 0, 5.0);
    expect(mat.get(0, 0)).toBeCloseTo(5.0);
  });

  test('矩陣向量乘法: y = A*x', () => {
    // 構建已知矩陣 A，計算 y = A*x，驗證結果
  });

  test('稀疏性保持: 零值不應存儲', () => {
    mat.add(1, 1, 1e-20); // 接近零
    expect(mat.getNonZeroCount()).toBe(0);
  });
});

describe('LUSolver', () => {
  test('求解簡單線性系統: [2,1;1,2]*x = [3;3]', () => {
    // 已知解 x = [1, 1]，驗證求解器精度
  });

  test('病態矩陣檢測: 條件數過大應報錯', () => {
    // 構建條件數 > 1e12 的矩陣，驗證是否拋出異常
  });
});
```

#### 3.1.2 被動元件測試 (`src/components/passive/`)
```typescript
// 測試文件: tests/unit/components/resistor.test.ts
describe('Resistor', () => {
  test('接口完整性: 實現所有必需方法', () => {
    const R = new Resistor('R1', 'n1', 'n2', 1000);
    expect(R.assemble).toBeDefined();
    expect(R.validate().isValid).toBe(true);
  });

  test('DC裝配: G矩陣正確性', () => {
    const G = new SparseMatrix(2);
    const rhs = new Vector(2);
    const nodeMap = new Map([['n1', 0], ['n2', 1]]);
    
    R.assemble({ matrix: G, rhs, nodeMap, currentTime: 0, dt: 0 });
    
    // 驗證 G[0,0] = 1/R, G[1,1] = 1/R, G[0,1] = -1/R, G[1,0] = -1/R
    expect(G.get(0, 0)).toBeCloseTo(0.001, 6);
    expect(G.get(0, 1)).toBeCloseTo(-0.001, 6);
  });

  test('邊界條件: R=0 應拋出驗證錯誤', () => {
    expect(() => new Resistor('R1', 'n1', 'n2', 0)).toThrow();
  });
});

describe('Capacitor', () => {
  test('瞬態裝配: 隱式歐拉離散化', () => {
    // C * dV/dt ≈ C * (V_n - V_{n-1}) / dt
    // 等效電導 G_eq = C / dt
    // 等效電流 I_eq = C * V_{n-1} / dt
    const C = new Capacitor('C1', 'n1', 'gnd', 1e-6);
    const G = new SparseMatrix(2);
    const rhs = new Vector(2);
    const dt = 1e-6;
    const prevV = new Vector(2);
    prevV.set(0, 5.0); // 前一時刻電壓 = 5V
    
    C.assemble({ 
      matrix: G, 
      rhs, 
      nodeMap: new Map([['n1', 0], ['gnd', 1]]), 
      dt, 
      previousSolutionVector: prevV 
    });
    
    const G_eq = 1e-6 / dt; // = 1.0
    const I_eq = 1e-6 * 5.0 / dt; // = 5.0
    
    expect(G.get(0, 0)).toBeCloseTo(G_eq, 3);
    expect(rhs.get(0)).toBeCloseTo(I_eq, 3);
  });
});
```

#### 3.1.3 智能設備測試 (`src/core/devices/`)
```typescript
describe('IntelligentDiode', () => {
  test('正向導通區: 指數特性', () => {
    const D = new IntelligentDiode('D1', 'anode', 'cathode', { Is: 1e-14, N: 1 });
    // 設置 Vd = 0.7V (正向偏壓)
    // 驗證電流 I ≈ Is * (exp(Vd / (N*Vt)) - 1)
  });

  test('反向截止區: 漏電流', () => {
    // 設置 Vd = -10V (反向偏壓)
    // 驗證 I ≈ -Is
  });

  test('limitUpdate: 防止電壓突變', () => {
    // 當 Newton 迭代嘗試 deltaV = 5V 時
    // limitUpdate 應限制為 < 1V
  });
});
```

---

### Layer 2: 核心算法集成測試
**目標**: 驗證求解器、積分器、事件檢測器的正確性與收斂性。

#### 3.2.1 MNA 系統構建測試
```typescript
// 測試文件: tests/integration/mna/mna_assembly.test.ts
describe('MNA系統構建', () => {
  test('純阻性網絡: 2R串聯分壓', () => {
    // V_in --[R1=1k]--n1--[R2=1k]-- GND
    // 已知解: V(n1) = V_in / 2
    
    const circuit = new Circuit();
    circuit.addComponent(new VoltageSource('Vin', 'V_in', 'gnd', 10));
    circuit.addComponent(new Resistor('R1', 'V_in', 'n1', 1000));
    circuit.addComponent(new Resistor('R2', 'n1', 'gnd', 1000));
    
    const engine = new CircuitSimulationEngine(circuit);
    const dcResult = engine.runDCAnalysis();
    
    expect(dcResult.solution.get('n1')).toBeCloseTo(5.0, 4); // ±0.01%
  });

  test('擴展MNA: 電感電流作為額外變量', () => {
    // V_in --[L=1mH]-- GND
    // DC穩態: I_L 應由 V_in/R_source 決定（若有串聯電阻）
    // 驗證額外變量索引正確分配
  });

  test('矩陣奇異性檢測: 懸空節點', () => {
    // 創建一個無連接路徑的節點
    // 期望在求解時拋出 "Singular matrix" 錯誤
  });
});
```

#### 3.2.2 DC 求解器測試（Homotopy 方法）
```typescript
describe('DC Analysis with Homotopy', () => {
  test('Source Stepping: 非線性電阻網絡', () => {
    // 構建包含非線性電阻的電路
    // 驗證從 V_source = 0 逐步增加到目標值時能收斂
  });

  test('Gmin Stepping: 強非線性二極體電路', () => {
    // 二極體整流電路
    // 初始添加 Gmin 並行電導，逐步移除
    // 驗證最終能收斂到正確解
  });

  test('收斂失敗記錄: 超過最大迭代次數', () => {
    // 構建病態電路（如負阻）
    // 驗證引擎能優雅地報告失敗並記錄診斷信息
  });
});
```

#### 3.2.3 瞬態積分器測試
```typescript
describe('GeneralizedAlphaIntegrator', () => {
  test('一階RC電路: 解析解對比', () => {
    // V_in(t) = 1.0 (階躍)  --[R=1k]--+--[C=1μF]-- GND
    //                                  |
    //                                V_out
    // 解析解: V_out(t) = V_in * (1 - exp(-t / τ))，τ = RC = 1ms
    
    const circuit = buildRCCircuit();
    const engine = new CircuitSimulationEngine(circuit);
    const result = engine.runTransientAnalysis(0, 5e-3, 1e-5); // 0-5ms, dt=10μs
    
    for (const point of result.timePoints) {
      const t = point.time;
      const v_sim = point.solution.get('V_out');
      const v_analytical = 1.0 * (1 - Math.exp(-t / 1e-3));
      expect(v_sim).toBeCloseTo(v_analytical, 2); // ±1%
    }
  });

  test('二階RLC諧振: 頻率與阻尼', () => {
    // 串聯RLC，階躍響應
    // 驗證振盪頻率 f_d = f_0 * sqrt(1 - ζ²)
    // 驗證包絡線衰減率 exp(-ζ * ω_0 * t)
  });

  test('數值穩定性: 剛性問題', () => {
    // 大電容與小電阻組合 (τ_fast = 1ns, τ_slow = 1ms)
    // 使用 dt = 100μs 仍應穩定（L-穩定性測試）
  });
});
```

#### 3.2.4 事件檢測測試
```typescript
describe('EventDetector', () => {
  test('零交叉檢測: 正弦波過零點', () => {
    // V(t) = sin(2π * 60 * t)
    // 在 t = 0, 8.33ms, 16.67ms, ... 處應檢測到事件
  });

  test('二分法精度: 開關瞬間', () => {
    // MOSFET 從截止到導通
    // 事件時間誤差應 < dt / 100
  });

  test('連續事件處理: 避免無限循環', () => {
    // 構建在同一時間點觸發多個事件的場景
    // 驗證引擎能正確處理並前進
  });
});
```

---

### Layer 3: 子系統集成測試（Multi-Component）
**目標**: 驗證多個元件協同工作時的物理準確性。

#### 3.3.1 線性電路基準測試
```typescript
describe('Linear Circuits Benchmark', () => {
  test('RC低通濾波器: 頻率響應', () => {
    // 輸入: V_in(t) = sum(A_k * sin(2π * f_k * t)), f_k = [1Hz, 10Hz, 100Hz, 1kHz]
    // 截止頻率 f_c = 1/(2π*RC)
    // 驗證: 
    //   - f < f_c 時，增益 ≈ 0dB
    //   - f = f_c 時，增益 ≈ -3dB
    //   - f > f_c 時，增益下降 20dB/decade
  });

  test('RL電路: 電感電流連續性', () => {
    // 階躍輸入，驗證 I_L(t) = (V/R) * (1 - exp(-R*t/L))
    // 並驗證相鄰時間點的電流變化 dI/dt = V/L
  });

  test('理想變壓器: 電壓電流關係', () => {
    // N1:N2 = 10:1
    // 驗證 V2/V1 = N2/N1 且 I1/I2 = N2/N1
  });
});
```

#### 3.3.2 非線性電路測試
```typescript
describe('Nonlinear Circuits', () => {
  test('二極體整流器: 輸出紋波', () => {
    // 單相半波整流 + RC 濾波
    // 驗證:
    //   - V_dc ≈ V_peak / π (無濾波)
    //   - 紋波頻率 = 2 * f_line (全波)
  });

  test('MOSFET開關: 電壓尖峰與振鈴', () => {
    // 感性負載 + MOSFET 開關
    // 驗證關斷瞬間的 V_ds 尖峰和振鈴頻率
  });

  test('飽和與截止轉換: 工作區正確性', () => {
    // 檢查 MOSFET 在整個仿真期間的工作區記錄
    // 驗證截止→線性→飽和的轉換符合 Vgs、Vds 關係
  });
});
```

#### 3.3.3 能量守恆驗證
```typescript
describe('Energy Conservation', () => {
  test('LC振盪器: 總能量恆定', () => {
    // E_total = (1/2) * L * I² + (1/2) * C * V²
    // 在無阻尼情況下，每個時間點的總能量應恆定 (誤差 < 0.1%)
  });

  test('RC充放電: 能量耗散', () => {
    // 充電階段: E_dissipated_R = ∫ I²R dt
    // E_stored_C = (1/2) * C * V²
    // 驗證 E_source = E_dissipated + E_stored
  });
});
```

---

### Layer 4: 典型應用電路測試（System-Level）
**目標**: 驗證引擎能處理實際工程電路，並與已知正確結果對比。

#### 3.4.1 DC-DC 轉換器
```typescript
describe('Buck Converter (降壓轉換器)', () => {
  test('連續導通模式 CCM: 輸出電壓調節', () => {
    // 參數: V_in = 12V, V_out = 5V, f_sw = 100kHz, L = 10μH, C = 100μF
    // 驗證:
    //   - V_out 穩態值 = D * V_in (D = 占空比)
    //   - 電感電流紋波 ΔI_L = (V_in - V_out) * D / (f_sw * L)
    //   - 輸出電壓紋波 ΔV_out < 50mV
  });

  test('斷續導通模式 DCM: 輕載條件', () => {
    // 輸出電流 < I_crit
    // 驗證電感電流在每個週期內歸零
  });

  test('動態響應: 負載突變', () => {
    // t = 1ms 時，負載從 0.5A 突變到 2A
    // 驗證輸出電壓跌落 < 10% 且恢復時間 < 500μs
  });
});

describe('Boost Converter (升壓轉換器)', () => {
  test('電壓增益: V_out = V_in / (1-D)', () => {
    // 多個工作點測試 (D = 0.3, 0.5, 0.7)
  });

  test('右半平面零點: 小信號響應', () => {
    // 驗證 PWM 占空比擾動時的輸出響應相位
  });
});
```

#### 3.4.2 諧振轉換器
```typescript
describe('LLC Resonant Converter', () => {
  test('諧振頻率: 增益特性', () => {
    // 驗證在 f_sw = f_r 時增益為 1
    // f_sw < f_r 時為升壓模式
    // f_sw > f_r 時為降壓模式
  });

  test('軟開關: ZVS 驗證', () => {
    // 檢查 MOSFET 開通瞬間的 V_ds
    // 應接近零 (Zero Voltage Switching)
  });
});
```

#### 3.4.3 PFC 電路
```typescript
describe('Power Factor Correction', () => {
  test('Boost PFC: 功率因數與THD', () => {
    // 輸入: V_ac = 220V, 50Hz
    // 驗證:
    //   - PF > 0.99
    //   - THD < 5%
  });
});
```

---

### Layer 5: 工業標準基準測試
**目標**: 與商業工具（LTspice, PSIM, Saber）的結果進行定量對比。

#### 3.5.1 對比測試方法論
```typescript
describe('LTspice Benchmark Comparison', () => {
  test('標準電路庫對比', () => {
    // 1. 使用相同的電路拓撲和參數
    // 2. 在 LTspice 中運行並導出波形 (CSV)
    // 3. 在 AkingSPICE 中運行
    // 4. 計算誤差指標:
    //    - 最大絕對誤差: max(|V_AkingSPICE - V_LTspice|)
    //    - 均方根誤差: sqrt(mean((V_AkingSPICE - V_LTspice)²))
    //    - 相對誤差: max(|V_AkingSPICE - V_LTspice| / |V_LTspice|)
    
    const benchmark = new LTspiceBenchmark('buck_converter_basic.asc');
    const ltspiceData = benchmark.loadLTspiceResults();
    const akingData = engine.runTransientAnalysis(...);
    
    const comparison = compareWaveforms(ltspiceData, akingData);
    
    expect(comparison.maxAbsError).toBeLessThan(0.05); // < 50mV
    expect(comparison.rmsError).toBeLessThan(0.01);    // < 10mV
    expect(comparison.maxRelError).toBeLessThan(0.02); // < 2%
  });
});
```

---

## 4. 驗證基準與通過標準

### 4.1 數值精度標準

| 電路類型 | 最大相對誤差 | RMS誤差 | 能量誤差 |
|---------|-------------|---------|----------|
| 純線性 (RC/RL/RLC) | < 0.1% | < 0.05% | < 0.01% |
| 二極體整流 | < 1% | < 0.5% | < 0.1% |
| MOSFET 開關 | < 2% | < 1% | < 0.5% |
| DC-DC 轉換器 | < 3% | < 2% | < 1% |
| 諧振轉換器 | < 5% | < 3% | < 2% |

### 4.2 收斂性標準

- **DC 分析**: 
  - 正常電路（線性/弱非線性）: 100% 收斂
  - 強非線性電路: > 95% 收斂（配合 Homotopy）
  
- **瞬態分析**:
  - 步長自適應成功率: > 99%
  - 事件檢測誤差: < dt / 100

### 4.3 性能標準

- **求解速度**: 
  - 小電路 (< 20 節點): < 100ms per time step
  - 中型電路 (20-100 節點): < 500ms per time step
  - 大型電路 (100-500 節點): < 2s per time step

- **內存效率**:
  - 稀疏矩陣存儲: 僅非零元素
  - 波形數據壓縮: 自適應採樣

---

## 5. 測試實施路線圖

### Phase 1: 基礎設施搭建 (Week 1-2)
- [ ] 建立測試框架 (Jest/Mocha)
- [ ] 實現測試工具類:
  - `CircuitBuilder`: 程序化構建測試電路
  - `WaveformComparator`: 波形數據對比工具
  - `AnalyticalSolution`: 常見電路的解析解庫
- [ ] 設置 CI/CD 流水線

### Phase 2: Layer 1 + 2 完成 (Week 3-4)
- [ ] 所有單元測試通過 (> 300 個測試)
- [ ] 核心算法測試通過 (> 150 個測試)
- [ ] 代碼覆蓋率 > 80%

### Phase 3: Layer 3 完成 (Week 5-6)
- [ ] 子系統集成測試通過 (> 80 個測試)
- [ ] 物理驗證通過 (KCL/KVL/能量守恆)

### Phase 4: Layer 4 + 5 完成 (Week 7-8)
- [ ] 典型應用電路測試通過 (> 15 個完整電路)
- [ ] LTspice 基準對比通過 (誤差 < 標準)

### Phase 5: 回歸測試與優化 (Ongoing)
- [ ] 每次代碼提交自動運行全量測試
- [ ] 性能回歸檢測
- [ ] 新增測試案例持續擴充

---

## 6. 持續集成與回歸測試

### 6.1 CI 工作流程
```yaml
# .github/workflows/ci.yml
name: AkingSPICE CI

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      
      - name: Install Dependencies
        run: npm install
      
      - name: Run Layer 1 Tests (Unit)
        run: npm run test:unit
      
      - name: Run Layer 2 Tests (Core)
        run: npm run test:core
      
      - name: Run Layer 3 Tests (Integration)
        run: npm run test:integration
      
      - name: Run Layer 4 Tests (System)
        run: npm run test:system
        
      - name: Code Coverage Report
        run: npm run coverage
      
      - name: Performance Benchmark
        run: npm run benchmark
```

### 6.2 測試報告模板

每次測試運行應生成報告：

```
====================================
AkingSPICE Test Report
Date: 2025-10-10 14:30:00
Commit: a3f5d2b
====================================

[Layer 1] Unit Tests
  ✓ 287 passed
  ✗ 3 failed
  ⊗ 2 skipped
  Coverage: 84.5%

[Layer 2] Core Algorithm Tests  
  ✓ 145 passed
  ✗ 1 failed
  Coverage: 78.2%

[Layer 3] Integration Tests
  ✓ 76 passed
  ✗ 5 failed

[Layer 4] System Tests
  ✓ 12 passed
  ✗ 3 failed

[Failed Tests Detail]
  ❌ test/unit/devices/mosfet.test.ts:45
     Expected: 2.5, Received: 2.47
     Error: Drain current mismatch > 1%
  
  ❌ test/system/buck_converter.test.ts:123
     DC analysis failed to converge after 50 iterations

[Performance Benchmark]
  Buck Converter (50 nodes, 1ms sim): 2.3s (↑ 0.5s from baseline)
  ⚠️  Performance regression detected!

====================================
Overall Status: ❌ FAILED
Critical Issues: 2
====================================
```

---

## 7. 測試工具與最佳實踐

### 7.1 測試工具類實現示例

```typescript
// tests/utils/CircuitBuilder.ts
export class CircuitBuilder {
  private components: ComponentInterface[] = [];
  
  addResistor(name: string, n1: string, n2: string, R: number): this {
    this.components.push(new Resistor(name, n1, n2, R));
    return this;
  }
  
  addVoltageSource(name: string, nP: string, nN: string, V: number): this {
    this.components.push(new VoltageSource(name, nP, nN, V));
    return this;
  }
  
  // ... 其他元件
  
  build(): Circuit {
    const circuit = new Circuit();
    this.components.forEach(c => circuit.addComponent(c));
    return circuit;
  }
  
  // 預定義經典電路
  static buildVoltageDivider(Vin: number, R1: number, R2: number): Circuit {
    return new CircuitBuilder()
      .addVoltageSource('Vin', 'in', 'gnd', Vin)
      .addResistor('R1', 'in', 'out', R1)
      .addResistor('R2', 'out', 'gnd', R2)
      .build();
  }
}
```

```typescript
// tests/utils/AnalyticalSolutions.ts
export class AnalyticalSolutions {
  static rcStepResponse(t: number, V0: number, tau: number): number {
    return V0 * (1 - Math.exp(-t / tau));
  }
  
  static rlcStepResponse(t: number, params: RLCParams): number {
    const { R, L, C, V0 } = params;
    const omega0 = 1 / Math.sqrt(L * C);
    const zeta = R / (2 * Math.sqrt(L / C));
    
    if (zeta < 1) { // 欠阻尼
      const omegaD = omega0 * Math.sqrt(1 - zeta * zeta);
      return V0 * (1 - Math.exp(-zeta * omega0 * t) * 
        (Math.cos(omegaD * t) + (zeta / Math.sqrt(1 - zeta * zeta)) * Math.sin(omegaD * t)));
    }
    // ... 臨界阻尼與過阻尼情況
  }
}
```

### 7.2 物理定律驗證工具

```typescript
// tests/utils/PhysicsValidator.ts
export class PhysicsValidator {
  static validateKCL(circuit: Circuit, solution: IVector, tolerance = 1e-6): ValidationResult {
    // 對每個節點，計算流入電流總和
    // sum(I_in) - sum(I_out) 應 ≈ 0
  }
  
  static validateKVL(circuit: Circuit, solution: IVector, loop: string[]): ValidationResult {
    // 對指定迴路，計算電壓降總和
    // sum(V_drop) 應 ≈ 0
  }
  
  static validateEnergyConservation(
    waveform: TimeSeriesData, 
    components: ComponentInterface[]
  ): EnergyReport {
    // 計算每個時間點的總能量
    // 檢查 dE/dt 是否等於功率耗散
  }
}
```

---

## 8. 結論

這套測試策略的核心原則：

1. **分層漸進**: 從小到大，逐層驗證
2. **物理為先**: 不僅驗證"能算"，更要驗證"算對"
3. **定量標準**: 每個測試都有明確的通過/失敗標準
4. **持續改進**: 測試覆蓋率和基準庫持續擴充

**只有當所有層級的測試都通過時，我們才能有信心地說：AkingSPICE 2.1 是一個可靠的通用電路仿真引擎。**

---

## 附錄 A: 測試命令清單

```bash
# 運行所有測試
npm test

# 分層運行
npm run test:unit           # Layer 1
npm run test:core           # Layer 2  
npm run test:integration    # Layer 3
npm run test:system         # Layer 4
npm run test:benchmark      # Layer 5

# 覆蓋率報告
npm run coverage

# 性能基準測試
npm run benchmark

# 監視模式（開發時使用）
npm run test:watch

# 特定文件測試
npm test -- resistor.test.ts
```

## 附錄 B: 推薦閱讀

- Nagel, L. W. (1975). "SPICE2: A Computer Program to Simulate Semiconductor Circuits"
- Kundert, K. (1995). "The Designer's Guide to SPICE and Spectre"
- Chung, J., & Hulbert, G. (1993). "A Time Integration Algorithm for Structural Dynamics With Improved Numerical Dissipation: The Generalized-α Method"
