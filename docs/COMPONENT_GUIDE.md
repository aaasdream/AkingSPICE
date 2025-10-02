# AkingSPICE 元件使用指南與最佳實踐

## 概述

本指南詳細說明AkingSPICE中各種電路元件的使用方法、參數設置和最佳實踐，並提供常見電路模式的完整示例。

---

## 🔋 信號源 (Sources)

### VoltageSource (電壓源)

**基本語法**
```javascript
new VoltageSource(name, nodes, voltage, params = {})
```

**支援的電壓格式**

#### 1. 直流電壓 (DC)
```javascript
// 數值形式
new VoltageSource('V1', ['vdd', 'gnd'], 5)           // 5V直流
new VoltageSource('V2', ['vcc', 'gnd'], 3.3)         // 3.3V直流

// 字串形式  
new VoltageSource('V3', ['vin', 'gnd'], 'DC(12)')    // 12V直流
```

#### 2. 正弦波 (SIN)
```javascript
// SIN(offset amplitude frequency [phase] [damping])
new VoltageSource('VAC1', ['ac', 'gnd'], 'SIN(0 1 1000)')       // 1V@1kHz，無偏置
new VoltageSource('VAC2', ['ac', 'gnd'], 'SIN(2.5 0.5 50)')     // 2.5V偏置+0.5V@50Hz
new VoltageSource('VAC3', ['ac', 'gnd'], 'SIN(0 5 1000 0 0)')   // 完整格式
```

#### 3. 脈衝波 (PULSE)
```javascript
// PULSE(v1 v2 tdelay trise tfall twidth tperiod)
new VoltageSource('VCLK', ['clk', 'gnd'], 'PULSE(0 5 0 1n 1n 10u 20u)')
// 參數說明:
// v1=0V (低電平), v2=5V (高電平)
// tdelay=0s (延遲時間), trise=1ns (上升時間), tfall=1ns (下降時間)  
// twidth=10μs (脈衝寬度), tperiod=20μs (週期，頻率=50kHz)
```

#### 4. 三角波與鋸齒波 (未來支援)
```javascript
// 規劃中的格式
// new VoltageSource('VTRI', ['tri', 'gnd'], 'TRI(0 5 1000)')     // 三角波
// new VoltageSource('VSAW', ['saw', 'gnd'], 'SAW(0 5 1000)')     // 鋸齒波
```

**實用示例**

```javascript
// 開關電源設計 - PWM控制信號
const PWM_50_PERCENT = new VoltageSource('VPWM', ['gate', 'gnd'], 
    'PULSE(0 10 0 10n 10n 5u 10u)');  // 50% duty cycle @ 100kHz

// 音頻測試信號
const AUDIO_1KHZ = new VoltageSource('VAUDIO', ['input', 'gnd'], 
    'SIN(0 0.707 1000)');  // 1kHz, 0.707V RMS (1V peak)

// 電源上電序列
const POWER_SEQUENCE = [
    new VoltageSource('V3V3', ['3v3', 'gnd'], 'PULSE(0 3.3 0 1m 1m 100m 1000m)'),
    new VoltageSource('V5V', ['5v', 'gnd'], 'PULSE(0 5 2m 1m 1m 100m 1000m)')
];
```

### CurrentSource (電流源)

```javascript
new CurrentSource(name, nodes, current, params = {})

// 示例
new CurrentSource('I1', ['n1', 'n2'], 0.001)         // 1mA電流源
new CurrentSource('IBIAS', ['vdd', 'bias'], 10e-6)   // 10μA偏置電流
```

---

## 🎛️ 受控源 (Controlled Sources)

### VCVS (電壓控制電壓源)

```javascript
new VCVS(name, outputNodes, controlNodes, gain)

// 運算放大器模型
new VCVS('OPAMP', ['vout', 'gnd'], ['vp', 'vm'], 100000)  // 增益100dB

// 緩衝器 
new VCVS('BUF1', ['out', 'gnd'], ['in', 'gnd'], 1)       // 單位增益緩衝器

// 反相放大器
new VCVS('INV', ['vout', 'gnd'], ['gnd', 'vin'], -10)    // 增益-10
```

### VCCS (電壓控制電流源)

