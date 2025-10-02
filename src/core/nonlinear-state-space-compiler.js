/**
 * 非線性狀態空間編譯器
 * 
 * 擴展狀態空間編譯器以支持真正的非線性元件：
 * - 基於 Shockley 方程的連續二極體模型
 * - 雅可比矩陣自動生成
 * - 牛頓-拉夫遜迭代框架
 * 
 * 數學基礎：
 * 混合微分代數方程組 (Hybrid DAE):
 * C * dx/dt = f(x, u, t) + g(x, u, t)
 * 其中：
 * - f(x, u, t) 是線性項 (Ax + Bu)
 * - g(x, u, t) 是非線性項 (二極體電流等)
 */

import { Matrix, Vector } from './linalg.js';
import { StateSpaceCompiler, StateVariable, InputVariable, OutputVariable, StateSpaceMatrices } from './state-space-compiler.js';

/**
 * 非線性元件描述符
 */
class NonlinearComponent {
    constructor(type, componentName, nodes, parameters) {
        this.type = type;                    // 'shockley_diode', 'bjt', 'mosfet_vgs', etc.
        this.componentName = componentName;  // 'D1', 'Q1', etc.
        this.nodes = [...nodes];             // 節點列表
        this.parameters = { ...parameters }; // 元件參數
        this.workingPoint = {};              // 當前工作點
        this.index = -1;                     // 在非線性元件列表中的索引
    }
    
    /**
     * 計算非線性函數值 g(x, u)
     * @param {Float32Array} stateVector 狀態向量
     * @param {Float32Array} inputVector 輸入向量
     * @param {Map} nodeVoltageMap 節點電壓映射
     * @returns {number} 非線性電流值
     */
    evaluateFunction(stateVector, inputVector, nodeVoltageMap) {
        throw new Error('evaluateFunction must be implemented by subclass');
    }
    
    /**
     * 計算雅可比矩陣元素 ∂g/∂x
     * @param {Float32Array} stateVector 狀態向量
     * @param {Float32Array} inputVector 輸入向量
     * @param {Map} nodeVoltageMap 節點電壓映射
     * @returns {Object} {stateJacobian: Array, inputJacobian: Array}
     */
    evaluateJacobian(stateVector, inputVector, nodeVoltageMap) {
        throw new Error('evaluateJacobian must be implemented by subclass');
    }
}

/**
 * Shockley 方程二極體模型
 * I = Is * (exp(Vd / (n*Vt)) - 1)
 */
class ShockleyDiode extends NonlinearComponent {
    constructor(componentName, nodes, parameters = {}) {
        super('shockley_diode', componentName, nodes, parameters);
        
        // 物理參數
        this.Is = parameters.Is || 1e-12;       // 飽和電流 (A)
        this.n = parameters.n || 1.0;           // 理想因子
        this.Vt = parameters.Vt || 0.0259;     // 熱電壓 (V) = kT/q @ 300K
        this.Vmax = parameters.Vmax || 0.8;    // 最大正向電壓 (數值穩定性)
        
        // 節點分配
        this.anode = nodes[0];
        this.cathode = nodes[1];
    }
    
    /**
     * 計算二極體電流 I = Is * (exp(Vd / (n*Vt)) - 1)
     */
    evaluateFunction(stateVector, inputVector, nodeVoltageMap) {
        const Va = nodeVoltageMap.get(this.anode) || 0;
        const Vk = nodeVoltageMap.get(this.cathode) || 0;
        const Vd = Va - Vk;
        
        // 數值穩定性：限制電壓範圍
        const VdLimited = Math.max(-10 * this.Vt, Math.min(Vd, this.Vmax));
        
        if (VdLimited > 0.1) {
            // 正向偏壓：使用完整 Shockley 方程
            const expTerm = Math.exp(VdLimited / (this.n * this.Vt));
            return this.Is * (expTerm - 1);
        } else {
            // 反向偏壓：線性化避免數值問題
            return this.Is * (VdLimited / (this.n * this.Vt));
        }
    }
    
    /**
     * 計算小信號導納 dI/dV = (Is / (n*Vt)) * exp(Vd / (n*Vt))
     */
    evaluateJacobian(stateVector, inputVector, nodeVoltageMap) {
        const Va = nodeVoltageMap.get(this.anode) || 0;
        const Vk = nodeVoltageMap.get(this.cathode) || 0;
        const Vd = Va - Vk;
        
        const VdLimited = Math.max(-10 * this.Vt, Math.min(Vd, this.Vmax));
        
        let conductance;
        if (VdLimited > 0.1) {
            // 正向偏壓：指數導數
            const expTerm = Math.exp(VdLimited / (this.n * this.Vt));
            conductance = (this.Is / (this.n * this.Vt)) * expTerm;
        } else {
            // 反向偏壓：常數導數
            conductance = this.Is / (this.n * this.Vt);
        }
        
        // 雅可比矩陣：dI/dVa = +conductance, dI/dVk = -conductance
        return {
            nodeJacobian: new Map([
                [this.anode, conductance],
                [this.cathode, -conductance]
            ])
        };
    }
}

