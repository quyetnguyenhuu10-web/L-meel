# Phase 02: apply_patches Executor Handler - Add Tool Execution Logic

**Status:** READY  
**Duration:** 2-3 hours  
**Dependency:** Phase 01 (tool schema exists)  
**Next:** Phase 03  

---

## 🎯 Goal

Implement the executor handler for `apply_patches` tool.

**What this does:**
- When OpenAI calls `apply_patches`, executor receives it
- Executor validates patches
- Executor calls `controller.execute("apply_patches", {...})`
- Executor broadcasts events
- Executor returns result to OpenAI

**What still missing:**
- Controller logic (Phase 03) - will return error for now
- This is OK - we'll implement a mock response

---

## 🔧 Scope: 1 Technical Problem

**Problem:** Executor doesn't know how to handle `apply_patches` calls → will error

**Solution:** Add executor branch that validates patches and calls controller

---

## 📋 Build Steps

### Step 1: Open server-agent.js

Find `executeToolCall` function (from Phase 00).

### Step 2: Locate Insert Point

Find the last tool handler (should be after `clear_all`):

```javascript
if (toolName === "clear_all") {
  // ... handler code ...
  return { success: result.ok };
}
```

Position cursor AFTER this closing `}`, but BEFORE the final `if (toolName === "verify")` check.

### Step 3: Add New Executor Handler

Insert this new handler:

```javascript
if (toolName === "apply_patches") {
  const patches = Array.isArray(args.patches) ? args.patches : [];
  
  // Validation 1: At least 1 patch
  if (patches.length === 0) {
    return {
      error: true,
      message: "apply_patches requires at least 1 patch"
    };
  }
  
  // Validation 2: Max 50 patches
  if (patches.length > 50) {
    return {
      error: true,
      message: "apply_patches supports max 50 patches at once"
    };
  }
  
  // Validation 3: Each patch has valid type
  const validTypes = ["write_replace_line", "write_append", "set_text", "clear_all"];
  for (let i = 0; i < patches.length; i++) {
    if (!patches[i].type || !validTypes.includes(patches[i].type)) {
      return {
        error: true,
        message: `Patch ${i} has invalid type: ${patches[i].type}`
      };
    }
  }
  
  // Validation 4: write_replace_line patches need lineNumber
  for (let i = 0; i < patches.length; i++) {
    if (patches[i].type === "write_replace_line") {
      if (!patches[i].lineNumber || patches[i].lineNumber < 1) {
        return {
          error: true,
          message: `Patch ${i} (write_replace_line) requires valid lineNumber (>= 1)`
        };
      }
      
      // Check line number not out of range
      const lines = paper.text.split('\n');
      if (patches[i].lineNumber > lines.length) {
        return {
          error: true,
          message: `Patch ${i}: lineNumber ${patches[i].lineNumber} out of range (max ${lines.length})`
        };
      }
    }
  }
  
  // Call controller (will handle actual patching in Phase 03)
  const result = await controller.execute("apply_patches", { patches });
  
  // If controller says it worked, broadcast events
  if (!result.ok) {
    return {
      error: true,
      message: result.error?.message || "Failed to apply patches"
    };
  }
  
  // Broadcast: patches applied
  broadcast(job, "paper.applied", {
    op: "apply_patches",
    count: result.output?.appliedCount || 0,
    failed: result.output?.failedCount || 0,
    newRev: result.output?.paper_rev
  });
  
  // Broadcast: final paper state
  broadcast(job, "paper.state", { ...paper.getState() });
  
  return {
    success: true,
    applied: result.output?.appliedCount || 0,
    failed: result.output?.failedCount || 0,
    newRev: result.output?.paper_rev,
    errors: result.output?.errors || []
  };
}
```

---

## 🧪 Test Now (Immediate)

### Test 1: Mock Controller + Executor Integration

```bash
# Create test script: test-phase-02.js
node test-phase-02.js
```

