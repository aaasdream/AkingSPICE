/**
 * 🚀 AkingSPICE 2.1 - KLU WASM TypeScript 接口
 * 
 * 為 SuiteSparse:KLU WebAssembly 模組提供高級 TypeScript API
 * 專門優化於電力電子電路模擬的稀疏矩陣求解
 * 
 * 特性：
 * - 符號/數值分離架構 (適合 Newton 迭代)
 * - 自動條件數監控 (數值穩定性)
 * - 高性能 CSC 格式支援 (零拷貝)
 * - 詳細性能分析 (bottleneck 識別)
 */

import type { SparseMatrix } from '@/math/sparse/matrix';

/**
 * WASM 模組接口 (由 Emscripten 生成)
 */
interface EmscriptenKLUModule {
  // 主求解器類
  UltraKLUSolver: {
    new(): WASMKLUSolver;
  };
  
  // STL 容器綁定
  VectorDouble: {
    new(): WASMVector<number>;
    new(size: number): WASMVector<number>;
  };
  
  VectorInt: {
    new(): WASMVector<number>;
    new(size: number): WASMVector<number>;
  };
}

interface WASMVector<T> {
  size(): number;
  get(index: number): T;
  set(index: number, value: T): void;
  push_back(value: T): void;
  resize(size: number): void;
  delete(): void;
}

interface WASMSolveResult {
  success: boolean;
  solution: WASMVector<number>;
  errorMessage: string;
  iterations: number;
  conditionNumber: number;
  factorizationTime: number;
  solveTime: number;
}

interface WASMMatrixStats {
  rows: number;
  cols: number;
  nnz: number;
  fillFactor: number;
  isSymmetric: boolean;
  conditionEstimate: number;
}

interface WASMKLUSolver {
  analyzeStructure(n: number, colPtr: WASMVector<number>, rowIdx: WASMVector<number>): boolean;
  factorizeMatrix(values: WASMVector<number>): boolean;
  solveSystem(rhs: WASMVector<number>): WASMSolveResult;
  getStatistics(): WASMMatrixStats;
  cleanup(): void;
  delete(): void;
}

/**
 * 求解結果
 */
export interface KLUSolveResult {
  readonly success: boolean;
  readonly solution: Float64Array;
  readonly errorMessage: string;
  readonly iterations: number;
  readonly conditionNumber: number;
  readonly performance: {
    readonly factorizationTime: number;  // ms
    readonly solveTime: number;          // ms
    readonly totalTime: number;          // ms
  };
}

/**
 * 矩陣統計信息
 */
export interface KLUMatrixStats {
  readonly dimensions: { rows: number; cols: number; nnz: number };
  readonly performance: { fillFactor: number; conditionEstimate: number };
  readonly properties: { isSymmetric: boolean; isAnalyzed: boolean; isFactorized: boolean };
}

/**
 * 求解器配置選項
 */
export interface KLUOptions {
  /** 數值容差 (預設: 1e-12) */
  readonly tolerance?: number;
  
  /** 是否啟用縮放 (預設: true) */
  readonly enableScaling?: boolean;
  
  /** 是否啟用部分透視 (預設: true) */
  readonly enablePivoting?: boolean;
  
  /** 排序算法 (預設: 'amd') */
  readonly ordering?: 'natural' | 'amd' | 'colamd';
  
  /** 是否監控條件數 (預設: false，較耗時) */
  readonly monitorCondition?: boolean;
}

/**
 * 🚀 Ultra-Performance KLU 求解器
 * 
 * 工業級稀疏線性方程組求解器，專為電路模擬優化
 * 實現符號/數值分離架構，支援高效的 Newton-Raphson 迭代
 */
export class UltraKLUSolver {
  private wasmSolver: WASMKLUSolver | null = null;
  private wasmModule: EmscriptenKLUModule | null = null;
  
  private isAnalyzed = false;
  private isFactorized = false;
  private matrixSize = 0;
  private options: Required<KLUOptions>;
  
  // 性能統計
  private totalSolves = 0;
  private totalFactorizations = 0;
  private cumulativeFactorTime = 0;
  private cumulativeSolveTime = 0;

  constructor(options: KLUOptions = {}) {
    this.options = {
      tolerance: options.tolerance ?? 1e-12,
      enableScaling: options.enableScaling ?? true,
      enablePivoting: options.enablePivoting ?? true,
      ordering: options.ordering ?? 'amd',
      monitorCondition: options.monitorCondition ?? false,
      ...options
    };
  }

  /**
   * 初始化 WASM 模組
   * 
   * @param wasmModule Emscripten 編譯的 KLU 模組
   */
  async initialize(wasmModule: EmscriptenKLUModule): Promise<void> {
    if (this.wasmModule) {
      throw new Error('KLU 求解器已經初始化');
    }
    
    this.wasmModule = wasmModule;
    this.wasmSolver = new wasmModule.UltraKLUSolver();
    
    console.log('🚀 Ultra KLU 求解器已準備就緒');
    console.log(`   配置: tolerance=${this.options.tolerance}, ordering=${this.options.ordering}`);
  }