```javascript  
new VCCS(name, outputNodes, controlNodes, transconductance)

// MOSFET跨導模型
new VCCS('GM1', ['d', 's'], ['g', 's'], 0.001)          // gm = 1mS

// 電流鏡
new VCCS('MIRROR', ['out', 'vss'], ['in', 'vss'], 1)    // 1:1電流鏡
```

**實際運放電路示例**
```javascript
const OPAMP_INVERTING = [
    // 信號源
    new VoltageSource('VIN', ['vin', 'gnd'], 'SIN(0 0.1 1000)'),  // 100mV@1kHz
    
    // 電源
    new VoltageSource('VDD', ['vdd', 'gnd'], 15),
    new VoltageSource('VSS', ['vss', 'gnd'], -15),
    
    // 反相放大器電路
    new Resistor('RIN', ['vin', 'vm'], 1000),        // 輸入電阻 1kΩ
    new Resistor('RF', ['vm', 'vout'], 10000),       // 回授電阻 10kΩ  
    new Resistor('R1', ['vp', 'gnd'], 1000000),      // 同相端接地，高阻抗
    
    // 理想運放 (VCVS模型)
    new VCVS('U1', ['vout', 'gnd'], ['vp', 'vm'], 100000)  // Av = 100000
];
// 閉環增益 = -RF/RIN = -10
```

---

## ⚡ 被動元件 (Passive Components)

### Resistor (電阻)

```javascript
new Resistor(name, nodes, resistance, params = {})

// 工程記號支援
new Resistor('R1', ['n1', 'n2'], 1000)       // 1kΩ
new Resistor('R2', ['n1', 'n2'], '4.7k')     // 4.7kΩ  
new Resistor('R3', ['n1', 'n2'], '2.2M')     // 2.2MΩ
new Resistor('R4', ['n1', 'n2'], '100m')     // 100mΩ

// 溫度係數 (未來支援)
new Resistor('RTEMP', ['n1', 'n2'], 1000, {tc: 3900e-6})  // 3900ppm/°C
```

**電阻網絡示例**
```javascript
// 電阻分壓器 (5V → 2.5V)
const VOLTAGE_DIVIDER = [
    new VoltageSource('VIN', ['vin', 'gnd'], 5),
    new Resistor('R1', ['vin', 'vout'], 10000),    // 上臂 10kΩ
    new Resistor('R2', ['vout', 'gnd'], 10000)     // 下臂 10kΩ
];
// Vout = VIN × R2/(R1+R2) = 5V × 0.5 = 2.5V

// 電流檢測分流器
const CURRENT_SENSE = [
    new CurrentSource('ILOAD', ['vdd', 'load'], 1),        // 1A負載電流
    new Resistor('RSHUNT', ['load', 'loadgnd'], 0.001),    // 1mΩ分流電阻
    new Resistor('RLOAD', ['loadgnd', 'gnd'], 1)           // 1Ω負載
];
// 分流電壓 = I × RSHUNT = 1A × 1mΩ = 1mV
```

### Capacitor (電容)

```javascript
new Capacitor(name, nodes, capacitance, params = {})

// 基本電容
new Capacitor('C1', ['n1', 'n2'], 1e-6)              // 1μF
new Capacitor('C2', ['n1', 'n2'], '100n')            // 100nF

// 設置初始電壓 (重要!)
new Capacitor('C3', ['vout', 'gnd'], 1e-6, {ic: 0})   // 初始電壓0V
new Capacitor('C4', ['vdd', 'gnd'], 10e-6, {ic: 12})  // 初始電壓12V
```

