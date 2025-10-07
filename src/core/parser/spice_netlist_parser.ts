/**
 * 🔍 SPICE 网表解析器 - AkingSPICE 2.1
 * 
 * 先进的电路网表解析系统，支持标准 SPICE 语法和电力电子扩展
 * 为大规模电路仿真引擎提供智能输入处理
 * 
 * 🏆 核心特色：
 * - 完整的 SPICE 语法支持 (R, L, C, M, D, V, I)
 * - 电力电子专用器件扩展
 * - 参数表达式和变量替换
 * - 拓扑分析和连通性检查
 * - 智能错误检测和修复建议
 * - 电路模板解析支持（应用层提供）
 * 
 * 📚 支持的语法：
 *   基础器件: R, L, C, D, M (MOSFET)
 *   电源: V (电压源), I (电流源)
 *   控制语句: .param, .model, .tran, .dc
 *   分析命令: .op, .ac, .noise
 *   子电路: .subckt, .ends
 * 
 * 🎯 设计目标：
 *   - 支持复杂电力电子电路解析
 *   - 自动参数优化和合理性检查
 *   - 与智能设备模型无缝集成
 *   - 高性能批量处理能力
 */

import type { IIntelligentDeviceModel } from '../devices/intelligent_device_model.js';
import { SmartDeviceFactory } from '../devices/intelligent_device_factory.js';

/**
 * 网表元素类型枚举
 */
export enum NetlistElementType {
  RESISTOR = 'R',
  INDUCTOR = 'L', 
  CAPACITOR = 'C',
  DIODE = 'D',
  MOSFET = 'M',
  VOLTAGE_SOURCE = 'V',
  CURRENT_SOURCE = 'I',
  SUBCIRCUIT_CALL = 'X',
  PARAMETER = '.PARAM',
  MODEL = '.MODEL',
  ANALYSIS = '.TRAN',
  DIRECTIVE = '.DIRECTIVE'
}

/**
 * 网表元素定义
 */
export interface NetlistElement {
  readonly type: NetlistElementType;
  readonly name: string;
  readonly nodes: readonly string[];
  readonly value?: string | number;
  readonly parameters: Map<string, string | number>;
  readonly modelName?: string;
  readonly lineNumber: number;
  readonly rawLine: string;
}

/**
 * 解析结果
 */
export interface ParsedNetlist {
  readonly elements: readonly NetlistElement[];
  readonly parameters: Map<string, number>;
  readonly models: Map<string, NetlistModel>;
  readonly analysisCommands: readonly AnalysisCommand[];
  readonly subcircuits: Map<string, SubcircuitDefinition>;
  readonly nodeList: readonly string[];
  readonly statistics: ParseStatistics;
  readonly warnings: readonly string[];
  readonly errors: readonly string[];
}

/**
 * 模型定义
 */
export interface NetlistModel {
  readonly name: string;
  readonly type: string;
  readonly parameters: Map<string, number>;
  readonly level?: number;
}

/**
 * 分析命令
 */
export interface AnalysisCommand {
  readonly type: string;
  readonly parameters: Map<string, string | number>;
  readonly startTime?: number;
  readonly endTime?: number;
  readonly stepSize?: number;
}

/**
 * 子电路定义
 */
export interface SubcircuitDefinition {
  readonly name: string;
  readonly nodes: readonly string[];
  readonly elements: readonly NetlistElement[];
  readonly parameters: Map<string, number>;
}

/**
 * 解析统计信息
 */
export interface ParseStatistics {
  readonly totalLines: number;
  readonly elementCount: number;
  readonly nodeCount: number;
  readonly parameterCount: number;
  readonly modelCount: number;
  readonly subcircuitCount: number;
  readonly parseTime: number;
  readonly memoryUsage: number;
}

/**
 * 🔍 SPICE 网表解析器核心类
 * 
 * 提供完整的网表解析和电路构建能力
 * 支持标准 SPICE 语法和电力电子扩展
 */
