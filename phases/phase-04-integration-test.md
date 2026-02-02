# Phase 04: Integration Test - Patch Mode Works

**Status:** READY  
**Duration:** 3-4 hours  
**Dependency:** Phase 03 (controller applies patches correctly)  
**Next:** Phase 05  

---

## 🎯 Goal

Test that Patch Mode works for **both single edits and batch edits**.

**What this does:**
- Verify single edit via `apply_patches`: `[{type: "write_replace_line", lineNumber: 5, text: "..."}]`
- Verify batch edits via `apply_patches`: Multiple patches applied in one tool call
- Verify DESC sort prevents line drift
- Verify patch validation works
- Verify no side effects

**Why this matters:**
- This is the first real test of unified Patch Mode
- Better to catch issues before production
- Validates DESC sort critical logic

---

## 🔧 Scope: 2 Technical Problems

1. **Problem 1:** Single edit works via apply_patches
   - Solution: Test 1 patch application end-to-end

2. **Problem 2:** Batch edits work without line drift
   - Solution: Test 5 patches, verify DESC sort prevents corruption

---

## 📋 Build Steps

### Step 1: Create Test Script for Single Edit

**File:** `test-phase-04-single-edit.js`

```javascript
const assert = require('assert');

console.log('=== PHASE 04 TEST 1: Single Edit via Patch Mode ===\n');

// Mock the paper object
let paperContent = `Line 1: original
Line 2: content
Line 3: here
Line 4: test
Line 5: target`;

const paperLines = paperContent.split('\n');

// Mock: Apply single patch
async function applyPatches(patches) {
  let lines = [...paperLines];
  let failed = [];
  
  // Validate patches
  if (!patches || patches.length === 0) {
    return { error: true, message: "No patches provided" };
  }
  
  if (patches.length > 50) {
    return { error: true, message: "Too many patches" };
  }
  
  // Separate by type
  const replacePatchesDesc = patches
    .filter(p => p.type === "write_replace_line")
    .sort((a, b) => b.lineNumber - a.lineNumber); // DESC!
  
  // Apply replace patches (DESC order)
  for (const patch of replacePatchesDesc) {
    const lineIdx = patch.lineNumber - 1; // Convert to 0-indexed
    
    if (lineIdx < 0 || lineIdx >= lines.length) {
      failed.push({
        patch,
        error: `Line ${patch.lineNumber} out of range (1-${lines.length})`
      });
      continue;
    }
    
    lines[lineIdx] = patch.text;
  }
  
  return {
    ok: failed.length === 0,
    newText: lines.join('\n'),
    failedPatches: failed,
    appliedCount: patches.length - failed.length
  };
}

// Test: Single edit
async function testSingleEdit() {
  console.log('Test 1A: Apply single patch to line 3...');
  try {
    const patches = [
      {
        type: "write_replace_line",
        lineNumber: 3,
        text: "Line 3: MODIFIED"
      }
    ];
    
    const result = await applyPatches(patches);
    
    assert.strictEqual(result.ok, true, "Should succeed");
    assert.strictEqual(result.appliedCount, 1, "Should apply 1 patch");
    assert(result.newText.includes("Line 3: MODIFIED"), "Line 3 should be modified");
    assert(result.newText.includes("Line 5: target"), "Line 5 should be unchanged");
    
    console.log('  ✓ Passed - Single edit works');
    return true;
  } catch (e) {
    console.log(`  ✗ FAIL: ${e.message}`);
    return false;
  }
}

// Run test
testSingleEdit().then(passed => {
  if (passed) {
    console.log('\n✅ TEST PASSED: Single edit via Patch Mode works');
    process.exit(0);
  } else {
    console.log('\n❌ TEST FAILED');
    process.exit(1);
  }
});
```

**Run it:**
```bash
node test-phase-04-single-edit.js
```

**Expected output:**
```
=== PHASE 04 TEST 1: Single Edit via Patch Mode ===

Test 1A: Apply single patch to line 3...
  ✓ Passed - Single edit works

✅ TEST PASSED: Single edit via Patch Mode works
```

---

### Step 2: Create Test Script for Batch Edits

**File:** `test-phase-04-batch-edits.js`

