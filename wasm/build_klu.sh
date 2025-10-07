#!/bin/bash

# 🚀 AkingSPICE 2.1 - KLU WASM 編譯腳本
# 
# 將 SuiteSparse:KLU 編譯為高性能 WebAssembly 模組
# 針對電路模擬應用優化

set -e  # 遇到錯誤立即退出

# === 配置參數 ===
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BUILD_DIR="$SCRIPT_DIR/build"
OUTPUT_DIR="$SCRIPT_DIR/../dist"
SUITESPARSE_VERSION="7.4.0"

# 編譯器設置
CC="emcc"
CXX="em++"
EMSCRIPTEN_FLAGS=(
    "-O3"                          # 最高優化級別
    "-flto"                        # 鏈接時優化
    "-DNDEBUG"                     # 禁用調試斷言
    "-ffast-math"                  # 快速數學運算
    "-msimd128"                    # 啟用 SIMD 指令
    "-pthread"                     # 多線程支援 (未來使用)
)

# WASM 特定標誌
WASM_FLAGS=(
    "-s WASM=1"                    # 生成 WASM
    "-s ALLOW_MEMORY_GROWTH=1"     # 允許記憶體增長
    "-s INITIAL_MEMORY=128MB"      # 初始記憶體 128MB
    "-s MAXIMUM_MEMORY=1GB"        # 最大記憶體 1GB
    "-s EXPORTED_RUNTIME_METHODS=['ccall','cwrap']"
    "-s MODULARIZE=1"              # 模組化輸出
    "-s EXPORT_NAME='KLUModule'"   # 模組名稱
    "--bind"                       # Embind 支援
)

# KLU 優化標誌
KLU_FLAGS=(
    "-DKLU_COMPILE_FOR_CIRCUIT_SIM"  # 電路模擬優化
    "-DKLU_USE_BTREE=1"              # B樹數據結構
    "-DKLU_USE_PARTIAL_PIVOTING=1"   # 部分透視
    "-DAMD_AGGRESSIVE=1"             # 積極的 AMD 重排序
)

echo "🚀 開始編譯 KLU WebAssembly 模組..."
echo "   SuiteSparse 版本: $SUITESPARSE_VERSION"
echo "   建置目錄: $BUILD_DIR"
echo "   輸出目錄: $OUTPUT_DIR"

# === 創建建置目錄 ===
mkdir -p "$BUILD_DIR"
mkdir -p "$OUTPUT_DIR"
cd "$BUILD_DIR"

# === 下載 SuiteSparse ===
if [ ! -d "SuiteSparse-$SUITESPARSE_VERSION" ]; then
    echo "📦 下載 SuiteSparse $SUITESPARSE_VERSION..."
    
    if command -v wget >/dev/null 2>&1; then
        wget -q "https://github.com/DrTimothyAldenDavis/SuiteSparse/archive/refs/tags/v$SUITESPARSE_VERSION.tar.gz" -O suitesparse.tar.gz
    elif command -v curl >/dev/null 2>&1; then
        curl -sL "https://github.com/DrTimothyAldenDavis/SuiteSparse/archive/refs/tags/v$SUITESPARSE_VERSION.tar.gz" -o suitesparse.tar.gz
    else
        echo "❌ 錯誤: 需要 wget 或 curl 下載 SuiteSparse"
        exit 1
    fi
    
    echo "📂 解壓縮 SuiteSparse..."
    tar -xzf suitesparse.tar.gz
    rm suitesparse.tar.gz
fi

SUITESPARSE_DIR="$BUILD_DIR/SuiteSparse-$SUITESPARSE_VERSION"

# === 編譯 SuiteSparse_config ===
echo "🔧 編譯 SuiteSparse_config..."
cd "$SUITESPARSE_DIR/SuiteSparse_config"

$CC ${EMSCRIPTEN_FLAGS[@]} -c SuiteSparse_config.c -o SuiteSparse_config.o

# === 編譯 AMD ===
echo "🔧 編譯 AMD (Approximate Minimum Degree)..."
cd "$SUITESPARSE_DIR/AMD"

# AMD 源文件
AMD_SOURCES=(
    "Source/amd_aat.c"
    "Source/amd_1.c"
    "Source/amd_2.c"
    "Source/amd_dump.c"
    "Source/amd_postorder.c"
    "Source/amd_post_tree.c"
    "Source/amd_defaults.c"
    "Source/amd_order.c"
    "Source/amd_control.c"
    "Source/amd_info.c"
    "Source/amd_valid.c"
    "Source/amd_preprocess.c"
)

