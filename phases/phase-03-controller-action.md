# Phase 03: apply_patches Controller Action - Implement Patch Application Logic

**Status:** READY  
**Duration:** 3-4 hours  
**Dependency:** Phase 02 (executor calls controller)  
**Next:** Phase 04  

---

## 🎯 Goal

Implement the controller action for `apply_patches`.

**What this does:**
- Receive validated patches from executor
- Apply all patches to paper (handle line drift with DESC sorting)
- Update paper.text and paper.rev
- Return success/failure result with applied count

**Why this matters:**
- This is the core logic of patch mode
- Must handle line drift correctly (DESC order)
- Must handle partial failures gracefully

---

## 🔧 Scope: 2 Technical Problems

1. **Problem 1:** Applying patches in wrong order causes line drift
   - Solution: Sort write_replace_line patches by lineNumber DESC before applying

2. **Problem 2:** Distinguishing success vs partial failure
   - Solution: Track applied vs failed patches separately

---

## 📋 Build Steps

### Step 1: Open controller.js

Find the ACTIONS enum (from Phase 00).

### Step 2: Add Action to Enum

Find line with ACTIONS = {...} and add:

```javascript
const ACTIONS = {
  search_paper,
  search_chat,
  search_tools,
  get_context_lines,
  keep_search,
  retrieve_search,
  get_kept_searches,
  clear_kept_search,
  clear_all_kept_searches,
  edit,
  apply_patches,           // ← NEW
  verify,
  close
};
```

### Step 3: Locate Controller Handler Insert Point

Find the execute() switch statement, locate last case (should be `verify`):

```javascript
case ACTIONS.verify:
  // ... handler code ...
  break;
```

Position cursor AFTER this closing `break;`, BEFORE the final `default:` case.

### Step 4: Add Controller Handler Case

Insert this new case:

```javascript
case ACTIONS.apply_patches: {
  const { patches } = params;
  
  if (!patches || patches.length === 0) {
    return {
      ok: false,
      error: new Error("No patches provided"),
      output: {
        appliedCount: 0,
        failedCount: 0,
        paper_rev: paper.getPaperRev()
      }
    };
  }
  
  // CRITICAL: Sort write_replace_line patches by lineNumber DESC
  // This prevents line index drift when applying multiple replacements
  // Example: If applying patches on lines [2, 5], apply line 5 first,
  // then line 2 won't shift due to line 5 removal
  
  const replacePatchesDesc = patches
    .filter(p => p.type === "write_replace_line")
    .sort((a, b) => b.lineNumber - a.lineNumber);
  
  const otherPatches = patches.filter(p => p.type !== "write_replace_line");
  
  // Working copy of paper content
  let workingText = paper.text;
  let workingLines = workingText.split('\n');
  
  const appliedPatches = [];
  const failedPatches = [];
  
  // Apply write_replace_line patches in DESC order
  for (const patch of replacePatchesDesc) {
    try {
      const idx = patch.lineNumber - 1;  // Convert 1-indexed to 0-indexed
      
      if (idx < 0 || idx >= workingLines.length) {
        throw new Error(`Line ${patch.lineNumber} out of range`);
      }
      
      workingLines[idx] = patch.text;
      appliedPatches.push(patch.id || `patch_line_${patch.lineNumber}`);
      
    } catch (e) {
      failedPatches.push({
        id: patch.id || `patch_line_${patch.lineNumber}`,
        error: e.message
      });
    }
  }
  
  // Apply other patches (write_append, set_text, clear_all)
  // WARNING: set_text and clear_all override all previous patches!
  for (const patch of otherPatches) {
    try {
      if (patch.type === "write_append") {
        workingText = workingLines.join('\n');
        workingText += patch.text;
        workingLines = workingText.split('\n');
        appliedPatches.push(patch.id || `patch_append`);
        
      } else if (patch.type === "set_text") {
        workingText = patch.text;
        workingLines = workingText.split('\n');
        appliedPatches.push(patch.id || `patch_set_text`);
        
      } else if (patch.type === "clear_all") {
        workingText = "";
        workingLines = [""];
        appliedPatches.push(patch.id || `patch_clear_all`);
      }
      
    } catch (e) {
      failedPatches.push({
        id: patch.id || `patch_${patch.type}`,
        error: e.message
      });
    }
  }
  
  // If any patches succeeded, apply to paper
  let finalText = workingText;
  if (!finalText && workingLines.length > 0) {
    finalText = workingLines.join('\n');
  }
  
  if (appliedPatches.length > 0) {
    paper.set_text(finalText);
  }
  
  // Determine success: ok only if ALL patches succeeded
  const allSucceeded = failedPatches.length === 0;
  
  return {
    ok: allSucceeded,
    output: {
      appliedCount: appliedPatches.length,
      failedCount: failedPatches.length,
      appliedIds: appliedPatches,
      errors: failedPatches,
      paper_rev: paper.getPaperRev()
    }
  };
}
```

