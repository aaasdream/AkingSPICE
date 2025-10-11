/**
 * 🧪 Resistor 單元測試
 * 
 * 測試電阻元件的：
 * 1. 基本屬性和驗證
 * 2. MNA 矩陣裝配正確性
 * 3. 歐姆定律驗證
 */

import { describe, test, expect, beforeEach, vi } from 'vitest';
import { Resistor, ResistorFactory, ResistorTest } from '../../../src/components/passive/resistor';
import { SparseMatrix } from '../../../src/math/sparse/matrix';
import { Vector } from '../../../src/math/sparse/vector';
import { AssemblyContext } from '../../../src/core/interfaces/component';

describe('Resistor - 基本屬性', () => {
  test('創建電阻 - 正常情況', () => {
    const R = new Resistor('R1', ['n1', 'n2'], 1000);
    
    expect(R.name).toBe('R1');
    expect(R.type).toBe('R');
    expect(R.nodes).toEqual(['n1', 'n2']);
    expect(R.resistance).toBe(1000);
    expect(R.conductance).toBeCloseTo(0.001, 10);
  });
  
  test('創建電阻 - 非法參數應拋出異常', () => {
    // 電阻值為零
    expect(() => new Resistor('R1', ['n1', 'n2'], 0)).toThrow();
    
    // 負電阻
    expect(() => new Resistor('R1', ['n1', 'n2'], -100)).toThrow();
    
    // 節點數量不對
    expect(() => new Resistor('R1', ['n1'] as any, 1000)).toThrow();
    
    // 連接到同一節點
    expect(() => new Resistor('R1', ['n1', 'n1'], 1000)).toThrow();
  });
  
  test('電導值計算', () => {
    const R1 = new Resistor('R1', ['n1', 'n2'], 1000);  // 1kΩ
    expect(R1.conductance).toBeCloseTo(0.001, 10);      // 1mS
    
    const R2 = new Resistor('R2', ['n1', 'n2'], 1e6);   // 1MΩ
    expect(R2.conductance).toBeCloseTo(1e-6, 12);       // 1μS
    
    const R3 = new Resistor('R3', ['n1', 'n2'], 0.1);   // 0.1Ω
    expect(R3.conductance).toBeCloseTo(10, 10);         // 10S
  });
  
  test('hasEvents - 電阻不產生事件', () => {
    const R = new Resistor('R1', ['n1', 'n2'], 1000);
    expect(R.hasEvents()).toBe(false);
  });
});

describe('Resistor - 驗證方法', () => {
  test('validate - 正常電阻應通過驗證', () => {
    const R = new Resistor('R1', ['n1', 'n2'], 1000);
    const result = R.validate();
    
    expect(result.isValid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });
  
  test('validate - 極小電阻應產生警告', () => {
    const R = new Resistor('R1', ['n1', 'n2'], 1e-13);
    const result = R.validate();
    
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings[0]).toContain('过小');  // 簡體中文
  });
  
  test('validate - 極大電阻應產生警告', () => {
    const R = new Resistor('R1', ['n1', 'n2'], 1e13);
    const result = R.validate();
    
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings[0]).toContain('过大');  // 簡體中文
  });
  
  test('getInfo - 獲取組件信息', () => {
    const R = new Resistor('R1', ['n1', 'n2'], 4700);
    const info = R.getInfo();
    
    expect(info.type).toBe('R');
    expect(info.name).toBe('R1');
    expect(info.nodes).toEqual(['n1', 'n2']);
    expect(info.parameters['resistance']).toBe(4700);
    expect(info.parameters['conductance']).toBeCloseTo(1/4700, 10);
  });
});