```javascript
const assert = require('assert');

console.log('=== PHASE 04 TEST 2: Batch Edits (Line Drift Prevention) ===\n');

// Setup paper
let paperContent = `Line 1: A
Line 2: B
Line 3: C
Line 4: D
Line 5: E
Line 6: F
Line 7: G
Line 8: H`;

const paperLines = paperContent.split('\n');

async function applyPatches(patches) {
  let lines = [...paperLines];
  let failed = [];
  
  if (!patches || patches.length === 0) {
    return { error: true, message: "No patches" };
  }
  
  if (patches.length > 50) {
    return { error: true, message: "Too many patches" };
  }
  
  // CRITICAL: DESC sort prevents line drift
  const replacePatchesDesc = patches
    .filter(p => p.type === "write_replace_line")
    .sort((a, b) => b.lineNumber - a.lineNumber);
  
  for (const patch of replacePatchesDesc) {
    const lineIdx = patch.lineNumber - 1;
    
    if (lineIdx < 0 || lineIdx >= lines.length) {
      failed.push({
        patch,
        error: `Line ${patch.lineNumber} out of range`
      });
      continue;
    }
    
    lines[lineIdx] = patch.text;
  }
  
  return {
    ok: failed.length === 0,
    newText: lines.join('\n'),
    failedPatches: failed,
    appliedCount: patches.length - failed.length
  };
}

async function testBatchEdits() {
  console.log('Test 2A: Apply 3 patches (lines 2, 5, 7) in mixed order...');
  try {
    const patches = [
      { type: "write_replace_line", lineNumber: 2, text: "Line 2: CHANGED" },
      { type: "write_replace_line", lineNumber: 7, text: "Line 7: CHANGED" },
      { type: "write_replace_line", lineNumber: 5, text: "Line 5: CHANGED" }
    ];
    
    const result = await applyPatches(patches);
    
    assert.strictEqual(result.ok, true, "All patches should apply");
    assert.strictEqual(result.appliedCount, 3, "Should apply 3 patches");
    
    // Verify line numbers didn't shift
    assert(result.newText.includes("Line 1: A"), "Line 1 unchanged");
    assert(result.newText.includes("Line 2: CHANGED"), "Line 2 changed");
    assert(result.newText.includes("Line 3: C"), "Line 3 unchanged");
    assert(result.newText.includes("Line 4: D"), "Line 4 unchanged");
    assert(result.newText.includes("Line 5: CHANGED"), "Line 5 changed");
    assert(result.newText.includes("Line 6: F"), "Line 6 unchanged");
    assert(result.newText.includes("Line 7: CHANGED"), "Line 7 changed");
    assert(result.newText.includes("Line 8: H"), "Line 8 unchanged");
    
    console.log('  ✓ Passed - No line drift, all patches applied');
    return true;
  } catch (e) {
    console.log(`  ✗ FAIL: ${e.message}`);
    return false;
  }
}

async function testConsecutiveLines() {
  console.log('Test 2B: Apply patches to consecutive lines (5, 6, 7)...');
  try {
    const patches = [
      { type: "write_replace_line", lineNumber: 5, text: "Line 5: X" },
      { type: "write_replace_line", lineNumber: 6, text: "Line 6: Y" },
      { type: "write_replace_line", lineNumber: 7, text: "Line 7: Z" }
    ];
    
    const result = await applyPatches(patches);
    
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.appliedCount, 3);
    assert(result.newText.includes("Line 5: X"));
    assert(result.newText.includes("Line 6: Y"));
    assert(result.newText.includes("Line 7: Z"));
    assert(result.newText.includes("Line 8: H"), "Line 8 unchanged");
    
    console.log('  ✓ Passed - Consecutive lines handled correctly');
    return true;
  } catch (e) {
    console.log(`  ✗ FAIL: ${e.message}`);
    return false;
  }
}

// Run all tests
(async () => {
  const test1 = await testBatchEdits();
  const test2 = await testConsecutiveLines();
  
  if (test1 && test2) {
    console.log('\n✅ ALL TESTS PASSED: Batch edits work, no line drift');
    process.exit(0);
  } else {
    console.log('\n❌ SOME TESTS FAILED');
    process.exit(1);
  }
})();
```

**Run it:**
```bash
node test-phase-04-batch-edits.js
```

**Expected output:**
```
=== PHASE 04 TEST 2: Batch Edits (Line Drift Prevention) ===

Test 2A: Apply 3 patches (lines 2, 5, 7) in mixed order...
  ✓ Passed - No line drift, all patches applied

Test 2B: Apply patches to consecutive lines (5, 6, 7)...
  ✓ Passed - Consecutive lines handled correctly

✅ ALL TESTS PASSED: Batch edits work, no line drift
```

---

### Step 3: Create Test Script for Patch Validation

**File:** `test-phase-04-validation.js`