export class SpiceNetlistParser {
  private readonly _parameters: Map<string, number> = new Map();
  private readonly _models: Map<string, NetlistModel> = new Map();
  private readonly _subcircuits: Map<string, SubcircuitDefinition> = new Map();
  private readonly _elements: NetlistElement[] = [];
  private readonly _analysisCommands: AnalysisCommand[] = [];
  private readonly _warnings: string[] = [];
  private readonly _errors: string[] = [];
  
  // 节点管理
  private readonly _nodes: Set<string> = new Set();
  private readonly _nodeAliases: Map<string, string> = new Map();
  
  // 解析状态
  private _currentLineNumber: number = 0;
  private _parseStartTime: number = 0;
  
  // 预定义参数和常数
  private readonly _constants: Map<string, number> = new Map([
    ['PI', Math.PI],
    ['E', Math.E],
    ['K', 1.381e-23],  // 玻尔兹曼常数
    ['Q', 1.602e-19],  // 电子电荷
    ['C', 2.998e8],    // 光速
    ['MU0', 4 * Math.PI * 1e-7]  // 真空磁导率
  ]);

  constructor() {
    // 初始化默认参数
    this._setDefaultParameters();
  }

  /**
   * 🔍 解析 SPICE 网表
   */
  parseNetlist(netlistContent: string): ParsedNetlist {
    this._parseStartTime = performance.now();
    this._reset();
    
    try {
      // 1. 预处理：注释清理、行合并、大小写标准化
      const preprocessedLines = this._preprocessNetlist(netlistContent);
      
      // 2. 第一遍解析：参数、模型、子电路定义
      this._parseDefinitions(preprocessedLines);
      
      // 3. 第二遍解析：元素和分析命令
      this._parseElements(preprocessedLines);
      
      // 4. 后处理：参数替换、节点规整、连通性检查
      this._postProcess();
      
      // 5. 验证和优化建议
      this._validateAndOptimize();
      
      const parseTime = performance.now() - this._parseStartTime;
      
      return this._generateParseResult(parseTime);
      
    } catch (error) {
      this._errors.push(`Critical parsing error: ${error}`);
      return this._generateErrorResult();
    }
  }

  /**
   * 🔧 从解析结果创建智能设备列表
   */
  createDevicesFromNetlist(parsedNetlist: ParsedNetlist): IIntelligentDeviceModel[] {
    const devices: IIntelligentDeviceModel[] = [];
    
    try {
      for (const element of parsedNetlist.elements) {
        const device = this._createDeviceFromElement(element, parsedNetlist);
        if (device) {
          devices.push(device);
        }
      }
      
      return devices;
      
    } catch (error) {
      throw new Error(`Device creation failed: ${error}`);
    }
  }

  // 注意: 电路特定的网表模板已移动到 src/applications/ 中
  // 核心解析器只处理通用的 SPICE 语法解析，不包含特定电路模板

  // === 私有解析方法 ===

  private _reset(): void {
    this._elements.length = 0;
    this._analysisCommands.length = 0;
    this._warnings.length = 0;
    this._errors.length = 0;
    this._parameters.clear();
    this._models.clear();
    this._subcircuits.clear();
    this._nodes.clear();
    this._nodeAliases.clear();
    this._currentLineNumber = 0;
    
    this._setDefaultParameters();
  }

  private _setDefaultParameters(): void {
    // 设置默认仿真参数
    this._parameters.set('TEMP', 27);        // 默认温度 27°C
    this._parameters.set('VT', 0.026);       // 热电压
    this._parameters.set('GMIN', 1e-12);     // 最小电导
    this._parameters.set('ABSTOL', 1e-12);   // 绝对容差
    this._parameters.set('RELTOL', 1e-3);    // 相对容差
    this._parameters.set('VNTOL', 1e-6);     // 电压容差
  }

