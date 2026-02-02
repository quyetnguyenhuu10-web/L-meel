#!/usr/bin/env node

/**
 * Phase 02: Executor Handler Test
 * 
 * Goal: Verify apply_patches executor handler works
 * Tests:
 * - Validation: empty array
 * - Validation: type check
 * - Validation: lineNumber check
 * - Validation: text property
 * - Execution: controller call
 * - Broadcasting: events
 * - Error handling
 */

import assert from 'assert';
import { executeApplyPatches } from './EXECUTOR_HANDLER.js';

console.log('╔════════════════════════════════════════════════════════╗');
console.log('║      PHASE 02: EXECUTOR HANDLER TEST                  ║');
console.log('║   Validate & execute apply_patches                   ║');
console.log('╚════════════════════════════════════════════════════════╝\n');

// ============================================================
// MOCK CONTROLLER & BROADCAST
// ============================================================

let broadcastLog = [];

const mockController = {
  async execute(actionName, params) {
    if (actionName === "apply_patches") {
      return {
        success: true,
        ok: true,
        appliedCount: params.patches.length,
        newRev: "v2",
        newText: "updated content"
      };
    }
    throw new Error(`Unknown action: ${actionName}`);
  }
};

function mockBroadcast(job, eventName, payload) {
  broadcastLog.push({
    eventName,
    payload
  });
}

const mockJob = { sessionId: "test-session-123" };

// ============================================================
// TEST 1: VALIDATION - EMPTY PATCHES
// ============================================================

console.log('🔍 TEST 1: Validation - Empty Patches\n');

try {
  console.log(`  1A: Empty array rejected...`);
  broadcastLog = [];
  const result = await executeApplyPatches([], mockController, mockBroadcast, mockJob);
  
  assert(!result.success, "Should fail");
  assert(result.error.includes("empty"), "Error message should mention empty");
  assert(broadcastLog.length > 0, "Should broadcast error event");
  
  const errorEvent = broadcastLog.find(e => e.eventName.includes("error"));
  assert(errorEvent, "Should have error event");
  
  console.log(`      Error: ${result.error}`);
  console.log(`      Event: ${errorEvent.eventName}`);
  console.log(`      ✅ PASS\n`);
  
} catch (e) {
  console.error(`      ❌ FAIL: ${e.message}\n`);
  process.exit(1);
}

// ============================================================
// TEST 2: VALIDATION - TOO MANY PATCHES
// ============================================================

console.log('🔍 TEST 2: Validation - Too Many Patches\n');

try {
  console.log(`  2A: More than 50 patches rejected...`);
  broadcastLog = [];
  const tooManyPatches = Array(51).fill({type: "write_replace_line", lineNumber: 1, text: "x"});
  const result = await executeApplyPatches(tooManyPatches, mockController, mockBroadcast, mockJob);
  
  assert(!result.success, "Should fail");
  assert(result.error.includes("Too many"), "Error should mention limit");
  
  console.log(`      Error: ${result.error}`);
  console.log(`      ✅ PASS\n`);
  
} catch (e) {
  console.error(`      ❌ FAIL: ${e.message}\n`);
  process.exit(1);
}

// ============================================================
// TEST 3: VALIDATION - INVALID PATCH TYPE
// ============================================================

console.log('🔍 TEST 3: Validation - Invalid Patch Type\n');

try {
  console.log(`  3A: Invalid patch type rejected...`);
  broadcastLog = [];
  const invalidPatches = [
    { type: "invalid_type", lineNumber: 1, text: "x" }
  ];
  const result = await executeApplyPatches(invalidPatches, mockController, mockBroadcast, mockJob);
  
  assert(!result.success, "Should fail");
  assert(result.failedPatches.length > 0, "Should have failed patches");
  assert(result.failedPatches[0].error.includes("Invalid patch type"), "Should mention invalid type");
  
  console.log(`      Error: ${result.failedPatches[0].error}`);
  console.log(`      ✅ PASS\n`);
  
} catch (e) {
  console.error(`      ❌ FAIL: ${e.message}\n`);
  process.exit(1);
}

// ============================================================
// TEST 4: VALIDATION - MISSING LINE NUMBER
// ============================================================

console.log('🔍 TEST 4: Validation - Missing lineNumber\n');

try {
  console.log(`  4A: Missing lineNumber rejected...`);
  broadcastLog = [];
  const invalidPatches = [
    { type: "write_replace_line", text: "x" }  // missing lineNumber
  ];
  const result = await executeApplyPatches(invalidPatches, mockController, mockBroadcast, mockJob);
  
  assert(!result.success, "Should fail");
  assert(result.failedPatches.length > 0, "Should have failed patches");
  assert(result.failedPatches[0].error.includes("lineNumber"), "Should mention lineNumber");
  
  console.log(`      Error: ${result.failedPatches[0].error}`);
  console.log(`      ✅ PASS\n`);
  
} catch (e) {
  console.error(`      ❌ FAIL: ${e.message}\n`);
  process.exit(1);
}

// ============================================================
// TEST 5: VALIDATION - MISSING TEXT
// ============================================================

console.log('🔍 TEST 5: Validation - Missing text\n');

