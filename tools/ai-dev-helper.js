#!/usr/bin/env node
/**
 * AkingSPICE AI開發助手工具
 * 
 * 為AI提供快速代碼生成、參考查詢和示例庫的命令行工具
 * 
 * 使用方法:
 * node tools/ai-dev-helper.js <command> [options]
 * 
 * 支援命令:
 * - generate circuit <type> - 生成電路模板
 * - generate component <type> - 生成元件代碼
 * - api <class> [method] - 快速API查詢
 * - example <pattern> - 搜索示例代碼
 * - cheatsheet - 顯示常用API速查表
 */

import fs from 'fs';
import path from 'path';

class AkingSPICEDevHelper {
  constructor() {
    this.templates = new Map();
    this.apiRef = new Map();
    this.examples = new Map();
    this.initializeData();
  }

  initializeData() {
    // 初始化電路模板
    this.templates.set('rc', {
      description: 'RC充電電路',
      code: `
// RC充電電路模板
import { VoltageSource, Resistor, Capacitor } from './lib-dist/AkingSPICE.es.js';

const components = [
    new VoltageSource('V1', ['vin', 'gnd'], 5),          // 5V電源
    new Resistor('R1', ['vin', 'vout'], 1000),           // 1kΩ電阻
    new Capacitor('C1', ['vout', 'gnd'], 1e-6, {ic: 0})  // 1μF電容，初始電壓0V
];

// 時間常數τ = RC = 1000 × 1e-6 = 1ms
const timeConstant = 1e-3;
const simulationTime = 5 * timeConstant; // 5τ = 5ms
const timeStep = simulationTime / 1000;   // 1000個點`
    });

    this.templates.set('rlc', {
      description: 'RLC諧振電路',
      code: `
// RLC串聯諧振電路模板
import { VoltageSource, Resistor, Inductor, Capacitor } from './lib-dist/AkingSPICE.es.js';

const L = 10e-6;  // 10μH
const C = 1e-6;   // 1μF
const R = 5;      // 5Ω

const components = [
    new VoltageSource('V1', ['vin', 'gnd'], 'PULSE(0 5 0 1n 1n 1u 10u)'), // 脈衝源
    new Resistor('R1', ['vin', 'n1'], R),
    new Inductor('L1', ['n1', 'n2'], L, {ic: 0}),
    new Capacitor('C1', ['n2', 'gnd'], C, {ic: 0})
];

// 諧振頻率 f0 = 1/(2π√LC)
const resonantFreq = 1 / (2 * Math.PI * Math.sqrt(L * C));
console.log(\`諧振頻率: \${resonantFreq/1000:.1f} kHz\`);`
    });

    this.templates.set('amplifier', {
      description: 'MOSFET放大器電路',
      code: `
// MOSFET共源放大器模板
import { VoltageSource, Resistor, Capacitor, MOSFET } from './lib-dist/AkingSPICE.es.js';

const components = [
    // 電源
    new VoltageSource('VDD', ['vdd', 'gnd'], 12),
    new VoltageSource('VIN', ['vin', 'gnd'], 'SIN(2 0.1 1000)'), // 2V偏置 + 100mV正弦
    
    // 偏置電路
    new Resistor('RG1', ['vdd', 'vg'], 1e6),    // 上拉電阻
    new Resistor('RG2', ['vg', 'gnd'], 1e6),    // 下拉電阻
    new Resistor('RD', ['vdd', 'vout'], 2000),   // 漏極負載
    new Resistor('RS', ['vs', 'gnd'], 500),      // 源極電阻
    
    // 耦合電容
    new Capacitor('CIN', ['vin', 'vg'], 10e-6),  // 輸入耦合
    new Capacitor('COUT', ['vout', 'vo'], 10e-6), // 輸出耦合
    new Capacitor('CS', ['vs', 'gnd'], 100e-6),  // 源極旁路
    
    // MOSFET
    new MOSFET('M1', ['vout', 'vg', 'vs', 'gnd'], {type: 'NMOS'})
];`
    });

    // API快速參考
    this.apiRef.set('AkingSPICE', [
      'constructor(netlist?)',
      'loadNetlist(text): Object',
      'runAnalysis(command?): Promise<Object>',
      'runDCAnalysis(): Promise<DCResult>',
      'runTransientAnalysis(command): Promise<TransientResult>',
      'addComponent(component): void',
      'addComponents(array): void',
      'getResult(type?): Object',
      'getCircuitInfo(): Object',
      'setDebug(enabled): void',
      'reset(): void'
    ]);

    this.apiRef.set('ExplicitStateSolver', [
      'constructor(options?)',
      'initialize(components, timeStep, options?): Promise<void>',
      'step(controlInputs?): Promise<Object>',
      'solveTimeStep(controlInputs?): Promise<Object>'
    ]);

    this.apiRef.set('VoltageSource', [
      'constructor(name, nodes, voltage, params?)',
      '// 電壓格式: 數字 | "DC(value)" | "SIN(offset amp freq)" | "PULSE(...)"'
    ]);

    this.apiRef.set('Resistor', [
      'constructor(name, nodes, resistance, params?)',
      '// 支援工程記號: 1k, 2.2M, 3.3m 等'
    ]);

    this.apiRef.set('Capacitor', [
      'constructor(name, nodes, capacitance, params?)',
      '// params.ic: 初始電壓',
      '// 範例: new Capacitor("C1", ["n1", "n2"], 1e-6, {ic: 0})'
    ]);

    // 示例庫
    this.examples.set('basic-simulation', `
// 基本仿真流程
const spice = new AkingSPICE();
spice.components = [/* 你的元件 */];
const result = await spice.runDCAnalysis();
console.log(result.nodeVoltages.get('vout'));
`);

    this.examples.set('transient-analysis', `
// 暫態分析示例
spice.loadNetlist(\`
V1 vin gnd PULSE(0 5 0 1n 1n 10u 20u)
R1 vin vout 1k
C1 vout gnd 1u IC=0
.tran 100n 100u
\`);
const result = await spice.runAnalysis();
`);

    this.examples.set('parameter-sweep', `
// 參數掃描示例
const results = [];
for (let r = 100; r <= 10000; r *= 2) {
    spice.components.find(c => c.name === 'R1').value = r;
    const result = await spice.runDCAnalysis();
    results.push({R: r, Vout: result.nodeVoltages.get('vout')});
}
`);
  }

