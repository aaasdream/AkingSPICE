/**
 * 🧮 Modified Nodal Analysis (MNA) 引擎 - AkingSPICE 2.0
 * 
 * 現代電路模擬的核心引擎
 * 基於 MNA 方法，不使用 MCP-LCP
 * 
 * 核心方程：
 * [G B] [v]   [i]
 * [C D] [j] = [e]
 * 
 * 其中：
 * G - 節點電導矩陣
 * B - 關聯矩陣 (節點到支路)
 * C - 關聯矩陣轉置
 * D - 支路矩陣
 * v - 節點電壓向量
 * j - 支路電流向量
 * i - 節點電流向量
 * e - 支路電壓向量
 */

import type { 
  IMNASystem, 
  ICircuit, 
  IComponent, 
  NodeId, 
  ComponentId,
  ISparseMatrix,
  IVector,
  VoltageVector
} from '../../types/index';
import { SparseMatrix } from '../../math/sparse/matrix';
import { Vector } from '../../math/sparse/vector';

/**
 * MNA 系統構建器和求解器
 */
export class MNAEngine {
  private _nodeMap = new Map<NodeId, number>();
  private _branchMap = new Map<ComponentId, number>();
  private _nodeCount = 0;
  private _branchCount = 0;

  /**
   * 從電路構建 MNA 系統
   */
  buildSystem(circuit: ICircuit): MNASystem {
    // 重置內部狀態
    this._reset();
    
    // 1. 映射節點和支路
    this._mapNodes(circuit);
    this._mapBranches(circuit);
    
    // 2. 創建 MNA 矩陣
    const systemSize = this._nodeCount + this._branchCount;
    const system = new MNASystem(systemSize, this._nodeCount, this._branchCount);
    
    // 3. 應用組件戳印
    for (const component of circuit.components.values()) {
      try {
        component.stamp(system);
      } catch (error) {
        throw new Error(`組件 ${component.id} 戳印失敗: ${error}`);
      }
    }
    
    return system;
  }

  /**
   * 求解 DC 工作點
   */
  solveDC(system: MNASystem, initialGuess?: VoltageVector): VoltageVector {
    // 對於線性 DC 問題，直接求解
    const rhs = this._buildRHS(system);
    const solution = system.systemMatrix.solve(rhs);
    
    // 提取節點電壓
    const nodeVoltages = new Vector(system.nodeCount);
    for (let i = 0; i < system.nodeCount; i++) {
      nodeVoltages.set(i, solution.get(i));
    }
    
    return nodeVoltages;
  }

  /**
   * 獲取節點索引
   */
  getNodeIndex(nodeId: NodeId): number {
    const index = this._nodeMap.get(nodeId);
    if (index === undefined) {
      throw new Error(`節點未找到: ${nodeId}`);
    }
    return index;
  }

  /**
   * 獲取支路索引
   */
  getBranchIndex(componentId: ComponentId): number {
    const index = this._branchMap.get(componentId);
    if (index === undefined) {
      throw new Error(`支路未找到: ${componentId}`);
    }
    return index;
  }

  private _reset(): void {
    this._nodeMap.clear();
    this._branchMap.clear();
    this._nodeCount = 0;
    this._branchCount = 0;
  }

  private _mapNodes(circuit: ICircuit): void {
    // 地節點固定為索引 0
    this._nodeMap.set(circuit.groundNode, 0);
    this._nodeCount = 1;
    
    // 映射其他節點
    for (const nodeId of circuit.nodes.keys()) {
      if (nodeId !== circuit.groundNode) {
        this._nodeMap.set(nodeId, this._nodeCount++);
      }
    }
  }

  private _mapBranches(circuit: ICircuit): void {
    // 映射需要支路電流的組件
    for (const component of circuit.components.values()) {
      if (this._needsBranchCurrent(component)) {
        this._branchMap.set(component.id, this._branchCount++);
      }
    }
  }

  private _needsBranchCurrent(component: IComponent): boolean {
    // 電壓源和電感需要支路電流
    return component.type === 'V' || component.type === 'L';
  }

  private _buildRHS(system: MNASystem): IVector {
    // 構建右側向量 [i; e]
    const rhs = new Vector(system.size);
    
    // 節點電流部分已在戳印時填入
    // 支路電壓部分已在戳印時填入
    
    return rhs;
  }
}

/**
 * MNA 系統實現
 */
export class MNASystem implements IMNASystem {
  private _G: SparseMatrix;  // 節點電導矩陣
  private _B: SparseMatrix;  // 節點-支路關聯矩陣
  private _C: SparseMatrix;  // 支路-節點關聯矩陣  
  private _D: SparseMatrix;  // 支路矩陣
  private _systemMatrix: SparseMatrix;  // 完整系統矩陣
  
