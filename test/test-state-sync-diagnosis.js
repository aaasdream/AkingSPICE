// 簡化的GPU問題診斷 - 專注於狀態同步問題
import { ExplicitStateSolver } from '../src/core/explicit-state-solver.js';
import { GPUExplicitStateSolver } from '../src/core/gpu-explicit-solver.js';
import { VoltageSource } from '../src/components/sources.js';
import { Resistor } from '../src/components/resistor.js';
import { Capacitor } from '../src/components/capacitor.js';

console.log('🔧 GPU狀態同步問題診斷');
console.log('檢查GPU狀態變量是否正確同步');
console.log('='.repeat(50));

async function diagnoseStateSynchronization() {
    try {
        // 使用最簡單的RC電路
        const R = 10;  // 10Ω
        const C = 1e-6; // 1μF
        const dt = 1e-8; // 10ns 很小的時間步長
        
        console.log(`📋 簡化RC電路診斷:`);
        console.log(`  R=${R}Ω, C=${formatValue(C, 'F')}`);
        console.log(`  時間步長: ${formatTime(dt)}`);
        
        // 創建簡單RC電路
        const components = [
            new VoltageSource('V1', ['vin', 'gnd'], 5),     // 5V階躍
            new Resistor('R1', ['vin', 'vout'], R),         // 10Ω電阻
            new Capacitor('C1', ['vout', 'gnd'], C, { ic: 0 }) // 1μF電容，初始0V
        ];
        
        console.log('\n🔍 步驟1: 檢查初始化');
        console.log('-'.repeat(30));
        
        // CPU初始化
        console.log('💻 CPU初始化...');
        const cpuSolver = new ExplicitStateSolver();
        const cpuStats = await cpuSolver.initialize(components, dt);
        
        // GPU初始化
        console.log('🚀 GPU初始化...');
        const gpuSolver = new GPUExplicitStateSolver({ debug: true });
        const gpuStats = await gpuSolver.initialize(components, dt);
        
        console.log('\n🔍 步驟2: 比較第一步計算');
        console.log('-'.repeat(30));
        
        // CPU第一步
        console.log('💻 CPU第一步:');
        const cpuStep1 = await cpuSolver.step();
        console.log(`  時間: ${formatTime(cpuStep1.time)}`);
        console.log(`  電容電壓: ${formatValue(cpuStep1.stateVariables.get('C1'), 'V')}`);
        console.log(`  節點電壓 vout: ${formatValue(cpuStep1.nodeVoltages.get('vout'), 'V')}`);
        
        // GPU第一步
        console.log('🚀 GPU第一步:');
        const gpuStep1 = await gpuSolver.step();
        console.log(`  時間: ${formatTime(gpuStep1.time)}`);
        console.log(`  電容電壓: ${formatValue(gpuStep1.stateVariables.get('C1'), 'V')}`);
        
        // 處理GPU返回格式差異 (可能是對象而不是Map)
        const gpuVout = typeof gpuStep1.nodeVoltages.get === 'function' ? 
                        gpuStep1.nodeVoltages.get('vout') : 
                        gpuStep1.nodeVoltages['vout'];
        console.log(`  節點電壓 vout: ${formatValue(gpuVout, 'V')}`);
        
        // 比較誤差
        const vcError = Math.abs((gpuStep1.stateVariables.get('C1') - cpuStep1.stateVariables.get('C1')) / cpuStep1.stateVariables.get('C1') * 100);
        const voutError = Math.abs((gpuVout - cpuStep1.nodeVoltages.get('vout')) / cpuStep1.nodeVoltages.get('vout') * 100);
        
        console.log('\n📊 第一步誤差分析:');
        console.log(`  電容電壓誤差: ${vcError.toFixed(4)}%`);
        console.log(`  節點電壓誤差: ${voutError.toFixed(4)}%`);
        
        if (vcError > 1 || voutError > 1) {
            console.log('  🔴 第一步就有明顯誤差！');
            
            // 深度診斷
            console.log('\n🔬 深度診斷:');
            await deepDiagnosis(cpuSolver, gpuSolver, components, dt);
        } else {
            console.log('  ✅ 第一步精度良好');
            
            // 繼續測試多步
            console.log('\n🔍 步驟3: 多步測試');
            console.log('-'.repeat(30));
            
            for (let step = 2; step <= 5; step++) {
                const cpuResult = await cpuSolver.step();
                const gpuResult = await gpuSolver.step();
                
                const vcErr = Math.abs((gpuResult.stateVariables.get('C1') - cpuResult.stateVariables.get('C1')) / cpuResult.stateVariables.get('C1') * 100);
                
                console.log(`  步驟${step}: 電容電壓誤差=${vcErr.toFixed(4)}%`);
                
                if (vcErr > 5) {
                    console.log(`    🔴 步驟${step}誤差急劇增長！`);
                    break;
                }
            }
        }
        
    } catch (error) {
        console.error('❌ 診斷失敗:', error.message);
        console.error(error.stack);
    }
}

