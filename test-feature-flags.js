const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { FeatureFlags, createBatchPatchHandler } = require('./FEATURE_FLAGS');

// ============ Test Suite: Feature Flags ============

console.log('\n=== PHASE 05.1 TEST: Feature Flags ===\n');

// TEST 1A: Basic enable/disable/check
console.log('TEST 1A: Basic enable/disable/check');
{
  const flags = new FeatureFlags(path.join(__dirname, '.test-flags-1a.json'));
  flags.reset();

  // Initially disabled
  assert.strictEqual(flags.isEnabled('batch-patches-v1'), false, 
    'Flag should be disabled by default');

  // Enable it
  flags.enable('batch-patches-v1', { reason: 'Initial rollout' });
  assert.strictEqual(flags.isEnabled('batch-patches-v1'), true,
    'Flag should be enabled after enable()');

  // Disable it
  flags.disable('batch-patches-v1', { reason: 'Hotfix' });
  assert.strictEqual(flags.isEnabled('batch-patches-v1'), false,
    'Flag should be disabled after disable()');

  console.log('✅ TEST 1A: PASS\n');
  fs.unlinkSync(flags.storagePath);
}

// TEST 2A: Percentage-based rollout (gradual)
console.log('TEST 2A: Percentage-based rollout');
{
  const flags = new FeatureFlags(path.join(__dirname, '.test-flags-2a.json'));
  flags.reset();

  // Enable at 50%
  flags.enable('batch-patches-v1', { percentage: 50 });
  const status = flags.getStatus();
  assert.strictEqual(status['batch-patches-v1'].percentage, 50,
    'Percentage should be 50');

  // Test with specific userIds (consistent hashing)
  const user1 = 'user-001';
  const user2 = 'user-002';
  
  // Users should get consistent results across multiple checks
  const result1a = flags.isEnabled('batch-patches-v1', user1);
  const result1b = flags.isEnabled('batch-patches-v1', user1);
  assert.strictEqual(result1a, result1b,
    'Same user should get same result (consistent hashing)');

  // Different users might get different results
  // (we can't guarantee without knowing their IDs, but we can test that it's boolean)
  const result2 = flags.isEnabled('batch-patches-v1', user2);
  assert.strictEqual(typeof result2, 'boolean',
    'Result should be boolean');

  console.log('✅ TEST 2A: PASS\n');
  fs.unlinkSync(flags.storagePath);
}

// TEST 3A: Percentage 100 = all users enabled
console.log('TEST 3A: Percentage 100 = all users');
{
  const flags = new FeatureFlags(path.join(__dirname, '.test-flags-3a.json'));
  flags.reset();

  flags.enable('batch-patches-v1', { percentage: 100 });

  // Multiple different users should all be enabled
  assert.strictEqual(flags.isEnabled('batch-patches-v1', 'user-A'), true);
  assert.strictEqual(flags.isEnabled('batch-patches-v1', 'user-B'), true);
  assert.strictEqual(flags.isEnabled('batch-patches-v1', 'user-C'), true);
  assert.strictEqual(flags.isEnabled('batch-patches-v1'), true); // Without userId

  console.log('✅ TEST 3A: PASS\n');
  fs.unlinkSync(flags.storagePath);
}

// TEST 4A: Percentage 0 = no users enabled
console.log('TEST 4A: Percentage 0 = no users');
{
  const flags = new FeatureFlags(path.join(__dirname, '.test-flags-4a.json'));
  flags.reset();

  flags.enable('batch-patches-v1', { percentage: 0 });

  // No users should be enabled
  assert.strictEqual(flags.isEnabled('batch-patches-v1', 'user-A'), false);
  assert.strictEqual(flags.isEnabled('batch-patches-v1', 'user-B'), false);
  assert.strictEqual(flags.isEnabled('batch-patches-v1'), false);

  console.log('✅ TEST 4A: PASS\n');
  fs.unlinkSync(flags.storagePath);
}

// TEST 5A: Scaling percentage (gradual rollout)
console.log('TEST 5A: Scaling percentage up (gradual rollout)');
{
  const flags = new FeatureFlags(path.join(__dirname, '.test-flags-5a.json'));
  flags.reset();

  // Start at 10%
  flags.enable('batch-patches-v1', { percentage: 10 });
  let status = flags.getStatus();
  assert.strictEqual(status['batch-patches-v1'].percentage, 10);

  // Scale to 50%
  flags.setPercentage('batch-patches-v1', 50);
  status = flags.getStatus();
  assert.strictEqual(status['batch-patches-v1'].percentage, 50);

  // Scale to 100%
  flags.setPercentage('batch-patches-v1', 100);
  status = flags.getStatus();
  assert.strictEqual(status['batch-patches-v1'].percentage, 100);

  // Verify history recorded scale events
  const history = flags.getHistory('batch-patches-v1');
  assert(history.some(h => h.action === 'SCALE'), 'Should have SCALE action in history');

  console.log('✅ TEST 5A: PASS\n');
  fs.unlinkSync(flags.storagePath);
}

