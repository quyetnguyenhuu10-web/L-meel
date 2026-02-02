# Phase 00: Baseline Validation - Confirm Single Mode Works

**Status:** MUST COMPLETE BEFORE ANYTHING ELSE  
**Duration:** 2-3 hours  
**Dependency:** None (baseline)  
**Next:** Phase 01

---

## 🎯 Goal

Verify the current Sequential Single Mode system is working end-to-end:
- Tools are callable
- Executor processes them correctly
- Controller dispatches actions
- Broadcast events flow to client
- No silent failures

**Why:** If baseline is broken, all downstream phases will fail. Better to know now.

---

## 🔧 Scope: 2 Technical Problems

1. **Problem 1:** Does the tool call pipeline work? (tool → executor → controller → handler)
2. **Problem 2:** Are broadcast events reaching the client correctly?

---

## 📋 Build Steps

### Step 1: Identify Current Tool Entry Point
```bash
# Find where TOOLS array is defined
grep -r "name: \"search_paper\"" . --include="*.js"
# Expected: aiClient-agent.js or similar
```

### Step 2: Identify Executor Entry Point
```bash
# Find where executeToolCall is defined
grep -r "executeToolCall" . --include="*.js"
# Expected: server-agent.js
```

### Step 3: Identify Controller Entry Point
```bash
# Find where controller.execute is called
grep -r "controller\.execute" . --include="*.js"
# Expected: server-agent.js calls it
```

### Step 4: Identify Broadcast Entry Point
```bash
# Find where broadcast function is used
grep -r "broadcast(job" . --include="*.js"
# Expected: server-agent.js or handlers
```

### Step 5: Document Current Architecture
Create file `BASELINE_ARCHITECTURE.md` locally:
```markdown
## Current Architecture Map

### Tools Definition
File: [__FILE__]
Line: [__LINE__]
Export: TOOLS = [...]

### Executor
File: [__FILE__]
Function: executeToolCall(toolName, args)
Location: [__LINE__]

### Controller
File: [__FILE__]
Method: execute(action, params)
Location: [__LINE__]

### Broadcast
File: [__FILE__]
Function: broadcast(job, eventName, payload)
Location: [__LINE__]
```

---

## 🧪 Test Now (Immediate)

### Test 1A: Verify Tool Schema is Valid JSON

```bash
# Extract TOOLS array and validate
node -e "
const tools = [/* TOOLS array from code */];
console.log('Tool count:', tools.length);
tools.forEach((t, i) => {
  console.log(\`  \${i}: \${t.name} ✓\`);
});
"
```

**Expected Output:**
```
Tool count: 14
  0: search_paper ✓
  1: search_chat ✓
  ...
  13: verify ✓
```

**PASS Criteria:** All 14 tools listed, no JSON parse errors

### Test 1B: Simulate Tool Call → Executor → Controller

```bash
# Create test script: test-baseline-single-mode.js
node test-baseline-single-mode.js << 'EOF'
{
  "action": "search_paper",
  "args": {"query": "test", "limit": 5}
}
EOF
```

**test-baseline-single-mode.js:**
```javascript
// Load modules
const fs = require('fs');
const path = require('path');

// Simulate tool call
async function testToolCall() {
  console.log('=== BASELINE TEST: Single Mode ===');
  
  // Step 1: Tool exists
  const toolName = "search_paper";
  const toolExists = TOOLS.some(t => t.name === toolName);
  console.log(`✓ Tool '${toolName}' exists:`, toolExists);
  
  if (!toolExists) {
    console.error('✗ FAIL: Tool not found');
    process.exit(1);
  }
  
  // Step 2: Executor accepts tool
  console.log(`✓ Calling executor with '${toolName}'...`);
  const args = { query: "test", limit: 5 };
  
  try {
    const result = await executeToolCall(toolName, args);
    console.log('✓ Executor returned:', result);
  } catch (e) {
    console.error('✗ FAIL: Executor error:', e.message);
    process.exit(1);
  }
  
  // Step 3: Controller action exists
  console.log('✓ Checking controller action...');
  const actionExists = ACTIONS.search_paper !== undefined;
  console.log('✓ Controller action exists:', actionExists);
  
  if (!actionExists) {
    console.error('✗ FAIL: Controller action not found');
    process.exit(1);
  }
  
  console.log('\n✓ ALL BASELINE TESTS PASSED');
  process.exit(0);
}

testToolCall().catch(e => {
  console.error('✗ FAIL:', e);
  process.exit(1);
});
```

