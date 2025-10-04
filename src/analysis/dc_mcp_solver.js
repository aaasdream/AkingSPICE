/**
 * DC-MCP 求解器
 * 
 * 專門用於求解包含 MCP (Mixed Complementarity Problem) 元件的直流工作點
 * 
 * 特點：
 * 1. 電感處理為短路 (Veq = 0)
 * 2. 電容處理為開路 (Ieq = 0) 
 * 3. 保持 MOSFET、二極體等 MCP 元件的互補約束
 * 4. 為瞬態分析提供物理上正確的初始條件
 */

import { Matrix, Vector, LUSolver } from '../core/linalg.js';
import { MNA_LCP_Builder } from './transient_mcp.js';
import { createLCPSolver } from '../core/mcp_solver.js';

export class DC_MCP_Solver {
    constructor(options = {}) {
        this.debug = options.debug || false;
        this.maxIterations = options.maxIterations || 100;
        this.tolerance = options.tolerance || 1e-9;
        
        // 創建 MNA-LCP 建構器 (DC 模式)
        this.mnaLcpBuilder = new MNA_LCP_Builder({
            debug: this.debug,
            isDcMode: true  // 標記為 DC 模式
        });
        
        // 創建 LCP 求解器
        this.lcpSolver = createLCPSolver({
            maxIterations: options.maxLcpIterations || 1000,
            tolerance: options.lcpTolerance || 1e-12,
            debug: this.debug
        });
    }

    /**
     * 求解 DC-MCP 問題
     * @param {BaseComponent[]} components 電路元件列表
     * @returns {Object} DC 工作點結果
     */
    async solve(components) {
        if (this.debug) {
            console.log('🔧 開始 DC-MCP 求解...');
        }

        // 預處理元件：標記為 DC 模式
        const dcComponents = this.preprocessComponentsForDC(components);
        
        if (this.debug) {
            console.log(`  處理後元件數: ${dcComponents.length}`);
            const mcpCount = dcComponents.filter(c => c.type.endsWith('_MCP')).length;
            console.log(`  MCP 元件: ${mcpCount}, 線性元件: ${dcComponents.length - mcpCount}`);
        }

        // 建立 MNA-LCP 系統 (DC模式，time=0)
        const systemData = this.mnaLcpBuilder.buildMNA_LCP_System(dcComponents, 0);
        
        if (this.debug) {
            console.log(`  系統維度: ${this.mnaLcpBuilder.finalMatrixSize}`);
            console.log(`  LCP 約束數: ${this.mnaLcpBuilder.lcpConstraintCount}`);
        }

        // 執行舒爾補化簡
        const schurData = this.mnaLcpBuilder.performSchurComplement();
        
        let solution;
        
        if (schurData.isLinear) {
            // 無 MCP 約束，直接線性求解
            if (this.debug) {
                console.log('  ✨ 純線性 DC 系統，直接求解');
            }
            solution = schurData.linearSolution;
        } else {
            // 有 MCP 約束，使用 LCP 求解器
            if (this.debug) {
                console.log('  🔄 求解 LCP 約束...');
            }
            
            const lcpResult = await this.lcpSolver.solve(schurData.M, schurData.q);
            
            if (!lcpResult.success) {
                throw new Error(`DC-MCP 求解失敗: ${lcpResult.error || 'LCP 求解失敗'}`);
            }
            
            // 重建完整解
            solution = this.mnaLcpBuilder.reconstructFullSolution(lcpResult.z, schurData);
        }

        // 提取 DC 工作點
        const dcOperatingPoint = this.extractDCOperatingPoint(dcComponents, solution, this.mnaLcpBuilder);
        
        if (this.debug) {
            console.log('✅ DC-MCP 求解完成');
            this.printDCResults(dcOperatingPoint);
        }

        return dcOperatingPoint;
    }

    /**
     * 預處理元件為 DC 分析模式
     */
    preprocessComponentsForDC(components) {
        const dcComponents = [];

        for (const component of components) {
            if (component.type === 'L') {
                // 電感在 DC 分析中視為短路
                // 創建等效的 0V 電壓源
                const dcInductor = {
                    ...component,
                    isDcEquivalent: true,
                    dcVoltage: 0,  // 短路電壓
                    // 保持電感的電流變量以獲得 DC 電流
                };
                dcComponents.push(dcInductor);
                
            } else if (component.type === 'C') {
                // 電容在 DC 分析中視為開路
                // 不添加到 DC 系統中 (開路 = 無電流路徑)
                if (this.debug) {
                    console.log(`  電容 ${component.name} 在 DC 分析中開路`);
                }
                continue;
                
            } else if (component.type.endsWith('_MCP')) {
                // MCP 元件保持原樣，但標記為 DC 模式
                const dcMcpComponent = {
                    ...component,
                    isDcMode: true
                };
                dcComponents.push(dcMcpComponent);
                
            } else {
                // 其他元件 (電阻、電壓源等) 保持不變
                dcComponents.push(component);
            }
        }

        return dcComponents;
    }

