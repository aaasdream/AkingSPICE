# AkingSPICE Quick Reference & Cheatsheet

## 🚀 快速開始模板

### 基本設置
```javascript
import { AkingSPICE, VoltageSource, Resistor, Capacitor } from './lib-dist/AkingSPICE.es.js';

const spice = new AkingSPICE();
spice.setDebug(true); // 可選：啟用詳細日誌
```

### 方法1: 網表方式
```javascript
spice.loadNetlist(`
V1 vin gnd DC(5)
R1 vin vout 1k  
C1 vout gnd 1u IC=0
.tran 1u 1m
`);
const result = await spice.runAnalysis();
```

### 方法2: 程式化方式
```javascript
spice.components = [
    new VoltageSource('V1', ['vin', 'gnd'], 5),
    new Resistor('R1', ['vin', 'vout'], 1000),
    new Capacitor('C1', ['vout', 'gnd'], 1e-6, {ic: 0})
];
const result = await spice.runTransientAnalysis('.tran 1u 1m');
```

---

## 📦 元件創建速查

### 被動元件
```javascript
// 電阻 (支援工程記號: 1k, 2.2M, 3.3m)
new Resistor('R1', ['n1', 'n2'], 1000)           // 1kΩ
new Resistor('R2', ['n1', 'n2'], '4.7k')         // 4.7kΩ

// 電容 (ic: 初始電壓)
new Capacitor('C1', ['n1', 'n2'], 1e-6)          // 1μF
new Capacitor('C2', ['n1', 'n2'], 100e-9, {ic: 2.5}) // 100nF, 初始2.5V

// 電感 (ic: 初始電流)
new Inductor('L1', ['n1', 'n2'], 1e-3)           // 1mH
new Inductor('L2', ['n1', 'n2'], 10e-6, {ic: 0.1}) // 10μH, 初始100mA
```

### 信號源
```javascript
// 直流電壓源
new VoltageSource('V1', ['vin', 'gnd'], 5)       // 5V直流
new VoltageSource('V2', ['vin', 'gnd'], 'DC(12)') // 12V直流

// 正弦波源 SIN(offset amplitude frequency [phase] [damping])
new VoltageSource('VAC', ['ac', 'gnd'], 'SIN(0 1 1000)') // 1V@1kHz
new VoltageSource('VAC2', ['ac', 'gnd'], 'SIN(2.5 0.5 50)') // 2.5V偏置+0.5V@50Hz

// 脈衝源 PULSE(v1 v2 tdelay trise tfall twidth tperiod)
new VoltageSource('VPULSE', ['clk', 'gnd'], 'PULSE(0 5 0 1n 1n 10u 20u)')

// 電流源
new CurrentSource('I1', ['n1', 'n2'], 0.001)     // 1mA電流源
```

### 受控源
```javascript
// 電壓控制電壓源 (增益=100)
new VCVS('E1', ['out+', 'out-'], ['in+', 'in-'], 100)

// 電壓控制電流源 (轉導=1mS)  
new VCCS('G1', ['out+', 'out-'], ['in+', 'in-'], 0.001)

// 電流控制電壓源 (轉阻=1kΩ)
new CCVS('H1', ['out+', 'out-'], 'Vsense', 1000)

// 電流控制電流源 (增益=10)
new CCCS('F1', ['out+', 'out-'], 'Vsense', 10)
```

### 半導體元件
```javascript
// 二極體
new Diode('D1', ['anode', 'cathode'])
new Diode('D2', ['anode', 'cathode'], {is: 1e-14, n: 1.0})

// MOSFET [drain, gate, source, bulk]
new MOSFET('M1', ['d', 'g', 's', 's'], {type: 'NMOS'})
new MOSFET('M2', ['d', 'g', 's', 'vss'], {type: 'PMOS', vth: -1.0})
```

---

## ⚡ 分析命令速查

### DC分析
```javascript
const dcResult = await spice.runDCAnalysis();
console.log('節點電壓:', dcResult.nodeVoltages);
console.log('元件電流:', dcResult.componentCurrents);
```

### 暫態分析
```javascript
// .tran <tstep> <tstop> [tstart] [tmax]
const result = await spice.runTransientAnalysis('.tran 1u 10m');   // 1μs步長, 10ms總時間
const result2 = await spice.runTransientAnalysis('.tran 100n 1m 0 50n'); // 自適應步長

// 獲取結果
const timeArray = result.timePoints;
const vout = result.nodeVoltages.get('vout');  // Float64Array
```

### 通用分析
```javascript
// 自動判斷分析類型
const result = await spice.runAnalysis('.tran 1u 1m');
const result2 = await spice.runAnalysis('.dc');
const result3 = await spice.runAnalysis(); // 預設DC分析
```

---

## 📊 結果訪問速查

### 節點電壓
```javascript
// DC結果
const vout_dc = result.nodeVoltages.get('vout');        // 單個數值

// 暫態結果  
const vout_tran = result.nodeVoltages.get('vout');      // Float64Array
const vout_at_1ms = vout_tran[Math.floor(0.001 / timeStep)];

// 遍歷所有節點
for (const [nodeName, voltage] of result.nodeVoltages.entries()) {
    console.log(`${nodeName}: ${voltage}V`);
}
```

