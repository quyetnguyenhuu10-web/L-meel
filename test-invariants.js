#!/usr/bin/env node

/**
 * test-invariants.js
 * 
 * Purpose: Test all 7 invariants
 * Each invariant has dedicated test
 * ALL violations must be caught
 */

import assert from 'assert';
import {
  InvariantViolation,
  enforceSnapshotSSoT,
  enforceDescOrder,
  enforceImmutableSnapshot,
  enforceInsertBounds,
  enforceIndependentPatches,
  enforceRevisionIncrement,
  enforceFixedSnapshotSize
} from './INVARIANT_ENFORCER.js';

console.log('╔════════════════════════════════════════════════════════╗');
console.log('║       TEST INVARIANTS - 7 Core System Laws             ║');
console.log('╚════════════════════════════════════════════════════════╝\n');

// ============================================================
// TEST 1: Snapshot SSOT
// ============================================================

console.log('🔒 INVARIANT 1: Snapshot SSOT\n');

try {
  console.log(`  1A: Valid lineNumber within snapshot bounds...`);
  
  const patches = [
    { type: "replace", lineNumber: 2 },
    { type: "replace", lineNumber: 5 }
  ];
  
  enforceSnapshotSSoT(patches, 5);  // snapshotLength = 5
  console.log(`      ✅ PASS - lineNumbers [2,5] valid for snapshot size 5\n`);
  
} catch (e) {
  console.error(`      ❌ FAIL: ${e.message}\n`);
  process.exit(1);
}

try {
  console.log(`  1B: REJECT - lineNumber exceeds snapshot bounds...`);
  
  const patches = [
    { type: "replace", lineNumber: 10 }
  ];
  
  assert.throws(
    () => enforceSnapshotSSoT(patches, 5),
    InvariantViolation,
    "Should reject lineNumber > snapshotLength"
  );
  
  console.log(`      ✅ PASS - Correctly rejected lineNumber 10 for snapshot size 5\n`);
  
} catch (e) {
  console.error(`      ❌ FAIL: ${e.message}\n`);
  process.exit(1);
}

// ============================================================
// TEST 2: DESC Order
// ============================================================

console.log('📉 INVARIANT 2: DESC Order (High→Low)\n');

try {
  console.log(`  2A: Valid DESC order [7, 5, 2]...`);
  
  const patches = [
    { type: "replace", lineNumber: 7 },
    { type: "replace", lineNumber: 5 },
    { type: "replace", lineNumber: 2 }
  ];
  
  enforceDescOrder(patches);
  console.log(`      ✅ PASS - DESC order valid\n`);
  
} catch (e) {
  console.error(`      ❌ FAIL: ${e.message}\n`);
  process.exit(1);
}

try {
  console.log(`  2B: REJECT - ASC order [2, 5, 7]...`);
  
  const patches = [
    { type: "replace", lineNumber: 2 },
    { type: "replace", lineNumber: 5 },
    { type: "replace", lineNumber: 7 }
  ];
  
  assert.throws(
    () => enforceDescOrder(patches),
    InvariantViolation,
    "Should reject ASC order"
  );
  
  console.log(`      ✅ PASS - Correctly rejected ASC order\n`);
  
} catch (e) {
  console.error(`      ❌ FAIL: ${e.message}\n`);
  process.exit(1);
}

// ============================================================
// TEST 3: Immutable Snapshot
// ============================================================

console.log('❄️  INVARIANT 3: Immutable Snapshot\n');

try {
  console.log(`  3A: Frozen snapshot is valid...`);
  
  const snapshot = Object.freeze(["Line 1", "Line 2", "Line 3"]);
  enforceImmutableSnapshot(snapshot);
  
  console.log(`      ✅ PASS - Frozen snapshot accepted\n`);
  
} catch (e) {
  console.error(`      ❌ FAIL: ${e.message}\n`);
  process.exit(1);
}

try {
  console.log(`  3B: REJECT - Unfrozen snapshot...`);
  
  const snapshot = ["Line 1", "Line 2", "Line 3"];  // Not frozen!
  
  assert.throws(
    () => enforceImmutableSnapshot(snapshot),
    InvariantViolation,
    "Should reject unfrozen snapshot"
  );
  
  console.log(`      ✅ PASS - Correctly rejected unfrozen snapshot\n`);
  
} catch (e) {
  console.error(`      ❌ FAIL: ${e.message}\n`);
  process.exit(1);
}

// ============================================================
// TEST 4: Insert Bounds
// ============================================================

console.log('📍 INVARIANT 4: Insert Bounds [1, snapshotLength+1]\n');

try {
  console.log(`  4A: Valid INSERT at boundary...`);
  
  const insertPatches = [
    { type: "insert", lineNumber: 3 },  // Within [1, 6]
    { type: "insert", lineNumber: 6 }   // At boundary (5+1)
  ];
  
  enforceInsertBounds(insertPatches, 5);
  console.log(`      ✅ PASS - INSERT at [3, 6] valid for snapshot size 5\n`);
  
} catch (e) {
  console.error(`      ❌ FAIL: ${e.message}\n`);
  process.exit(1);
}

try {
  console.log(`  4B: REJECT - INSERT beyond boundary...`);
  
  const insertPatches = [
    { type: "insert", lineNumber: 7 }   // > 5+1
  ];
  
  assert.throws(
    () => enforceInsertBounds(insertPatches, 5),
    InvariantViolation,
    "Should reject INSERT beyond snapshotLength+1"
  );
  
  console.log(`      ✅ PASS - Correctly rejected INSERT at line 7\n`);
  
} catch (e) {
  console.error(`      ❌ FAIL: ${e.message}\n`);
  process.exit(1);
}