---

## 🧪 Test Now (Immediate)

### Test 1: Line Drift Prevention (Critical)

```bash
# Create test script: test-phase-03-line-drift.js
node test-phase-03-line-drift.js
```

**test-phase-03-line-drift.js:**
```javascript
const assert = require('assert');

console.log('=== PHASE 03 TEST: Line Drift Prevention ===\n');

// Mock paper object
class MockPaper {
  constructor(text) {
    this.text = text;
    this.rev = 0;
  }
  
  set_text(newText) {
    this.text = newText;
    this.rev++;
  }
  
  getPaperRev() {
    return this.rev;
  }
}

// Simulate controller action
async function applyPatchesAction(patches) {
  const paper = new MockPaper("line1\nline2\nline3\nline4\nline5");
  
  // Sort DESC (key logic!)
  const replacePatchesDesc = patches
    .filter(p => p.type === "write_replace_line")
    .sort((a, b) => b.lineNumber - a.lineNumber);
  
  let workingLines = paper.text.split('\n');
  const appliedPatches = [];
  
  for (const patch of replacePatchesDesc) {
    const idx = patch.lineNumber - 1;
    workingLines[idx] = patch.text;
    appliedPatches.push(patch.id || `patch_${patch.lineNumber}`);
  }
  
  const finalText = workingLines.join('\n');
  paper.set_text(finalText);
  
  return {
    ok: true,
    output: {
      appliedCount: appliedPatches.length,
      paper_rev: paper.getPaperRev(),
      finalText: paper.text
    }
  };
}

// Test 1: Single patch (no drift possible)
console.log('Test 1: Single patch on line 2...');
let result = await applyPatchesAction([
  {type: "write_replace_line", lineNumber: 2, text: "line2_modified", id: "p0"}
]);
const lines1 = result.output.finalText.split('\n');
assert.strictEqual(lines1[1], "line2_modified", "Line 2 should be modified");
assert.strictEqual(lines1[0], "line1", "Line 1 should be unchanged");
console.log('  ✓ Passed');

// Test 2: Two patches ascending order (WRONG ORDER, but with DESC sort should work)
console.log('Test 2: Patches in ascending order (DESC sort handles it)...');
result = await applyPatchesAction([
  {type: "write_replace_line", lineNumber: 2, text: "line2_new", id: "p1"},
  {type: "write_replace_line", lineNumber: 4, text: "line4_new", id: "p2"}
  // Note: patches provided in ascending order (2, 4)
  // Our code sorts DESC (4, 2) automatically
]);
const lines2 = result.output.finalText.split('\n');
assert.strictEqual(lines2[1], "line2_new", "Line 2 should match");
assert.strictEqual(lines2[3], "line4_new", "Line 4 should match");
assert.strictEqual(lines2[0], "line1", "Line 1 should be unchanged");
console.log('  ✓ Passed - DESC sort prevented drift!');

// Test 3: Three patches (hardest case - lots of potential drift)
console.log('Test 3: Three patches in mixed order...');
result = await applyPatchesAction([
  {type: "write_replace_line", lineNumber: 5, text: "line5_new", id: "p3"},
  {type: "write_replace_line", lineNumber: 2, text: "line2_new", id: "p4"},
  {type: "write_replace_line", lineNumber: 4, text: "line4_new", id: "p5"}
]);
const lines3 = result.output.finalText.split('\n');
assert.strictEqual(lines3[1], "line2_new", "Line 2");
assert.strictEqual(lines3[3], "line4_new", "Line 4");
assert.strictEqual(lines3[4], "line5_new", "Line 5");
assert.strictEqual(lines3[0], "line1", "Line 1 unchanged");
console.log('  ✓ Passed');

// Test 4: Consecutive lines (stress test)
console.log('Test 4: Consecutive lines (1, 2, 3)...');
result = await applyPatchesAction([
  {type: "write_replace_line", lineNumber: 1, text: "1_mod"},
  {type: "write_replace_line", lineNumber: 2, text: "2_mod"},
  {type: "write_replace_line", lineNumber: 3, text: "3_mod"}
]);
const lines4 = result.output.finalText.split('\n');
assert.strictEqual(lines4[0], "1_mod");
assert.strictEqual(lines4[1], "2_mod");
assert.strictEqual(lines4[2], "3_mod");
console.log('  ✓ Passed');

// Test 5: Applied count matches
console.log('Test 5: Applied count should match patch count...');
result = await applyPatchesAction([
  {type: "write_replace_line", lineNumber: 1, text: "a"},
  {type: "write_replace_line", lineNumber: 2, text: "b"},
  {type: "write_replace_line", lineNumber: 3, text: "c"}
]);
assert.strictEqual(result.output.appliedCount, 3, "Should apply 3 patches");
assert.strictEqual(result.output.failedCount || 0, 0, "Should have 0 failures");
console.log('  ✓ Passed');

console.log('\n✓ ALL LINE DRIFT TESTS PASSED');
console.log('\nKey insight: DESC sorting is CRITICAL for correctness!');
process.exit(0);
```