  private _i: Vector;  // 節點電流向量
  private _e: Vector;  // 支路電壓向量
  private _v: Vector;  // 節點電壓向量  
  private _j: Vector;  // 支路電流向量

  constructor(
    public readonly size: number,
    public readonly nodeCount: number, 
    public readonly branchCount: number
  ) {
    // 初始化子矩陣
    this._G = new SparseMatrix(nodeCount, nodeCount);
    this._B = new SparseMatrix(nodeCount, branchCount);
    this._C = new SparseMatrix(branchCount, nodeCount);
    this._D = new SparseMatrix(branchCount, branchCount);
    
    // 構建完整系統矩陣
    this._systemMatrix = new SparseMatrix(size, size);
    
    // 初始化向量
    this._i = new Vector(nodeCount);
    this._e = new Vector(branchCount);
    this._v = new Vector(nodeCount);
    this._j = new Vector(branchCount);
  }

  get G(): ISparseMatrix { return this._G; }
  get B(): ISparseMatrix { return this._B; }
  get C(): ISparseMatrix { return this._C; }
  get D(): ISparseMatrix { return this._D; }
  get systemMatrix(): ISparseMatrix { return this._systemMatrix; }

  get i(): IVector { return this._i; }
  get e(): IVector { return this._e; }
  get v(): IVector { return this._v; }
  get j(): IVector { return this._j; }

  /**
   * 添加節點 (實際上節點已在引擎中預分配)
   */
  addNode(id: NodeId): number {
    throw new Error('節點應在 MNA 引擎中預分配');
  }

  /**
   * 添加支路 (實際上支路已在引擎中預分配)
   */
  addBranch(from: NodeId, to: NodeId): number {
    throw new Error('支路應在 MNA 引擎中預分配');
  }

  /**
   * 對系統矩陣加戳印
   */
  stamp(row: number, col: number, value: number): void {
    if (Math.abs(value) < 1e-15) return;
    
    this._systemMatrix.add(row, col, value);
    
    // 同時更新對應的子矩陣
    if (row < this.nodeCount && col < this.nodeCount) {
      // G 矩陣
      this._G.add(row, col, value);
    } else if (row < this.nodeCount && col >= this.nodeCount) {
      // B 矩陣
      this._B.add(row, col - this.nodeCount, value);
    } else if (row >= this.nodeCount && col < this.nodeCount) {
      // C 矩陣
      this._C.add(row - this.nodeCount, col, value);
    } else {
      // D 矩陣
      this._D.add(row - this.nodeCount, col - this.nodeCount, value);
    }
  }

  /**
   * 對節點電流向量加戳印
   */
  stampNodeCurrent(nodeIndex: number, current: number): void {
    this._i.add(nodeIndex, current);
  }

  /**
   * 對支路電壓向量加戳印
   */
  stampBranchVoltage(branchIndex: number, voltage: number): void {
    this._e.add(branchIndex, voltage);
  }

  /**
   * 重建系統矩陣 (用於非線性或事件後)
   */
  rebuild(): void {
    // 清空系統矩陣
    this._systemMatrix.clear();
    this._G.clear();
    this._B.clear(); 
    this._C.clear();
    this._D.clear();
    
    // 清空右側向量
    this._i.fill(0);
    this._e.fill(0);
  }

  /**
   * 獲取完整的右側向量 [i; e]
   */
  getRHS(): IVector {
    const rhs = new Vector(this.size);
    
    // 複製節點電流
    for (let i = 0; i < this.nodeCount; i++) {
      rhs.set(i, this._i.get(i));
    }
    
    // 複製支路電壓
    for (let i = 0; i < this.branchCount; i++) {
      rhs.set(this.nodeCount + i, this._e.get(i));
    }
    
    return rhs;
  }

  /**
   * 設置解向量 [v; j]
   */
  setSolution(solution: IVector): void {
    if (solution.size !== this.size) {
      throw new Error(`解向量維度不匹配: ${solution.size} vs ${this.size}`);
    }
    
    // 提取節點電壓
    for (let i = 0; i < this.nodeCount; i++) {
      this._v.set(i, solution.get(i));
    }
    
    // 提取支路電流
    for (let i = 0; i < this.branchCount; i++) {
      this._j.set(i, solution.get(this.nodeCount + i));
    }
  }

  /**
   * 獲取系統信息
   */
  getSystemInfo(): SystemInfo {
    return {
      size: this.size,
      nodeCount: this.nodeCount,
      branchCount: this.branchCount,
      nnz: this._systemMatrix.nnz,
      matrixInfo: this._systemMatrix.getInfo()
    };
  }
}

export interface SystemInfo {
  readonly size: number;
  readonly nodeCount: number; 
  readonly branchCount: number;
  readonly nnz: number;
  readonly matrixInfo: any;
}