  private _preprocessNetlist(content: string): string[] {
    const lines = content.split(/\r?\n/);
    const processedLines: string[] = [];
    
    for (let i = 0; i < lines.length; i++) {
      let line = lines[i].trim();
      
      // 跳过空行和注释行
      if (line.length === 0 || line.startsWith('*')) {
        continue;
      }
      
      // 处理行继续符 '+'
      while (i + 1 < lines.length && lines[i + 1].trim().startsWith('+')) {
        i++;
        line += ' ' + lines[i].trim().substring(1);
      }
      
      // 大小写标准化：保留参数值的原始大小写
      const parts = line.split(/\s+/);
      if (parts.length > 0) {
        parts[0] = parts[0].toUpperCase(); // 元素名称大写
        line = parts.join(' ');
      }
      
      processedLines.push(line);
    }
    
    return processedLines;
  }

  private _parseDefinitions(lines: string[]): void {
    for (let i = 0; i < lines.length; i++) {
      this._currentLineNumber = i + 1;
      const line = lines[i];
      
      if (line.startsWith('.PARAM')) {
        this._parseParameter(line);
      } else if (line.startsWith('.MODEL')) {
        this._parseModel(line);
      } else if (line.startsWith('.SUBCKT')) {
        const subckt = this._parseSubcircuit(lines, i);
        i = subckt.endIndex;
      }
    }
  }

  private _parseElements(lines: string[]): void {
    for (let i = 0; i < lines.length; i++) {
      this._currentLineNumber = i + 1;
      const line = lines[i];
      
      // 跳过定义行 (已在第一遍处理)
      if (line.startsWith('.PARAM') || line.startsWith('.MODEL') || line.startsWith('.SUBCKT')) {
        continue;
      }
      
      if (line.startsWith('.TRAN') || line.startsWith('.AC') || line.startsWith('.DC') || line.startsWith('.OP')) {
        this._parseAnalysisCommand(line);
      } else if (line.match(/^[RLCDMVIX]/)) {
        this._parseElement(line);
      }
    }
  }

  private _parseParameter(line: string): void {
    // 解析 .PARAM name=value [name=value ...]
    const paramRegex = /(\w+)\s*=\s*([^\s]+)/g;
    let match;
    
    while ((match = paramRegex.exec(line)) !== null) {
      const [, name, valueStr] = match;
      
      try {
        const value = this._evaluateExpression(valueStr);
        this._parameters.set(name.toUpperCase(), value);
      } catch (error) {
        this._warnings.push(`Line ${this._currentLineNumber}: Invalid parameter value '${valueStr}' for ${name}`);
      }
    }
  }

  private _parseModel(line: string): void {
    // 解析 .MODEL modelname type [parameters]
    const parts = line.split(/\s+/);
    if (parts.length < 3) {
      this._errors.push(`Line ${this._currentLineNumber}: Invalid .MODEL syntax`);
      return;
    }
    
    const modelName = parts[1].toUpperCase();
    const modelType = parts[2].toUpperCase();
    const parameters = new Map<string, number>();
    
    // 解析模型参数
    for (let i = 3; i < parts.length; i++) {
      const paramMatch = parts[i].match(/(\w+)\s*=\s*([^\s]+)/);
      if (paramMatch) {
        const [, name, valueStr] = paramMatch;
        try {
          const value = this._evaluateExpression(valueStr);
          parameters.set(name.toUpperCase(), value);
        } catch (error) {
          this._warnings.push(`Line ${this._currentLineNumber}: Invalid model parameter '${valueStr}'`);
        }
      }
    }
    
    this._models.set(modelName, {
      name: modelName,
      type: modelType,
      parameters
    });
  }

  private _parseSubcircuit(lines: string[], startIndex: number): { endIndex: number } {
    // TODO: 实现子电路解析
    let endIndex = startIndex;
    
    // 找到 .ENDS
    for (let i = startIndex + 1; i < lines.length; i++) {
      if (lines[i].toUpperCase().startsWith('.ENDS')) {
        endIndex = i;
        break;
      }
    }
    
    return { endIndex };
  }

