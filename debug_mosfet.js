// 深度調試 MOSFET 構造函數
import { MOSFET_MCP } from './src/components/mosfet_mcp.js';

console.log('🔍 深度調試：MOSFET 構造函數');

const nodes = ['2', '0', '3'];
const params = { Ron: '50m', Vth: '2V', type: 'NMOS' };

console.log('\n1. 輸入參數:');
console.log(`   nodes: [${nodes.join(', ')}]`);
console.log(`   params:`, params);

console.log('\n2. 創建 MOSFET:');
const mosfet = new MOSFET_MCP('M1', nodes, params);

console.log('\n3. 檢查結果:');
console.log(`   名稱: ${mosfet.name}`);
console.log(`   類型: ${mosfet.type}`);
console.log(`   基礎節點 (MNA): [${mosfet.nodes.join(', ')}]`);
console.log(`   drainNode: ${mosfet.drainNode}`);
console.log(`   sourceNode: ${mosfet.sourceNode}`);
console.log(`   gateNode: ${mosfet.gateNode}`);
console.log(`   channelType: ${mosfet.channelType}`);
console.log(`   Ron: ${mosfet.Ron}`);
console.log(`   Vth: ${mosfet.Vth}`);

console.log('\n4. 所有屬性檢查:');
const keys = Object.keys(mosfet);
keys.forEach(key => {
    if (key.includes('node') || key.includes('Node')) {
        console.log(`   ${key}: ${mosfet[key]}`);
    }
});

console.log('\n5. 原型鏈檢查:');
console.log(`   constructor.name: ${mosfet.constructor.name}`);
console.log(`   是否為 MOSFET_MCP: ${mosfet instanceof MOSFET_MCP}`);