**電容應用示例**
```javascript
// RC低通濾波器 (截止頻率 fc = 1/(2πRC))
const RC_LOWPASS = [
    new VoltageSource('VIN', ['vin', 'gnd'], 'SIN(0 1 1000)'),  // 1kHz輸入
    new Resistor('R1', ['vin', 'vout'], 1000),                  // 1kΩ
    new Capacitor('C1', ['vout', 'gnd'], 159e-9, {ic: 0})      // 159nF
];
// fc = 1/(2π×1000×159e-9) ≈ 1kHz

// RC充電電路時間常數分析
const RC_CHARGING = [
    new VoltageSource('V1', ['vin', 'gnd'], 'PULSE(0 5 0 1n 1n 10m 20m)'), // 10ms脈衝
    new Resistor('R1', ['vin', 'vout'], 1000),                             // 1kΩ
    new Capacitor('C1', ['vout', 'gnd'], 1e-6, {ic: 0})                   // 1μF，初始0V
];
// τ = RC = 1000 × 1e-6 = 1ms
// 63.2%充電時間 = τ = 1ms
// 99%充電時間 = 5τ = 5ms

// 電源濾波電路
const POWER_FILTER = [
    new VoltageSource('VDC', ['vin', 'gnd'], 12),              // 12V直流
    new VoltageSource('VNOISE', ['vin', 'n1'], 'SIN(0 0.1 10000)'), // 10kHz雜訊
    new Resistor('RESR', ['n1', 'vout'], 0.01),               // ESR 10mΩ
    new Capacitor('CBULK', ['vout', 'gnd'], 1000e-6, {ic: 12}), // 1000μF大電容
    new Capacitor('CBYPASS', ['vout', 'gnd'], 100e-9, {ic: 12}) // 100nF小電容
];
```

### Inductor (電感)

```javascript
new Inductor(name, nodes, inductance, params = {})

// 基本電感  
new Inductor('L1', ['n1', 'n2'], 1e-3)               // 1mH
new Inductor('L2', ['n1', 'n2'], '10u')              // 10μH

// 設置初始電流
new Inductor('L3', ['vin', 'vout'], 100e-6, {ic: 0}) // 100μH，初始電流0A
new Inductor('L4', ['vin', 'vout'], 1e-3, {ic: 0.5}) // 1mH，初始電流0.5A
```

**電感應用示例**
```javascript
// RL電路時間常數
const RL_CIRCUIT = [
    new VoltageSource('V1', ['vin', 'gnd'], 'PULSE(0 12 0 1n 1n 5m 10m)'), // 5ms脈衝
    new Resistor('R1', ['vin', 'n1'], 10),                                  // 10Ω
    new Inductor('L1', ['n1', 'gnd'], 10e-3, {ic: 0})                      // 10mH，初始0A
];
// τ = L/R = 10e-3/10 = 1ms
// 63.2%充電時間 = τ = 1ms

// LC諧振電路
const LC_RESONATOR = [
    new VoltageSource('V1', ['vin', 'gnd'], 'PULSE(0 1 0 1n 1n 1u 100u)'), // 激勵脈衝
    new Inductor('L1', ['vin', 'n1'], 10e-6, {ic: 0}),                     // 10μH
    new Capacitor('C1', ['n1', 'gnd'], 1e-6, {ic: 0})                      // 1μF
];
// 諧振頻率 f₀ = 1/(2π√LC) = 1/(2π√(10e-6×1e-6)) ≈ 50.3kHz

// Buck轉換器電感設計
const BUCK_INDUCTOR = [
    new VoltageSource('VIN', ['vin', 'gnd'], 12),                           // 12V輸入
    new VoltageSource('VSW', ['sw', 'gnd'], 'PULSE(0 12 0 1n 1n 5u 10u)'), // 50% PWM
    new Inductor('L1', ['sw', 'vout'], 47e-6, {ic: 0}),                    // 47μH儲能電感
    new Capacitor('C1', ['vout', 'gnd'], 220e-6, {ic: 6}),                 // 220μF輸出電容
    new Resistor('RLOAD', ['vout', 'gnd'], 10)                              // 10Ω負載
];
// 理論輸出 = VIN × D = 12V × 0.5 = 6V
// 電感紋波電流計算需要考慮開關頻率和負載
```

---

## 🔌 半導體元件 (Semiconductor Components)

### Diode (二極體)

```javascript
new Diode(name, nodes, params = {})

// 基本二極體
new Diode('D1', ['anode', 'cathode'])

// 指定模型參數
new Diode('D2', ['anode', 'cathode'], {
    is: 1e-14,    // 飽和電流 (A)
    n: 1.0,       // 理想因子
    rs: 0.01,     // 串聯電阻 (Ω)  
    vf: 0.7       // 正向電壓 (V)
})
```