### 元件電流
```javascript
// 元件電流 (從正端流入為正)
const ir1 = result.componentCurrents.get('R1');
const ic1 = result.componentCurrents.get('C1');

// 功率計算
const power = voltage * current;
```

### 狀態變量 (暫態分析)
```javascript
// 電容電壓、電感電流
const vcap = result.stateVariables.get('C1');  // 電容電壓歷史
const iind = result.stateVariables.get('L1');  // 電感電流歷史
```

---

## 🔧 求解器使用速查

### CPU求解器 (小型電路 <50節點)
```javascript
import { ExplicitStateSolver } from './lib-dist/AkingSPICE.es.js';

const solver = new ExplicitStateSolver({debug: true});
await solver.initialize(components, 1e-6); // 1μs時間步長

// 逐步仿真
for (let i = 0; i < 1000; i++) {
    const result = await solver.step();
    console.log(`t=${result.time}: V_out=${result.nodeVoltages[1]}`);
}
```

### GPU求解器 (大型電路 >50節點, 瀏覽器環境)
```javascript
import { GPUExplicitStateSolver } from './lib-dist/AkingSPICE.es.js';

const gpuSolver = new GPUExplicitStateSolver();
await gpuSolver.initialize(components, 1e-6);

// GPU加速仿真 (4.6倍性能提升)
const result = await gpuSolver.step();
```

---

## 🎯 常用電路模式

### RC充電電路
```javascript
const RC_CIRCUIT = [
    new VoltageSource('V1', ['vin', 'gnd'], 5),
    new Resistor('R1', ['vin', 'vout'], 1000),
    new Capacitor('C1', ['vout', 'gnd'], 1e-6, {ic: 0})
];
// 時間常數 τ = RC = 1ms
// 99%充電時間 = 5τ = 5ms
```

### RLC諧振電路
```javascript
const L = 10e-6, C = 1e-6, R = 5;  // 10μH, 1μF, 5Ω

const RLC_CIRCUIT = [
    new VoltageSource('V1', ['vin', 'gnd'], 'PULSE(0 5 0 1n 1n 1u 10u)'),
    new Resistor('R1', ['vin', 'n1'], R),
    new Inductor('L1', ['n1', 'n2'], L, {ic: 0}),
    new Capacitor('C1', ['n2', 'gnd'], C, {ic: 0})
];

// 諧振頻率 f₀ = 1/(2π√LC) ≈ 50.3kHz
// 品質因子 Q = (1/R)√(L/C) = 0.632
```

### 運算放大器
```javascript
const OPAMP_CIRCUIT = [
    new VoltageSource('VIN', ['vin', 'gnd'], 'SIN(0 0.1 1000)'),
    new VoltageSource('VDD', ['vdd', 'gnd'], 15),
    new VoltageSource('VSS', ['vss', 'gnd'], -15),
    new Resistor('RIN', ['vin', 'n_minus'], 1000),      // 輸入電阻
    new Resistor('RF', ['n_minus', 'vout'], 10000),     // 回授電阻 
    new VCVS('E1', ['vout', 'gnd'], ['n_plus', 'n_minus'], 100000) // 理想運放
];
// 增益 = -RF/RIN = -10
```

### 切換式電源 (Buck轉換器)
```javascript
const BUCK_CONVERTER = [
    new VoltageSource('VIN', ['vin', 'gnd'], 12),
    // 開關 (用MOSFET + 控制信號模擬)
    new MOSFET('SW', ['vin', 'gate', 'lx', 'gnd'], {type: 'NMOS'}),
    new VoltageSource('VGATE', ['gate', 'gnd'], 'PULSE(0 10 0 1n 1n 5u 10u)'), // 50% duty
    // 續流二極體
    new Diode('D1', ['gnd', 'lx']),
    // LC濾波器
    new Inductor('L1', ['lx', 'vout'], 100e-6, {ic: 0}),
    new Capacitor('C1', ['vout', 'gnd'], 100e-6, {ic: 0}),
    new Resistor('RLOAD', ['vout', 'gnd'], 10)  // 負載
];
// 理論輸出電壓 = VIN × duty_cycle = 12V × 0.5 = 6V
```

---

## 🐛 調試與優化速查

### 調試技巧
```javascript
// 啟用詳細日誌
spice.setDebug(true);
solver.initialize(components, timeStep, {debug: true});

// 檢查電路資訊
console.log(spice.getCircuitInfo());

// 驗證電路拓撲
const validation = spice.validateCircuit();
if (!validation.isValid) {
    console.log('電路錯誤:', validation.errors);
}

// 檢查收斂性
if (!result.converged) {
    console.log(`第${result.iterations}次迭代後未收斂`);
}
```

