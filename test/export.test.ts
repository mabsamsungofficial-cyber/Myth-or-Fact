import assert from 'node:assert';
import { getBestSupportedMimeType } from '../src/services/videoExporter.ts';

console.log('=== Running Video Export Tests ===\n');

// Test 1: Fallback MIME type check
console.log('Test 1: Default MIME type check in headless environment...');
const format = getBestSupportedMimeType();
assert(format.mimeType.length > 0, 'Should return a valid mime type');
assert(format.extension === 'webm' || format.extension === 'mp4', 'Extension should be mp4 or webm');
console.log(`✔ Passed: Selected format: ${format.label} (${format.mimeType})\n`);

console.log('=== All Video Export Tests Passed Successfully! ===');