  // 生成電路模板
  generateCircuit(type) {
    const template = this.templates.get(type.toLowerCase());
    if (!template) {
      console.log(`❌ 未找到電路類型: ${type}`);
      console.log('可用類型:', Array.from(this.templates.keys()).join(', '));
      return;
    }

    console.log(`📋 ${template.description}`);
    console.log('='.repeat(50));
    console.log(template.code);
    console.log('\n🎯 使用提示:');
    console.log('1. 複製上述代碼到你的文件');
    console.log('2. 根據需要調整元件參數');
    console.log('3. 選擇適當的分析類型和時間範圍');
  }

  // 生成元件代碼
  generateComponent(type) {
    const templates = {
      'voltage-source': `new VoltageSource('V1', ['vin', 'gnd'], 5)`,
      'current-source': `new CurrentSource('I1', ['n1', 'n2'], 0.001)`,
      'resistor': `new Resistor('R1', ['n1', 'n2'], 1000)`,
      'capacitor': `new Capacitor('C1', ['n1', 'n2'], 1e-6, {ic: 0})`,
      'inductor': `new Inductor('L1', ['n1', 'n2'], 1e-3, {ic: 0})`,
      'diode': `new Diode('D1', ['anode', 'cathode'])`,
      'mosfet': `new MOSFET('M1', ['drain', 'gate', 'source', 'bulk'], {type: 'NMOS'})`,
      'vcvs': `new VCVS('E1', ['out+', 'out-'], ['in+', 'in-'], 100)`,
      'vccs': `new VCCS('G1', ['out+', 'out-'], ['in+', 'in-'], 0.001)`
    };

    const template = templates[type.toLowerCase()];
    if (!template) {
      console.log(`❌ 未找到元件類型: ${type}`);
      console.log('可用類型:', Object.keys(templates).join(', '));
      return;
    }

    console.log(`📦 ${type} 元件代碼:`);
    console.log(template);
  }

  // API查詢
  showAPI(className, method) {
    if (!this.apiRef.has(className)) {
      console.log(`❌ 未找到類別: ${className}`);
      console.log('可用類別:', Array.from(this.apiRef.keys()).join(', '));
      return;
    }

    const methods = this.apiRef.get(className);
    console.log(`📚 ${className} API:`);
    console.log('='.repeat(50));

    if (method) {
      const found = methods.find(m => m.toLowerCase().includes(method.toLowerCase()));
      if (found) {
        console.log(found);
      } else {
        console.log(`❌ 未找到方法: ${method}`);
      }
    } else {
      methods.forEach(m => console.log(`  ${m}`));
    }
  }