describe('Resistor - MNA 矩陣裝配', () => {
  let matrix: SparseMatrix;
  let rhs: Vector;
  let nodeMap: Map<string, number>;
  let context: AssemblyContext;
  
  beforeEach(() => {
    // 創建 3x3 矩陣（2個節點 + 1個地節點）
    matrix = new SparseMatrix(3, 3);
    rhs = new Vector(3);
    nodeMap = new Map([
      ['n1', 0],
      ['n2', 1],
      ['gnd', 2]
    ]);
    
    context = {
      matrix,
      rhs,
      nodeMap,
      currentTime: 0,
      dt: 0
    };
  });
  
  test('assemble - 基本矩陣裝配', () => {
    // 電阻 R = 1000Ω, G = 0.001S
    const R = new Resistor('R1', ['n1', 'n2'], 1000);
    R.assemble(context);
    
    const G = 0.001;
    
    // 驗證 MNA 矩陣元素
    // G[0,0] = +G
    expect(matrix.get(0, 0)).toBeCloseTo(G, 10);
    
    // G[0,1] = -G
    expect(matrix.get(0, 1)).toBeCloseTo(-G, 10);
    
    // G[1,0] = -G
    expect(matrix.get(1, 0)).toBeCloseTo(-G, 10);
    
    // G[1,1] = +G
    expect(matrix.get(1, 1)).toBeCloseTo(G, 10);
  });
  
  test('assemble - 連接到地節點', () => {
    const R = new Resistor('R1', ['n1', 'gnd'], 1000);
    R.assemble(context);
    
    const G = 0.001;
    
    // n1 到地，只影響 G[0,0]
    expect(matrix.get(0, 0)).toBeCloseTo(G, 10);
    
    // 地節點（索引2）也會被裝配（因為 assemble 會處理所有有效節點）
    // 修正：地節點也有電導貢獻
    expect(matrix.get(2, 2)).toBeCloseTo(G, 10);
  });
  
  test('assemble - 多個電阻累加', () => {
    const R1 = new Resistor('R1', ['n1', 'n2'], 1000);  // G1 = 0.001
    const R2 = new Resistor('R2', ['n1', 'n2'], 2000);  // G2 = 0.0005
    
    R1.assemble(context);
    R2.assemble(context);
    
    const G_total = 0.001 + 0.0005; // = 0.0015
    
    // 並聯電阻，電導相加
    expect(matrix.get(0, 0)).toBeCloseTo(G_total, 10);
    expect(matrix.get(1, 1)).toBeCloseTo(G_total, 10);
  });
  
  test('assemble - 不影響 RHS（DC分析）', () => {
    const R = new Resistor('R1', ['n1', 'n2'], 1000);
    R.assemble(context);
    
    // 線性電阻不貢獻 RHS
    expect(rhs.get(0)).toBe(0);
    expect(rhs.get(1)).toBe(0);
    expect(rhs.get(2)).toBe(0);
  });
});

