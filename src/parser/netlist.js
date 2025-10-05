/**
 * SPICE風格網表解析器
 * 
 * 解析傳統SPICE格式的網表文件，建立電路元件列表
 */

import { Resistor } from '../components/resistor.js';
import { Capacitor } from '../components/capacitor.js';
import { Inductor } from '../components/inductor.js';
import { VoltageSource, CurrentSource, VCVS, VCCS } from '../components/sources.js';
import { MOSFET_MCP } from '../components/mosfet_mcp.js';
import { Diode_MCP } from '../components/diode_mcp.js';

/**
 * 網表解析器
 */
export class NetlistParser {
    constructor() {
        this.components = [];
        this.models = new Map(); // .MODEL 定義
        this.parameters = new Map(); // .PARAM 定義
        this.analyses = []; // .TRAN, .DC 等分析指令
        this.options = new Map(); // .OPTIONS 設置
        this.includes = []; // .INCLUDE 文件
        
        // 解析統計
        this.stats = {
            totalLines: 0,
            parsedLines: 0,
            skippedLines: 0,
            errors: []
        };
    }

    /**
     * 解析網表字符串
     * @param {string} netlistText 網表內容
     * @returns {Object} 解析結果
     */
    parse(netlistText) {
        this.reset();
        
        const lines = netlistText.split(/\r?\n/).map(line => line.trim());
        this.stats.totalLines = lines.length;
        
        console.log(`Parsing netlist with ${lines.length} lines...`);
        
        try {
            // 預處理：移除註釋、合併續行
            const processedLines = this.preprocessLines(lines);
            
            // 逐行解析
            for (let i = 0; i < processedLines.length; i++) {
                const line = processedLines[i];
                if (line.length === 0) continue;
                
                try {
                    this.parseLine(line, i + 1);
                    this.stats.parsedLines++;
                } catch (error) {
                    this.stats.errors.push({
                        line: i + 1,
                        content: line,
                        error: error.message
                    });
                }
            }
            
            console.log(`Netlist parsing completed: ${this.components.length} components, ${this.stats.errors.length} errors`);
            
            return {
                components: this.components,
                models: this.models,
                parameters: this.parameters,
                analyses: this.analyses,
                options: this.options,
                stats: this.stats
            };
            
        } catch (error) {
            console.error('Netlist parsing failed:', error);
            throw error;
        }
    }

    /**
     * 重置解析器狀態
     */
    reset() {
        this.components = [];
        this.models.clear();
        this.parameters.clear();
        this.analyses = [];
        this.options.clear();
        this.includes = [];
        this.stats = {
            totalLines: 0,
            parsedLines: 0,
            skippedLines: 0,
            errors: []
        };
    }

    /**
     * 預處理網表行
     * @param {string[]} lines 原始行
     * @returns {string[]} 處理後的行
     */
    preprocessLines(lines) {
        const processed = [];
        let currentLine = '';
        
        for (let line of lines) {
            // 移除註釋 (以 * 或 ; 開頭的行)
            if (line.startsWith('*') || line.startsWith(';')) {
                continue;
            }
            
            // 移除行內註釋 ($ 或 ; 之後的內容)
            const commentIndex = Math.min(
                line.indexOf('$') >= 0 ? line.indexOf('$') : line.length,
                line.indexOf(';') >= 0 ? line.indexOf(';') : line.length
            );
            line = line.substring(0, commentIndex).trim();
            
            if (line.length === 0) continue;
            
            // 處理續行 (以 + 開頭)
            if (line.startsWith('+')) {
                currentLine += ' ' + line.substring(1).trim();
            } else {
                if (currentLine.length > 0) {
                    processed.push(currentLine);
                }
                currentLine = line;
            }
        }
        
        // 添加最後一行
        if (currentLine.length > 0) {
            processed.push(currentLine);
        }
        
        return processed;
    }