  // 搜索示例
  searchExample(pattern) {
    console.log(`🔍 搜索示例: "${pattern}"`);
    console.log('='.repeat(50));

    let found = false;
    for (const [key, code] of this.examples.entries()) {
      if (key.includes(pattern.toLowerCase()) || code.toLowerCase().includes(pattern.toLowerCase())) {
        console.log(`\n📝 ${key}:`);
        console.log(code);
        found = true;
      }
    }

    if (!found) {
      console.log('❌ 未找到相關示例');
      console.log('可用示例:', Array.from(this.examples.keys()).join(', '));
    }
  }

  // 顯示速查表
  showCheatsheet() {
    console.log('🚀 AkingSPICE 速查表');
    console.log('='.repeat(50));

    console.log('\n📦 快速建立電路:');
    console.log(`
const spice = new AkingSPICE();
spice.components = [
    new VoltageSource('V1', ['vin', 'gnd'], 5),
    new Resistor('R1', ['vin', 'vout'], 1000)
];`);

    console.log('\n⚡ 分析命令:');
    console.log('  await spice.runDCAnalysis()           // DC分析');
    console.log('  await spice.runAnalysis(".tran 1u 1m") // 暫態分析');
    console.log('  spice.getResult("dc")                // 獲取結果');

    console.log('\n🔧 常用元件:');
    console.log('  VoltageSource(name, nodes, voltage)');
    console.log('  Resistor(name, nodes, resistance)');
    console.log('  Capacitor(name, nodes, capacitance, {ic: 0})');
    console.log('  Inductor(name, nodes, inductance, {ic: 0})');

    console.log('\n📊 結果訪問:');
    console.log('  result.nodeVoltages.get("nodeName")   // 節點電壓');
    console.log('  result.componentCurrents.get("R1")    // 元件電流');
    console.log('  result.timePoints                     // 時間陣列');

    console.log('\n🐛 調試技巧:');
    console.log('  spice.setDebug(true)                 // 啟用詳細日誌');
    console.log('  solver.initialize(components, 1e-6, {debug: true})');

    console.log('\n💡 性能優化:');
    console.log('  使用 GPU 求解器: GPUExplicitStateSolver');
    console.log('  適當的時間步長: < 1/(10*最高頻率)');
    console.log('  避免極大的阻抗差異');
  }

  // 主命令處理
  handleCommand(args) {
    const [command, subcommand, ...params] = args;

    switch (command) {
      case 'generate':
        if (subcommand === 'circuit') {
          this.generateCircuit(params[0] || 'rc');
        } else if (subcommand === 'component') {
          this.generateComponent(params[0] || 'resistor');
        } else {
          console.log('用法: generate <circuit|component> <type>');
        }
        break;

      case 'api':
        this.showAPI(subcommand, params[0]);
        break;

      case 'example':
        this.searchExample(subcommand || 'basic');
        break;

      case 'cheatsheet':
        this.showCheatsheet();
        break;

      default:
        this.showHelp();
    }
  }

  showHelp() {
    console.log('🤖 AkingSPICE AI開發助手');
    console.log('='.repeat(50));
    console.log('可用命令:');
    console.log('  generate circuit <type>    生成電路模板 (rc, rlc, amplifier)');
    console.log('  generate component <type>  生成元件代碼');
    console.log('  api <class> [method]       查詢API參考');
    console.log('  example <pattern>          搜索代碼示例');
    console.log('  cheatsheet                 顯示常用API速查表');
    console.log('\n示例:');
    console.log('  node tools/ai-dev-helper.js generate circuit rc');
    console.log('  node tools/ai-dev-helper.js api AkingSPICE runAnalysis');
    console.log('  node tools/ai-dev-helper.js example transient');
  }
}

// 主程序入口
if (import.meta.url.endsWith(process.argv[1]) || import.meta.url.includes('ai-dev-helper.js')) {
  const helper = new AkingSPICEDevHelper();
  const args = process.argv.slice(2);

  if (args.length === 0) {
    helper.showHelp();
  } else {
    helper.handleCommand(args);
  }
}

export { AkingSPICEDevHelper };