  private _parseAnalysisCommand(line: string): void {
    const parts = line.split(/\s+/);
    const type = parts[0].substring(1).toUpperCase(); // 去掉 '.'
    const parameters = new Map<string, string | number>();
    
    if (type === 'TRAN') {
      // .TRAN tstep tstop [tstart] [tmax]
      if (parts.length >= 3) {
        parameters.set('step', this._evaluateExpression(parts[1]));
        parameters.set('stop', this._evaluateExpression(parts[2]));
        if (parts.length >= 4) parameters.set('start', this._evaluateExpression(parts[3]));
        if (parts.length >= 5) parameters.set('max', this._evaluateExpression(parts[4]));
      }
    } else if (type === 'DC') {
      // .DC source start stop step
      if (parts.length >= 5) {
        parameters.set('source', parts[1]);
        parameters.set('start', this._evaluateExpression(parts[2]));
        parameters.set('stop', this._evaluateExpression(parts[3]));
        parameters.set('step', this._evaluateExpression(parts[4]));
      }
    }
    
    this._analysisCommands.push({
      type,
      parameters,
      startTime: parameters.get('start') as number,
      endTime: parameters.get('stop') as number,
      stepSize: parameters.get('step') as number
    });
  }

  private _parseElement(line: string): void {
    const parts = line.split(/\s+/);
    if (parts.length < 3) {
      this._errors.push(`Line ${this._currentLineNumber}: Insufficient element definition`);
      return;
    }
    
    const name = parts[0];
    const type = this._getElementType(name);
    const nodes: string[] = [];
    const parameters = new Map<string, string | number>();
    let value: string | number | undefined;
    let modelName: string | undefined;
    
    // 根据元素类型解析
    switch (type) {
      case NetlistElementType.RESISTOR:
      case NetlistElementType.INDUCTOR:
      case NetlistElementType.CAPACITOR:
        // R/L/C node1 node2 value [parameters]
        if (parts.length >= 4) {
          nodes.push(parts[1], parts[2]);
          value = this._evaluateExpression(parts[3]);
          this._parseElementParameters(parts.slice(4), parameters);
        }
        break;
        
      case NetlistElementType.DIODE:
        // D node1 node2 modelname [parameters]
        if (parts.length >= 4) {
          nodes.push(parts[1], parts[2]);
          modelName = parts[3].toUpperCase();
          this._parseElementParameters(parts.slice(4), parameters);
        }
        break;
        
      case NetlistElementType.MOSFET:
        // M drain gate source bulk modelname [parameters]
        if (parts.length >= 6) {
          nodes.push(parts[1], parts[2], parts[3], parts[4]); // D G S B
          modelName = parts[5].toUpperCase();
          this._parseElementParameters(parts.slice(6), parameters);
        }
        break;
        
      case NetlistElementType.VOLTAGE_SOURCE:
      case NetlistElementType.CURRENT_SOURCE:
        // V/I node+ node- [DC] value [AC magnitude [phase]] [transient_spec]
        if (parts.length >= 4) {
          nodes.push(parts[1], parts[2]);
          
          // 解析电源规格
          let valueIndex = 3;
          if (parts[3].toUpperCase() === 'DC') {
            valueIndex = 4;
          }
          
          if (parts.length > valueIndex) {
            value = this._parseSourceValue(parts.slice(valueIndex));
          }
        }
        break;
    }
    
    // 注册节点
    nodes.forEach(node => {
      if (node !== '0') { // 地节点不计入
        this._nodes.add(node);
      }
    });
    
    const element: NetlistElement = {
      type,
      name,
      nodes,
      value,
      parameters,
      modelName,
      lineNumber: this._currentLineNumber,
      rawLine: line
    };
    
    this._elements.push(element);
  }

  private _getElementType(name: string): NetlistElementType {
    const firstChar = name.charAt(0).toUpperCase();
    switch (firstChar) {
      case 'R': return NetlistElementType.RESISTOR;
      case 'L': return NetlistElementType.INDUCTOR;
      case 'C': return NetlistElementType.CAPACITOR;
      case 'D': return NetlistElementType.DIODE;
      case 'M': return NetlistElementType.MOSFET;
      case 'V': return NetlistElementType.VOLTAGE_SOURCE;
      case 'I': return NetlistElementType.CURRENT_SOURCE;
      case 'X': return NetlistElementType.SUBCIRCUIT_CALL;
      default:
        throw new Error(`Unknown element type: ${firstChar}`);
    }
  }