    /**
     * 解析單行網表
     * @param {string} line 網表行
     * @param {number} lineNumber 行號
     * @returns {BaseComponent} 創建的組件 (如果是組件行)
     */
    parseLine(line, lineNumber = 1) {
        const tokens = line.split(/\s+/);
        if (tokens.length === 0) return null;
        
        const firstChar = tokens[0][0].toUpperCase();
        let component = null;
        
        try {
            switch (firstChar) {
                case 'R':
                    component = this.parseResistor(tokens);
                    break;
                case 'C':
                    component = this.parseCapacitor(tokens);
                    break;
                case 'L':
                    component = this.parseInductor(tokens);
                    break;
                case 'V':
                    component = this.parseVoltageSource(tokens);
                    break;
                case 'I':
                    component = this.parseCurrentSource(tokens);
                    break;
                case 'E':
                    component = this.parseVCVS(tokens);
                    break;
                case 'G':
                    component = this.parseVCCS(tokens);
                    break;
                case 'M':
                    component = this.parseMOSFET(tokens);
                    break;
                case 'D':
                    component = this.parseDiode(tokens);
                    break;
                case '.':
                    this.parseDirective(tokens);
                    break;
                default:
                    console.warn(`Unknown component type: ${tokens[0]} (line ${lineNumber})`);
                    this.stats.skippedLines++;
            }
        } catch (error) {
            throw new Error(`Line ${lineNumber}: ${error.message}`);
        }
        
        return component;
    }

    /**
     * 解析電阻
     * 格式: R<name> <node1> <node2> <value> [parameters]
     * @returns {Resistor} 創建的電阻組件
     */
    parseResistor(tokens) {
        if (tokens.length < 4) {
            throw new Error('Resistor requires at least 4 tokens: R<name> <node1> <node2> <value>');
        }
        
        const name = tokens[0];
        const nodes = [tokens[1], tokens[2]];
        const value = tokens[3];
        const params = this.parseParameters(tokens.slice(4));
        
        const resistor = new Resistor(name, nodes, value, params);
        this.components.push(resistor);
        return resistor;
    }

    /**
     * 解析電容
     * 格式: C<name> <node1> <node2> <value> [IC=<initial_voltage>]
     * @returns {Capacitor} 創建的電容組件
     */
    parseCapacitor(tokens) {
        if (tokens.length < 4) {
            throw new Error('Capacitor requires at least 4 tokens: C<name> <node1> <node2> <value>');
        }
        
        const name = tokens[0];
        const nodes = [tokens[1], tokens[2]];
        const value = tokens[3];
        const params = this.parseParameters(tokens.slice(4));
        
        const capacitor = new Capacitor(name, nodes, value, params);
        this.components.push(capacitor);
        return capacitor;
    }

    /**
     * 解析電感
     * 格式: L<name> <node1> <node2> <value> [IC=<initial_current>]
     * @returns {Inductor} 創建的電感組件
     */
    parseInductor(tokens) {
        if (tokens.length < 4) {
            throw new Error('Inductor requires at least 4 tokens: L<name> <node1> <node2> <value>');
        }
        
        const name = tokens[0];
        const nodes = [tokens[1], tokens[2]];
        const value = tokens[3];
        const params = this.parseParameters(tokens.slice(4));
        
        const inductor = new Inductor(name, nodes, value, params);
        this.components.push(inductor);
        return inductor;
    }

    /**
     * 解析 MOSFET (MCP 版本)
     * 格式: M<name> <drain> <source> <gate> [Ron=<value>] [Vth=<value>] [type=<NMOS|PMOS>] [Vf_body=<value>]
     * @returns {MOSFET_MCP} 創建的 MCP MOSFET 組件
     */
    parseMOSFET(tokens) {
        if (tokens.length < 4) {
            throw new Error('MOSFET requires at least 4 tokens: M<name> <drain> <source> <gate>');
        }
        
        const name = tokens[0];
        const drain = tokens[1];
        const source = tokens[2];
        const gate = tokens[3];
        const allNodes = [drain, source, gate];
        
        // 解析 MCP MOSFET 參數
        const params = this.parseParameters(tokens.slice(4));
        
        const mosfetParams = {
            Ron: params.Ron || params.ron || 1e-3,           // 1mΩ 導通電阻
            Roff: params.Roff || params.roff || 1e12,        // 1TΩ 截止電阻（理論無限大）
            Vth: params.Vth || params.vth || 2.0,            // 2V 閾值電壓
            type: params.type || params.channelType || 'NMOS', // NMOS 或 PMOS
            Vf_body: params.Vf_body || params.vf_body || 0.7, // 體二極管導通電壓
            Ron_body: params.Ron_body || params.ron_body || 5e-3, // 體二極管導通電阻
            controlMode: params.controlMode || params.control_mode || 'voltage', // 控制模式
            debug: params.debug || false
        };
        
        const mosfet = new MOSFET_MCP(name, allNodes, mosfetParams);
        this.components.push(mosfet);
        return mosfet;
    }