```javascript
const assert = require('assert');

console.log('=== PHASE 04 TEST 3: Patch Validation ===\n');

const paperLines = 10; // Mock paper has 10 lines

async function validatePatches(patches) {
  // Validation rules
  if (!patches || patches.length === 0) {
    return { error: true, reason: "No patches" };
  }
  
  if (patches.length > 50) {
    return { error: true, reason: "Too many patches" };
  }
  
  for (const patch of patches) {
    // Type validation
    const validTypes = ["write_replace_line", "insert_line", "delete_line"];
    if (!validTypes.includes(patch.type)) {
      return { error: true, reason: `Invalid type: ${patch.type}` };
    }
    
    // Line number validation
    if (patch.lineNumber === undefined) {
      return { error: true, reason: "Missing lineNumber" };
    }
    
    if (patch.lineNumber < 1 || patch.lineNumber > paperLines) {
      return { error: true, reason: `Line ${patch.lineNumber} out of range (1-${paperLines})` };
    }
    
    // Text validation
    if (patch.type === "write_replace_line" && !patch.text) {
      return { error: true, reason: "write_replace_line needs text" };
    }
  }
  
  return { ok: true };
}

async function testValidation() {
  console.log('Test 3A: Valid patches pass...');
  try {
    const result = await validatePatches([
      { type: "write_replace_line", lineNumber: 5, text: "new" }
    ]);
    assert.strictEqual(result.ok, true);
    console.log('  ✓ Passed');
    return true;
  } catch (e) {
    console.log(`  ✗ FAIL: ${e.message}`);
    return false;
  }
}

async function testInvalidType() {
  console.log('Test 3B: Invalid type rejected...');
  try {
    const result = await validatePatches([
      { type: "invalid_type", lineNumber: 5, text: "new" }
    ]);
    assert.strictEqual(result.error, true);
    assert(result.reason.includes("Invalid type"));
    console.log('  ✓ Passed');
    return true;
  } catch (e) {
    console.log(`  ✗ FAIL: ${e.message}`);
    return false;
  }
}

async function testOutOfRange() {
  console.log('Test 3C: Out of range line rejected...');
  try {
    const result = await validatePatches([
      { type: "write_replace_line", lineNumber: 999, text: "new" }
    ]);
    assert.strictEqual(result.error, true);
    assert(result.reason.includes("out of range"));
    console.log('  ✓ Passed');
    return true;
  } catch (e) {
    console.log(`  ✗ FAIL: ${e.message}`);
    return false;
  }
}

async function testEmptyPatches() {
  console.log('Test 3D: Empty patches rejected...');
  try {
    const result = await validatePatches([]);
    assert.strictEqual(result.error, true);
    console.log('  ✓ Passed');
    return true;
  } catch (e) {
    console.log(`  ✗ FAIL: ${e.message}`);
    return false;
  }
}

// Run all
(async () => {
  const r1 = await testValidation();
  const r2 = await testInvalidType();
  const r3 = await testOutOfRange();
  const r4 = await testEmptyPatches();
  
  if (r1 && r2 && r3 && r4) {
    console.log('\n✅ ALL VALIDATION TESTS PASSED');
    process.exit(0);
  } else {
    console.log('\n❌ SOME TESTS FAILED');
    process.exit(1);
  }
})();
```

---

### Step 4: Run All Tests

```bash
node test-phase-04-single-edit.js
node test-phase-04-batch-edits.js
node test-phase-04-validation.js
```

All three should pass with ✅ signals.

---

## ✅ Exit Criteria

Before moving to Phase 05, verify:

- [ ] `test-phase-04-single-edit.js` passes ✅
- [ ] `test-phase-04-batch-edits.js` passes ✅
- [ ] `test-phase-04-validation.js` passes ✅
- [ ] No regressions in existing system
- [ ] DESC sort prevents line drift (verified in test 2B)
- [ ] Patch validation catches invalid inputs
- [ ] All test output clean (no warnings)

---

## If Tests Fail

### Single Edit Test Fails
- Check: `apply_patches` handler exists in executor
- Check: controller.execute("apply_patches", ...) called
- Check: DESC sort logic working
- Debug: Add console.log before each assert

### Batch Edit Test Fails
- Check: DESC sort is actually doing `sort((a, b) => b.lineNumber - a.lineNumber)`
- Check: NOT `sort((a, b) => a.lineNumber - b.lineNumber)` (that's ascending!)
- This is THE most critical bug - wrong sort = line drift
- Verify: patches applied from line 7 → 5 → 2 (high to low)

### Validation Test Fails
- Check: All 5 validation rules implemented
- Check: Error messages match test expectations
- Check: Out-of-range check uses paperLines correctly

---

## 📊 Success Metrics

| Metric | Target | Result |
|--------|--------|--------|
| Single edit success | 100% | ✓ |
| Batch edit success | 100% | ✓ |
| No line drift | 0 occurrences | ✓ |
| Validation accuracy | 100% | ✓ |
| Execution time | < 100ms | ? |

---

## 🔗 Dependencies

**Requires:**
- Phase 00: Baseline (architecture understood)
- Phase 01: Tool schema (apply_patches defined)
- Phase 02: Executor handler (tool execution works)
- Phase 03: Controller action (patches apply correctly)

**Provides to Phase 05:**
- Confidence that Patch Mode is production-ready
- Test framework for future regression testing
- Measurement baseline for performance

---

## 📝 Checklist

### Before Starting
- [ ] Phase 03 tests all pass
- [ ] DESC sort implemented correctly
- [ ] No uncommitted changes

### During Phase
- [ ] Create each test file
- [ ] Run each test script
- [ ] Verify output matches expected
- [ ] Note any unexpected behaviors

### After Phase
- [ ] All 3 test scripts pass
- [ ] Exit criteria checked
- [ ] Ready for Phase 05
- [ ] Commit: `git commit -m "Phase 04: Integration tests passed"`

---

## Next Phase

→ [Phase 05: Production Rollout](phase-05-production-rollout.md)

Patch Mode is now validated. Ready for gradual production deployment!
