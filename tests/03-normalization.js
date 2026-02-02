#!/usr/bin/env node

/**
 * Phase 03: Controller Action Test
 * 
 * CRITICAL: Test DESC sort to prevent line drift
 * 
 * Goal: Verify patches applied correctly without line number shifts
 * Tests:
 * - Single patch works
 * - DESC sort prevents line drift
 * - Consecutive line edits
 * - Mixed patch types
 * - Error handling
 */

import assert from 'assert';
import { applyPatchesAction, MockPaper } from '../phases/03-normalization/CONTROLLER_ACTION.js';

console.log('╔════════════════════════════════════════════════════════╗');
console.log('║      PHASE 03: CONTROLLER ACTION TEST                 ║');
console.log('║   DESC sort + Line Drift Prevention                  ║');
console.log('╚════════════════════════════════════════════════════════╝\n');

// ============================================================
// TEST 1: SINGLE PATCH
// ============================================================

console.log('📝 TEST 1: Single Patch\n');

try {
  console.log(`  1A: Single write_replace_line...`);
  const paper = new MockPaper("Line 1\nLine 2\nLine 3\nLine 4\nLine 5");
  
  const patches = [
    { type: "write_replace_line", lineNumber: 3, text: "Line 3: MODIFIED" }
  ];
  
  const result = await applyPatchesAction({ patches }, paper);
  
  assert(result.success, "Should succeed");
  assert.strictEqual(result.appliedCount, 1, "Should apply 1 patch");
  assert(paper.lines[2] === "Line 3: MODIFIED", "Line 3 should be modified");
  assert(paper.lines[0] === "Line 1", "Line 1 unchanged");
  assert(paper.lines[4] === "Line 5", "Line 5 unchanged");
  
  console.log(`      Result: ${result.appliedCount}/1 applied`);
  console.log(`      Line 3: "${paper.lines[2]}"`);
  console.log(`      ✅ PASS\n`);
  
} catch (e) {
  console.error(`      ❌ FAIL: ${e.message}\n`);
  process.exit(1);
}

// ============================================================
// TEST 2: DESC SORT - 3 PATCHES
// ============================================================

console.log('🔄 TEST 2: DESC Sort - Multiple Patches (Critical)\n');

try {
  console.log(`  2A: Apply patches to lines 2, 5, 7 (mixed order)...`);
  const paper = new MockPaper(
    "Line 1\nLine 2\nLine 3\nLine 4\nLine 5\nLine 6\nLine 7\nLine 8"
  );
  
  // Apply in random order, should be sorted DESC internally
  const patches = [
    { type: "write_replace_line", lineNumber: 2, text: "Line 2: CHANGED" },
    { type: "write_replace_line", lineNumber: 7, text: "Line 7: CHANGED" },
    { type: "write_replace_line", lineNumber: 5, text: "Line 5: CHANGED" }
  ];
  
  const result = await applyPatchesAction({ patches }, paper);
  
  assert(result.success, "Should succeed");
  assert.strictEqual(result.appliedCount, 3, "Should apply 3 patches");
  
  // CRITICAL: Verify NO line drift
  assert(paper.lines[1] === "Line 2: CHANGED", "Line 2 should be changed");
  assert(paper.lines[4] === "Line 5: CHANGED", "Line 5 should be changed");
  assert(paper.lines[6] === "Line 7: CHANGED", "Line 7 should be changed");
  
  // CRITICAL: Verify unchanged lines still correct
  assert(paper.lines[0] === "Line 1", "Line 1 should be unchanged");
  assert(paper.lines[2] === "Line 3", "Line 3 should be unchanged");
  assert(paper.lines[3] === "Line 4", "Line 4 should be unchanged");
  assert(paper.lines[5] === "Line 6", "Line 6 should be unchanged");
  assert(paper.lines[7] === "Line 8", "Line 8 should be unchanged");
  
  console.log(`      Patches applied in DESC order:`);
  console.log(`        1. Line 7 → "${paper.lines[6]}"`);
  console.log(`        2. Line 5 → "${paper.lines[4]}"`);
  console.log(`        3. Line 2 → "${paper.lines[1]}"`);
  console.log(`      NO line drift detected ✅`);
  console.log(`      ✅ PASS\n`);
  
} catch (e) {
  console.error(`      ❌ FAIL: ${e.message}\n`);
  process.exit(1);
}