**Expected Output:**
```
=== BASELINE TEST: Single Mode ===
✓ Tool 'search_paper' exists: true
✓ Calling executor with 'search_paper'...
✓ Executor returned: {success: true, matches: 5}
✓ Checking controller action...
✓ Controller action exists: true

✓ ALL BASELINE TESTS PASSED
```

**PASS Criteria:** All 4 checks pass, no exceptions

### Test 1C: Verify Broadcast Events Exist

```bash
# Check broadcast function signature
grep -A 5 "function broadcast" . --include="*.js" -r
```

**Expected:**
```javascript
function broadcast(job, eventName, payload) {
  // ... sends SSE event
}
```

**Test Code:**
```javascript
// Simulate broadcast
const events = [];
function mockBroadcast(job, eventName, payload) {
  events.push({eventName, payload});
  console.log(`✓ Broadcast: ${eventName}`);
}

// Call executor with mock broadcast
const result = await executeToolCall("search_paper", {query: "test"});

// Check events were fired
console.log(`✓ Events fired: ${events.length}`);
events.forEach(e => console.log(`  - ${e.eventName}`));
```

**Expected Events:**
```
✓ Events fired: 2
  - agent.thought
  - search.result
```

**PASS Criteria:** At least 2 broadcast events (thought + result)

---

## ✅ Exit Criteria

### MUST PASS (Hard Requirements)

- [ ] All 14 tools can be listed from TOOLS array
- [ ] search_paper tool schema is valid JSON
- [ ] Executor function exists and accepts (toolName, args)
- [ ] Controller.execute() exists and maps tool → action
- [ ] Broadcast function exists and can fire events
- [ ] Manual test: curl POST /api/chat/create → returns sessionId
- [ ] Manual test: curl GET /api/chat/stream?sid=xxx → receives SSE events

### MUST NOT (Failure Conditions)

- [ ] ✗ Parse errors in tool definitions
- [ ] ✗ Executor throws unhandled exception
- [ ] ✗ Controller action missing for any tool
- [ ] ✗ Broadcast not sending events
- [ ] ✗ API endpoint unreachable

---

## 📊 Checklist

```
BEFORE proceeding to Phase 01:

□ Located TOOLS array in codebase
□ Located executeToolCall function
□ Located controller.execute method
□ Located broadcast function
□ Created BASELINE_ARCHITECTURE.md
□ Ran test-baseline-single-mode.js - PASSED
□ Tested broadcast events manually - working
□ Curl test /api/chat/create - working
□ Curl test /api/chat/stream - receiving SSE events
□ No errors in system logs
□ Documented any deviations in README
```

---

## 🚨 If Tests Fail

**Failure: Tool not found in TOOLS array**
→ Check aiClient-agent.js has all 14 tools exported

**Failure: Executor throws error**
→ Check executeToolCall is properly bound with `this` context

**Failure: Controller.execute undefined**
→ Check controller.js has execute method

**Failure: Broadcast not working**
→ Check SSE headers in response (Content-Type: text/event-stream)

**Troubleshooting:**
1. Run `npm install` to ensure dependencies
2. Run `npm test` (if test suite exists)
3. Check NODE_ENV=development for debug logging
4. Search git history for recent changes to core files

---

## 📝 Dependency Chain

```
Phase 00 (THIS)
    ↓
Phase 01 (apply_patches tool schema)
    ↓
Phase 02 (apply_patches controller handler)
    ↓
... etc
```

**This phase must complete with ZERO issues before Phase 01 starts.**

---

## 📝 Output for Next Phase

Phase 01 will use:
- TOOLS array reference (where to add apply_patches)
- Executor signature (executeToolCall pattern)
- Controller action mapping (how to register apply_patches action)
- Broadcast mechanism (how to send paper.applied events)

**Documentation produced:**
- BASELINE_ARCHITECTURE.md (file locations + function signatures)

---

**Status:** Ready to Execute  
**Estimated Time:** 2-3 hours  
**Risk Level:** Low (read-only validation)  
**Owner:** QA Engineer