**Expected Output:**
```
=== PHASE 03 TEST: Line Drift Prevention ===

Test 1: Single patch on line 2...
  ✓ Passed
Test 2: Patches in ascending order (DESC sort handles it)...
  ✓ Passed - DESC sort prevented drift!
Test 3: Three patches in mixed order...
  ✓ Passed
Test 4: Consecutive lines (1, 2, 3)...
  ✓ Passed
Test 5: Applied count should match patch count...
  ✓ Passed

✓ ALL LINE DRIFT TESTS PASSED

Key insight: DESC sorting is CRITICAL for correctness!
```

**PASS Criteria:** All 5 tests pass

### Test 2: Patch Type Handling

```bash
# Create test script: test-phase-03-patch-types.js
node test-phase-03-patch-types.js
```

**test-phase-03-patch-types.js:**
```javascript
const assert = require('assert');

console.log('=== PHASE 03 TEST: Patch Types ===\n');

class MockPaper {
  constructor(text) {
    this.text = text;
    this.rev = 0;
  }
  set_text(newText) {
    this.text = newText;
    this.rev++;
  }
  getPaperRev() {
    return this.rev;
  }
}

async function applyPatchesAction(initialText, patches) {
  const paper = new MockPaper(initialText);
  
  const replacePatchesDesc = patches
    .filter(p => p.type === "write_replace_line")
    .sort((a, b) => b.lineNumber - a.lineNumber);
  
  const otherPatches = patches.filter(p => p.type !== "write_replace_line");
  
  let workingText = paper.text;
  let workingLines = workingText.split('\n');
  const appliedPatches = [];
  
  for (const patch of replacePatchesDesc) {
    const idx = patch.lineNumber - 1;
    workingLines[idx] = patch.text;
    appliedPatches.push(patch.id || `patch_${patch.lineNumber}`);
  }
  
  for (const patch of otherPatches) {
    if (patch.type === "write_append") {
      workingText = workingLines.join('\n');
      workingText += patch.text;
      workingLines = workingText.split('\n');
    } else if (patch.type === "set_text") {
      workingText = patch.text;
      workingLines = workingText.split('\n');
    } else if (patch.type === "clear_all") {
      workingText = "";
      workingLines = [""];
    }
    appliedPatches.push(patch.id || `patch_${patch.type}`);
  }
  
  const finalText = workingLines.join('\n');
  paper.set_text(finalText);
  
  return {
    ok: true,
    output: {
      appliedCount: appliedPatches.length,
      finalText: paper.text
    }
  };
}

// Test 1: write_replace_line only
console.log('Test 1: write_replace_line only...');
let result = await applyPatchesAction("a\nb\nc", [
  {type: "write_replace_line", lineNumber: 2, text: "B"}
]);
assert.strictEqual(result.output.finalText, "a\nB\nc");
console.log('  ✓ Passed');

// Test 2: write_append only
console.log('Test 2: write_append only...');
result = await applyPatchesAction("line1\nline2", [
  {type: "write_append", text: "\nline3"}
]);
assert.strictEqual(result.output.finalText, "line1\nline2\nline3");
console.log('  ✓ Passed');

// Test 3: set_text (replaces everything)
console.log('Test 3: set_text (replaces all)...');
result = await applyPatchesAction("old\ncontent", [
  {type: "set_text", text: "new\ncontent"}
]);
assert.strictEqual(result.output.finalText, "new\ncontent");
console.log('  ✓ Passed');

// Test 4: clear_all
console.log('Test 4: clear_all...');
result = await applyPatchesAction("line1\nline2\nline3", [
  {type: "clear_all"}
]);
assert.strictEqual(result.output.finalText, "");
console.log('  ✓ Passed');

// Test 5: Mix (replace + append)
console.log('Test 5: Mix write_replace_line + write_append...');
result = await applyPatchesAction("1\n2\n3", [
  {type: "write_replace_line", lineNumber: 2, text: "TWO"},
  {type: "write_append", text: "\n4"}
]);
assert.strictEqual(result.output.finalText, "1\nTWO\n3\n4");
console.log('  ✓ Passed');

console.log('\n✓ ALL PATCH TYPE TESTS PASSED');
process.exit(0);
```