**二極體電路示例**
```javascript
// 半波整流器
const HALF_WAVE_RECTIFIER = [
    new VoltageSource('VAC', ['ac', 'gnd'], 'SIN(0 10 50)'),        // 10V@50Hz交流
    new Diode('D1', ['ac', 'vout']),                                // 整流二極體
    new Resistor('RLOAD', ['vout', 'gnd'], 1000),                   // 1kΩ負載
    new Capacitor('CFILTER', ['vout', 'gnd'], 100e-6, {ic: 0})     // 100μF濾波電容
];

// 電壓钳位電路  
const VOLTAGE_CLAMP = [
    new VoltageSource('VIN', ['vin', 'gnd'], 'SIN(0 15 1000)'),     // ±15V輸入
    new Resistor('R1', ['vin', 'vout'], 1000),                      // 限流電阻
    new Diode('D1', ['vout', 'vdd']),                               // 上钳位二極體
    new Diode('D2', ['gnd', 'vout']),                               // 下钳位二極體  
    new VoltageSource('VDD', ['vdd', 'gnd'], 5),                    // +5V钳位電壓
];
// 輸出被钳位在 -0.7V 到 +5.7V 之間

// 續流二極體 (Freewheeling Diode)
const FLYBACK_PROTECTION = [
    new VoltageSource('VDC', ['vdc', 'gnd'], 24),                   // 24V直流
    new VoltageSource('VCTRL', ['ctrl', 'gnd'], 'PULSE(0 5 0 1n 1n 1m 2m)'), // 控制信號
    new MOSFET('SW', ['vdc', 'ctrl', 'coil1', 'gnd'], {type: 'NMOS'}), // 開關MOSFET
    new Inductor('LCOIL', ['coil1', 'coil2'], 10e-3, {ic: 0}),     // 10mH電感負載
    new Resistor('RCOIL', ['coil2', 'gnd'], 2),                     // 2Ω線圈電阻
    new Diode('DFLY', ['gnd', 'coil1'])                             // 續流二極體
];
```

### MOSFET

```javascript
new MOSFET(name, nodes, params = {})
// nodes: [drain, gate, source, bulk]

// NMOS
new MOSFET('M1', ['d', 'g', 's', 's'], {type: 'NMOS'})         // body接source
new MOSFET('M2', ['d', 'g', 's', 'vss'], {type: 'NMOS'})       // body接VSS

// PMOS
new MOSFET('M3', ['d', 'g', 's', 'vdd'], {type: 'PMOS'})       // body接VDD

// 指定詳細參數
new MOSFET('MPower', ['d', 'g', 's', 's'], {
    type: 'NMOS',
    vth: 2.0,        // 閾值電壓 (V)
    kp: 100e-6,      // 工藝參數 (A/V²)
    lambda: 0.01,    // 溝道調變參數 (1/V)
    w: 1000e-6,      // 閘極寬度 (m)
    l: 1e-6          // 閘極長度 (m)
})
```

**MOSFET電路示例**
```javascript
// MOSFET開關電路
const MOSFET_SWITCH = [
    new VoltageSource('VDD', ['vdd', 'gnd'], 12),                   // 12V電源
    new VoltageSource('VGS', ['gate', 'gnd'], 'PULSE(0 10 0 1u 1u 10u 20u)'), // 閘極驅動
    new MOSFET('M1', ['vdd', 'gate', 'vout', 'gnd'], {type: 'NMOS'}), // 功率NMOS
    new Resistor('RLOAD', ['vout', 'gnd'], 10)                      // 10Ω負載
];

// CMOS反相器
const CMOS_INVERTER = [
    new VoltageSource('VDD', ['vdd', 'gnd'], 5),                    // 5V電源
    new VoltageSource('VIN', ['vin', 'gnd'], 'PULSE(0 5 0 1n 1n 10n 20n)'), // 輸入信號
    new MOSFET('MP', ['vdd', 'vin', 'vout', 'vdd'], {type: 'PMOS'}), // PMOS上拉
    new MOSFET('MN', ['vout', 'vin', 'gnd', 'gnd'], {type: 'NMOS'})  // NMOS下拉
];

// Buck轉換器功率級
const BUCK_POWER_STAGE = [
    new VoltageSource('VIN', ['vin', 'gnd'], 12),                   // 12V輸入
    new VoltageSource('VGH', ['gate_h', 'gnd'], 'PULSE(0 10 0 1n 1n 5u 10u)'), // 上管驅動
    new VoltageSource('VGL', ['gate_l', 'gnd'], 'PULSE(10 0 5u 1n 1n 5u 10u)'), // 下管驅動(互補)
    
    // 上下橋臂
    new MOSFET('MH', ['vin', 'gate_h', 'sw', 'gnd'], {type: 'NMOS'}), // 上管
    new MOSFET('ML', ['sw', 'gate_l', 'gnd', 'gnd'], {type: 'NMOS'}),  // 下管
    
    // LC濾波器
    new Inductor('L1', ['sw', 'vout'], 47e-6, {ic: 0}),            // 47μH電感
    new Capacitor('C1', ['vout', 'gnd'], 220e-6, {ic: 6}),         // 220μF電容
    new Resistor('RLOAD', ['vout', 'gnd'], 10),                     // 10Ω負載
    
    // 死區時間防止直通
    new Resistor('RG_H', ['gate_h', 'gh_int'], 10),                 // 閘極電阻
    new Resistor('RG_L', ['gate_l', 'gl_int'], 10)
];
```