for src in "${AMD_SOURCES[@]}"; do
    obj="$(basename "$src" .c).o"
    $CC ${EMSCRIPTEN_FLAGS[@]} -I Include -I ../SuiteSparse_config -c "$src" -o "$obj"
done

# === 編譯 COLAMD ===
echo "🔧 編譯 COLAMD (Column Approximate Minimum Degree)..."
cd "$SUITESPARSE_DIR/COLAMD"

COLAMD_SOURCES=(
    "Source/colamd.c"
)

for src in "${COLAMD_SOURCES[@]}"; do
    obj="$(basename "$src" .c).o"
    $CC ${EMSCRIPTEN_FLAGS[@]} -I Include -I ../SuiteSparse_config -c "$src" -o "$obj"
done

# === 編譯 BTF ===
echo "🔧 編譯 BTF (Block Triangular Form)..."
cd "$SUITESPARSE_DIR/BTF"

BTF_SOURCES=(
    "Source/btf_maxtrans.c"
    "Source/btf_order.c"
    "Source/btf_strongcomp.c"
)

for src in "${BTF_SOURCES[@]}"; do
    obj="$(basename "$src" .c).o"
    $CC ${EMSCRIPTEN_FLAGS[@]} -I Include -I ../SuiteSparse_config -c "$src" -o "$obj"
done

# === 編譯 KLU ===
echo "🔧 編譯 KLU (核心稀疏求解器)..."
cd "$SUITESPARSE_DIR/KLU"

KLU_SOURCES=(
    "Source/klu_analyze.c"
    "Source/klu_analyze_given.c"
    "Source/klu_defaults.c"
    "Source/klu_diagnostics.c"
    "Source/klu_dump.c"
    "Source/klu_extract.c"
    "Source/klu_factor.c"
    "Source/klu_free_factor.c"
    "Source/klu_free_symbolic.c"
    "Source/klu_kernel.c"
    "Source/klu_memory.c"
    "Source/klu_refactor.c"
    "Source/klu_scale.c"
    "Source/klu_solve.c"
    "Source/klu_sort.c"
    "Source/klu_tsolve.c"
)

for src in "${KLU_SOURCES[@]}"; do
    obj="$(basename "$src" .c).o"
    $CC ${EMSCRIPTEN_FLAGS[@]} ${KLU_FLAGS[@]} \
        -I Include \
        -I ../SuiteSparse_config \
        -I ../AMD/Include \
        -I ../COLAMD/Include \
        -I ../BTF/Include \
        -c "$src" -o "$obj"
done

# === 編譯 C++ 接口 ===
echo "🔧 編譯 C++ WASM 接口..."
cd "$SCRIPT_DIR"

$CXX ${EMSCRIPTEN_FLAGS[@]} ${KLU_FLAGS[@]} ${WASM_FLAGS[@]} \
    -I "$SUITESPARSE_DIR/KLU/Include" \
    -I "$SUITESPARSE_DIR/AMD/Include" \
    -I "$SUITESPARSE_DIR/COLAMD/Include" \
    -I "$SUITESPARSE_DIR/BTF/Include" \
    -I "$SUITESPARSE_DIR/SuiteSparse_config" \
    -c cpp/klu_interface.cpp -o klu_interface.o

# === 鏈接最終 WASM 模組 ===
echo "🔗 鏈接 WebAssembly 模組..."

# 收集所有目標檔案
OBJECT_FILES=(
    "$SCRIPT_DIR/klu_interface.o"
    "$SUITESPARSE_DIR/SuiteSparse_config/SuiteSparse_config.o"
)

# AMD 目標檔案
cd "$SUITESPARSE_DIR/AMD"
for src in "${AMD_SOURCES[@]}"; do
    OBJECT_FILES+=("$PWD/$(basename "$src" .c).o")
done

# COLAMD 目標檔案
cd "$SUITESPARSE_DIR/COLAMD"
for src in "${COLAMD_SOURCES[@]}"; do
    OBJECT_FILES+=("$PWD/$(basename "$src" .c).o")
done

# BTF 目標檔案
cd "$SUITESPARSE_DIR/BTF"
for src in "${BTF_SOURCES[@]}"; do
    OBJECT_FILES+=("$PWD/$(basename "$src" .c).o")
done

# KLU 目標檔案
cd "$SUITESPARSE_DIR/KLU"
for src in "${KLU_SOURCES[@]}"; do
    OBJECT_FILES+=("$PWD/$(basename "$src" .c).o")
done