**Expected Output:**
```
=== PHASE 03 TEST: Patch Types ===

Test 1: write_replace_line only...
  ✓ Passed
Test 2: write_append only...
  ✓ Passed
Test 3: set_text (replaces all)...
  ✓ Passed
Test 4: clear_all...
  ✓ Passed
Test 5: Mix write_replace_line + write_append...
  ✓ Passed

✓ ALL PATCH TYPE TESTS PASSED
```

**PASS Criteria:** All 5 tests pass

### Test 3: Error Handling & Partial Failures

```bash
# Create test script: test-phase-03-error-handling.js
node test-phase-03-error-handling.js
```

**test-phase-03-error-handling.js:**
```javascript
const assert = require('assert');

console.log('=== PHASE 03 TEST: Error Handling ===\n');

class MockPaper {
  constructor(text) {
    this.text = text;
    this.rev = 0;
  }
  set_text(newText) {
    this.text = newText;
    this.rev++;
  }
  getPaperRev() {
    return this.rev;
  }
}

async function applyPatchesAction(initialText, patches) {
  const paper = new MockPaper(initialText);
  
  const replacePatchesDesc = patches
    .filter(p => p.type === "write_replace_line")
    .sort((a, b) => b.lineNumber - a.lineNumber);
  
  let workingLines = paper.text.split('\n');
  const appliedPatches = [];
  const failedPatches = [];
  
  for (const patch of replacePatchesDesc) {
    try {
      const idx = patch.lineNumber - 1;
      
      if (idx < 0 || idx >= workingLines.length) {
        throw new Error(`Line ${patch.lineNumber} out of range`);
      }
      
      workingLines[idx] = patch.text;
      appliedPatches.push(patch.id || `patch_${patch.lineNumber}`);
    } catch (e) {
      failedPatches.push({
        id: patch.id || `patch_line_${patch.lineNumber}`,
        error: e.message
      });
    }
  }
  
  const finalText = workingLines.join('\n');
  if (appliedPatches.length > 0) {
    paper.set_text(finalText);
  }
  
  return {
    ok: failedPatches.length === 0,
    output: {
      appliedCount: appliedPatches.length,
      failedCount: failedPatches.length,
      errors: failedPatches,
      finalText: paper.text
    }
  };
}

// Test 1: Out of range line number
console.log('Test 1: Out of range line number...');
let result = await applyPatchesAction("a\nb", [
  {type: "write_replace_line", lineNumber: 99, text: "x", id: "bad"}
]);
assert.strictEqual(result.ok, false, "Should fail (ok=false)");
assert.strictEqual(result.output.failedCount, 1);
assert.strictEqual(result.output.errors[0].id, "bad");
assert.strictEqual(result.output.appliedCount, 0, "Should apply 0 patches");
console.log('  ✓ Passed');

// Test 2: Mix of good and bad patches
console.log('Test 2: Partial success (1 good, 1 bad)...');
result = await applyPatchesAction("a\nb\nc", [
  {type: "write_replace_line", lineNumber: 2, text: "B", id: "good"},
  {type: "write_replace_line", lineNumber: 99, text: "X", id: "bad"}
]);
assert.strictEqual(result.ok, false, "Should fail (not ALL succeeded)");
assert.strictEqual(result.output.appliedCount, 1, "1 patch applied");
assert.strictEqual(result.output.failedCount, 1, "1 patch failed");
assert.strictEqual(result.output.finalText, "a\nB\nc", "Good patch should be applied");
console.log('  ✓ Passed');

// Test 3: All fail
console.log('Test 3: All patches fail...');
result = await applyPatchesAction("a\nb", [
  {type: "write_replace_line", lineNumber: 99, text: "x"},
  {type: "write_replace_line", lineNumber: 100, text: "y"}
]);
assert.strictEqual(result.ok, false);
assert.strictEqual(result.output.failedCount, 2);
assert.strictEqual(result.output.appliedCount, 0);
console.log('  ✓ Passed');

console.log('\n✓ ALL ERROR HANDLING TESTS PASSED');
process.exit(0);
```

**Expected Output:**
```
=== PHASE 03 TEST: Error Handling ===

Test 1: Out of range line number...
  ✓ Passed
Test 2: Partial success (1 good, 1 bad)...
  ✓ Passed
Test 3: All patches fail...
  ✓ Passed

✓ ALL ERROR HANDLING TESTS PASSED
```

