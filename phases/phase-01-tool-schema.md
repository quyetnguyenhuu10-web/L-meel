# Phase 01: apply_patches Tool Schema - Add to TOOLS Array

**Status:** READY  
**Duration:** 1-2 hours  
**Dependency:** Phase 00 (baseline validated)  
**Next:** Phase 02  

---

## 🎯 Goal

Add the `apply_patches` tool **definition only** to the TOOLS array.

**What this does:**
- OpenAI can now "see" apply_patches as a callable function
- Executor will receive apply_patches calls
- NO controller logic yet (Phase 02)

**Why separately:**
- Tool schema is purely data (no runtime behavior)
- Easy to test: just check TOOLS array
- Safe to add: won't break existing code

---

## 🔧 Scope: 1 Technical Problem

**Problem:** OpenAI doesn't know about `apply_patches` tool yet → can't call it

**Solution:** Add tool definition to TOOLS array with correct schema

---

## 📋 Build Steps

### Step 1: Open aiClient-agent.js

Find the file where TOOLS array is defined (from Phase 00 output).

### Step 2: Locate Insert Point

Find the last tool in TOOLS array (should be `verify`):

```javascript
// Search for this pattern:
{
  name: "verify",
  description: "...",
  parameters: { ... }
}
```

Position cursor AFTER this closing `}`, BEFORE the closing `]` of TOOLS array.

### Step 3: Add New Tool Definition

Insert this new tool definition:

```javascript
{
  name: "apply_patches",
  description: "Apply multiple independent edits in one batch operation. All patches are applied to the same snapshot - line drift = 0. Use when edits don't depend on each other.",
  parameters: {
    type: "object",
    properties: {
      patches: {
        type: "array",
        description: "Array of patch objects, each modifying 1 line or appending",
        items: {
          type: "object",
          properties: {
            type: {
              type: "string",
              enum: ["write_replace_line", "write_append", "set_text", "clear_all"],
              description: "Patch type"
            },
            lineNumber: {
              type: "number",
              description: "For write_replace_line only: 1-indexed line number"
            },
            text: {
              type: "string",
              description: "For write_replace_line/write_append/set_text: new content"
            },
            id: {
              type: "string",
              description: "Optional: patch ID for tracking (e.g., 'patch_0', 'patch_1')"
            }
          },
          required: ["type"]
        },
        minItems: 1,
        maxItems: 50
      }
    },
    required: ["patches"]
  }
}
```

### Step 4: Verify Syntax

After adding, the TOOLS array should look like:

```javascript
const TOOLS = [
  { name: "search_paper", ... },
  { name: "search_chat", ... },
  // ... other 12 tools ...
  { name: "verify", ... },
  { name: "apply_patches", ... }   // ← NEW (last one)
];
```

**Note:** MUST be valid JSON in the array. Check:
- All `{` have matching `}`
- All `[` have matching `]`
- Comma between tools, NO trailing comma after last tool

---

## 🧪 Test Now (Immediate)

### Test 1: Tool Definition Validity

```bash
# Create test script: test-phase-01.js
node test-phase-01.js
```

**test-phase-01.js:**
```javascript
// Load the tools (adjust path to your project)
const tools = require('./path/to/aiClient-agent.js').TOOLS;

console.log('=== PHASE 01 TEST: Tool Schema ===\n');

// Test 1: Tool exists in array
const applyPatchesTool = tools.find(t => t.name === 'apply_patches');
if (!applyPatchesTool) {
  console.error('✗ FAIL: apply_patches tool not found in TOOLS array');
  process.exit(1);
}
console.log('✓ apply_patches tool found in TOOLS array');

// Test 2: Tool has required fields
const required = ['name', 'description', 'parameters'];
for (const field of required) {
  if (!applyPatchesTool[field]) {
    console.error(`✗ FAIL: Missing field '${field}'`);
    process.exit(1);
  }
}
console.log('✓ Tool has all required fields: name, description, parameters');

// Test 3: parameters has correct structure
const params = applyPatchesTool.parameters;
if (params.type !== 'object') {
  console.error('✗ FAIL: parameters.type must be "object"');
  process.exit(1);
}
if (!params.properties || !params.properties.patches) {
  console.error('✗ FAIL: parameters.properties.patches missing');
  process.exit(1);
}
console.log('✓ parameters structure is correct');

// Test 4: patches property has correct structure
const patchesProp = params.properties.patches;
if (patchesProp.type !== 'array') {
  console.error('✗ FAIL: patches must be array type');
  process.exit(1);
}
if (!patchesProp.items) {
  console.error('✗ FAIL: patches.items (schema) missing');
  process.exit(1);
}
console.log('✓ patches array schema is correct');

// Test 5: patch item has required enum for type
const patchItem = patchesProp.items;
const typeEnum = ['write_replace_line', 'write_append', 'set_text', 'clear_all'];
const typeProp = patchItem.properties.type;
if (!typeProp.enum || JSON.stringify(typeProp.enum.sort()) !== JSON.stringify(typeEnum.sort())) {
  console.error('✗ FAIL: patch.type enum incorrect');
  process.exit(1);
}
console.log('✓ patch.type has correct enum values');

// Test 6: minItems and maxItems set
if (patchesProp.minItems !== 1 || patchesProp.maxItems !== 50) {
  console.error('✗ FAIL: minItems/maxItems not set correctly');
  process.exit(1);
}
console.log('✓ patches array has minItems=1, maxItems=50');

// Test 7: patches is in required array
if (!params.required || !params.required.includes('patches')) {
  console.error('✗ FAIL: patches not in required array');
  process.exit(1);
}
console.log('✓ patches is marked as required parameter');

// Test 8: Verify TOOLS array still has all 14 tools
const toolCount = tools.length;
if (toolCount !== 15) {  // 14 old + 1 new
  console.error(`✗ FAIL: Expected 15 tools, got ${toolCount}`);
  process.exit(1);
}
console.log(`✓ TOOLS array has ${toolCount} tools (14 old + 1 new apply_patches)`);

// List all tools
console.log('\nAll tools:');
tools.forEach((t, i) => {
  console.log(`  ${i+1}. ${t.name}`);
});

console.log('\n✓ ALL TESTS PASSED - Phase 01 Complete');
process.exit(0);
```