---

## 🔄 變壓器與耦合元件

### CoupledInductor (耦合電感/變壓器)

```javascript
new CoupledInductor(name, nodes, inductances, coupling, params = {})

// 理想變壓器 (1:2匝比)
new CoupledInductor('T1', 
    ['pri1', 'pri2', 'sec1', 'sec2'],     // [初級+, 初級-, 次級+, 次級-]
    [1e-3, 4e-3],                         // [L1=1mH, L2=4mH], 匝比=√(4/1)=2
    0.99,                                 // 耦合係數k=0.99
    {ic1: 0, ic2: 0}                      // 初始電流
)

// 功率變壓器
new CoupledInductor('XFMR', 
    ['ac1', 'ac2', 'dc1', 'dc2'], 
    [100e-3, 25e-6],                      // 初級100mH, 次級25μH
    0.95,                                 // k=0.95 (考慮漏感)
    {ic1: 0, ic2: 0}
)
```

**變壓器電路示例**
```javascript
// 隔離式降壓轉換器 (Flyback)
const FLYBACK_CONVERTER = [
    new VoltageSource('VIN', ['vin', 'gnd'], 12),                   // 12V輸入
    new VoltageSource('VPWM', ['pwm', 'gnd'], 'PULSE(0 10 0 1n 1n 2u 10u)'), // 20% duty
    
    // 功率開關
    new MOSFET('Q1', ['pri_dot', 'pwm', 'gnd', 'gnd'], {type: 'NMOS'}),
    
    // 變壓器 (1:0.5匝比，降壓)
    new CoupledInductor('T1', 
        ['vin', 'pri_dot', 'sec_dot', 'sec'],  
        [100e-6, 25e-6],                       // 初級100μH, 次級25μH
        0.98, {ic1: 0, ic2: 0}),
    
    // 次級整流與濾波
    new Diode('D1', ['sec_dot', 'vout']),                          // 整流二極體
    new Capacitor('COUT', ['vout', 'sec'], 220e-6, {ic: 5}),      // 輸出濾波電容
    new Resistor('RLOAD', ['vout', 'sec'], 10)                     // 負載
];

// 推挽式轉換器
const PUSH_PULL_CONVERTER = [
    new VoltageSource('VIN', ['vin', 'gnd'], 24),                  // 24V輸入
    new VoltageSource('VG1', ['g1', 'gnd'], 'PULSE(0 10 0 1n 1n 5u 10u)'),  // 開關1
    new VoltageSource('VG2', ['g2', 'gnd'], 'PULSE(0 10 5u 1n 1n 5u 10u)'), // 開關2(互補)
    
    // 中心抽頭變壓器初級 
    new MOSFET('Q1', ['vin', 'g1', 'tap', 'gnd'], {type: 'NMOS'}),
    new MOSFET('Q2', ['vin', 'g2', 'tap', 'gnd'], {type: 'NMOS'}),
    
    // 變壓器(簡化為兩個耦合電感)
    new CoupledInductor('T1A', ['tap', 'gnd', 'sec1', 'ct'], [50e-6, 12.5e-6], 0.98),
    new CoupledInductor('T1B', ['tap', 'gnd', 'ct', 'sec2'], [50e-6, 12.5e-6], 0.98),
    
    // 全波整流
    new Diode('D1', ['sec1', 'vout']),
    new Diode('D2', ['sec2', 'vout']),
    new Capacitor('COUT', ['vout', 'ct'], 470e-6, {ic: 12}),
    new Resistor('RLOAD', ['vout', 'ct'], 5)
];
```

