#!/usr/bin/env node

/**
 * test-layers.js
 * 
 * Purpose: Test 3-layer architecture
 * - Layer 1: Semantics
 * - Layer 2: Normalization
 * - Layer 3: Execution
 */

import assert from 'assert';
import { PatchSemantics } from './PATCH_SEMANTICS.js';
import { PatchNormalizer } from './PATCH_NORMALIZER.js';
import { PatchExecutor } from './PATCH_EXECUTOR.js';

console.log('╔════════════════════════════════════════════════════════╗');
console.log('║      TEST 3-LAYER ARCHITECTURE                         ║');
console.log('║   Semantics → Normalization → Execution                ║');
console.log('╚════════════════════════════════════════════════════════╝\n');

// ============================================================
// LAYER 1: SEMANTICS
// ============================================================

console.log('📊 LAYER 1: Patch Semantics\n');

try {
  console.log(`  1A: Analyze patch semantics...`);
  
  const snapshot = ["Line 1", "Line 2", "Line 3", "Line 4", "Line 5"];
  const patches = [
    { type: "write_replace_line", lineNumber: 2, text: "Modified 2" },
    { type: "write_replace_line", lineNumber: 5, text: "Modified 5" },
    { type: "insert_line", lineNumber: 3, text: "NEW" }
  ];
  
  const semantics = new PatchSemantics(snapshot, patches);
  
  assert.strictEqual(semantics.snapshotLength, 5, "Snapshot size");
  assert.strictEqual(semantics.summary.totalPatches, 3, "Total patches");
  assert.strictEqual(semantics.summary.replaceCount, 2, "Replace count");
  assert.strictEqual(semantics.summary.insertCount, 1, "Insert count");
  assert.strictEqual(semantics.summary.expectedFinalLength, 6, "Final length");
  
  console.log(semantics.toString());
  console.log(`\n      ✅ PASS - Semantics analyzed correctly\n`);
  
} catch (e) {
  console.error(`      ❌ FAIL: ${e.message}\n`);
  process.exit(1);
}

// ============================================================
// LAYER 2: NORMALIZATION
// ============================================================

console.log('🔧 LAYER 2: Patch Normalization\n');

try {
  console.log(`  2A: Normalize patches (validation + sorting)...`);
  
  const snapshot = ["L1", "L2", "L3", "L4", "L5"];
  const patches = [
    { type: "write_replace_line", lineNumber: 2, text: "X" },
    { type: "write_replace_line", lineNumber: 5, text: "Y" },
    { type: "insert_line", lineNumber: 3, text: "INS" }
  ];
  
  const normalized = PatchNormalizer.normalize(snapshot, patches);
  
  assert(normalized.isReady, "Should be ready");
  assert(Object.isFrozen(normalized.snapshotLines), "Snapshot frozen");
  assert.strictEqual(normalized.snapshotLength, 5, "Snapshot length");
  assert.strictEqual(normalized.organized.replaceDesc.length, 2, "Replace DESC");
  assert.strictEqual(normalized.organized.insertDesc.length, 1, "Insert DESC");
  
  // Check DESC order for replaces
  const replaceLines = normalized.organized.replaceDesc.map(p => p.lineNumber);
  assert.deepEqual(replaceLines, [5, 2], "Replaces in DESC order");
  
  console.log(`      Snapshot frozen: ✅`);
  console.log(`      Patches validated: ✅`);
  console.log(`      Organized by type: ✅`);
  console.log(`      Sorted DESC: ${JSON.stringify(replaceLines)} ✅`);
  if (normalized.warnings.length > 0) {
    console.log(`      Warnings:`);
    normalized.warnings.forEach(w => {
      console.log(`        - ${w.message}`);
    });
  }
  console.log(`\n      ✅ PASS - Normalization successful\n`);
  
} catch (e) {
  console.error(`      ❌ FAIL: ${e.message}\n`);
  process.exit(1);
}

// ============================================================
// LAYER 3: EXECUTION
// ============================================================

console.log('🔁 LAYER 3: Patch Execution\n');

try {
  console.log(`  3A: Execute normalized patches...`);
  
  const snapshot = ["L1", "L2", "L3", "L4", "L5"];
  const patches = [
    { type: "write_replace_line", lineNumber: 2, text: "MODIFIED 2" },
    { type: "write_replace_line", lineNumber: 5, text: "MODIFIED 5" }
  ];
  
  const normalized = PatchNormalizer.normalize(snapshot, patches);
  
  const paper = {
    lines: [...snapshot],
    text: snapshot.join('\n'),
    rev: "v1"
  };
  
  const result = PatchExecutor.execute(normalized.snapshotLines, normalized, paper);
  
  assert(result.success, "Execution success");
  assert.strictEqual(result.appliedCount, 2, "Applied count");
  assert.strictEqual(paper.rev, "v2", "Revision incremented");
  assert.strictEqual(paper.lines[1], "MODIFIED 2", "Line 2 modified");
  assert.strictEqual(paper.lines[4], "MODIFIED 5", "Line 5 modified");
  
  console.log(`      Applied: ${result.appliedCount}`);
  console.log(`      Revision: ${paper.rev}`);
  console.log(`      Paper updated: ✅`);
  console.log(`\n      ✅ PASS - Execution successful\n`);
  
} catch (e) {
  console.error(`      ❌ FAIL: ${e.message}\n`);
  process.exit(1);
}

// ============================================================
// FULL PIPELINE TEST
// ============================================================

console.log('🚀 FULL PIPELINE: Semantics → Normalization → Execution\n');