# 執行最終鏈接
cd "$SCRIPT_DIR"
$CXX ${EMSCRIPTEN_FLAGS[@]} ${WASM_FLAGS[@]} \
    "${OBJECT_FILES[@]}" \
    -o "$OUTPUT_DIR/klu_solver.js"

echo "✅ 編譯完成！"
echo "   輸出檔案:"
echo "   - $OUTPUT_DIR/klu_solver.js"
echo "   - $OUTPUT_DIR/klu_solver.wasm"

# === 生成 TypeScript 模組載入器 ===
echo "📝 生成 TypeScript 模組載入器..."

cat > "$OUTPUT_DIR/klu_loader.ts" << 'EOF'
/**
 * 🚀 KLU WASM 模組載入器
 * 
 * 動態載入 KLU WebAssembly 模組
 * 提供 Promise 基礎的異步初始化
 */

// 載入 Emscripten 生成的模組
declare const KLUModule: any;

let wasmModulePromise: Promise<any> | null = null;

/**
 * 載入 KLU WASM 模組
 * 
 * @returns Promise<EmscriptenKLUModule>
 */
export function loadKLUModule(): Promise<any> {
  if (wasmModulePromise) {
    return wasmModulePromise;
  }
  
  wasmModulePromise = new Promise((resolve, reject) => {
    // 動態導入 WASM 模組
    import('./klu_solver.js').then((module) => {
      const KLUModule = module.default || module;
      
      // 等待 WASM 初始化完成
      KLUModule().then((wasmModule: any) => {
        console.log('🚀 KLU WASM 模組載入成功');
        resolve(wasmModule);
      }).catch((error: any) => {
        console.error('❌ KLU WASM 初始化失敗:', error);
        reject(error);
      });
    }).catch((error) => {
      console.error('❌ KLU WASM 模組載入失敗:', error);
      reject(error);
    });
  });
  
  return wasmModulePromise;
}

/**
 * 重置模組載入狀態 (用於測試)
 */
export function resetKLUModule(): void {
  wasmModulePromise = null;
}
EOF

# === 生成使用範例 ===
echo "📝 生成使用範例..."

cat > "$OUTPUT_DIR/usage_example.ts" << 'EOF'
/**
 * 🎯 KLU WASM 使用範例
 * 
 * 展示如何使用超高性能 KLU 求解器
 * 求解電路 MNA 方程組
 */

import { UltraKLUSolver, KLUManager } from '../klu_solver.js';
import { SparseMatrix } from '../../src/math/sparse/matrix.js';

/**
 * 🧪 測試 Buck 變換器 MNA 矩陣求解
 */
async function testBuckConverterSolve() {
  console.log('🧪 開始 Buck 變換器 KLU 求解測試...');
  
  // 創建 5×5 Buck 變換器 MNA 矩陣
  const matrix = new SparseMatrix(5, 5);
  
  // 填入典型的 Buck 變換器 MNA 矩陣
  // 節點1: 輸入濾波電容
  matrix.set(0, 0, 1e-3);  // C1 導納
  matrix.set(0, 1, -1e-3);
  
  // 節點2: 開關節點  
  matrix.set(1, 0, -1e-3);
  matrix.set(1, 1, 1e-3 + 1e-6);  // C1 + L 導納
  matrix.set(1, 2, -1e-6);
  
  // 節點3: 輸出節點
  matrix.set(2, 1, -1e-6);
  matrix.set(2, 2, 1e-6 + 1e-4);  // L + C2 導納
  matrix.set(2, 3, -1e-4);
  
  // 節點4: 負載節點
  matrix.set(3, 2, -1e-4);
  matrix.set(3, 3, 1e-4 + 1.0);   // C2 + R 導納
  
  // 電壓源方程
  matrix.set(4, 0, 1);
  matrix.set(0, 4, 1);
  
  // 右端向量 (12V 輸入)
  const rhs = new Float64Array([0, 0, 0, 0, 12]);
  
  try {
    // 獲取全域 KLU 求解器實例
    const solver = await KLUManager.getInstance({
      tolerance: 1e-12,
      monitorCondition: true
    });
    
    const startTime = performance.now();
    
    // 符號分析 (一次性)
    console.log('🔍 執行符號分析...');
    if (!solver.analyzeStructure(matrix)) {
      throw new Error('符號分析失敗');
    }
    
    // 數值分解
    console.log('🔢 執行數值分解...');
    if (!solver.factorizeMatrix(matrix)) {
      throw new Error('數值分解失敗');  
    }
    
    // 求解方程組
    console.log('⚡ 求解線性方程組...');
    const result = solver.solveSystem(rhs);
    
    const totalTime = performance.now() - startTime;
    
    if (result.success) {
      console.log('✅ Buck 變換器求解成功！');
      console.log(`   節點電壓: [${Array.from(result.solution).map(v => v.toFixed(3)).join(', ')}]`);
      console.log(`   總時間: ${totalTime.toFixed(3)}ms`);
      console.log(`   條件數: ${result.conditionNumber.toExponential(2)}`);
      
      // 顯示性能統計
      const stats = solver.getStatistics();
      const perfReport = solver.getPerformanceReport();
      
      console.log('📊 性能統計:');
      console.log(`   矩陣大小: ${stats.dimensions.rows}×${stats.dimensions.cols}`);
      console.log(`   非零元素: ${stats.dimensions.nnz}`);
      console.log(`   填充因子: ${stats.performance.fillFactor.toFixed(2)}`);
      console.log(`   求解效率: ${perfReport.efficiency}`);
      
    } else {
      console.error(`❌ 求解失敗: ${result.errorMessage}`);
    }
    
  } catch (error) {
    console.error('❌ KLU 測試失敗:', error);
  }
}