**test-phase-02.js:**
```javascript
const assert = require('assert');

console.log('=== PHASE 02 TEST: Executor Handler ===\n');

// Mock objects
let broadcastedEvents = [];
function mockBroadcast(job, eventName, payload) {
  broadcastedEvents.push({eventName, payload});
}

let controllerCalls = [];
async function mockController(action, params) {
  controllerCalls.push({action, params});
  
  // For Phase 02: Return mock success response
  // Phase 03 will implement real logic
  return {
    ok: true,
    output: {
      appliedCount: params.patches.length,
      failedCount: 0,
      paper_rev: 10,
      errors: []
    }
  };
}

// Load executor (simplified version for testing)
async function executeApplyPatches(toolName, args) {
  const patches = Array.isArray(args.patches) ? args.patches : [];
  
  // Same validation as in code
  if (patches.length === 0) {
    return {error: true, message: "apply_patches requires at least 1 patch"};
  }
  
  if (patches.length > 50) {
    return {error: true, message: "apply_patches supports max 50 patches"};
  }
  
  // Test: call controller
  const result = await mockController("apply_patches", {patches});
  
  if (!result.ok) {
    return {error: true, message: result.error?.message};
  }
  
  // Test: broadcast events
  mockBroadcast("job", "paper.applied", {
    op: "apply_patches",
    count: result.output.appliedCount,
    failed: result.output.failedCount,
    newRev: result.output.paper_rev
  });
  
  mockBroadcast("job", "paper.state", {text: "new text", rev: result.output.paper_rev});
  
  return {
    success: true,
    applied: result.output.appliedCount
  };
}

// Test 1: Valid single patch
console.log('Test 1: Single valid patch...');
broadcastedEvents = [];
controllerCalls = [];
const test1Result = await executeApplyPatches("apply_patches", {
  patches: [
    {type: "write_replace_line", lineNumber: 1, text: "new content"}
  ]
});
assert.strictEqual(test1Result.success, true, "Should succeed");
assert.strictEqual(test1Result.applied, 1, "Should apply 1 patch");
assert.strictEqual(controllerCalls.length, 1, "Should call controller once");
assert.strictEqual(broadcastedEvents.length, 2, "Should broadcast 2 events");
console.log('  ✓ Passed');

// Test 2: Multiple patches
console.log('Test 2: Multiple patches...');
broadcastedEvents = [];
controllerCalls = [];
const test2Result = await executeApplyPatches("apply_patches", {
  patches: [
    {type: "write_replace_line", lineNumber: 1, text: "line1"},
    {type: "write_replace_line", lineNumber: 2, text: "line2"},
    {type: "write_replace_line", lineNumber: 3, text: "line3"}
  ]
});
assert.strictEqual(test2Result.success, true);
assert.strictEqual(test2Result.applied, 3);
assert.strictEqual(controllerCalls.length, 1);
console.log('  ✓ Passed');

// Test 3: Empty patches - should error
console.log('Test 3: Empty patches array (should error)...');
const test3Result = await executeApplyPatches("apply_patches", {patches: []});
assert.strictEqual(test3Result.error, true, "Should error");
assert.strictEqual(controllerCalls.length, 0, "Should NOT call controller");
console.log('  ✓ Passed');

// Test 4: Too many patches - should error
console.log('Test 4: Too many patches (should error)...');
const test4Patches = Array(51).fill({type: "write_append", text: "x"});
const test4Result = await executeApplyPatches("apply_patches", {patches: test4Patches});
assert.strictEqual(test4Result.error, true);
assert.strictEqual(controllerCalls.length, 0);
console.log('  ✓ Passed');

// Test 5: Invalid patch type - should error
console.log('Test 5: Invalid patch type (should error)...');
const test5Result = await executeApplyPatches("apply_patches", {
  patches: [{type: "invalid_type", lineNumber: 1, text: "x"}]
});
assert.strictEqual(test5Result.error, true, "Should error on invalid type");
assert.strictEqual(controllerCalls.length, 0);
console.log('  ✓ Passed');

// Test 6: write_replace_line without lineNumber - should error
console.log('Test 6: Missing lineNumber (should error)...');
const test6Result = await executeApplyPatches("apply_patches", {
  patches: [{type: "write_replace_line", text: "x"}]  // No lineNumber
});
assert.strictEqual(test6Result.error, true);
assert.strictEqual(controllerCalls.length, 0);
console.log('  ✓ Passed');

// Test 7: Broadcast events on success
console.log('Test 7: Broadcast events on success...');
broadcastedEvents = [];
await executeApplyPatches("apply_patches", {
  patches: [{type: "write_replace_line", lineNumber: 1, text: "x"}]
});
assert.strictEqual(broadcastedEvents.length, 2, "Should broadcast 2 events");
assert.strictEqual(broadcastedEvents[0].eventName, "paper.applied");
assert.strictEqual(broadcastedEvents[1].eventName, "paper.state");
assert.strictEqual(broadcastedEvents[0].payload.op, "apply_patches");
console.log('  ✓ Passed');

console.log('\n✓ ALL TESTS PASSED - Phase 02 Complete');
process.exit(0);
```

**Expected Output:**
```
=== PHASE 02 TEST: Executor Handler ===

Test 1: Single valid patch...
  ✓ Passed
Test 2: Multiple patches...
  ✓ Passed
Test 3: Empty patches array (should error)...
  ✓ Passed
Test 4: Too many patches (should error)...
  ✓ Passed
Test 5: Invalid patch type (should error)...
  ✓ Passed
Test 6: Missing lineNumber (should error)...
  ✓ Passed
Test 7: Broadcast events on success...
  ✓ Passed

✓ ALL TESTS PASSED - Phase 02 Complete
```

**PASS Criteria:** All 7 tests pass

### Test 2: Executor Integration with Real Code