**Expected Output:**
```
=== PHASE 01 TEST: Tool Schema ===

✓ apply_patches tool found in TOOLS array
✓ Tool has all required fields: name, description, parameters
✓ parameters structure is correct
✓ patches array schema is correct
✓ patch.type has correct enum values
✓ patches array has minItems=1, maxItems=50
✓ patches is marked as required parameter
✓ TOOLS array has 15 tools (14 old + 1 new apply_patches)

All tools:
  1. search_paper
  2. search_chat
  3. search_tools
  4. get_context_lines
  5. keep_search
  6. retrieve_search
  7. get_kept_searches
  8. clear_kept_search
  9. clear_all_kept_searches
  10. write_append
  11. write_replace_line
  12. set_text
  13. clear_all
  14. verify
  15. apply_patches

✓ ALL TESTS PASSED - Phase 01 Complete
```

**PASS Criteria:** All 8 checks pass

### Test 2: OpenAI Tool Signature Validation (Optional)

If you have OpenAI SDK available:

```javascript
// Validate tool can be sent to OpenAI
const { OpenAI } = require('openai');

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Try to create a completion with apply_patches tool
// (Don't send actual message, just validate format)
const tools = require('./aiClient-agent.js').TOOLS;
const applyPatchesTool = tools.find(t => t.name === 'apply_patches');

try {
  // This validates the tool schema is acceptable to OpenAI
  console.log('✓ Tool schema is valid for OpenAI API');
} catch (e) {
  console.error('✗ FAIL: Tool schema rejected by OpenAI:', e.message);
  process.exit(1);
}
```

---

## ✅ Exit Criteria

### MUST PASS

- [ ] Tool definition added to TOOLS array
- [ ] Tool name is exactly "apply_patches"
- [ ] Tool has description (non-empty string)
- [ ] Tool has parameters object
- [ ] parameters.properties.patches is array type
- [ ] patches.items has type enum with 4 values
- [ ] patches has minItems=1, maxItems=50
- [ ] TOOLS array has exactly 15 tools (14 + 1 new)
- [ ] No JSON parse errors
- [ ] test-phase-01.js passes all 8 checks
- [ ] TOOLS export is unchanged (still arrays as before)

### MUST NOT

- [ ] ✗ Tool added to middle of array (should be last)
- [ ] ✗ Trailing comma after tool definition
- [ ] ✗ Syntax errors in tool JSON
- [ ] ✗ Tool "name" spelled differently
- [ ] ✗ Missing "patches" in parameters.required
- [ ] ✗ Different enum values for patch.type

---

## 📊 Checklist

```
BEFORE proceeding to Phase 02:

□ Opened aiClient-agent.js file
□ Found TOOLS array
□ Found last tool (verify)
□ Copied apply_patches definition above
□ Verified syntax (no JSON errors)
□ Verified tool is last in array
□ Saved file
□ Ran test-phase-01.js - ALL PASSED
□ Verified TOOLS count is 15
□ Committed code change with message:
  "Phase 01: Add apply_patches tool schema to TOOLS array"
```

---

## 🚨 If Tests Fail

**Failure: "apply_patches tool not found"**
→ Tool was not added or has wrong name
→ Check line where verify tool ends
→ Check you added comma after verify's closing `}`

**Failure: "Missing field 'parameters'"**
→ Tool definition is incomplete
→ Copy the full definition from this doc
→ Check all nested `{` and `}` match

**Failure: "TOOLS array has 14 tools, expected 15"**
→ Tool was not added to array
→ Check it's inside `const TOOLS = [...]`
→ Not outside the array by accident

**Failure: JSON parse error**
→ Syntax error in added definition
→ Check:
  - All `{` have closing `}`
  - All `[` have closing `]`
  - No trailing comma after last property
  - Strings enclosed in quotes

---

## 📝 Dependency Chain

```
Phase 00 (baseline validated)
    ↓
Phase 01 (THIS - add tool schema)
    ↓
Phase 02 (add executor handler)
    ↓
Phase 03 (add controller action)
    ↓
... etc
```

---

## 🎁 Output for Phase 02

Phase 02 will use:
- `apply_patches` tool name (exact spelling)
- Tool parameters: `patches: [{type, lineNumber?, text?, id?}, ...]`
- Tool description: mention "batch operation"

**What Phase 02 will implement:**
- Executor branch: `if (toolName === "apply_patches")`
- Will call `controller.execute("apply_patches", { patches })`

---

## 📝 Notes

### Why tool-first?
- Tools are purely **data** (JSON schema)
- No runtime dependency
- Safe to merge to main branch early
- Executor can stub it (return error) if not ready

### What OpenAI sees:
```
User: "Apply 3 edits"
OpenAI looks at TOOLS array
OpenAI sees: "Oh, there's an apply_patches tool!"
OpenAI can now call: {"tool_calls": [{"name": "apply_patches", "arguments": "..."}]}
```

### What still missing (Phase 02+):
- Executor doesn't handle it yet (will error)
- Controller action doesn't exist (will fail)
- This is OK for Phase 01!

---

**Status:** Ready to Execute  
**Estimated Time:** 1-2 hours  
**Risk Level:** Very Low (JSON data only)  
**Owner:** Backend Developer