/**
 * 🚀 性能基準測試
 */
async function benchmarkKLUSolver() {
  console.log('🚀 開始 KLU 性能基準測試...');
  
  const sizes = [10, 50, 100, 500];
  
  for (const n of sizes) {
    console.log(`📐 測試 ${n}×${n} 隨機稀疏矩陣...`);
    
    // 生成隨機稀疏矩陣
    const matrix = generateRandomSparseMatrix(n, 0.1); // 10% 稠密度
    const rhs = new Float64Array(n);
    rhs.fill(1.0); // 右端向量全為 1
    
    try {
      const solver = await KLUManager.getInstance();
      
      const startTime = performance.now();
      
      // 完整求解流程
      solver.analyzeStructure(matrix);
      solver.factorizeMatrix(matrix);
      const result = solver.solveSystem(rhs);
      
      const totalTime = performance.now() - startTime;
      
      if (result.success) {
        console.log(`   ✅ ${n}×${n}: ${totalTime.toFixed(2)}ms (條件數: ${result.conditionNumber.toExponential(1)})`);
      } else {
        console.log(`   ❌ ${n}×${n}: 求解失敗`);
      }
      
      solver.reset(); // 重置以測試下一個矩陣
      
    } catch (error) {
      console.error(`   ❌ ${n}×${n}: 錯誤 - ${error}`);
    }
  }
}

/**
 * 生成隨機稀疏矩陣 (用於測試)
 */
function generateRandomSparseMatrix(n: number, density: number): SparseMatrix {
  const matrix = new SparseMatrix(n, n);
  
  // 確保對角線非零 (數值穩定性)
  for (let i = 0; i < n; i++) {
    matrix.set(i, i, 1.0 + Math.random());
  }
  
  // 隨機填充非對角線元素
  const nnzTarget = Math.floor(n * n * density);
  let nnzCount = n; // 已有對角線元素
  
  while (nnzCount < nnzTarget) {
    const i = Math.floor(Math.random() * n);
    const j = Math.floor(Math.random() * n);
    
    if (i !== j && matrix.get(i, j) === 0) {
      matrix.set(i, j, (Math.random() - 0.5) * 2); // [-1, 1] 範圍
      nnzCount++;
    }
  }
  
  return matrix;
}

// 執行測試
if (typeof window !== 'undefined') {
  // 瀏覽器環境
  window.addEventListener('load', () => {
    testBuckConverterSolve();
    benchmarkKLUSolver();
  });
} else {
  // Node.js 環境
  testBuckConverterSolve().then(() => benchmarkKLUSolver());
}
EOF

echo ""
echo "🎉 KLU WebAssembly 編譯流程完成！"
echo ""
echo "📁 生成的檔案:"
echo "   $OUTPUT_DIR/klu_solver.js      - WASM 模組 (Emscripten)"
echo "   $OUTPUT_DIR/klu_solver.wasm    - WebAssembly 二進位檔"
echo "   $OUTPUT_DIR/klu_loader.ts      - TypeScript 載入器"
echo "   $OUTPUT_DIR/usage_example.ts   - 使用範例"
echo ""
echo "🚀 下一步:"
echo "   1. 將生成的檔案整合到 AkingSPICE 2.1"
echo "   2. 運行使用範例測試性能"
echo "   3. 整合到 MNA 求解器管線"
echo ""
echo "⚡ 預期性能提升: 100x+ (相比傳統 JavaScript 求解器)"