async function deepDiagnosis(cpuSolver, gpuSolver, components, dt) {
    console.log('🔬 執行深度診斷...');
    
    try {
        // 檢查內部狀態
        console.log('📋 內部狀態檢查:');
        
        // CPU內部狀態
        const cpuState = cpuSolver.stateVector;
        console.log(`  CPU stateVector: [${cpuState ? Array.from(cpuState).map(x => x.toExponential(3)).join(', ') : 'undefined'}]`);
        
        // GPU內部狀態  
        const gpuState = gpuSolver.currentStateVector;
        console.log(`  GPU currentStateVector: [${gpuState ? Array.from(gpuState).map(x => x.toExponential(3)).join(', ') : 'undefined'}]`);
        
        // 檢查電路數據是否一致
        console.log('📋 電路數據檢查:');
        const cpuCircuitData = cpuSolver.circuitData;
        const gpuCircuitData = gpuSolver.circuitData;
        
        console.log(`  CPU 節點數: ${cpuCircuitData.nodeCount}, 狀態數: ${cpuCircuitData.stateCount}`);
        console.log(`  GPU 節點數: ${gpuCircuitData.nodeCount}, 狀態數: ${gpuCircuitData.stateCount}`);
        
        if (cpuCircuitData.stateCount > 0 && gpuCircuitData.stateCount > 0) {
            const cpuStateVar = cpuCircuitData.stateVariables[0];
            const gpuStateVar = gpuCircuitData.stateVariables[0];
            
            console.log(`  CPU 第一個狀態變量: type=${cpuStateVar.type}, param=${cpuStateVar.parameter}, nodes=[${cpuStateVar.node1},${cpuStateVar.node2}]`);
            console.log(`  GPU 第一個狀態變量: type=${gpuStateVar.type}, param=${gpuStateVar.parameter}, nodes=[${gpuStateVar.node1},${gpuStateVar.node2}]`);
        }
        
        // 檢查G矩陣是否一致
        console.log('📋 G矩陣檢查:');
        if (cpuSolver.gMatrix && gpuSolver.webgpuSolver) {
            console.log(`  CPU G矩陣大小: ${cpuSolver.gMatrix.rows}x${cpuSolver.gMatrix.cols}`);
            // 檢查幾個關鍵元素
            for (let i = 0; i < Math.min(2, cpuSolver.gMatrix.rows); i++) {
                for (let j = 0; j < Math.min(2, cpuSolver.gMatrix.cols); j++) {
                    console.log(`    G[${i},${j}] = ${cpuSolver.gMatrix.get(i, j).toExponential(3)}`);
                }
            }
        }
        
    } catch (error) {
        console.error('深度診斷失敗:', error.message);
    }
}

// 格式化函數
function formatValue(value, unit) {
    const abs = Math.abs(value);
    if (abs === 0) return `0${unit}`;
    if (abs >= 1) return `${value.toFixed(6)}${unit}`;
    if (abs >= 1e-3) return `${(value*1e3).toFixed(3)}m${unit}`;
    if (abs >= 1e-6) return `${(value*1e6).toFixed(3)}μ${unit}`;
    if (abs >= 1e-9) return `${(value*1e9).toFixed(3)}n${unit}`;
    return `${value.toExponential(3)}${unit}`;
}

function formatTime(time) {
    if (time >= 1) return `${time.toFixed(6)}s`;
    if (time >= 1e-3) return `${(time*1e3).toFixed(3)}ms`;
    if (time >= 1e-6) return `${(time*1e6).toFixed(3)}μs`;
    if (time >= 1e-9) return `${(time*1e9).toFixed(3)}ns`;
    return `${time.toExponential(3)}s`;
}

// 執行診斷
diagnoseStateSynchronization();