// TEST 6A: Persistence (save/load from disk)
console.log('TEST 6A: Persistence to disk');
{
  const testPath = path.join(__dirname, '.test-flags-6a.json');
  
  // First instance: create and enable flag
  const flags1 = new FeatureFlags(testPath);
  flags1.reset();
  flags1.enable('batch-patches-v1', { percentage: 75, reason: 'Wave 1' });

  // Second instance: should load from disk
  const flags2 = new FeatureFlags(testPath);
  assert.strictEqual(flags2.isEnabled('batch-patches-v1'), true,
    'Flag should load from disk');
  
  const status = flags2.getStatus();
  assert.strictEqual(status['batch-patches-v1'].percentage, 75,
    'Percentage should persist');

  console.log('✅ TEST 6A: PASS\n');
  fs.unlinkSync(testPath);
}

// TEST 7A: History tracking
console.log('TEST 7A: History tracking');
{
  const flags = new FeatureFlags(path.join(__dirname, '.test-flags-7a.json'));
  flags.reset();

  // Enable
  flags.enable('flag1', { reason: 'Reason A' });
  
  // Scale
  flags.setPercentage('flag1', 50);
  
  // Disable
  flags.disable('flag1', { reason: 'Reason B' });

  // Check history
  const history = flags.getHistory('flag1');
  assert.strictEqual(history.length, 3, 'Should have 3 history entries');
  assert.strictEqual(history[0].action, 'ENABLE');
  assert.strictEqual(history[1].action, 'SCALE');
  assert.strictEqual(history[2].action, 'DISABLE');

  console.log('✅ TEST 7A: PASS\n');
  fs.unlinkSync(flags.storagePath);
}

// TEST 8A: Multiple independent flags
console.log('TEST 8A: Multiple independent flags');
{
  const flags = new FeatureFlags(path.join(__dirname, '.test-flags-8a.json'));
  flags.reset();

  // Enable multiple flags
  flags.enable('feature-A', { percentage: 100 });
  flags.enable('feature-B', { percentage: 50 });
  flags.disable('feature-C');

  // Check each
  assert.strictEqual(flags.isEnabled('feature-A'), true, 'feature-A at 100% should be enabled');
  // feature-B at 50% depends on hash, just verify it's boolean
  const resultB = flags.isEnabled('feature-B', 'user-1');
  assert.strictEqual(typeof resultB, 'boolean', 'Should return boolean');
  assert.strictEqual(flags.isEnabled('feature-C'), false, 'feature-C disabled should be false');

  // All flags in status
  const status = flags.getStatus();
  assert(status['feature-A'].enabled === true, 'feature-A should be enabled');
  assert(status['feature-B'].enabled === true, 'feature-B should be enabled');
  assert(status['feature-C'].enabled === false, 'feature-C should be disabled');

  console.log('✅ TEST 8A: PASS\n');
  fs.unlinkSync(flags.storagePath);
}

// TEST 9A: Invalid percentage clamp
console.log('TEST 9A: Percentage clamp (0-100)');
{
  const flags = new FeatureFlags(path.join(__dirname, '.test-flags-9a.json'));
  flags.reset();

  // Enable with negative percentage (should clamp to 0)
  flags.enable('flag1', { percentage: -50 });
  let status = flags.getStatus();
  assert.strictEqual(status['flag1'].percentage, 0, 'Should clamp negative to 0');

  // Set with percentage > 100 (should clamp to 100)
  flags.setPercentage('flag1', 150);
  status = flags.getStatus();
  assert.strictEqual(status['flag1'].percentage, 100, 'Should clamp > 100 to 100');

  console.log('✅ TEST 9A: PASS\n');
  fs.unlinkSync(flags.storagePath);
}

// TEST 10A: Wrapper integration test (mock)
console.log('TEST 10A: Batch patch wrapper integration');
{
  const flags = new FeatureFlags(path.join(__dirname, '.test-flags-10a.json'));
  flags.reset();

  // Mock the 3-layer system
  const mockSemantics = { analyze: () => ({}) };
  const mockNormalizer = { normalize: () => [] };
  const mockExecutor = { execute: () => ({ success: true, applied: 5, revision: 2 }) };

  // Create wrapper
  const execute = createBatchPatchHandler(mockSemantics, mockNormalizer, mockExecutor, flags);

  // Test 1: Feature disabled → rejected
  let result = execute([{ type: 'REPLACE', line: 1, old: 'a', new: 'b' }], ['line1'], 'user1');
  assert.strictEqual(result.success, false, 'Should reject when flag disabled');

  // Test 2: Feature enabled → executed
  flags.enable('batch-patches-v1', { percentage: 100 });
  result = execute([{ type: 'REPLACE', line: 1, old: 'a', new: 'b' }], ['line1'], 'user1');
  assert.strictEqual(result.success, true, 'Should execute when flag enabled');
  assert.strictEqual(result.applied, 5);

  console.log('✅ TEST 10A: PASS\n');
  fs.unlinkSync(flags.storagePath);
}

console.log('=== PHASE 05.1 SUMMARY ===');
console.log('✅ All 10 tests passed');
console.log('✅ Feature flags working');
console.log('✅ Percentage-based rollout ready');
console.log('✅ Persistence verified');
console.log('✅ History tracking active');
console.log('✅ Integration wrapper ready\n');