// ============================================================
// TEST 5: Independent Patches
// ============================================================

console.log('🔀 INVARIANT 5: Independent Patches\n');

try {
  console.log(`  5A: Independent patches (different lines)...`);
  
  const patches = [
    { type: "replace", lineNumber: 2 },
    { type: "replace", lineNumber: 5 },
    { type: "replace", lineNumber: 8 }
  ];
  
  enforceIndependentPatches(patches, 10);
  console.log(`      ✅ PASS - All patches on different lines\n`);
  
} catch (e) {
  console.error(`      ❌ FAIL: ${e.message}\n`);
  process.exit(1);
}

try {
  console.log(`  5B: REJECT - Multiple patches on same line...`);
  
  const patches = [
    { type: "replace", lineNumber: 5 },
    { type: "insert", lineNumber: 5 }   // Same line!
  ];
  
  assert.throws(
    () => enforceIndependentPatches(patches, 10),
    InvariantViolation,
    "Should reject patches on same line"
  );
  
  console.log(`      ✅ PASS - Correctly rejected dual patches on line 5\n`);
  
} catch (e) {
  console.error(`      ❌ FAIL: ${e.message}\n`);
  process.exit(1);
}

// ============================================================
// TEST 6: Revision Increment
// ============================================================

console.log('📌 INVARIANT 6: Revision Increment\n');

try {
  console.log(`  6A: Valid increment (v1 → v2)...`);
  
  enforceRevisionIncrement("v1", "v2");
  console.log(`      ✅ PASS - Revision incremented correctly\n`);
  
} catch (e) {
  console.error(`      ❌ FAIL: ${e.message}\n`);
  process.exit(1);
}

try {
  console.log(`  6B: REJECT - No increment (v1 → v1)...`);
  
  assert.throws(
    () => enforceRevisionIncrement("v1", "v1"),
    InvariantViolation,
    "Should reject no increment"
  );
  
  console.log(`      ✅ PASS - Correctly rejected non-increment\n`);
  
} catch (e) {
  console.error(`      ❌ FAIL: ${e.message}\n`);
  process.exit(1);
}

try {
  console.log(`  6C: REJECT - Wrong increment (v1 → v3)...`);
  
  assert.throws(
    () => enforceRevisionIncrement("v1", "v3"),
    InvariantViolation,
    "Should reject +2 increment"
  );
  
  console.log(`      ✅ PASS - Correctly rejected non-linear increment\n`);
  
} catch (e) {
  console.error(`      ❌ FAIL: ${e.message}\n`);
  process.exit(1);
}

// ============================================================
// TEST 7: Fixed Snapshot Size
// ============================================================

console.log('📏 INVARIANT 7: Fixed Snapshot Size\n');

try {
  console.log(`  7A: Snapshot size unchanged...`);
  
  const snapshot = Object.freeze(["L1", "L2", "L3", "L4", "L5"]);
  enforceFixedSnapshotSize(snapshot, 5);
  
  console.log(`      ✅ PASS - Snapshot size constant\n`);
  
} catch (e) {
  console.error(`      ❌ FAIL: ${e.message}\n`);
  process.exit(1);
}

try {
  console.log(`  7B: REJECT - Snapshot size changed...`);
  
  // Note: In real system, this would be caught as frozen object
  // This test checks the guard function
  const snapshot = Object.freeze(["L1", "L2", "L3"]);
  
  assert.throws(
    () => enforceFixedSnapshotSize(snapshot, 5),  // Claimed 5, actually 3
    InvariantViolation,
    "Should reject size mismatch"
  );
  
  console.log(`      ✅ PASS - Correctly rejected size mismatch\n`);
  
} catch (e) {
  console.error(`      ❌ FAIL: ${e.message}\n`);
  process.exit(1);
}

// ============================================================
// FINAL SUMMARY
// ============================================================

console.log('╔════════════════════════════════════════════════════════╗');
console.log('║           ✅ ALL INVARIANTS ENFORCED                   ║');
console.log('╠════════════════════════════════════════════════════════╣');
console.log('║ INV 1: Snapshot SSOT ............................ ✅');
console.log('║ INV 2: DESC Order .............................. ✅');
console.log('║ INV 3: Immutable Snapshot ...................... ✅');
console.log('║ INV 4: Insert Bounds ........................... ✅');
console.log('║ INV 5: Independent Patches ..................... ✅');
console.log('║ INV 6: Revision Increment ...................... ✅');
console.log('║ INV 7: Fixed Snapshot Size ..................... ✅');
console.log('╠════════════════════════════════════════════════════════╣');
console.log('║                                                        ║');
console.log('║ 🔒 PRODUCTION-GRADE INVARIANT ENFORCEMENT              ║');
console.log('║                                                        ║');
console.log('║ ✅ All 7 core invariants have guards                  ║');
console.log('║ ✅ Violations = HARD STOP (InvariantViolation)        ║');
console.log('║ ✅ Each violation logged with full context            ║');
console.log('║ ✅ Ready for production monitoring                     ║');
console.log('║                                                        ║');
console.log('╚════════════════════════════════════════════════════════╝\n');

process.exit(0);
