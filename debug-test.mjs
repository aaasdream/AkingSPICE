console.log('Starting test...');

try {
    const testModule = await import('./test/test-fixed-explicit-solver.js');
    console.log('Test module loaded successfully');
} catch (error) {
    console.error('Import error:', error.message);
    console.error(error.stack);
}