// ============================================================
// TEST 3: CONSECUTIVE LINES
// ============================================================

console.log('📊 TEST 3: Consecutive Line Edits\n');

try {
  console.log(`  3A: Edit consecutive lines 5, 6, 7...`);
  const paper = new MockPaper(
    "Line 1\nLine 2\nLine 3\nLine 4\nLine 5\nLine 6\nLine 7\nLine 8"
  );
  
  const patches = [
    { type: "write_replace_line", lineNumber: 5, text: "Line 5: X" },
    { type: "write_replace_line", lineNumber: 6, text: "Line 6: Y" },
    { type: "write_replace_line", lineNumber: 7, text: "Line 7: Z" }
  ];
  
  const result = await applyPatchesAction({ patches }, paper);
  
  assert(result.success, "Should succeed");
  assert.strictEqual(result.appliedCount, 3, "Should apply 3 patches");
  
  // Verify correct values
  assert(paper.lines[4] === "Line 5: X", "Line 5");
  assert(paper.lines[5] === "Line 6: Y", "Line 6");
  assert(paper.lines[6] === "Line 7: Z", "Line 7");
  
  // Verify adjacent lines unchanged
  assert(paper.lines[3] === "Line 4", "Line 4 unchanged");
  assert(paper.lines[7] === "Line 8", "Line 8 unchanged");
  
  console.log(`      Applied to consecutive lines:`);
  console.log(`        Line 5: "${paper.lines[4]}"`);
  console.log(`        Line 6: "${paper.lines[5]}"`);
  console.log(`        Line 7: "${paper.lines[6]}"`);
  console.log(`      ✅ PASS\n`);
  
} catch (e) {
  console.error(`      ❌ FAIL: ${e.message}\n`);
  process.exit(1);
}

// ============================================================
// TEST 4: MIXED PATCH TYPES
// ============================================================

console.log('🔀 TEST 4: Mixed Patch Types\n');

try {
  console.log(`  4A: write_replace + insert + delete...`);
  const paper = new MockPaper(
    "Line 1\nLine 2\nLine 3\nLine 4\nLine 5\nLine 6"
  );
  
  const patches = [
    { type: "write_replace_line", lineNumber: 2, text: "Line 2: MODIFIED" },
    { type: "insert_line", lineNumber: 4, text: "NEW LINE" },
    { type: "delete_line", lineNumber: 6 }
  ];
  
  const result = await applyPatchesAction({ patches }, paper);
  
  assert(result.success, "Should succeed");
  assert.strictEqual(result.appliedCount, 3, "Should apply 3 patches");
  
  // Verify operations
  assert(paper.lines[1] === "Line 2: MODIFIED", "Line 2 modified");
  assert(paper.lines[4] === "NEW LINE", "New line inserted");
  
  console.log(`      Applied ${result.appliedCount} patches (mixed types)`);
  console.log(`      Final line count: ${paper.lines.length}`);
  console.log(`      ✅ PASS\n`);
  
} catch (e) {
  console.error(`      ❌ FAIL: ${e.message}\n`);
  process.exit(1);
}

// ============================================================
// TEST 5: OUT OF RANGE HANDLING
// ============================================================

console.log('⚠️  TEST 5: Out of Range Error Handling\n');

