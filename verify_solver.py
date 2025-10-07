#!/usr/bin/env python3
"""
🔬 稀疏線性求解器驗證腳本

使用 SciPy 作為黃金標準，生成測試數據來驗證
TypeScript KLU 求解器的正確性。

運行方式:
    python verify_solver.py

輸出:
    - CSR 格式的矩陣數據
    - 右側向量 (RHS)
    - 期望的解向量
"""

import numpy as np
from scipy.sparse import csc_matrix, csr_matrix
from scipy.sparse.linalg import spsolve
import json

def create_test_matrices():
    """創建多個測試用例矩陣"""
    
    test_cases = []
    
    # 測試用例 1: 4x4 非對稱 MNA 風格矩陣
    print("=== 測試用例 1: 4x4 非對稱 MNA 矩陣 ===")
    A1_dense = np.array([
        [ 10.0, -1.0,  0.0,  1.0],
        [ -2.0, 15.0, -3.0,  0.0],
        [  0.0, -4.0, 20.0, -5.0],
        [  2.0,  0.0, -6.0, 12.0]
    ])
    
    b1 = np.array([1.0, 2.0, 3.0, 4.0])
    
    test_cases.append({
        "name": "4x4_asymmetric_mna",
        "A_dense": A1_dense,
        "b": b1
    })
    
    # 測試用例 2: 3x3 對稱矩陣 (電阻網絡)
    print("=== 測試用例 2: 3x3 對稱電阻網絡 ===")
    A2_dense = np.array([
        [ 3.0, -1.0, -1.0],
        [-1.0,  3.0, -1.0],
        [-1.0, -1.0,  3.0]
    ])
    
    b2 = np.array([1.0, 0.0, 1.0])
    
    test_cases.append({
        "name": "3x3_symmetric_resistor",
        "A_dense": A2_dense,
        "b": b2
    })
    
    # 測試用例 3: 5x5 更大的矩陣 (模擬複雜電路)
    print("=== 測試用例 3: 5x5 複雜電路矩陣 ===")
    A3_dense = np.array([
        [ 5.0, -1.0,  0.0, -1.0,  0.0],
        [-1.0,  4.0, -2.0,  0.0, -1.0],
        [ 0.0, -2.0,  6.0, -1.0,  0.0],
        [-1.0,  0.0, -1.0,  4.0, -2.0],
        [ 0.0, -1.0,  0.0, -2.0,  3.0]
    ])
    
    b3 = np.array([1.0, 2.0, 0.0, -1.0, 1.5])
    
    test_cases.append({
        "name": "5x5_complex_circuit",
        "A_dense": A3_dense,
        "b": b3
    })
    
    return test_cases

def solve_and_export_test_case(test_case):
    """求解單個測試用例並導出數據"""
    
    name = test_case["name"]
    A_dense = test_case["A_dense"]
    b = test_case["b"]
    
    print(f"\n--- 處理測試用例: {name} ---")
    
    # 轉換為 CSR 格式
    A_csr = csr_matrix(A_dense)
    
    # 使用 SciPy 求解
    try:
        x_solution = spsolve(A_csr, b)
        print(f"✅ SciPy 求解成功")
    except Exception as e:
        print(f"❌ SciPy 求解失敗: {e}")
        return None
    
    # 驗證解的正確性
    residual = A_dense @ x_solution - b
    residual_norm = np.linalg.norm(residual)
    print(f"📊 殘差範數: {residual_norm:.2e}")
    
    if residual_norm > 1e-10:
        print(f"⚠️ 警告: 殘差較大，可能數值不穩定")
    
    # 準備輸出數據
    result = {
        "name": name,
        "matrix": {
            "rows": A_csr.shape[0],
            "cols": A_csr.shape[1],
            "nnz": A_csr.nnz,
            "csr_values": A_csr.data.tolist(),
            "csr_col_indices": A_csr.indices.tolist(),
            "csr_row_pointers": A_csr.indptr.tolist(),
            "dense_matrix": A_dense.tolist()  # 用於調試
        },
        "rhs_vector": b.tolist(),
        "expected_solution": x_solution.tolist(),
        "residual_norm": residual_norm,
        "condition_number": np.linalg.cond(A_dense)
    }
    
    # 打印詳細數據 (用於手動複製到 TypeScript)
    print(f"\n🔢 CSR 格式數據:")
    print(f"values: {A_csr.data.tolist()}")
    print(f"col_indices: {A_csr.indices.tolist()}")
    print(f"row_pointers: {A_csr.indptr.tolist()}")
    print(f"rows: {A_csr.shape[0]}, cols: {A_csr.shape[1]}")
    
    print(f"\n📊 右側向量 (b): {b.tolist()}")
    print(f"📊 期望解 (x): {x_solution.tolist()}")
    print(f"📊 條件數: {np.linalg.cond(A_dense):.2e}")
    
    return result

def main():
    """主函數"""
    print("🚀 啟動稀疏線性求解器驗證腳本")
    print("=" * 50)
    
    # 創建測試用例
    test_cases = create_test_matrices()
    
    # 存儲所有結果
    all_results = []
    
    # 處理每個測試用例
    for test_case in test_cases:
        result = solve_and_export_test_case(test_case)
        if result:
            all_results.append(result)
    
    # 導出 JSON 文件供 TypeScript 使用
    output_file = "solver_verification_data.json"
    
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(all_results, f, indent=2, ensure_ascii=False)
    
    print(f"\n💾 測試數據已導出到: {output_file}")
    print(f"✅ 總共生成 {len(all_results)} 個測試用例")
    
    # 生成 TypeScript 類型定義
    generate_typescript_types()
    
    print("\n🎯 下一步:")
    print("1. 在 TypeScript 中實現 numeric 庫集成")
    print("2. 創建測試用例使用上述數據")
    print("3. 驗證求解器的正確性")

def generate_typescript_types():
    """生成 TypeScript 類型定義"""
    
    ts_types = '''
/**
 * 求解器驗證測試數據類型定義
 */
export interface SolverTestCase {
  name: string;
  matrix: {
    rows: number;
    cols: number;
    nnz: number;
    csr_values: number[];
    csr_col_indices: number[];
    csr_row_pointers: number[];
    dense_matrix: number[][];
  };
  rhs_vector: number[];
  expected_solution: number[];
  residual_norm: number;
  condition_number: number;
}

export interface SolverVerificationData {
  test_cases: SolverTestCase[];
}
'''
    
    with open("solver_verification_types.ts", 'w', encoding='utf-8') as f:
        f.write(ts_types)
    
    print(f"📝 TypeScript 類型定義已生成: solver_verification_types.ts")

if __name__ == "__main__":
    main()
