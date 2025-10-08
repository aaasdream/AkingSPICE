/**
 * 🧪 理想变压器组件测试 - AkingSPICE 2.1
 * 
 * 验证理想变压器的基本功能和 MNA 装配
 */

import { describe, it, expect } from 'vitest';
import { IdealTransformer } from '../src/components/coupling/transformer';
import { SparseMatrix } from '../src/math/sparse/matrix';
import { Vector } from '../src/math/sparse/vector';

describe('IdealTransformer', () => {
  it('应该能够创建有效的理想变压器', () => {
    const transformer = new IdealTransformer(
      'T1',
      ['n1', 'n2', 'n3', 'n4'],
      2.0  // 2:1 变压器
    );
    
    expect(transformer.name).toBe('T1');
    expect(transformer.type).toBe('K');
    expect(transformer.nodes).toEqual(['n1', 'n2', 'n3', 'n4']);
    expect(transformer.turnsRatio).toBe(2.0);
  });

  it('应该在匝数比为负数时抛出错误', () => {
    expect(() => {
      new IdealTransformer('T1', ['n1', 'n2', 'n3', 'n4'], -1.0);
    }).toThrow('变压器匝数比必须为正数');
  });

  it('应该通过有效参数的验证', () => {
    const transformer = new IdealTransformer(
      'T1',
      ['n1', 'n2', 'n3', 'n4'],
      2.0
    );
    
    const validation = transformer.validate();
    expect(validation.isValid).toBe(true);
    expect(validation.errors).toHaveLength(0);
  });

  it('应该正确计算次级电压', () => {
    const transformer = new IdealTransformer(
      'T1',
      ['n1', 'n2', 'n3', 'n4'],
      2.0
    );
    
    const primaryVoltage = 10.0;
    const secondaryVoltage = transformer.calculateSecondaryVoltage(primaryVoltage);
    expect(secondaryVoltage).toBe(5.0); // 10V / 2 = 5V
  });

  it('应该正确计算初级电流', () => {
    const transformer = new IdealTransformer(
      'T1',
      ['n1', 'n2', 'n3', 'n4'],
      2.0
    );
    
    const secondaryCurrent = 2.0;
    const primaryCurrent = transformer.calculatePrimaryCurrent(secondaryCurrent);
    expect(primaryCurrent).toBe(-1.0); // -2A / 2 = -1A
  });

  it('应该验证功率守恒', () => {
    const transformer = new IdealTransformer(
      'T1',
      ['n1', 'n2', 'n3', 'n4'],
      2.0
    );
    
    const result = transformer.verifyPowerConservation(
      10.0, // Vp
      1.0,  // Ip
      5.0,  // Vs
      -2.0  // Is
    );
    
    expect(result.primaryPower).toBe(10.0);
    expect(result.secondaryPower).toBe(-10.0);
    expect(result.isConserved).toBe(true);
  });

  it('应该正确装配 MNA 矩阵', () => {
    const transformer = new IdealTransformer(
      'T1',
      ['n1', 'n2', 'n3', 'n4'],
      2.0
    );
    
    // 设置电流支路索引
    transformer.setCurrentIndices(4, 5);
    
    // 创建测试矩阵
    const matrix = new SparseMatrix(6, 6);
    const rhs = new Vector(6);
    const nodeMap = new Map([
      ['n1', 0],
      ['n2', 1],
      ['n3', 2],
      ['n4', 3]
    ]);
    
    transformer.assemble({ matrix, rhs, nodeMap, currentTime: 0 });
    
    // 验证关键矩阵元素
    expect(matrix.get(0, 4)).toBe(1);   // KCL: n1 -> ip
    expect(matrix.get(1, 4)).toBe(-1);  // KCL: n2 -> ip
    expect(matrix.get(2, 5)).toBe(1);   // KCL: n3 -> is
    expect(matrix.get(3, 5)).toBe(-1);  // KCL: n4 -> is
    
    // 验证电压关系
    expect(matrix.get(4, 0)).toBe(1);   // 电压方程: ip -> n1
    expect(matrix.get(4, 1)).toBe(-1);  // 电压方程: ip -> n2
    expect(matrix.get(4, 2)).toBe(-2);  // 电压方程: ip -> n3 (-n)
    expect(matrix.get(4, 3)).toBe(2);   // 电压方程: ip -> n4 (n)
    
    // 验证电流关系
    expect(matrix.get(5, 4)).toBe(2);   // 电流方程: is -> ip (n)
    expect(matrix.get(5, 5)).toBe(1);   // 电流方程: is -> is
  });

  it('应该返回正确的额外变量数量', () => {
    const transformer = new IdealTransformer(
      'T1',
      ['n1', 'n2', 'n3', 'n4'],
      2.0
    );
    
    expect(transformer.getExtraVariableCount()).toBe(2);
  });

  it('应该返回正确的组件信息', () => {
    const transformer = new IdealTransformer(
      'T1',
      ['n1', 'n2', 'n3', 'n4'],
      2.0
    );
    transformer.setCurrentIndices(4, 5);
    
    const info = transformer.getInfo();
    expect(info.type).toBe('K');
    expect(info.name).toBe('T1');
    expect(info.nodes).toEqual(['n1', 'n2', 'n3', 'n4']);
    expect(info.parameters.turnsRatio).toBe(2.0);
    expect(info.parameters.primaryCurrentIndex).toBe(4);
    expect(info.parameters.secondaryCurrentIndex).toBe(5);
  });
});