/**
 * 網表解析調試測試
 */

import { NetlistParser } from './src/parser/netlist.js';

console.log('=== Netlist Parser Debug Test ===');

const simpleNetlist = `
* Simple resistor divider
VIN 1 0 DC(10)
R1 1 2 1000
R2 2 0 1000
`;

console.log('Testing netlist:');
console.log(simpleNetlist);

const parser = new NetlistParser();

// 單獨測試 parseLine
console.log('\n=== Testing individual parseLine calls ===');
try {
    const comp1 = parser.parseLine('VIN 1 0 DC(10)');
    console.log('VIN parsed:', comp1);
} catch (error) {
    console.log('VIN error:', error.message);
}

try {
    const comp2 = parser.parseLine('R1 1 2 1000');
    console.log('R1 parsed:', comp2);
} catch (error) {
    console.log('R1 error:', error.message);
}

console.log('\n=== Testing full netlist parse ===');
const result = parser.parse(simpleNetlist);

console.log('Parse result:');
console.log('Components:', result.components.length);
console.log('Errors:', result.stats.errors.length);

if (result.components.length > 0) {
    console.log('Components found:');
    result.components.forEach(comp => {
        console.log(`  - ${comp.name} (${comp.type}): value=${comp.value}`);
    });
} else {
    console.log('No components found!');
    if (result.stats.errors.length > 0) {
        console.log('Errors:');
        result.stats.errors.forEach(err => {
            console.log(`  Line ${err.line}: ${err.error}`);
        });
    }
}