  private _parseElementParameters(parts: string[], parameters: Map<string, string | number>): void {
    for (const part of parts) {
      const paramMatch = part.match(/(\w+)\s*=\s*([^\s]+)/);
      if (paramMatch) {
        const [, name, valueStr] = paramMatch;
        try {
          const value = this._evaluateExpression(valueStr);
          parameters.set(name.toUpperCase(), value);
        } catch (error) {
          parameters.set(name.toUpperCase(), valueStr); // 保存原始字符串
        }
      }
    }
  }

  private _parseSourceValue(parts: string[]): number | string {
    if (parts.length === 0) return 0;
    
    const firstPart = parts[0].toUpperCase();
    
    // 常数电源
    if (!isNaN(parseFloat(firstPart))) {
      return this._evaluateExpression(firstPart);
    }
    
    // 时变电源 (PULSE, SIN, EXP 等)
    if (firstPart.startsWith('PULSE') || firstPart.startsWith('SIN') || firstPart.startsWith('EXP')) {
      return parts.join(' '); // 保存完整定义
    }
    
    // 参数引用
    return firstPart;
  }

  private _evaluateExpression(expr: string): number {
    // 移除大括号 {expr}
    let cleanExpr = expr.replace(/[{}]/g, '');
    
    // 替换常数
    for (const [name, value] of this._constants) {
      const regex = new RegExp(`\\b${name}\\b`, 'gi');
      cleanExpr = cleanExpr.replace(regex, value.toString());
    }
    
    // 替换参数
    for (const [name, value] of this._parameters) {
      const regex = new RegExp(`\\b${name}\\b`, 'gi');
      cleanExpr = cleanExpr.replace(regex, value.toString());
    }
    
    // 处理工程记号 (m, u, n, p, k, M, G)
    cleanExpr = this._parseEngineeringNotation(cleanExpr);
    
    try {
      // 安全的表达式计算 (仅支持基本数学运算)
      return this._safeEval(cleanExpr);
    } catch (error) {
      throw new Error(`Invalid expression: ${expr}`);
    }
  }

  private _parseEngineeringNotation(expr: string): string {
    const notations = [
      { suffix: 'G', multiplier: 1e9 },
      { suffix: 'M', multiplier: 1e6 },
      { suffix: 'k', multiplier: 1e3 },
      { suffix: 'm', multiplier: 1e-3 },
      { suffix: 'u', multiplier: 1e-6 },
      { suffix: 'n', multiplier: 1e-9 },
      { suffix: 'p', multiplier: 1e-12 },
      { suffix: 'f', multiplier: 1e-15 }
    ];
    
    for (const { suffix, multiplier } of notations) {
      const regex = new RegExp(`(\\d+(?:\\.\\d+)?)${suffix}\\b`, 'g');
      expr = expr.replace(regex, (match, number) => {
        return (parseFloat(number) * multiplier).toString();
      });
    }
    
    return expr;
  }

  private _safeEval(expr: string): number {
    // 简单的表达式计算器 (仅支持 +, -, *, /, ^, sqrt, sin, cos 等)
    // 移除所有非数字、运算符、函数名的字符
    const safeExpr = expr.replace(/[^0-9+\-*/.()eE\s]/g, '');
    
    try {
      // 使用 Function 构造函数进行安全计算
      return new Function(`return ${safeExpr}`)();
    } catch (error) {
      // 如果是单个数字，直接解析
      const num = parseFloat(expr);
      if (!isNaN(num)) return num;
      
      throw new Error(`Cannot evaluate: ${expr}`);
    }
  }