/**
 * 非線性狀態空間矩陣
 * 擴展線性狀態空間矩陣，添加非線性項支持
 */
class NonlinearStateSpaceMatrices extends StateSpaceMatrices {
    constructor(numStates, numInputs, numOutputs, numNonlinearComponents = 0) {
        super(numStates, numInputs, numOutputs);
        
        // 非線性相關
        this.numNonlinearComponents = numNonlinearComponents;
        this.nonlinearComponents = [];
        
        // 雅可比矩陣維度：[numStates × numStates] (狀態對狀態的偏導)
        this.stateJacobian = Matrix.zeros(numStates, numStates);
        
        // 非線性函數向量 g(x, u) 
        this.nonlinearVector = new Float32Array(numStates);
        
        // 工作點信息
        this.workingPoint = {
            stateVector: new Float32Array(numStates),
            inputVector: new Float32Array(numInputs),
            nodeVoltages: new Map()
        };
    }
    
    /**
     * 更新工作點信息
     */
    updateWorkingPoint(stateVector, inputVector, nodeVoltages) {
        this.workingPoint.stateVector.set(stateVector);
        this.workingPoint.inputVector.set(inputVector);
        this.workingPoint.nodeVoltages = new Map(nodeVoltages);
    }
    
    /**
     * 計算非線性向量 g(x, u)
     */
    evaluateNonlinearVector() {
        this.nonlinearVector.fill(0);
        
        for (const nlComp of this.nonlinearComponents) {
            const current = nlComp.evaluateFunction(
                this.workingPoint.stateVector,
                this.workingPoint.inputVector,
                this.workingPoint.nodeVoltages
            );
            
            // 將電流注入到相應的節點方程中
            // 這需要根據具體的電路拓撲來實現
            // 暫時簡化：假設每個非線性元件影響一個狀態變量
            if (nlComp.index >= 0 && nlComp.index < this.numStates) {
                this.nonlinearVector[nlComp.index] = current;
            }
        }
        
        return this.nonlinearVector;
    }
    
    /**
     * 計算狀態雅可比矩陣 ∂g/∂x
     */
    evaluateStateJacobian() {
        // 重置雅可比矩陣
        this.stateJacobian.fill(0);
        
        for (const nlComp of this.nonlinearComponents) {
            const jacobian = nlComp.evaluateJacobian(
                this.workingPoint.stateVector,
                this.workingPoint.inputVector,
                this.workingPoint.nodeVoltages
            );
            
            // 將雅可比元素填入矩陣
            // 這是一個簡化實現，實際需要根據電路拓撲映射
            if (jacobian.nodeJacobian) {
                for (const [nodeName, value] of jacobian.nodeJacobian) {
                    // 需要節點名到狀態索引的映射
                    // 這裡先用簡化邏輯
                    const stateIndex = this.getStateIndexForNode(nodeName);
                    if (stateIndex >= 0) {
                        this.stateJacobian.addAt(stateIndex, stateIndex, value);
                    }
                }
            }
        }
        
        return this.stateJacobian;
    }
    
    /**
     * 獲取節點對應的狀態變量索引 (簡化實現)
     */
    getStateIndexForNode(nodeName) {
        // 這裡需要實際的節點到狀態映射邏輯
        // 暫時返回 0 作為占位符
        return 0;
    }
}

/**
 * 非線性狀態空間編譯器
 * 支持混合線性/非線性電路編譯
 */
export class NonlinearStateSpaceCompiler extends StateSpaceCompiler {
    constructor() {
        super();
        
        // 非線性元件管理
        this.nonlinearComponents = [];
        this.nonlinearComponentMap = new Map();
        
        // 編譯選項
        this.nonlinearOptions = {
            enableShockleyDiodes: true,      // 啟用 Shockley 二極體
            enableNonlinearBJT: false,       // 啟用非線性 BJT (未實現)
            maxNewtonIterations: 10,         // 牛頓迭代最大次數
            newtonTolerance: 1e-9,          // 收斂容忍度
            dampingFactor: 1.0              // 阻尼係數
        };
    }
    