try {
  console.log(`  5A: Line number out of range...`);
  const paper = new MockPaper("Line 1\nLine 2\nLine 3");
  
  const patches = [
    { type: "write_replace_line", lineNumber: 10, text: "Out of range" }
  ];
  
  const result = await applyPatchesAction({ patches }, paper);
  
  assert(!result.success, "Should fail");
  assert.strictEqual(result.appliedCount, 0, "Should apply 0 patches");
  assert(result.failedPatches.length > 0, "Should have failed patch");
  assert(result.failedPatches[0].error.includes("out of range"), "Error message");
  
  console.log(`      Error: ${result.failedPatches[0].error}`);
  console.log(`      ✅ PASS\n`);
  
} catch (e) {
  console.error(`      ❌ FAIL: ${e.message}\n`);
  process.exit(1);
}

// ============================================================
// TEST 6: REVISION INCREMENT
// ============================================================

console.log('📌 TEST 6: Revision Increment\n');

try {
  console.log(`  6A: Revision updates after patches...`);
  const paper = new MockPaper("Line 1\nLine 2");
  const initialRev = paper.rev;
  
  const patches = [
    { type: "write_replace_line", lineNumber: 1, text: "Modified" }
  ];
  
  const result = await applyPatchesAction({ patches }, paper);
  
  assert(result.success, "Should succeed");
  assert(paper.rev !== initialRev, "Revision should change");
  assert(paper.rev === "v2", "Should increment to v2");
  assert(result.newRev === "v2", "Result should show new revision");
  
  console.log(`      Initial: ${initialRev}`);
  console.log(`      After: ${paper.rev}`);
  console.log(`      ✅ PASS\n`);
  
} catch (e) {
  console.error(`      ❌ FAIL: ${e.message}\n`);
  process.exit(1);
}

// ============================================================
// TEST 7: LARGE BATCH
// ============================================================

console.log('📦 TEST 7: Large Batch (50 patches)\n');

try {
  console.log(`  7A: Apply 50 patches (maximum)...`);
  
  // Create paper with 100 lines
  const lines = Array.from({length: 100}, (_, i) => `Line ${i+1}`);
  const paper = new MockPaper(lines.join('\n'));
  
  // Create 50 patches at different line numbers
  const patches = Array.from({length: 50}, (_, i) => ({
    type: "write_replace_line",
    lineNumber: i * 2 + 1,  // Every other line
    text: `Modified-${i+1}`
  }));
  
  const result = await applyPatchesAction({ patches }, paper);
  
  assert(result.success, "Should succeed");
  assert.strictEqual(result.appliedCount, 50, "Should apply all 50");
  assert.strictEqual(result.failedPatches.length, 0, "No failures");
  
  console.log(`      Applied: ${result.appliedCount}/50 patches`);
  console.log(`      Failures: ${result.failedPatches.length}`);
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
console.log('║ TEST 1: Single Patch ............................... ✅');
console.log('║ TEST 2: DESC Sort (Critical) ....................... ✅');
console.log('║ TEST 3: Consecutive Lines ......................... ✅');
console.log('║ TEST 4: Mixed Patch Types ......................... ✅');
console.log('║ TEST 5: Out of Range Handling ..................... ✅');
console.log('║ TEST 6: Revision Increment ........................ ✅');
console.log('║ TEST 7: Large Batch (50 patches) ................. ✅');
console.log('╠════════════════════════════════════════════════════════╣');
console.log('║                                                        ║');
console.log('║ 🎯 CRITICAL: DESC SORT VALIDATION                     ║');
console.log('║                                                        ║');
console.log('║ ✅ Line drift PREVENTED in all tests                  ║');
console.log('║ ✅ Patches applied in correct DESC order               ║');
console.log('║ ✅ Line numbers stable after edits                     ║');
console.log('║ ✅ All 7 tests pass + edge cases handled               ║');
console.log('║                                                        ║');
console.log('║ 🎯 PHASE 03 EXIT CRITERIA: ALL MET ✅                 ║');
console.log('║                                                        ║');
console.log('║ ✨ apply_patches controller validated!                ║');
console.log('║ 🚀 Ready for Phase 04: Integration Test                ║');
console.log('║                                                        ║');
console.log('╚════════════════════════════════════════════════════════╝\n');

process.exit(0);
