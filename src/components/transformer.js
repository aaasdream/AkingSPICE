/**
 * 多繞組變壓器模型 - 專為 LLC、Flyback、Forward 等高階拓撲設計
 * 🔥 修正版 v2：確保互感值為正，由 MNA 求解器處理極性。
 */

import { BaseComponent } from './base.js';
import { Inductor } from './inductor.js';

export class MultiWindingTransformer {
    /**
     * @param {string} name 變壓器名稱 (如 'T1', 'XFMR1')
     * @param {Object} config 變壓器配置
     */
    constructor(name, config) {
        this.name = name;
        this.type = 'T_META'; // 標記為元元件

        if (!config || !config.windings || config.windings.length < 2) {
            throw new Error(`Transformer ${name} must have at least 2 windings`);
        }
        
        const numWindings = config.windings.length;
        
        // 1. 創建內部 Inductor 實例
        this.inductors = config.windings.map((windingDef, index) => {
            const inductorName = `${name}_${windingDef.name || `W${index+1}`}`;
            return new Inductor(inductorName, windingDef.nodes, windingDef.inductance, {
                r: windingDef.resistance || 0
            });
        });

        // 2. 建立耦合矩陣
        const couplingMatrix = this.buildCouplingMatrix(numWindings, config.couplingMatrix);

        // 3. 計算互感矩陣
        const mutualMatrix = this.calculateMutualInductanceMatrix(couplingMatrix);

        // 4. 將耦合資訊注入到每個 Inductor 實例中
        for (let i = 0; i < numWindings; i++) {
            const inductorI = this.inductors[i];
            inductorI.couplings = [];

            for (let j = 0; j < numWindings; j++) {
                if (i === j) continue;

                const inductorJ = this.inductors[j];
                const mutualInductance = mutualMatrix[i][j];
                
                // 🔥 核心修正：
                // MNA 矩陣的印花邏輯 (mna.js) 會自動處理負號以符合物理公式。
                // 因此這裡的互感值必須為正，以避免雙重否定導致的相位反轉。
                const polarity = 1.0; 

                inductorI.couplings.push({
                    inductor: inductorJ,
                    mutualInductance: mutualInductance * polarity
                });
            }
        }
    }

    /**
     * 🔥 核心方法：返回構成變壓器的所有實際元件
     * @returns {Inductor[]}
     */
    getComponents() {
        return this.inductors;
    }

    buildCouplingMatrix(n, userMatrix) {
        const matrix = Array(n).fill(null).map(() => Array(n).fill(0));
        for (let i = 0; i < n; i++) matrix[i][i] = 1.0;

        if (userMatrix) {
            for (let i = 0; i < n; i++) {
                for (let j = i + 1; j < n; j++) {
                    const k = (userMatrix[i] && userMatrix[i][j] !== undefined) ? userMatrix[i][j] : 0.99;
                    matrix[i][j] = matrix[j][i] = Math.max(-1, Math.min(1, k));
                }
            }
        } else {
            const defaultK = 0.99;
            for (let i = 0; i < n; i++) {
                for (let j = i + 1; j < n; j++) {
                    matrix[i][j] = matrix[j][i] = defaultK;
                }
            }
        }
        return matrix;
    }

    calculateMutualInductanceMatrix(couplingMatrix) {
        const n = this.inductors.length;
        const mutualMatrix = Array(n).fill(null).map(() => Array(n).fill(0));
        
        for (let i = 0; i < n; i++) {
            for (let j = i; j < n; j++) {
                if (i === j) {
                    mutualMatrix[i][j] = this.inductors[i].getInductance();
                } else {
                    const Li = this.inductors[i].getInductance();
                    const Lj = this.inductors[j].getInductance();
                    const k_ij = couplingMatrix[i][j];
                    const M = k_ij * Math.sqrt(Li * Lj);
                    mutualMatrix[i][j] = mutualMatrix[j][i] = M;
                }
            }
        }
        return mutualMatrix;
    }
    
    toString() {
        return `${this.name} (MultiWinding Transformer with ${this.inductors.length} windings)`;
    }
}