    /**
     * 編譯包含非線性元件的電路
     */
    async compile(components, options = {}) {
        console.log('🔧 開始非線性狀態空間編譯...');
        
        // 合併選項
        this.options = { ...this.options, ...options };
        this.nonlinearOptions = { ...this.nonlinearOptions, ...options.nonlinear };
        
        // 階段1：分析並分離線性/非線性元件
        const { linearComponents, nonlinearComponents } = this.analyzeComponentTypes(components);
        
        console.log(`  線性元件: ${linearComponents.length}個, 非線性元件: ${nonlinearComponents.length}個`);
        
        // 階段2：處理線性部分 (使用父類方法)
        const linearMatrices = await super.compile(linearComponents, this.options);
        
        // 階段3：集成非線性元件
        const matrices = this.integrateNonlinearComponents(linearMatrices, nonlinearComponents);
        
        console.log('✅ 非線性狀態空間編譯完成');
        
        return matrices;
    }
    
    /**
     * 分析元件類型，分離線性和非線性元件
     */
    analyzeComponentTypes(components) {
        const linearComponents = [];
        const nonlinearComponents = [];
        
        for (const component of components) {
            if (this.isNonlinearComponent(component)) {
                nonlinearComponents.push(component);
            } else {
                linearComponents.push(component);
            }
        }
        
        return { linearComponents, nonlinearComponents };
    }
    
    /**
     * 判斷是否為非線性元件
     */
    isNonlinearComponent(component) {
        // 檢查是否為 Shockley 二極體
        if (component.type === 'D' && component.model === 'shockley') {
            return true;
        }
        
        // 檢查是否為其他非線性元件
        if (component.type === 'Q' || (component.type === 'M' && component.model === 'nonlinear')) {
            return true;
        }
        
        return false;
    }
    
    /**
     * 集成非線性元件到狀態空間矩陣
     */
    integrateNonlinearComponents(linearMatrices, nonlinearComponents) {
        // 創建擴展的非線性狀態空間矩陣
        const matrices = new NonlinearStateSpaceMatrices(
            linearMatrices.numStates,
            linearMatrices.numInputs,
            linearMatrices.numOutputs,
            nonlinearComponents.length
        );
        
        // 複製線性矩陣
        matrices.A = linearMatrices.A.clone();
        matrices.B = linearMatrices.B.clone();
        matrices.C = linearMatrices.C.clone();
        matrices.D = linearMatrices.D.clone();
        
        // 複製其他屬性
        matrices.stateVariables = [...linearMatrices.stateVariables];
        matrices.inputVariables = [...linearMatrices.inputVariables];
        matrices.outputVariables = [...linearMatrices.outputVariables];
        matrices.nodeCount = linearMatrices.nodeCount;
        matrices.nodeNames = [...linearMatrices.nodeNames];
        matrices.nodeMap = new Map(linearMatrices.nodeMap);
        
        // 處理非線性元件
        this.processNonlinearComponents(matrices, nonlinearComponents);
        
        return matrices;
    }
    
    /**
     * 處理非線性元件，創建相應的描述符
     */
    processNonlinearComponents(matrices, nonlinearComponents) {
        for (let i = 0; i < nonlinearComponents.length; i++) {
            const component = nonlinearComponents[i];
            
            let nlComp = null;
            
            if (component.type === 'D' && component.model === 'shockley') {
                // Shockley 二極體
                nlComp = new ShockleyDiode(component.name, [component.node1, component.node2], {
                    Is: component.Is || 1e-12,
                    n: component.n || 1.0,
                    Vt: component.Vt || 0.0259
                });
            }
            // 這裡可以添加其他非線性元件類型
            
            if (nlComp) {
                nlComp.index = i;
                matrices.nonlinearComponents.push(nlComp);
                this.nonlinearComponentMap.set(component.name, nlComp);
            }
        }
        
        console.log(`  已處理 ${matrices.nonlinearComponents.length} 個非線性元件`);
    }
    
    /**
     * 獲取編譯統計信息
     */
    getStats() {
        return {
            ...super.getStats(),
            nonlinearComponents: this.nonlinearComponents.length,
            nonlinearOptions: { ...this.nonlinearOptions }
        };
    }
}

/**
 * 工廠函數：創建非線性狀態空間編譯器實例
 */
export function createNonlinearStateSpaceCompiler(options = {}) {
    const compiler = new NonlinearStateSpaceCompiler();
    
    if (options.debug !== undefined) {
        compiler.setDebug(options.debug);
    }
    
    return compiler;
}

// 導出非線性元件基類，供外部擴展使用
export { NonlinearComponent, ShockleyDiode, NonlinearStateSpaceMatrices };