try {
  console.log(`  4A: Complete end-to-end flow...`);
  
  // Input
  const snapshot = ["A", "B", "C", "D", "E"];
  const patches = [
    { type: "write_replace_line", lineNumber: 5, text: "E_MODIFIED" },
    { type: "write_replace_line", lineNumber: 2, text: "B_MODIFIED" },
    { type: "write_replace_line", lineNumber: 1, text: "A_MODIFIED" }
  ];
  
  // Layer 1: Semantics
  const semantics = new PatchSemantics(snapshot, patches);
  assert.strictEqual(semantics.summary.totalPatches, 3, "Semantics: 3 patches");
  
  // Layer 2: Normalization
  const normalized = PatchNormalizer.normalize(snapshot, patches);
  assert(normalized.isReady, "Normalization: ready");
  const replaceOrder = normalized.organized.replaceDesc.map(p => p.lineNumber);
  assert.deepEqual(replaceOrder, [5, 2, 1], "Normalization: DESC order [5,2,1]");
  
  // Layer 3: Execution
  const paper = {
    lines: [...snapshot],
    text: snapshot.join('\n'),
    rev: "v1"
  };
  
  const result = PatchExecutor.execute(normalized.snapshotLines, normalized, paper);
  assert(result.success, "Execution: success");
  assert.strictEqual(result.appliedCount, 3, "Execution: 3 applied");
  
  // Verify final state
  assert.strictEqual(paper.lines[0], "A_MODIFIED", "Final: line 1");
  assert.strictEqual(paper.lines[1], "B_MODIFIED", "Final: line 2");
  assert.strictEqual(paper.lines[4], "E_MODIFIED", "Final: line 5");
  assert.strictEqual(paper.rev, "v2", "Final: rev incremented");
  
  console.log(`      ✓ Semantics: analyzed ${semantics.summary.totalPatches} patches`);
  console.log(`      ✓ Normalization: sorted ${replaceOrder}`);
  console.log(`      ✓ Execution: applied ${result.appliedCount}, rev→${paper.rev}`);
  console.log(`\n      ✅ PASS - Full pipeline successful\n`);
  
} catch (e) {
  console.error(`      ❌ FAIL: ${e.message}\n`);
  process.exit(1);
}

// ============================================================
// LAYER ISOLATION TEST
// ============================================================

console.log('🔐 LAYER ISOLATION: Layers Don\'t Leak State\n');

try {
  console.log(`  5A: Snapshot immutable across layers...`);
  
  const snapshot = ["A", "B", "C"];
  const patches = [{ type: "write_replace_line", lineNumber: 2, text: "X" }];
  
  // Layer 1: Semantics
  const semantics = new PatchSemantics(snapshot, patches);
  const semSnapshot = semantics.snapshotLines;
  
  // Layer 2: Normalization
  const normalized = PatchNormalizer.normalize(snapshot, patches);
  const normSnapshot = normalized.snapshotLines;
  
  // Layer 3: Execution
  const paper = { lines: [...snapshot], text: snapshot.join('\n'), rev: "v1" };
  const result = PatchExecutor.execute(normalized.snapshotLines, normalized, paper);
  
  // Verify: all snapshots are same (frozen)
  assert(Object.isFrozen(semSnapshot), "Layer 1 snapshot frozen");
  assert(Object.isFrozen(normSnapshot), "Layer 2 snapshot frozen");
  assert.deepEqual(semSnapshot, normSnapshot, "Same snapshot");
  assert.deepEqual(normSnapshot, ["A", "B", "C"], "Snapshot unchanged");
  
  // Verify: paper changed
  assert.notDeepEqual(paper.lines, snapshot, "Paper changed");
  assert.strictEqual(paper.lines[1], "X", "Paper modified");
  
  console.log(`      Layer 1 snapshot: frozen ✅`);
  console.log(`      Layer 2 snapshot: frozen ✅`);
  console.log(`      Same snapshot across layers ✅`);
  console.log(`      Paper mutated separately ✅`);
  console.log(`\n      ✅ PASS - Layer isolation confirmed\n`);
  
} catch (e) {
  console.error(`      ❌ FAIL: ${e.message}\n`);
  process.exit(1);
}

// ============================================================
// FINAL SUMMARY
// ============================================================

console.log('╔════════════════════════════════════════════════════════╗');
console.log('║         ✅ 3-LAYER ARCHITECTURE VALIDATED               ║');
console.log('╠════════════════════════════════════════════════════════╣');
console.log('║ LAYER 1: Semantics ............................... ✅');
console.log('║   • Analyze patch meaning                             ║');
console.log('║   • Categorize by type/line                           ║');
console.log('║   • Calculate metadata                                ║');
console.log('║                                                        ║');
console.log('║ LAYER 2: Normalization ........................... ✅');
console.log('║   • Enforce invariants                                ║');
console.log('║   • Sort patches (DESC)                               ║');
console.log('║   • Organize by type                                  ║');
console.log('║   • Generate warnings                                 ║');
console.log('║                                                        ║');
console.log('║ LAYER 3: Execution .............................. ✅');
console.log('║   • Apply patches sequentially                        ║');
console.log('║   • Mutate execution state                            ║');
console.log('║   • Update revision                                   ║');
console.log('║   • Return result                                     ║');
console.log('║                                                        ║');
console.log('╠════════════════════════════════════════════════════════╣');
console.log('║ Benefits:                                              ║');
console.log('║ • Clear separation of concerns                         ║');
console.log('║ • Easy to audit & test each layer                     ║');
console.log('║ • Can replace algorithm in one layer                  ║');
console.log('║ • No state leakage between layers                     ║');
console.log('║ • Production-ready architecture                       ║');
console.log('║                                                        ║');
console.log('╚════════════════════════════════════════════════════════╝\n');

process.exit(0);