    /**
     * 解析二極管 (MCP 版本)
     * 格式: D<name> <anode> <cathode> [Vf=<value>] [Ron=<value>]
     * @returns {Diode_MCP} 創建的 MCP 二極管組件
     */
    parseDiode(tokens) {
        if (tokens.length < 3) {
            throw new Error('Diode requires at least 3 tokens: D<name> <anode> <cathode>');
        }
        
        const name = tokens[0];
        const anode = tokens[1];
        const cathode = tokens[2];
        const nodes = [anode, cathode];
        
        // 解析 MCP 二極管參數
        const params = this.parseParameters(tokens.slice(3));
        
        const diodeParams = {
            Vf: params.Vf || params.vf || 0.7,              // 導通電壓
            Ron: params.Ron || params.ron || 1e-3,           // 導通電阻
            Isat: params.Isat || params.isat || 1e-12,       // 反向飽和電流
            n: params.n || params.ideality || 1.0,           // 理想因子
            debug: params.debug || false
        };
        
        const diode = new Diode_MCP(name, nodes, diodeParams);
        this.components.push(diode);
        return diode;
    }

    /**
     * 解析電壓源
     * 格式: V<name> <node+> <node-> <source_spec>
     * @returns {VoltageSource} 創建的電壓源組件
     */
    parseVoltageSource(tokens) {
        if (tokens.length < 4) {
            throw new Error('Voltage source requires at least 4 tokens: V<name> <node+> <node-> <source>');
        }
        
        const name = tokens[0];
        const nodes = [tokens[1], tokens[2]];
        
        // 合併source specification (可能包含空格)
        let sourceSpec = tokens.slice(3).join(' ');
        
        // 解析參數
        const params = {};
        
        const voltageSource = new VoltageSource(name, nodes, sourceSpec, params);
        this.components.push(voltageSource);
        return voltageSource;
    }

    /**
     * 解析電流源
     * 格式: I<name> <node+> <node-> <source_spec>
     * @returns {CurrentSource} 創建的電流源組件
     */
    parseCurrentSource(tokens) {
        if (tokens.length < 4) {
            throw new Error('Current source requires at least 4 tokens: I<name> <node+> <node-> <source>');
        }
        
        const name = tokens[0];
        const nodes = [tokens[1], tokens[2]];
        
        // 合併source specification
        let sourceSpec = tokens.slice(3).join(' ');
        const params = {};
        
        const currentSource = new CurrentSource(name, nodes, sourceSpec, params);
        this.components.push(currentSource);
        return currentSource;
    }

    /**
     * 解析壓控電壓源 (VCVS)
     * 格式: E<name> <out+> <out-> <in+> <in-> <gain>
     */
    parseVCVS(tokens) {
        if (tokens.length < 6) {
            throw new Error('VCVS requires 6 tokens: E<name> <out+> <out-> <in+> <in-> <gain>');
        }
        
        const name = tokens[0];
        const outputNodes = [tokens[1], tokens[2]];
        const controlNodes = [tokens[3], tokens[4]];
        const gain = parseFloat(tokens[5]);
        
        const vcvs = new VCVS(name, outputNodes, controlNodes, gain);
        this.components.push(vcvs);
    }

    /**
     * 解析壓控電流源 (VCCS)
     * 格式: G<name> <out+> <out-> <in+> <in-> <transconductance>
     */
    parseVCCS(tokens) {
        if (tokens.length < 6) {
            throw new Error('VCCS requires 6 tokens: G<name> <out+> <out-> <in+> <in-> <gm>');
        }
        
        const name = tokens[0];
        const outputNodes = [tokens[1], tokens[2]];
        const controlNodes = [tokens[3], tokens[4]];
        const transconductance = parseFloat(tokens[5]);
        
        const vccs = new VCCS(name, outputNodes, controlNodes, transconductance);
        this.components.push(vccs);
    }

    /**
     * 解析指令 (以 . 開頭的行)
     * @param {string[]} tokens 標記陣列
     */
    parseDirective(tokens) {
        const directive = tokens[0].toLowerCase();
        
        switch (directive) {
            case '.tran':
                this.parseTranDirective(tokens);
                break;
            case '.dc':
                this.parseDCDirective(tokens);
                break;
            case '.param':
                this.parseParamDirective(tokens);
                break;
            case '.model':
                this.parseModelDirective(tokens);
                break;
            case '.options':
                this.parseOptionsDirective(tokens);
                break;
            case '.end':
                // 網表結束標記
                break;
            case '.title':
                // 標題行，忽略
                break;
            default:
                console.warn(`Unknown directive: ${directive}`);
        }
    }