    /**
     * 提取 DC 工作點信息
     */
    extractDCOperatingPoint(components, solution, mnaBuilder) {
        const nodeVoltages = new Map();
        const branchCurrents = new Map();
        const componentStates = new Map();

        // 提取節點電壓
        for (const [nodeName, index] of mnaBuilder.nodeMap.entries()) {
            if (index >= 0 && index < solution.size()) {
                nodeVoltages.set(nodeName, solution.get(index));
            }
        }

        // 提取支路電流
        for (const [branchName, index] of mnaBuilder.voltageSourceMap.entries()) {
            if (index >= 0 && index < solution.size()) {
                branchCurrents.set(branchName, solution.get(index));
            }
        }

        // 提取 MCP 元件狀態
        for (const component of components) {
            if (component.type.endsWith('_MCP')) {
                const state = this.extractMCPComponentDCState(component, solution, mnaBuilder);
                componentStates.set(component.name, state);
            }
        }

        return {
            nodeVoltages,
            branchCurrents,
            componentStates,
            converged: true,
            iterations: 1  // LCP 求解器會報告實際迭代數
        };
    }

    /**
     * 提取 MCP 元件的 DC 狀態
     */
    extractMCPComponentDCState(component, solution, mnaBuilder) {
        const state = {
            name: component.name,
            type: component.type
        };

        if (component.type === 'MOSFET_MCP') {
            // 提取通道和體二極管狀態
            if (component.channelCurrentIndex >= 0) {
                state.channelCurrent = solution.get(component.channelCurrentIndex);
                state.channelState = Math.abs(state.channelCurrent) > 1e-12 ? 'ON' : 'OFF';
            }
            
            if (component.bodyCurrentIndex >= 0) {
                state.bodyCurrent = solution.get(component.bodyCurrentIndex);
                state.bodyDiodeState = Math.abs(state.bodyCurrent) > 1e-12 ? 'ON' : 'OFF';
            }

            // 計算端電壓
            const vDrain = mnaBuilder.nodeMap.has(component.drain) ? 
                solution.get(mnaBuilder.nodeMap.get(component.drain)) : 0;
            const vSource = mnaBuilder.nodeMap.has(component.source) ? 
                solution.get(mnaBuilder.nodeMap.get(component.source)) : 0;
            
            state.vds = vDrain - vSource;
        }

        return state;
    }

    /**
     * 打印 DC 結果 (調試用)
     */
    printDCResults(dcResult) {
        console.log('📊 DC 工作點結果:');
        
        console.log('   節點電壓:');
        for (const [node, voltage] of dcResult.nodeVoltages.entries()) {
            if (node !== 'gnd' && Math.abs(voltage) > 1e-12) {
                console.log(`     ${node}: ${voltage.toFixed(6)}V`);
            }
        }

        console.log('   支路電流:');
        for (const [branch, current] of dcResult.branchCurrents.entries()) {
            if (Math.abs(current) > 1e-12) {
                console.log(`     ${branch}: ${current.toExponential(3)}A`);
            }
        }

        if (dcResult.componentStates.size > 0) {
            console.log('   MCP 元件狀態:');
            for (const [name, state] of dcResult.componentStates.entries()) {
                if (state.type === 'MOSFET_MCP') {
                    console.log(`     ${name}: Ch=${state.channelState}, Body=${state.bodyDiodeState}, Vds=${state.vds?.toFixed(3)}V`);
                }
            }
        }
    }

    /**
     * 設置調試模式
     */
    setDebug(enabled) {
        this.debug = enabled;
        this.mnaLcpBuilder.debug = enabled;
        this.lcpSolver.debug = enabled;
    }
}

/**
 * 創建 DC-MCP 求解器的工廠函數
 */
export function createDC_MCP_Solver(options = {}) {
    return new DC_MCP_Solver(options);
}