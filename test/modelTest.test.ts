import assert from 'node:assert';
import { cleanModelName } from '../src/services/geminiClient.ts';

console.log('=== Running Gemini Model Normalization Tests ===\n');

// Test 1: Clean model name prefix stripping
assert.strictEqual(cleanModelName('models/gemini-1.5-flash'), 'gemini-1.5-flash');
assert.strictEqual(cleanModelName('models/gemini-2.5-flash'), 'gemini-2.5-flash');
assert.strictEqual(cleanModelName('gemini-2.0-flash'), 'gemini-2.0-flash');
assert.strictEqual(cleanModelName('/models/gemini-2.5-flash/'), 'gemini-2.5-flash');
assert.strictEqual(cleanModelName('  models/gemini-1.5-pro  '), 'gemini-1.5-pro');
assert.strictEqual(cleanModelName(''), 'gemini-2.5-flash');

console.log('✔ Passed: cleanModelName handles all prefix variations correctly.');
console.log('=== Model Normalization Tests Passed Successfully! ===\n');