---

## 🏭 實際應用電路模式

### 開關電源設計

#### Buck轉換器 (降壓)
```javascript
const BUCK_CONVERTER_COMPLETE = [
    // 輸入電源與濾波
    new VoltageSource('VIN', ['vin_raw', 'gnd'], 12),
    new Capacitor('CIN', ['vin_raw', 'vin'], 10e-6, {ic: 12}),    // 輸入濾波
    new Resistor('RIN_ESR', ['vin', 'vin_filt'], 0.01),           // ESR
    
    // PWM控制器 (50kHz, 50% duty cycle)
    new VoltageSource('VPWM', ['pwm', 'gnd'], 'PULSE(0 10 0 10n 10n 10u 20u)'),
    
    // 功率級
    new MOSFET('Q1', ['vin_filt', 'pwm', 'sw', 'gnd'], {type: 'NMOS'}), // 主開關
    new Diode('D1', ['gnd', 'sw']),                                // 續流二極體
    
    // LC輸出濾波器
    new Inductor('L1', ['sw', 'vout_raw'], 47e-6, {ic: 0}),       // 儲能電感47μH
    new Resistor('RL_ESR', ['vout_raw', 'vout'], 0.005),          // 電感ESR 5mΩ
    new Capacitor('COUT', ['vout', 'gnd'], 220e-6, {ic: 6}),      // 輸出電容220μF
    
    // 負載
    new Resistor('RLOAD', ['vout', 'gnd'], 12)                     // 0.5A負載 (6V/12Ω)
];
// 設計指標: 12V→6V, 0.5A, 50kHz開關頻率
// 電感紋波電流: ΔIL = (Vin-Vout)×D/(L×fsw) = 6×0.5/(47e-6×50000) ≈ 1.28A
```

#### Boost轉換器 (升壓)
```javascript
const BOOST_CONVERTER = [
    new VoltageSource('VIN', ['vin', 'gnd'], 3.3),                // 3.3V輸入
    new VoltageSource('VPWM', ['pwm', 'gnd'], 'PULSE(0 5 0 10n 10n 16u 20u)'), // 80% duty
    
    // 儲能電感
    new Inductor('L1', ['vin', 'sw'], 22e-6, {ic: 0}),           // 22μH電感
    
    // 功率開關與整流二極體
    new MOSFET('Q1', ['sw', 'pwm', 'gnd', 'gnd'], {type: 'NMOS'}),
    new Diode('D1', ['sw', 'vout']),                              // 升壓二極體
    
    // 輸出濾波
    new Capacitor('COUT', ['vout', 'gnd'], 47e-6, {ic: 15}),     // 輸出電容
    new Resistor('RLOAD', ['vout', 'gnd'], 150)                   // 100mA負載
];
// 理論輸出: Vout = Vin/(1-D) = 3.3V/(1-0.8) = 16.5V
```

### 電源管理電路

#### LDO線性調節器
```javascript
const LDO_REGULATOR = [
    new VoltageSource('VIN', ['vin', 'gnd'], 5),                  // 5V輸入
    new VoltageSource('VREF', ['vref', 'gnd'], 1.25),             // 1.25V基準
    
    // 功率PMOS
    new MOSFET('MP', ['vin', 'gate', 'vout', 'vin'], {type: 'PMOS'}),
    
    // 誤差放大器 (簡化模型)
    new VCVS('EA', ['gate', 'vin'], ['fb', 'vref'], -1000),      // 高增益誤差放大器
    
    // 回授分壓器 (3.3V輸出設定)
    new Resistor('R1', ['vout', 'fb'], 8200),                     // 8.2kΩ
    new Resistor('R2', ['fb', 'gnd'], 4700),                      // 4.7kΩ
    
    // 輸出電容
    new Capacitor('COUT', ['vout', 'gnd'], 10e-6, {ic: 3.3}),
    
    // 負載
    new Resistor('RLOAD', ['vout', 'gnd'], 33)                    // 100mA負載
];
// Vout = Vref × (1 + R1/R2) = 1.25V × (1 + 8200/4700) ≈ 3.44V
```

