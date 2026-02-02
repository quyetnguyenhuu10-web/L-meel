#!/usr/bin/env node

/**
 * Phase 01: Tool Schema Test
 * 
 * Goal: Verify apply_patches tool is correctly added
 * Tests:
 * - TOOLS count = 15 (was 14)
 * - apply_patches exists
 * - Schema is valid JSON
 * - patches parameter correct
 * - patch item structure correct
 */

import assert from 'assert';
import TOOLS from '../phases/00-baseline/TOOLS_ARRAY.js';

console.log('╔════════════════════════════════════════════════════════╗');
console.log('║        PHASE 01: TOOL SCHEMA TEST                     ║');
console.log('║   Adding apply_patches tool (14 → 15 tools)          ║');
console.log('╚════════════════════════════════════════════════════════╝\n');

// ============================================================
// TEST 1: TOOL COUNT
// ============================================================

console.log('📊 TEST 1: Tool Count (14 → 15)\n');

try {
  console.log(`  1A: TOOLS array length...`);
  assert.strictEqual(TOOLS.length, 15, `Expected 15 tools, got ${TOOLS.length}`);
  console.log(`      ✅ PASS - Found 15 tools (was 14)\n`);
  
  console.log(`  1B: Original 14 tools still present...`);
  const originalToolNames = [
    "search_paper", "search_chat", "get_context_lines",
    "write_replace_line", "insert_line", "delete_line",
    "verify", "revert", "commit_paper", "broadcast_event",
    "list_comments", "highlight_section", "get_edit_history",
    "validate_syntax"
  ];
  
  for (const toolName of originalToolNames) {
    const exists = TOOLS.some(t => t.name === toolName);
    assert(exists, `Original tool missing: ${toolName}`);
  }
  console.log(`      ✅ PASS - All 14 original tools present\n`);
  
} catch (e) {
  console.error(`      ❌ FAIL: ${e.message}\n`);
  process.exit(1);
}

// ============================================================
// TEST 2: NEW TOOL EXISTENCE
// ============================================================

console.log('🆕 TEST 2: New apply_patches Tool\n');

let applyPatchesTool = null;

try {
  console.log(`  2A: apply_patches tool exists...`);
  applyPatchesTool = TOOLS.find(t => t.name === "apply_patches");
  assert(applyPatchesTool, "apply_patches tool not found");
  console.log(`      ✅ PASS - apply_patches found at index ${TOOLS.indexOf(applyPatchesTool)}\n`);
  
  console.log(`  2B: Tool has description...`);
  assert(applyPatchesTool.description, "Missing description");
  console.log(`      Description: "${applyPatchesTool.description}"`);
  console.log(`      ✅ PASS\n`);
  
} catch (e) {
  console.error(`      ❌ FAIL: ${e.message}\n`);
  process.exit(1);
}

// ============================================================
// TEST 3: SCHEMA STRUCTURE
// ============================================================

console.log('📋 TEST 3: Schema Structure\n');

try {
  console.log(`  3A: Tool has valid parameters object...`);
  assert(applyPatchesTool.parameters, "Missing parameters");
  assert.strictEqual(applyPatchesTool.parameters.type, "object");
  console.log(`      ✅ PASS\n`);
  
  console.log(`  3B: Has 'patches' property...`);
  assert(applyPatchesTool.parameters.properties.patches, "Missing patches property");
  const patchesProperty = applyPatchesTool.parameters.properties.patches;
  console.log(`      ✅ PASS\n`);
  
  console.log(`  3C: patches is array type...`);
  assert.strictEqual(patchesProperty.type, "array", "patches should be array");
  console.log(`      ✅ PASS\n`);
  
  console.log(`  3D: patches has minItems and maxItems...`);
  assert.strictEqual(patchesProperty.minItems, 1, "minItems should be 1");
  assert.strictEqual(patchesProperty.maxItems, 50, "maxItems should be 50");
  console.log(`      minItems: ${patchesProperty.minItems}`);
  console.log(`      maxItems: ${patchesProperty.maxItems}`);
  console.log(`      ✅ PASS\n`);
  
} catch (e) {
  console.error(`      ❌ FAIL: ${e.message}\n`);
  process.exit(1);
}

