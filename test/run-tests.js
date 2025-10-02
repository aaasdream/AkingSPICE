#!/usr/bin/env node

/**
 * 簡化的測試啟動器
 */

console.log('🚀 AkingSPICE Test Launcher Starting...');

import('./master-test.js').then(module => {
  console.log('✓ Master test module loaded');
  return module.default(); // 執行 runMasterTest
}).catch(error => {
  console.error('✗ Failed to run tests:', error.message);
  console.error(error.stack);
  process.exit(1);
});