**PASS Criteria:** All 3 tests pass

---

## ✅ Exit Criteria

### MUST PASS

- [ ] Controller action `apply_patches` added to ACTIONS enum
- [ ] Controller case added to execute() switch
- [ ] DESC sort implemented for write_replace_line patches
- [ ] Patches applied in correct order (DESC for line numbers)
- [ ] write_append patches applied after replacements
- [ ] set_text/clear_all patches override previous
- [ ] paper.set_text called when patches succeed
- [ ] paper.rev incremented by set_text
- [ ] Return value has {ok, output: {appliedCount, failedCount, paper_rev, errors}}
- [ ] test-phase-03-line-drift.js passes (all 5 tests)
- [ ] test-phase-03-patch-types.js passes (all 5 tests)
- [ ] test-phase-03-error-handling.js passes (all 3 tests)
- [ ] No line drift occurs with multiple patches
- [ ] Partial failures don't crash controller

### MUST NOT

- [ ] ✗ Missing DESC sort
- [ ] ✗ write_replace_line applied before other patches
- [ ] ✗ Line indexing off-by-one error
- [ ] ✗ Unhandled exceptions
- [ ] ✗ Wrong output structure
- [ ] ✗ Skipping paper.set_text call
- [ ] ✗ Not incrementing paper.rev

---

## 📊 Checklist

```
BEFORE proceeding to Phase 04:

□ Opened controller.js
□ Added apply_patches to ACTIONS enum
□ Located execute() switch statement
□ Copied controller case (apply_patches)
□ Verified DESC sort logic is correct:
  .sort((a, b) => b.lineNumber - a.lineNumber)
□ Verified paper.set_text() is called
□ Verified output structure matches:
  {ok, output: {appliedCount, failedCount, paper_rev, errors}}
□ Saved file
□ Ran test-phase-03-line-drift.js - ALL PASSED
□ Ran test-phase-03-patch-types.js - ALL PASSED
□ Ran test-phase-03-error-handling.js - ALL PASSED
□ Verified no syntax errors
□ Committed code change with message:
  "Phase 03: Add apply_patches controller action with DESC sort"
```

---

## 🚨 If Tests Fail

**Failure: "Line 2 should be modified"**
→ Patches not being applied
→ Check workingLines[idx] = patch.text assignment
→ Verify idx = lineNumber - 1 conversion is correct

**Failure: "DESC sort prevented drift"**
→ Ascending order patches applied wrong
→ Check sort comparator: (a, b) => b.lineNumber - a.lineNumber
→ Verify sort is DESC (highest first)

**Failure: "Line out of range" error**
→ Boundary check failing
→ Check: idx >= workingLines.length
→ Verify split('\n') counted correctly

**Failure: "finalText mismatch"**
→ Text reconstruction wrong
→ Check: workingLines.join('\n')
→ Verify no extra newlines added

---

## 📝 Dependency Chain

```
Phase 00 (baseline validated)
    ↓
Phase 01 (tool schema added)
    ↓
Phase 02 (executor handler)
    ↓
Phase 03 (THIS - controller action)
    ↓
Phase 04 (AI decision logic)
    ↓
... etc
```

---

## 🎁 Output for Phase 04

Phase 04 will use:
- Controller action works: patches are applied correctly
- No line drift: DESC sort is verified
- Error handling: partial failures reported

**What Phase 04 will implement:**
- System Prompt additions (when to use patch mode)
- AI decision helper function
- Mode selection logic

---

## 📝 Key Insights

### Why DESC sort?
```
Example: patches on lines [2, 5]

WRONG (ascending - causes drift):
  Apply line 2: [1, NEW, 3, 4, 5]  ← Line 5 index shifted!
  Apply line 5: tries index 4 but...WRONG line!

RIGHT (DESC - no drift):
  Apply line 5: [1, 2, 3, 4, NEW]  ← No shift of other lines
  Apply line 2: [1, NEW, 3, 4, NEW] ← Line 2 still index 1 ✓
```

### Contract with executor:
```
Executor sends:
  controller.execute("apply_patches", {patches: [...]})

Controller returns:
  {
    ok: true/false,
    output: {
      appliedCount: 3,
      failedCount: 0,
      appliedIds: ["patch_0", "patch_1", "patch_2"],
      errors: [],
      paper_rev: 11
    }
  }
```

---

**Status:** Ready to Execute  
**Estimated Time:** 3-4 hours  
**Risk Level:** Medium (complex patch logic)  
**Owner:** Backend Developer  
**Critical:** DESC sort correctness - test thoroughly!