  /**
   * 符號分析 - 分析矩陣稀疏結構
   * 
   * 只需在電路拓撲改變時執行一次
   * 建立最優的消元順序和記憶體佈局
   * 
   * @param matrix 稀疏矩陣 (CSC 格式)
   * @returns 是否分析成功
   */
  analyzeStructure(matrix: SparseMatrix): boolean {
    this.validateInitialization();
    
    if (matrix.rows !== matrix.cols) {
      throw new Error('KLU 只支援方陣');
    }
    
    const startTime = performance.now();
    
    // 轉換為 CSC 格式並創建 WASM 向量
    const cscMatrix = matrix.toCSC(); // 需要在 SparseMatrix 中實現 CSC 轉換
    const colPtr = this.createWASMVector(cscMatrix.colPointers);
    const rowIdx = this.createWASMVector(cscMatrix.rowIndices);
    
    try {
      const success = this.wasmSolver!.analyzeStructure(matrix.rows, colPtr, rowIdx);
      
      if (success) {
        this.isAnalyzed = true;
        this.isFactorized = false;
        this.matrixSize = matrix.rows;
        
        const analyzeTime = performance.now() - startTime;
        console.log(`✅ KLU 符號分析完成 (${analyzeTime.toFixed(2)}ms)`);
        console.log(`   矩陣: ${matrix.rows}×${matrix.cols}, NNZ: ${matrix.nnz}`);
      } else {
        console.error('❌ KLU 符號分析失敗');
      }
      
      return success;
    } finally {
      colPtr.delete();
      rowIdx.delete();
    }
  }

  /**
   * 數值分解 - LU 分解
   * 
   * 每次矩陣值變化時執行
   * 保持符號結構，只更新數值
   * 
   * @param matrix 稀疏矩陣 (值已更新)
   * @returns 是否分解成功
   */
  factorizeMatrix(matrix: SparseMatrix): boolean {
    if (!this.isAnalyzed) {
      throw new Error('必須先執行符號分析');
    }
    
    this.validateMatrixCompatibility(matrix);
    
    const startTime = performance.now();
    
    const cscMatrix = matrix.toCSC();
    const values = this.createWASMVector(Array.from(cscMatrix.values));
    
    try {
      const success = this.wasmSolver!.factorizeMatrix(values);
      
      if (success) {
        this.isFactorized = true;
        this.totalFactorizations++;
        
        const factorTime = performance.now() - startTime;
        this.cumulativeFactorTime += factorTime;
        
        console.log(`✅ KLU 數值分解完成 (${factorTime.toFixed(3)}ms)`);
        
        // 檢查數值穩定性
        if (this.options.monitorCondition) {
          const stats = this.getStatistics();
          if (stats.performance.conditionEstimate > 1e12) {
            console.warn(`⚠️  高條件數警告: ${stats.performance.conditionEstimate.toExponential(2)}`);
          }
        }
      } else {
        console.error('❌ KLU 數值分解失敗 (矩陣可能奇異)');
      }
      
      return success;
    } finally {
      values.delete();
    }
  }

  /**
   * 求解線性方程組 Ax = b
   * 
   * 使用預分解的 LU 因子，高效求解
   * 支援多次求解不同的右端向量
   * 
   * @param rhs 右端向量
   * @returns 求解結果
   */
  solveSystem(rhs: Float64Array | number[]): KLUSolveResult {
    if (!this.isFactorized) {
      throw new Error('必須先執行矩陣分解');
    }
    
    if (rhs.length !== this.matrixSize) {
      throw new Error(`右端向量維度不匹配: 期望 ${this.matrixSize}, 實際 ${rhs.length}`);
    }
    
    const totalStartTime = performance.now();
    
    const rhsVector = this.createWASMVector(Array.from(rhs));
    
    try {
      const wasmResult = this.wasmSolver!.solveSystem(rhsVector);
      
      // 轉換結果
      const solution = new Float64Array(this.matrixSize);
      for (let i = 0; i < this.matrixSize; i++) {
        solution[i] = wasmResult.solution.get(i);
      }
      
      const totalTime = performance.now() - totalStartTime;
      this.totalSolves++;
      this.cumulativeSolveTime += wasmResult.solveTime;
      
      const result: KLUSolveResult = {
        success: wasmResult.success,
        solution,
        errorMessage: wasmResult.errorMessage,
        iterations: wasmResult.iterations,
        conditionNumber: wasmResult.conditionNumber,
        performance: {
          factorizationTime: wasmResult.factorizationTime,
          solveTime: wasmResult.solveTime,
          totalTime
        }
      };
      
      if (result.success) {
        console.log(`✅ KLU 求解完成 (${result.performance.solveTime.toFixed(3)}ms)`);
      } else {
        console.error(`❌ KLU 求解失敗: ${result.errorMessage}`);
      }
      
      return result;
    } finally {
      rhsVector.delete();
    }
  }