describe('Resistor - 歐姆定律驗證', () => {
  test('calculatePower - 功率計算', () => {
    const R = new Resistor('R1', ['n1', 'n2'], 100);  // 100Ω
    
    // V = 10V, I = 0.1A
    const power1 = R.calculatePower(10, 0.1);
    expect(power1).toBeCloseTo(1.0, 6);  // P = V²/R = 100/100 = 1W
    
    // V = 5V, I = 0.05A
    const power2 = R.calculatePower(5, 0.05);
    expect(power2).toBeCloseTo(0.25, 6);  // P = 25/100 = 0.25W
  });
  
  test('calculatePower - 電壓電流不一致應警告', () => {
    const R = new Resistor('R1', ['n1', 'n2'], 100);
    
    // 捕獲 console.warn
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    
    // V = 10V 但 I = 0.2A (應該是 0.1A)
    R.calculatePower(10, 0.2);
    
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});

describe('Resistor - 溫度特性', () => {
  test('getTemperatureAdjustedResistance - 無溫度係數', () => {
    const R = new Resistor('R1', ['n1', 'n2'], 1000);
    
    // 溫度變化但無溫度係數，電阻不變
    const R_25C = R.getTemperatureAdjustedResistance(25, 25, 0);
    const R_75C = R.getTemperatureAdjustedResistance(75, 25, 0);
    
    expect(R_25C).toBeCloseTo(1000, 10);
    expect(R_75C).toBeCloseTo(1000, 10);
  });
  
  test('getTemperatureAdjustedResistance - 正溫度係數', () => {
    const R = new Resistor('R1', ['n1', 'n2'], 1000);
    const tempCoeff = 3900;  // 3900 ppm/°C (典型銅導線)
    
    // 從 25°C 升溫到 75°C (ΔT = 50°C)
    const R_75C = R.getTemperatureAdjustedResistance(75, 25, tempCoeff);
    
    // R(75°C) = 1000 * (1 + 3900e-6 * 50) = 1000 * 1.195 = 1195Ω
    expect(R_75C).toBeCloseTo(1195, 1);
  });
  
  test('createTemperatureAdjustedVersion - 創建新實例', () => {
    const R_25C = new Resistor('R1', ['n1', 'n2'], 1000);
    const R_75C = R_25C.createTemperatureAdjustedVersion(75, 25, 3900);
    
    expect(R_75C.name).toContain('T75C');
    expect(R_75C.resistance).toBeCloseTo(1195, 1);
    
    // 原始電阻不變
    expect(R_25C.resistance).toBe(1000);
  });
});

describe('Resistor - 工廠方法', () => {
  test('ResistorFactory.create - 創建標準電阻', () => {
    const R = ResistorFactory.create('R1', ['n1', 'n2'], 4700);
    
    expect(R.name).toBe('R1');
    expect(R.resistance).toBe(4700);
  });
  
  test('ResistorFactory.createStandardValue - E12 系列', () => {
    // 嘗試創建接近 1.3kΩ 的標準阻值
    const R = ResistorFactory.createStandardValue('R1', ['n1', 'n2'], 1.3, 1000);
    
    // 應該選擇 1.2kΩ (最接近的 E12 值)
    expect(R.resistance).toBe(1200);
  });
});

describe('Resistor - 測試工具', () => {
  test('ResistorTest.verifyOhmsLaw - 歐姆定律計算', () => {
    const result = ResistorTest.verifyOhmsLaw(1000, 10);
    
    expect(result.current).toBeCloseTo(0.01, 10);  // I = 10/1000 = 0.01A
    expect(result.power).toBeCloseTo(0.1, 10);     // P = 10*0.01 = 0.1W
  });
  
  test('ResistorTest.verifyMNAStamp - MNA 裝配驗證', () => {
    const stamp = ResistorTest.verifyMNAStamp(1000);
    const G = 0.001;
    
    expect(stamp.g11).toBeCloseTo(G, 10);
    expect(stamp.g12).toBeCloseTo(-G, 10);
    expect(stamp.g21).toBeCloseTo(-G, 10);
    expect(stamp.g22).toBeCloseTo(G, 10);
  });
});

describe('Resistor - 邊界條件和數值穩定性', () => {
  test('極小電阻 - 接近短路', () => {
    const R = new Resistor('R1', ['n1', 'n2'], 1e-13);  // 更極端的值
    
    expect(R.conductance).toBeCloseTo(1e13, 0);
    const result = R.validate();
    // 驗證至少有警告
    expect(result.warnings.length).toBeGreaterThan(0);
  });
  
  test('極大電阻 - 接近開路', () => {
    const R = new Resistor('R1', ['n1', 'n2'], 1e13);  // 超過閾值
    
    expect(R.conductance).toBeCloseTo(1e-13, 15);
    const result = R.validate();
    expect(result.warnings.length).toBeGreaterThan(0);
  });
  
  test('toString - 調試信息', () => {
    const R = new Resistor('R1', ['n1', 'n2'], 4700);
    const str = R.toString();
    
    expect(str).toContain('R1');
    expect(str).toContain('4700');
    expect(str).toContain('n1');
    expect(str).toContain('n2');
  });
});