// ============================================================
// TEST 4: PATCH ITEM STRUCTURE
// ============================================================

console.log('🔧 TEST 4: Patch Item Structure\n');

try {
  const patchesProperty = applyPatchesTool.parameters.properties.patches;
  const patchItemSchema = patchesProperty.items;
  
  console.log(`  4A: Item schema exists...`);
  assert(patchItemSchema, "Missing items schema");
  assert.strictEqual(patchItemSchema.type, "object");
  console.log(`      ✅ PASS\n`);
  
  console.log(`  4B: Has required properties: type, lineNumber...`);
  assert(patchItemSchema.properties.type, "Missing type property");
  assert(patchItemSchema.properties.lineNumber, "Missing lineNumber property");
  assert(patchItemSchema.required, "Missing required array");
  assert(patchItemSchema.required.includes("type"), "type not required");
  assert(patchItemSchema.required.includes("lineNumber"), "lineNumber not required");
  console.log(`      ✅ PASS\n`);
  
  console.log(`  4C: type is enum with correct values...`);
  const typeEnum = patchItemSchema.properties.type.enum;
  assert(typeEnum, "Missing enum for type");
  assert.deepStrictEqual(typeEnum, ["write_replace_line", "insert_line", "delete_line"]);
  console.log(`      Enum values: ${typeEnum.join(", ")}`);
  console.log(`      ✅ PASS\n`);
  
  console.log(`  4D: lineNumber is integer...`);
  const lineNumberProp = patchItemSchema.properties.lineNumber;
  assert.strictEqual(lineNumberProp.type, "integer");
  console.log(`      ✅ PASS\n`);
  
  console.log(`  4E: text property exists (optional)...`);
  const textProp = patchItemSchema.properties.text;
  assert(textProp, "Missing text property");
  assert.strictEqual(textProp.type, "string");
  console.log(`      ✅ PASS\n`);
  
} catch (e) {
  console.error(`      ❌ FAIL: ${e.message}\n`);
  process.exit(1);
}

// ============================================================
// TEST 5: TOOL LISTING
// ============================================================

console.log('📝 TEST 5: All 15 Tools Listed\n');

try {
  console.log(`  Tools in TOOLS array:\n`);
  TOOLS.forEach((tool, i) => {
    const isNew = tool.name === "apply_patches" ? " 🆕 NEW" : "";
    console.log(`      ${i+1}. ${tool.name}${isNew}`);
  });
  console.log(`\n      ✅ PASS - All 15 tools listed\n`);
  
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
console.log('║ TEST 1: Tool Count ................................. ✅');
console.log('║ TEST 2: New apply_patches Tool ..................... ✅');
console.log('║ TEST 3: Schema Structure ........................... ✅');
console.log('║ TEST 4: Patch Item Structure ...................... ✅');
console.log('║ TEST 5: Tool Listing .............................. ✅');
console.log('╠════════════════════════════════════════════════════════╣');
console.log('║                                                        ║');
console.log('║ 📊 METRICS:                                            ║');
console.log('║   • Tools: 15 (14 original + 1 new) ✅                ║');
console.log('║   • apply_patches schema: Valid ✅                    ║');
console.log('║   • Patches parameter: Array, 1-50 items ✅           ║');
console.log('║   • Patch types: 3 enums ✅                           ║');
console.log('║   • Required fields: type, lineNumber ✅              ║');
console.log('║                                                        ║');
console.log('║ 🎯 PHASE 01 EXIT CRITERIA: ALL MET ✅                 ║');
console.log('║                                                        ║');
console.log('║ ✨ apply_patches tool schema validated!               ║');
console.log('║ 🚀 Ready for Phase 02: Executor Handler               ║');
console.log('║                                                        ║');
console.log('╚════════════════════════════════════════════════════════╝\n');

process.exit(0);