    /**
     * 解析 .TRAN 指令
     * 格式: .TRAN <tstep> <tstop> [tstart] [tmax]
     */
    parseTranDirective(tokens) {
        if (tokens.length < 3) {
            throw new Error('.TRAN requires at least 2 parameters: .TRAN <tstep> <tstop>');
        }
        
        const analysis = {
            type: 'TRAN',
            tstep: tokens[1],
            tstop: tokens[2],
            tstart: tokens[3] || '0',
            tmax: tokens[4] || tokens[1]
        };
        
        this.analyses.push(analysis);
    }

    /**
     * 解析 .DC 指令
     */
    parseDCDirective(tokens) {
        const analysis = {
            type: 'DC',
            parameters: tokens.slice(1)
        };
        
        this.analyses.push(analysis);
    }

    /**
     * 解析 .PARAM 指令
     */
    parseParamDirective(tokens) {
        for (let i = 1; i < tokens.length; i++) {
            const param = tokens[i];
            const equalIndex = param.indexOf('=');
            if (equalIndex > 0) {
                const name = param.substring(0, equalIndex);
                const value = param.substring(equalIndex + 1);
                this.parameters.set(name, value);
            }
        }
    }

    /**
     * 解析 .MODEL 指令
     */
    parseModelDirective(tokens) {
        if (tokens.length < 3) {
            throw new Error('.MODEL requires at least 2 parameters: .MODEL <name> <type>');
        }
        
        const modelName = tokens[1];
        const modelType = tokens[2];
        const modelParams = this.parseParameters(tokens.slice(3));
        
        this.models.set(modelName, {
            type: modelType,
            parameters: modelParams
        });
    }

    /**
     * 解析 .OPTIONS 指令
     */
    parseOptionsDirective(tokens) {
        for (let i = 1; i < tokens.length; i++) {
            const option = tokens[i];
            const equalIndex = option.indexOf('=');
            if (equalIndex > 0) {
                const name = option.substring(0, equalIndex);
                const value = option.substring(equalIndex + 1);
                this.options.set(name.toLowerCase(), value);
            } else {
                this.options.set(option.toLowerCase(), true);
            }
        }
    }

    /**
     * 解析參數列表 (key=value 格式)
     * @param {string[]} tokens 參數標記
     * @returns {Object} 參數對象
     */
    parseParameters(tokens) {
        const params = {};
        
        for (const token of tokens) {
            const equalIndex = token.indexOf('=');
            if (equalIndex > 0) {
                const key = token.substring(0, equalIndex).toLowerCase();
                const value = token.substring(equalIndex + 1);
                
                // 保持字符串格式，讓各個組件自己處理工程記號
                // 只有明確的純數字才轉換為數字類型
                const trimmedValue = value.trim();
                if (/^[-+]?[0-9]*\.?[0-9]+([eE][-+]?[0-9]+)?$/.test(trimmedValue)) {
                    // 純數字（包括科學記號）
                    const numValue = parseFloat(trimmedValue);
                    params[key] = isNaN(numValue) ? value : numValue;
                } else {
                    // 包含單位後綴或其他文本，保持字符串
                    params[key] = value;
                }
            }
        }
        
        return params;
    }

    /**
     * 獲取解析統計信息
     * @returns {Object} 統計信息
     */
    getStats() {
        return {
            ...this.stats,
            componentCount: this.components.length,
            modelCount: this.models.size,
            parameterCount: this.parameters.size,
            analysisCount: this.analyses.length
        };
    }



    /**
     * 打印解析報告
     */
    printReport() {
        console.log('\\n=== Netlist Parsing Report ===');
        console.log(`Total lines: ${this.stats.totalLines}`);
        console.log(`Parsed lines: ${this.stats.parsedLines}`);
        console.log(`Skipped lines: ${this.stats.skippedLines}`);
        console.log(`Errors: ${this.stats.errors.length}`);
        
        console.log(`\\nComponents: ${this.components.length}`);
        const componentTypes = {};
        for (const comp of this.components) {
            componentTypes[comp.type] = (componentTypes[comp.type] || 0) + 1;
        }
        for (const [type, count] of Object.entries(componentTypes)) {
            console.log(`  ${type}: ${count}`);
        }
        
        if (this.analyses.length > 0) {
            console.log(`\\nAnalyses: ${this.analyses.length}`);
            for (const analysis of this.analyses) {
                console.log(`  ${analysis.type}`);
            }
        }
        
        if (this.stats.errors.length > 0) {
            console.log('\\nErrors:');
            for (const error of this.stats.errors) {
                console.log(`  Line ${error.line}: ${error.error}`);
                console.log(`    "${error.content}"`);
            }
        }
        
        console.log('==============================\\n');
    }
}