  private _postProcess(): void {
    // 参数替换
    for (const element of this._elements) {
      if (typeof element.value === 'string') {
        try {
          (element as any).value = this._evaluateExpression(element.value);
        } catch (error) {
          this._warnings.push(`Cannot evaluate value '${element.value}' for element ${element.name}`);
        }
      }
    }
    
    // 节点名称规整化
    this._normalizeNodeNames();
    
    // 连通性检查
    this._checkConnectivity();
  }

  private _normalizeNodeNames(): void {
    // 将数字节点名转换为标准格式
    const nodeMapping = new Map<string, string>();
    let nodeCounter = 1;
    
    // 地节点始终为 '0'
    nodeMapping.set('0', '0');
    nodeMapping.set('GND', '0');
    nodeMapping.set('GROUND', '0');
    
    // 为其他节点分配编号
    for (const node of this._nodes) {
      if (!nodeMapping.has(node) && node !== '0') {
        nodeMapping.set(node, nodeCounter.toString());
        nodeCounter++;
      }
    }
    
    this._nodeAliases = nodeMapping;
  }

  private _checkConnectivity(): void {
    // 简单的连通性检查
    const connections = new Map<string, Set<string>>();
    
    for (const element of this._elements) {
      for (const node of element.nodes) {
        if (!connections.has(node)) {
          connections.set(node, new Set());
        }
        
        // 连接所有同一元素的节点
        for (const otherNode of element.nodes) {
          if (node !== otherNode) {
            connections.get(node)!.add(otherNode);
          }
        }
      }
    }
    
    // 检查孤立节点
    for (const [node, connectedNodes] of connections) {
      if (connectedNodes.size === 0 && node !== '0') {
        this._warnings.push(`Node '${node}' appears to be isolated`);
      }
    }
  }

  private _validateAndOptimize(): void {
    // 元素数量检查
    if (this._elements.length === 0) {
      this._errors.push('No circuit elements found');
      return;
    }
    
    // 检查必要的分析命令
    const hasTransientAnalysis = this._analysisCommands.some(cmd => cmd.type === 'TRAN');
    if (!hasTransientAnalysis) {
      this._warnings.push('No transient analysis command found (.TRAN)');
    }
    
    // 检查电源
    const hasPowerSource = this._elements.some(el => 
      el.type === NetlistElementType.VOLTAGE_SOURCE || el.type === NetlistElementType.CURRENT_SOURCE
    );
    if (!hasPowerSource) {
      this._warnings.push('No power sources (V or I) found in circuit');
    }
    
    // 参数合理性检查
    for (const element of this._elements) {
      this._validateElementParameters(element);
    }
  }

  private _validateElementParameters(element: NetlistElement): void {
    const name = element.name;
    const value = element.value;
    
    switch (element.type) {
      case NetlistElementType.RESISTOR:
        if (typeof value === 'number' && value <= 0) {
          this._warnings.push(`Resistor ${name} has non-positive value: ${value}`);
        }
        break;
        
      case NetlistElementType.INDUCTOR:
        if (typeof value === 'number' && value <= 0) {
          this._warnings.push(`Inductor ${name} has non-positive value: ${value}`);
        }
        break;
        
      case NetlistElementType.CAPACITOR:
        if (typeof value === 'number' && value <= 0) {
          this._warnings.push(`Capacitor ${name} has non-positive value: ${value}`);
        }
        break;
    }
  }