### 性能優化
```javascript
// 1. 適當的時間步長 (最高頻率的1/10)
const maxFreq = 1000; // Hz
const recommendedTimeStep = 1 / (10 * maxFreq);

// 2. 使用GPU加速 (大電路)
if (nodeCount > 50) {
    const gpuSolver = new GPUExplicitStateSolver();
}

// 3. 避免極大的元件值差異
// 好: R1=1kΩ, R2=10kΩ (10倍差異)
// 差: R1=1Ω, R2=1MΩ (1000000倍差異)

// 4. 適當設置初始條件
new Capacitor('C1', ['n1', 'n2'], 1e-6, {ic: 2.5}); // 設置合理的初始電壓
```

### 常見錯誤處理
```javascript
try {
    const result = await spice.runAnalysis('.tran 1u 1m');
} catch (error) {
    switch (error.name) {
        case 'ConvergenceError':
            console.log('數值不收斂，嘗試減小時間步長或檢查電路');
            break;
        case 'GPUError':
            console.log('GPU不可用，自動回退到CPU模式');
            break;
        case 'CircuitError':
            console.log('電路拓撲錯誤:', error.message);
            break;
    }
}
```

---

## 📈 參數掃描與批次分析

### 阻值掃描
```javascript
const sweepResults = [];
for (let r = 100; r <= 10000; r *= 2) {
    // 動態修改元件值
    spice.components.find(c => c.name === 'R1').value = r;
    const result = await spice.runDCAnalysis();
    sweepResults.push({
        resistance: r,
        vout: result.nodeVoltages.get('vout')
    });
}
```

### 頻率響應分析
```javascript
const freqResponse = [];
for (let freq = 1; freq <= 10000; freq *= 1.5) {
    // 修改AC源頻率
    const acSource = spice.components.find(c => c.name === 'VAC');
    acSource.rawValue = `SIN(0 1 ${freq})`;
    acSource.value = acSource.parseValue(acSource.rawValue);
    
    const result = await spice.runTransientAnalysis('.tran 10u 100u');
    // 分析穩態響應...
    freqResponse.push({freq, magnitude: /* 計算幅度 */});
}
```

### 溫度分析
```javascript
for (let temp = -40; temp <= 125; temp += 25) {
    spice.components.forEach(comp => comp.temperature = temp);
    const result = await spice.runDCAnalysis();
    console.log(`${temp}°C: Vout=${result.nodeVoltages.get('vout')}V`);
}
```

---

## 🔗 實用工具函數

### 工程記號解析
```javascript
// 內建支援工程記號
const values = ['1k', '2.2M', '3.3m', '4.7u', '100n', '22p'];
// 自動轉換為: 1000, 2200000, 0.0033, 0.0000047, 1e-7, 2.2e-11
```

### 數據導出
```javascript
// CSV導出 (暫態分析結果)
const csvData = result.exportCSV();
console.log(csvData); // 可直接保存為CSV文件

// 自定義導出
const exportData = {
    time: Array.from(result.timePoints),
    vout: Array.from(result.nodeVoltages.get('vout')),
    iR1: Array.from(result.componentCurrents.get('R1'))
};
```

### 時域信號處理
```javascript
// FFT分析 (需要外部庫，如fft.js)
const signal = result.nodeVoltages.get('vout');
const spectrum = fft(signal);

// RMS值計算
function rms(signal) {
    const sum = signal.reduce((acc, val) => acc + val * val, 0);
    return Math.sqrt(sum / signal.length);
}

// 峰值檢測
function findPeaks(signal, threshold = 0.1) {
    const peaks = [];
    for (let i = 1; i < signal.length - 1; i++) {
        if (signal[i] > signal[i-1] && signal[i] > signal[i+1] && signal[i] > threshold) {
            peaks.push({index: i, value: signal[i]});
        }
    }
    return peaks;
}
```

---

## 🚀 AI開發助手工具使用

```bash
# 生成電路模板
node tools/ai-dev-helper.js generate circuit rc
node tools/ai-dev-helper.js generate circuit rlc  
node tools/ai-dev-helper.js generate circuit amplifier

# 生成元件代碼
node tools/ai-dev-helper.js generate component resistor
node tools/ai-dev-helper.js generate component mosfet

# API快速查詢  
node tools/ai-dev-helper.js api AkingSPICE
node tools/ai-dev-helper.js api ExplicitStateSolver step

# 搜索示例代碼
node tools/ai-dev-helper.js example transient
node tools/ai-dev-helper.js example sweep

# 顯示速查表
node tools/ai-dev-helper.js cheatsheet
```

---

## 📝 開發最佳實踐

1. **電路設計**: 先從簡單電路開始，逐步增加複雜度
2. **時間步長**: 選擇適當的步長，通常為最高頻率週期的1/10
3. **初始條件**: 合理設置電容初始電壓和電感初始電流
4. **調試模式**: 開發時啟用debug，發布時關閉以提高性能
5. **錯誤處理**: 總是用try-catch包裹分析調用
6. **結果驗證**: 對比理論值或其他仿真工具驗證結果
7. **性能監控**: 大電路優先考慮GPU求解器

使用這份速查表，AI和開發者可以快速找到所需的API和代碼模式，無需每次都深入閱讀完整文檔。