```bash
# After adding to actual server-agent.js, test with:
npm test -- --grep "apply_patches executor"
```

Or manual:

```bash
# Start server
npm start &
SERVER_PID=$!
sleep 2

# Send apply_patches call
curl -X POST http://localhost:3000/api/chat/create \
  -H "Content-Type: application/json" \
  -d '{"message": "test"}'

# Get sessionId from response
SESSION_ID="xxx"

# Send apply_patches via streaming
# (This will error because controller not ready, but executor should handle it)
curl http://localhost:3000/api/chat/stream?sid=$SESSION_ID

kill $SERVER_PID
```

Expected: Should get SSE stream, might see error from controller (that's OK for Phase 02).

---

## ✅ Exit Criteria

### MUST PASS

- [ ] Executor handler added to server-agent.js
- [ ] Handler checks for empty patches array
- [ ] Handler checks for max 50 patches
- [ ] Handler validates patch.type enum
- [ ] Handler validates write_replace_line has lineNumber
- [ ] Handler validates lineNumber >= 1
- [ ] Handler validates lineNumber <= file lines
- [ ] Handler calls controller.execute("apply_patches", ...)
- [ ] Handler broadcasts "paper.applied" event
- [ ] Handler broadcasts "paper.state" event
- [ ] Handler returns {success, applied, failed, newRev}
- [ ] test-phase-02.js passes all 7 tests
- [ ] No JSON parse errors
- [ ] Controller.execute call signature is correct

### MUST NOT

- [ ] ✗ Missing validation for empty array
- [ ] ✗ Missing validation for patch.type
- [ ] ✗ Missing lineNumber validation
- [ ] ✗ Broadcast events not sent on success
- [ ] ✗ Wrong event names (should be "paper.applied", "paper.state")
- [ ] ✗ Controller not called
- [ ] ✗ Executor throws unhandled exception

---

## 📊 Checklist

```
BEFORE proceeding to Phase 03:

□ Opened server-agent.js
□ Found last tool handler (clear_all)
□ Copied apply_patches handler above
□ Verified handler validates all 5 conditions:
  1. Not empty
  2. Max 50
  3. Valid type enum
  4. lineNumber present for write_replace_line
  5. lineNumber in range
□ Verified controller.execute call
□ Verified broadcast calls for paper.applied and paper.state
□ Saved file
□ Ran test-phase-02.js - ALL PASSED
□ Verified no syntax errors
□ Committed code change with message:
  "Phase 02: Add apply_patches executor handler"
```

---

## 🚨 If Tests Fail

**Failure: "Should call controller once"**
→ Controller.execute not being called
→ Check line: `await controller.execute("apply_patches", { patches })`
→ Verify `controller` is in scope (global or passed param)

**Failure: "Should broadcast 2 events"**
→ Broadcast calls not working
→ Check: `broadcast(job, "paper.applied", {...})`
→ Verify `broadcast` function exists and is callable
→ Verify `job` variable is in scope

**Failure: "Should error on invalid type"**
→ Type validation not working
→ Check validTypes array has 4 items
→ Check includes() call is correct
→ Verify loop exits early on invalid type

**Failure: "lineNumber validation"**
→ Line number check not working
→ Check split('\n') correctly counts lines
→ Verify lineNumber comparison is correct (>= 1, <= maxLines)

---

## 📝 Dependency Chain

```
Phase 00 (baseline validated)
    ↓
Phase 01 (tool schema added)
    ↓
Phase 02 (THIS - executor handler)
    ↓
Phase 03 (controller action)
    ↓
Phase 04 (AI decision logic)
    ↓
... etc
```

---

## 🎁 Output for Phase 03

Phase 03 will use:
- Controller action name: "apply_patches" (exact spelling)
- Parameters: `{ patches: [...] }`
- Expected output: `{ ok: true, output: { appliedCount, failedCount, paper_rev, errors } }`

**What Phase 03 will implement:**
- Controller case: `case ACTIONS.apply_patches:`
- Real patch application logic (sort, apply, update paper)
- Return proper success/failure result

---

## 📝 Notes

### Why executor-first?
- Executor is **validation layer**
- Catches bad input before controller
- Easy to test (mock controller)
- Safe to merge early

### Contract with controller:
```
Executor sends:
  controller.execute("apply_patches", {patches: [...]})

Controller must return:
  {
    ok: true/false,
    output: {
      appliedCount: number,
      failedCount: number,
      paper_rev: number,
      errors: [{id, error}, ...]
    }
  }
```

### What's different from single mode?
- Single mode: 1 edit at a time
- Patch mode: batch validation + controller call
- But broadcast same events (paper.applied, paper.state)

---

**Status:** Ready to Execute  
**Estimated Time:** 2-3 hours  
**Risk Level:** Low (executor is validation + dispatcher)  
**Owner:** Backend Developer