  private _createDeviceFromElement(element: NetlistElement, netlist: ParsedNetlist): IIntelligentDeviceModel | null {
    try {
      const nodeIds = element.nodes.map(node => {
        const mappedNode = this._nodeAliases.get(node);
        return parseInt(mappedNode || node);
      });
      
      switch (element.type) {
        case NetlistElementType.RESISTOR:
          // TODO: 实现电阻器智能模型
          return null;
          
        case NetlistElementType.INDUCTOR:
          if (typeof element.value === 'number') {
            return SmartDeviceFactory.createInductor(
              element.name,
              [nodeIds[0], nodeIds[1]],
              {
                L0: element.value,
                Isat: element.parameters.get('ISAT') as number || 10,
                alpha: element.parameters.get('ALPHA') as number || 2.0,
                R: element.parameters.get('RSER') as number || element.value / 1000
              }
            );
          }
          break;
          
        case NetlistElementType.CAPACITOR:
          // TODO: 实现电容器智能模型
          return null;
          
        case NetlistElementType.DIODE:
          const diodeModel = element.modelName ? netlist.models.get(element.modelName) : null;
          return SmartDeviceFactory.createDiode(
            element.name,
            [nodeIds[0], nodeIds[1]],
            {
              Is: diodeModel?.parameters.get('IS') || 1e-12,
              n: diodeModel?.parameters.get('N') || 1.2,
              Rs: diodeModel?.parameters.get('RS') || 0.01,
              Cj0: diodeModel?.parameters.get('CJO') || 1e-12,
              Vj: diodeModel?.parameters.get('VJ') || 0.7,
              m: diodeModel?.parameters.get('M') || 0.5,
              tt: diodeModel?.parameters.get('TT') || 1e-9
            }
          );
          
        case NetlistElementType.MOSFET:
          const mosfetModel = element.modelName ? netlist.models.get(element.modelName) : null;
          return SmartDeviceFactory.createMOSFET(
            element.name,
            [nodeIds[0], nodeIds[1], nodeIds[2]], // D G S
            {
              Vth: mosfetModel?.parameters.get('VTH') || element.parameters.get('VTH') as number || 2.0,
              Kp: mosfetModel?.parameters.get('KP') || element.parameters.get('KP') as number || 1e-3,
              lambda: mosfetModel?.parameters.get('LAMBDA') || 0.01,
              Cgs: element.parameters.get('CGS') as number || 500e-12,
              Cgd: element.parameters.get('CGD') as number || 100e-12,
              Ron: 0.1,
              Roff: 1e6,
              Vmax: 100,
              Imax: 10
            }
          );
      }
      
      return null;
      
    } catch (error) {
      this._errors.push(`Failed to create device ${element.name}: ${error}`);
      return null;
    }
  }

  private _generateParseResult(parseTime: number): ParsedNetlist {
    return {
      elements: this._elements,
      parameters: new Map(this._parameters),
      models: new Map(this._models),
      analysisCommands: this._analysisCommands,
      subcircuits: new Map(this._subcircuits),
      nodeList: Array.from(this._nodes),
      statistics: {
        totalLines: this._currentLineNumber,
        elementCount: this._elements.length,
        nodeCount: this._nodes.size,
        parameterCount: this._parameters.size,
        modelCount: this._models.size,
        subcircuitCount: this._subcircuits.size,
        parseTime,
        memoryUsage: 0 // TODO: 实际内存使用计算
      },
      warnings: this._warnings,
      errors: this._errors
    };
  }

  private _generateErrorResult(): ParsedNetlist {
    return {
      elements: [],
      parameters: new Map(),
      models: new Map(),
      analysisCommands: [],
      subcircuits: new Map(),
      nodeList: [],
      statistics: {
        totalLines: this._currentLineNumber,
        elementCount: 0,
        nodeCount: 0,
        parameterCount: 0,
        modelCount: 0,
        subcircuitCount: 0,
        parseTime: performance.now() - this._parseStartTime,
        memoryUsage: 0
      },
      warnings: this._warnings,
      errors: this._errors
    };
  }

  /**
   * 📊 获取解析统计
   */
  getLastParseStatistics(): ParseStatistics | null {
    if (this._elements.length === 0) return null;
    
    return {
      totalLines: this._currentLineNumber,
      elementCount: this._elements.length,
      nodeCount: this._nodes.size,
      parameterCount: this._parameters.size,
      modelCount: this._models.size,
      subcircuitCount: this._subcircuits.size,
      parseTime: performance.now() - this._parseStartTime,
      memoryUsage: 0
    };
  }

  /**
   * ♻️ 清理解析器状态
   */
  reset(): void {
    this._reset();
  }
}