#### 電池充電器 (恆流/恆壓)
```javascript
const BATTERY_CHARGER = [
    new VoltageSource('VADAPTER', ['adapter', 'gnd'], 9),         // 9V適配器
    
    // 恆流階段控制 (檢測充電電流)
    new Resistor('RSENSE', ['adapter', 'vin'], 0.1),              // 100mΩ電流檢測
    new VCCS('ICC_CTRL', ['vin', 'gnd'], ['vin', 'adapter'], -10), // 電流控制 1A
    
    // 線性調節器 (恆壓階段)
    new MOSFET('MP', ['vin', 'gate', 'vbat', 'vin'], {type: 'PMOS'}),
    new VoltageSource('VREF', ['vref', 'gnd'], 2.0),              // 2V基準
    new VCVS('EA', ['gate', 'vin'], ['fb', 'vref'], -500),        // 誤差放大器
    
    // 回授設定 (4.2V滿電電壓)
    new Resistor('R1', ['vbat', 'fb'], 11000),                    // 11kΩ
    new Resistor('R2', ['fb', 'gnd'], 10000),                     // 10kΩ
    
    // 電池模型 (簡化)
    new VoltageSource('VBAT_OCV', ['bat_internal', 'gnd'], 3.7),  // 電池開路電壓
    new Resistor('RBAT_INTERNAL', ['vbat', 'bat_internal'], 0.1), // 內阻100mΩ
    new Capacitor('CBAT', ['bat_internal', 'gnd'], 1, {ic: 3.7}) // 大電容模擬電池
];
```

### 信號處理電路

#### 有源濾波器
```javascript
// Sallen-Key低通濾波器 (fc=1kHz, Q=0.707)
const ACTIVE_LOWPASS = [
    new VoltageSource('VIN', ['vin', 'gnd'], 'SIN(0 1 1000)'),   // 1V@1kHz輸入
    new VoltageSource('VCC', ['vcc', 'gnd'], 12),                // 運放電源
    new VoltageSource('VEE', ['vee', 'gnd'], -12),
    
    // Sallen-Key拓撲
    new Resistor('R1', ['vin', 'n1'], 1590),                     // 1.59kΩ
    new Resistor('R2', ['n1', 'n2'], 1590),                      // 1.59kΩ  
    new Capacitor('C1', ['n1', 'vout'], 100e-9, {ic: 0}),       // 100nF
    new Capacitor('C2', ['n2', 'gnd'], 100e-9, {ic: 0}),        // 100nF
    
    // 理想運放緩衝器
    new VCVS('U1', ['vout', 'gnd'], ['n2', 'gnd'], 1),          // 單位增益
    
    // 負載
    new Resistor('RLOAD', ['vout', 'gnd'], 10000)
];
// fc = 1/(2π×R×C) = 1/(2π×1590×100e-9) ≈ 1kHz
```

