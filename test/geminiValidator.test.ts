import assert from 'node:assert';
import { validateAndSanitizeData } from '../src/services/geminiClient.ts';
import { TEST_FIXTURES } from './fixtures.ts';

console.log('=== Running Gemini Schema & Validation Tests ===\n');

// Test 1: Valid datasets should pass
console.log('Test 1: Validating English dataset against schema...');
const test1 = validateAndSanitizeData(TEST_FIXTURES.en, 'en', 4, []);
assert.strictEqual(test1.valid, true, 'English dataset should be strictly valid');
assert.strictEqual(test1.sanitized?.rounds.length, 4, 'Should have 4 rounds');
console.log('✔ Passed: English dataset valid\n');

// Test 2: Hinglish dataset
console.log('Test 2: Validating Hinglish dataset...');
const test2 = validateAndSanitizeData(TEST_FIXTURES.hinglish, 'hinglish', 4, []);
assert.strictEqual(test2.valid, true, 'Hinglish dataset should be strictly valid');
console.log('✔ Passed: Hinglish dataset valid\n');

// Test 3: Hindi Devanagari dataset
console.log('Test 3: Validating Hindi Devanagari dataset...');
const test3 = validateAndSanitizeData(TEST_FIXTURES.hi, 'hi', 4, []);
assert.strictEqual(test3.valid, true, 'Hindi dataset should be strictly valid');
console.log('✔ Passed: Hindi dataset valid\n');

// Test 4: Long lines should trigger validation issue but produce sanitized fallback
console.log('Test 4: Long claim line validation...');
const badData = {
  language: 'en',
  rounds: [
    {
      lines: ['This is an excessively long claim statement line that exceeds eighteen characters'],
      fact: true,
      proof: ['Short proof'],
      source: '',
      confidence: 'high'
    }
  ],
  recap: ['Long line test']
};
const fallbackSources = [{ url: 'https://grounding.source.org/test' }];
const test4 = validateAndSanitizeData(badData, 'en', 3, fallbackSources);
assert.strictEqual(test4.valid, false, 'Should flag long line as invalid');
assert(test4.issues.length > 0, 'Should list issues');
assert.strictEqual(test4.sanitized?.rounds[0].source, 'https://grounding.source.org/test', 'Should use fallback source');
console.log('✔ Passed: Overlong line flagged and sanitized with fallback source\n');

// Test 5: Empty/Malformed data handling
console.log('Test 5: Malformed JSON handling...');
const test5 = validateAndSanitizeData(null, 'en', 3, []);
assert.strictEqual(test5.valid, false, 'Null data should be invalid');
console.log('✔ Passed: Null/malformed data handled safely without throwing\n');

console.log('=== All Gemini Validation Tests Passed Successfully! ===');
