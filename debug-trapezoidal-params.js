/**
 * =================================================================
 *         調試梯形積分法實現 - 檢查參數傳遞
 * =================================================================
 */

import {
    AkingSPICE,
    VoltageSource,
    Resistor,
    Inductor,
    Capacitor
} from './src/index.js';

async function debugTrapezoidalImplementation() {
    console.log("=== 調試梯形積分法實現 ===");
    
    const timeStep = 1e-6; // 1μs
    const L_value = 25e-6;
    const C_value = 207e-9;
    
    // 創建組件並測試初始化
    const inductor = new Inductor('L1', ['in', 'out'], L_value);
    const capacitor = new Capacitor('C1', ['in', 'out'], C_value);
    
    console.log("\n--- 後向歐拉法初始化 ---");
    inductor.initTransient(timeStep, 'backward_euler');
    capacitor.initTransient(timeStep, 'backward_euler');
    
    console.log(`電感積分方法: ${inductor.integrationMethod}`);
    console.log(`電感等效電阻: ${inductor.equivalentResistance.toFixed(1)}Ω`);
    console.log(`電容積分方法: ${capacitor.integrationMethod}`);
    console.log(`電容等效電導: ${(capacitor.equivalentConductance*1e6).toFixed(0)}mS`);
    
    console.log("\n--- 梯形法初始化 ---");
    inductor.initTransient(timeStep, 'trapezoidal');
    capacitor.initTransient(timeStep, 'trapezoidal');
    
    console.log(`電感積分方法: ${inductor.integrationMethod}`);
    console.log(`電感等效電阻: ${inductor.equivalentResistance.toFixed(1)}Ω`);
    console.log(`電容積分方法: ${capacitor.integrationMethod}`);
    console.log(`電容等效電導: ${(capacitor.equivalentConductance*1e6).toFixed(0)}mS`);
    
    // 測試伴隨模型更新
    console.log("\n--- 伴隨模型測試 ---");
    
    // 設置一些歷史值
    inductor.previousValues.set('current', 1.0);
    inductor.previousValues.set('voltage', 10.0);
    inductor.updateCompanionModel();
    
    capacitor.previousValues.set('voltage', 5.0);
    capacitor.previousValues.set('current', 0.5);
    capacitor.updateCompanionModel();
    
    console.log(`電感歷史電壓源 (梯形法): ${inductor.historyVoltageSource.toFixed(3)}V`);
    console.log(`電容歷史電流源 (梯形法): ${capacitor.historyCurrentSource.toFixed(6)}A`);
    
    // 與後向歐拉法對比
    inductor.initTransient(timeStep, 'backward_euler');
    capacitor.initTransient(timeStep, 'backward_euler');
    
    inductor.previousValues.set('current', 1.0);
    inductor.previousValues.set('voltage', 10.0);
    inductor.updateCompanionModel();
    
    capacitor.previousValues.set('voltage', 5.0);
    capacitor.previousValues.set('current', 0.5);
    capacitor.updateCompanionModel();
    
    console.log(`電感歷史電壓源 (後向歐拉): ${inductor.historyVoltageSource.toFixed(3)}V`);
    console.log(`電容歷史電流源 (後向歐拉): ${capacitor.historyCurrentSource.toFixed(6)}A`);
    
    return { inductor, capacitor };
}

/**
 * 檢查MNA矩陣是否正確使用了梯形法參數
 */
async function checkMNAMatrix() {
    console.log("\n=== 檢查MNA矩陣構建 ===");
    
    const solver = new AkingSPICE();
    const timeStep = 1e-6;
    
    // 創建簡單RC電路
    const voltage = new VoltageSource('V1', ['in', '0'], 'DC(10)');
    const resistor = new Resistor('R1', ['in', 'rc_node'], 10.0);
    const capacitor = new Capacitor('C1', ['rc_node', '0'], 207e-9);
    
    // 手動設置梯形法
    voltage.initTransient(timeStep, 'trapezoidal');
    resistor.initTransient(timeStep, 'trapezoidal');
    capacitor.initTransient(timeStep, 'trapezoidal');
    
    console.log(`電容等效電導 (梯形法): ${(capacitor.equivalentConductance*1e6).toFixed(0)}mS`);
    
    solver.components = [voltage, resistor, capacitor];
    solver.isInitialized = true;
    
    try {
        // 手動調用MNA建構來檢查矩陣
        const mnaBuilder = solver.transientAnalysis.mnaBuilder;
        mnaBuilder.analyzeCircuit(solver.components);
        
        const { matrix, rhs } = mnaBuilder.buildMNAMatrix(solver.components, 0);
        
        console.log("MNA矩陣大小:", matrix.rows, "x", matrix.cols);
        console.log("MNA矩陣內容:");
        for (let i = 0; i < matrix.rows; i++) {
            const row = [];
            for (let j = 0; j < matrix.cols; j++) {
                row.push(matrix.get(i, j).toFixed(6));
            }
            console.log(`  [${i}]: [${row.join(', ')}]`);
        }
        
        console.log("右手邊向量:");
        for (let i = 0; i < rhs.length; i++) {
            console.log(`  b[${i}]: ${rhs.get(i).toFixed(6)}`);
        }
        
    } catch (error) {
        console.log("MNA矩陣建構失敗:", error.message);
    }
}

async function main() {
    await debugTrapezoidalImplementation();
    await checkMNAMatrix();
}

main();