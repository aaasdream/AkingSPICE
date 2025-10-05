// 調試解析器中的 MOSFET 創建過程
import { NetlistParser } from './src/parser/netlist.js';

// 複寫 MOSFET_MCP 構造函數來添加調試信息
const originalParseMOSFET = NetlistParser.prototype.parseMOSFET;

NetlistParser.prototype.parseMOSFET = function(tokens) {
    console.log('\n🔍 parseMOSFET 被調用:');
    console.log(`   tokens: [${tokens.join(', ')}]`);
    console.log(`   tokens.length: ${tokens.length}`);
    
    if (tokens.length < 4) {
        throw new Error('MOSFET requires at least 4 tokens: M<name> <drain> <source> <gate>');
    }
    
    const name = tokens[0];
    const drain = tokens[1];
    const source = tokens[2];
    const gate = tokens[3];
    const allNodes = [drain, source, gate];
    
    console.log(`   解析得到: name=${name}, drain=${drain}, source=${source}, gate=${gate}`);
    console.log(`   allNodes: [${allNodes.join(', ')}]`);
    
    // 解析 MCP MOSFET 參數
    const params = this.parseParameters(tokens.slice(4));
    console.log(`   解析參數:`, params);
    
    const mosfetParams = {
        Ron: params.Ron || params.ron || 1e-3,
        Roff: params.Roff || params.roff || 1e12,
        Vth: params.Vth || params.vth || 2.0,
        type: params.type || params.channelType || 'NMOS',
        Vf_body: params.Vf_body || params.vf_body || 0.7,
        Ron_body: params.Ron_body || params.ron_body || 5e-3,
        controlMode: params.controlMode || params.control_mode || 'voltage',
        debug: params.debug || false
    };
    
    console.log(`   mosfetParams:`, mosfetParams);
    
    // 使用原始解析器的導入
    return originalParseMOSFET.call(this, tokens);
    
    console.log(`   創建後的 MOSFET:`);
    console.log(`     name: ${mosfet.name}`);
    console.log(`     nodes: [${mosfet.nodes.join(', ')}]`);
    console.log(`     drainNode: ${mosfet.drainNode}`);
    console.log(`     sourceNode: ${mosfet.sourceNode}`);
    console.log(`     gateNode: ${mosfet.gateNode}`);
    
    this.components.push(mosfet);
    return mosfet;
};

console.log('🔍 測試覆寫後的 MOSFET 解析');

const parser = new NetlistParser();
const testLine = "M1 2 0 3 Ron=50m Vth=2V type=NMOS";

try {
    const tokens = testLine.split(/\s+/);
    const mosfet = await parser.parseMOSFET(tokens);
    console.log('\n✅ 解析完成');
} catch (error) {
    console.log(`\n❌ 解析失敗: ${error.message}`);
    console.log(error.stack);
}