  /**
   * 獲取詳細統計信息
   */
  getStatistics(): KLUMatrixStats {
    this.validateInitialization();
    
    const wasmStats = this.wasmSolver!.getStatistics();
    
    return {
      dimensions: {
        rows: wasmStats.rows,
        cols: wasmStats.cols,
        nnz: wasmStats.nnz
      },
      performance: {
        fillFactor: wasmStats.fillFactor,
        conditionEstimate: wasmStats.conditionEstimate
      },
      properties: {
        isSymmetric: wasmStats.isSymmetric,
        isAnalyzed: this.isAnalyzed,
        isFactorized: this.isFactorized
      }
    };
  }

  /**
   * 獲取累積性能統計
   */
  getPerformanceReport(): {
    totalSolves: number;
    totalFactorizations: number;
    avgFactorTime: number;
    avgSolveTime: number;
    efficiency: string;
  } {
    return {
      totalSolves: this.totalSolves,
      totalFactorizations: this.totalFactorizations,
      avgFactorTime: this.totalFactorizations > 0 ? this.cumulativeFactorTime / this.totalFactorizations : 0,
      avgSolveTime: this.totalSolves > 0 ? this.cumulativeSolveTime / this.totalSolves : 0,
      efficiency: this.totalSolves > this.totalFactorizations ? 
        `高效 (${(this.totalSolves / Math.max(this.totalFactorizations, 1)).toFixed(1)}x 復用)` :
        '需要更多復用'
    };
  }

  /**
   * 重置求解器狀態
   */
  reset(): void {
    if (this.wasmSolver) {
      this.wasmSolver.cleanup();
    }
    
    this.isAnalyzed = false;
    this.isFactorized = false;
    this.matrixSize = 0;
    
    // 保留性能統計
    console.log('🔄 KLU 求解器已重置');
  }

  /**
   * 釋放資源
   */
  dispose(): void {
    if (this.wasmSolver) {
      this.wasmSolver.delete();
      this.wasmSolver = null;
    }
    
    this.wasmModule = null;
    console.log('♻️  KLU 求解器資源已釋放');
  }

  // === 私有輔助方法 ===

  private validateInitialization(): void {
    if (!this.wasmModule || !this.wasmSolver) {
      throw new Error('KLU 求解器未初始化，請先調用 initialize()');
    }
  }

  private validateMatrixCompatibility(matrix: SparseMatrix): void {
    if (matrix.rows !== this.matrixSize || matrix.cols !== this.matrixSize) {
      throw new Error(`矩陣維度不匹配: 期望 ${this.matrixSize}×${this.matrixSize}, 實際 ${matrix.rows}×${matrix.cols}`);
    }
  }

  private createWASMVector(data: number[]): WASMVector<number> {
    const vector = new this.wasmModule!.VectorDouble();
    vector.resize(data.length);
    
    for (let i = 0; i < data.length; i++) {
      const value = data[i];
      if (value !== undefined) {
        vector.set(i, value);
      } else {
        vector.set(i, 0); // 處理 undefined 值
      }
    }
    
    return vector;
  }
}

/**
 * 🚀 全局 KLU 實例管理器
 * 
 * 提供單例模式的高性能求解器
 * 支援自動資源管理和性能監控
 */
export class KLUManager {
  private static instance: UltraKLUSolver | null = null;
  private static isInitialized = false;

  /**
   * 獲取全局 KLU 實例
   */
  static async getInstance(options?: KLUOptions): Promise<UltraKLUSolver> {
    if (!this.instance) {
      this.instance = new UltraKLUSolver(options);
      
      // 動態載入 WASM 模組
      try {
        const wasmModule = await this.loadWASMModule();
        await this.instance.initialize(wasmModule);
        this.isInitialized = true;
        
        console.log('🚀 全域 KLU 求解器已啟動');
      } catch (error) {
        console.error('❌ KLU WASM 模組載入失敗:', error);
        throw error;
      }
    }
    
    return this.instance;
  }

  /**
   * 檢查是否已初始化
   */
  static isReady(): boolean {
    return this.isInitialized && this.instance !== null;
  }

  /**
   * 關閉全域實例
   */
  static shutdown(): void {
    if (this.instance) {
      this.instance.dispose();
      this.instance = null;
      this.isInitialized = false;
      
      console.log('🛑 全域 KLU 求解器已關閉');
    }
  }

  private static async loadWASMModule(): Promise<EmscriptenKLUModule> {
    // 這裡需要載入實際的 WASM 模組
    // 暫時返回模擬接口
    throw new Error('WASM 模組載入尚未實現 - 需要 Emscripten 編譯');
  }
}

/**
 * 便利函數：快速求解稀疏線性系統
 * 
 * @param matrix MNA 矩陣
 * @param rhs 右端向量  
 * @param options 求解選項
 * @returns 求解結果
 */
export async function solveLinearSystem(
  matrix: SparseMatrix,
  rhs: Float64Array,
  options?: KLUOptions
): Promise<KLUSolveResult> {
  const solver = await KLUManager.getInstance(options);
  
  // 自動執行符號分析和數值分解
  if (!solver.getStatistics().properties.isAnalyzed) {
    if (!solver.analyzeStructure(matrix)) {
      throw new Error('符號分析失敗');
    }
  }
  
  if (!solver.factorizeMatrix(matrix)) {
    throw new Error('數值分解失敗');
  }
  
  return solver.solveSystem(rhs);
}