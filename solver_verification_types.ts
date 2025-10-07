
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