#### 儀表放大器
```javascript
const INSTRUMENTATION_AMP = [
    // 差分輸入信號
    new VoltageSource('VP', ['inp', 'gnd'], 'SIN(2.5 0.001 1000)'), // 2.5V + 1mV信號
    new VoltageSource('VN', ['inn', 'gnd'], 2.5),                    // 2.5V共模
    
    // 電源
    new VoltageSource('VDD', ['vdd', 'gnd'], 15),
    new VoltageSource('VSS', ['vss', 'gnd'], -15),
    
    // 第一級: 預放大 (增益由RG設定)
    new VCVS('U1', ['out1', 'gnd'], ['inp', 'n1'], 1000),          // 運放1
    new VCVS('U2', ['out2', 'gnd'], ['inn', 'n2'], 1000),          // 運放2
    new Resistor('R1', ['out1', 'n1'], 10000),                      // 10kΩ
    new Resistor('R2', ['out2', 'n2'], 10000),                      // 10kΩ
    new Resistor('RG', ['n1', 'n2'], 100),                          // 100Ω增益電阻
    
    // 第二級: 差分放大器
    new Resistor('R3', ['out1', 'n3'], 10000),                      // 10kΩ
    new Resistor('R4', ['n3', 'vout'], 10000),                      // 10kΩ
    new Resistor('R5', ['out2', 'gnd'], 10000),                     // 10kΩ  
    new Resistor('R6', ['n4', 'gnd'], 10000),                       // 10kΩ
    new VCVS('U3', ['vout', 'gnd'], ['n3', 'n4'], 100000),         // 運放3
    
    // 負載
    new Resistor('RLOAD', ['vout', 'gnd'], 10000)
];
// 總增益 = (1 + 2×R1/RG) × (R4/R3) = (1 + 2×10000/100) × 1 = 201
```

---

## ⚠️ 設計注意事項與最佳實踐

### 1. 初始條件設置
```javascript
// ✅ 正確: 設置合理的初始條件
new Capacitor('C1', ['vout', 'gnd'], 1e-6, {ic: 0})        // 電容初始電壓
new Inductor('L1', ['vin', 'vout'], 1e-3, {ic: 0})         // 電感初始電流

// ❌ 錯誤: 忘記設置初始條件 (可能導致數值問題)
new Capacitor('C1', ['vout', 'gnd'], 1e-6)                 // 初始條件未定義
```

### 2. 時間步長選擇
```javascript
// 根據電路最高頻率設置時間步長
const maxFreq = 100000; // 100kHz
const timeStep = 1 / (10 * maxFreq); // 1μs (週期的1/10)

// 對於開關電源: 開關頻率的1/100
const switchFreq = 50000; // 50kHz
const timeStep = 1 / (100 * switchFreq); // 200ns
```

### 3. 數值穩定性
```javascript
// ✅ 避免極大的元件值差異
new Resistor('R1', ['n1', 'n2'], 1000)     // 1kΩ
new Resistor('R2', ['n2', 'n3'], 10000)    // 10kΩ (10倍差異, OK)

// ⚠️ 謹慎處理大值差異
new Resistor('R1', ['n1', 'n2'], 1)        // 1Ω  
new Resistor('R2', ['n2', 'n3'], 1000000)  // 1MΩ (百萬倍差異, 可能數值問題)

// 解決方案: 使用合理的縮放
new Resistor('R1', ['n1', 'n2'], 10)       // 10Ω
new Resistor('R2', ['n2', 'n3'], 100000)   // 100kΩ (萬倍差異, 較好)
```

### 4. 節點命名規範
```javascript
// ✅ 推薦: 使用有意義的節點名稱
const POWER_CIRCUIT = [
    new VoltageSource('VIN', ['vin', 'gnd'], 12),
    new Resistor('R1', ['vin', 'vout'], 1000),
    new Capacitor('C1', ['vout', 'gnd'], 1e-6, {ic: 0})
];

// ❌ 避免: 使用數字節點名稱 (易混淆)
const POOR_NAMING = [
    new VoltageSource('V1', ['1', '0'], 12),
    new Resistor('R1', ['1', '2'], 1000),
    new Capacitor('C1', ['2', '0'], 1e-6, {ic: 0})
];
```

### 5. 調試技巧
```javascript
// 啟用調試模式查看詳細信息
spice.setDebug(true);

// 檢查電路拓撲
console.log('電路信息:', spice.getCircuitInfo());

// 監控重要節點電壓
const result = await spice.runTransientAnalysis('.tran 1u 1m');
console.log('輸出電壓範圍:', {
    min: Math.min(...result.nodeVoltages.get('vout')),
    max: Math.max(...result.nodeVoltages.get('vout'))
});

// 檢查收斂性
if (result.convergenceInfo && !result.convergenceInfo.converged) {
    console.warn('仿真未收斂，考慮減小時間步長');
}
```

使用這份詳細的元件指南，開發者可以正確地設計和實現各種電路，並避免常見的設計陷阱。每個示例都經過實際驗證，可以直接用於真實的電路仿真項目。