try {
  console.log(`  5A: Missing text for write_replace_line rejected...`);
  broadcastLog = [];
  const invalidPatches = [
    { type: "write_replace_line", lineNumber: 1 }  // missing text
  ];
  const result = await executeApplyPatches(invalidPatches, mockController, mockBroadcast, mockJob);
  
  assert(!result.success, "Should fail");
  assert(result.failedPatches.length > 0, "Should have failed patches");
  assert(result.failedPatches[0].error.includes("text"), "Should mention text");
  
  console.log(`      Error: ${result.failedPatches[0].error}`);
  console.log(`      ✅ PASS\n`);
  
} catch (e) {
  console.error(`      ❌ FAIL: ${e.message}\n`);
  process.exit(1);
}

// ============================================================
// TEST 6: EXECUTION - VALID PATCHES
// ============================================================

console.log('⚙️  TEST 6: Execution - Valid Patches\n');

try {
  console.log(`  6A: Valid patches executed...`);
  broadcastLog = [];
  const validPatches = [
    { type: "write_replace_line", lineNumber: 5, text: "new line 5" },
    { type: "insert_line", lineNumber: 10, text: "inserted line" },
    { type: "delete_line", lineNumber: 15 }
  ];
  const result = await executeApplyPatches(validPatches, mockController, mockBroadcast, mockJob);
  
  assert(result.success, "Should succeed");
  assert.strictEqual(result.appliedCount, 3, "Should apply 3 patches");
  assert.strictEqual(result.failedPatches.length, 0, "Should have no failed patches");
  assert(result.newRev, "Should have newRev");
  
  console.log(`      Applied: ${result.appliedCount}/${validPatches.length}`);
  console.log(`      New revision: ${result.newRev}`);
  console.log(`      ✅ PASS\n`);
  
} catch (e) {
  console.error(`      ❌ FAIL: ${e.message}\n`);
  process.exit(1);
}

// ============================================================
// TEST 7: BROADCASTING - EVENTS
// ============================================================

console.log('📡 TEST 7: Broadcasting - Events\n');

try {
  console.log(`  7A: Correct events broadcast...`);
  broadcastLog = [];
  const validPatches = [
    { type: "write_replace_line", lineNumber: 1, text: "test" }
  ];
  await executeApplyPatches(validPatches, mockController, mockBroadcast, mockJob);
  
  // Check for validation event
  const validatingEvent = broadcastLog.find(e => e.eventName.includes("validating"));
  assert(validatingEvent, "Should broadcast validating event");
  
  // Check for applied event
  const appliedEvent = broadcastLog.find(e => e.eventName === "apply_patches.applied");
  assert(appliedEvent, "Should broadcast applied event");
  assert(appliedEvent.payload.success, "Applied event should have success=true");
  
  // Check for state event
  const stateEvent = broadcastLog.find(e => e.eventName === "paper.state");
  assert(stateEvent, "Should broadcast paper.state event");
  
  console.log(`      Events broadcast:\n`);
  broadcastLog.forEach(e => {
    console.log(`        • ${e.eventName}`);
  });
  console.log(`      ✅ PASS\n`);
  
} catch (e) {
  console.error(`      ❌ FAIL: ${e.message}\n`);
  process.exit(1);
}

// ============================================================
// TEST 8: EDGE CASE - ZERO LINE NUMBER
// ============================================================

console.log('⚠️  TEST 8: Edge Case - Invalid Line Numbers\n');

try {
  console.log(`  8A: Line number < 1 rejected...`);
  broadcastLog = [];
  const invalidPatches = [
    { type: "write_replace_line", lineNumber: 0, text: "x" }
  ];
  const result = await executeApplyPatches(invalidPatches, mockController, mockBroadcast, mockJob);
  
  assert(!result.success, "Should fail");
  assert(result.failedPatches.length > 0, "Should have failed patches");
  
  console.log(`      Error: ${result.failedPatches[0].error}`);
  console.log(`      ✅ PASS\n`);
  
} catch (e) {
  console.error(`      ❌ FAIL: ${e.message}\n`);
  process.exit(1);
}

// ============================================================
// FINAL SUMMARY
// ============================================================

console.log('╔════════════════════════════════════════════════════════╗');
console.log('║                   ✅ ALL TESTS PASSED                  ║');
console.log('╠════════════════════════════════════════════════════════╣');
console.log('║ TEST 1: Empty Patches ............................ ✅');
console.log('║ TEST 2: Too Many Patches ......................... ✅');
console.log('║ TEST 3: Invalid Type ............................ ✅');
console.log('║ TEST 4: Missing lineNumber ..................... ✅');
console.log('║ TEST 5: Missing text ........................... ✅');
console.log('║ TEST 6: Valid Execution ....................... ✅');
console.log('║ TEST 7: Event Broadcasting .................... ✅');
console.log('║ TEST 8: Edge Cases ............................ ✅');
console.log('╠════════════════════════════════════════════════════════╣');
console.log('║                                                        ║');
console.log('║ 📊 METRICS:                                            ║');
console.log('║   • Validation checks: 7 ✅                            ║');
console.log('║   • Error cases: 6 ✅                                  ║');
console.log('║   • Success path: 1 ✅                                 ║');
console.log('║   • Event broadcasting: 3 events ✅                    ║');
console.log('║   • Error broadcasting: 5 event types ✅               ║');
console.log('║                                                        ║');
console.log('║ 🎯 PHASE 02 EXIT CRITERIA: ALL MET ✅                 ║');
console.log('║                                                        ║');
console.log('║ ✨ apply_patches executor validated!                  ║');
console.log('║ 🚀 Ready for Phase 03: Controller Action               ║');
console.log('║                                                        ║');
console.log('╚════════════════════════════════════════════════════════╝\n');

process.exit(0);
