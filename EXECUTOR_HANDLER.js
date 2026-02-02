/**
 * EXECUTOR_HANDLER.js - Phase 02
 * 
 * Goal: Implement executor handler for apply_patches tool
 * 
 * Responsibilities:
 * 1. Validate patches array
 * 2. Call controller.execute
 * 3. Broadcast events
 * 4. Return result
 */

/**
 * Execute apply_patches tool
 * 
 * @param {Array} patches - Array of patch objects
 * @param {Object} controller - Controller instance
 * @param {Function} broadcast - Broadcast function
 * @param {Object} job - Job/session object for broadcasting
 * @returns {Promise<Object>} Result object
 */
async function executeApplyPatches(patches, controller, broadcast, job) {
  const executionResult = {
    toolName: "apply_patches",
    timestamp: Date.now(),
    success: false,
    appliedCount: 0,
    failedPatches: [],
    error: null
  };

  try {
    // ============================================================
    // VALIDATION STEP 1: Check patches array exists
    // ============================================================
    if (!patches) {
      executionResult.error = "Patches parameter is required";
      broadcast(job, "apply_patches.error", {
        reason: "missing_patches",
        message: executionResult.error
      });
      return executionResult;
    }

    // ============================================================
    // VALIDATION STEP 2: Check patches is array
    // ============================================================
    if (!Array.isArray(patches)) {
      executionResult.error = "Patches must be an array";
      broadcast(job, "apply_patches.error", {
        reason: "invalid_type",
        message: executionResult.error,
        received: typeof patches
      });
      return executionResult;
    }

    // ============================================================
    // VALIDATION STEP 3: Check patches not empty
    // ============================================================
    if (patches.length === 0) {
      executionResult.error = "Patches array cannot be empty (minimum 1)";
      broadcast(job, "apply_patches.error", {
        reason: "empty_array",
        message: executionResult.error
      });
      return executionResult;
    }

    // ============================================================
    // VALIDATION STEP 4: Check patches not too many
    // ============================================================
    if (patches.length > 50) {
      executionResult.error = `Too many patches (${patches.length}), maximum 50`;
      broadcast(job, "apply_patches.error", {
        reason: "too_many_patches",
        message: executionResult.error,
        count: patches.length,
        max: 50
      });
      return executionResult;
    }

    // ============================================================
    // VALIDATION STEP 5: Validate each patch
    // ============================================================
    const validPatchTypes = ["write_replace_line", "insert_line", "delete_line"];
    
    for (let i = 0; i < patches.length; i++) {
      const patch = patches[i];
      
      // Check patch is object
      if (!patch || typeof patch !== "object") {
        executionResult.failedPatches.push({
          index: i,
          patch,
          error: "Patch must be an object"
        });
        continue;
      }

      // Check patch has type
      if (!patch.type) {
        executionResult.failedPatches.push({
          index: i,
          patch,
          error: "Patch must have 'type' property"
        });
        continue;
      }

      // Check patch type is valid
      if (!validPatchTypes.includes(patch.type)) {
        executionResult.failedPatches.push({
          index: i,
          patch,
          error: `Invalid patch type '${patch.type}'. Must be one of: ${validPatchTypes.join(", ")}`
        });
        continue;
      }

      // Check patch has lineNumber
      if (patch.lineNumber === undefined || patch.lineNumber === null) {
        executionResult.failedPatches.push({
          index: i,
          patch,
          error: "Patch must have 'lineNumber' property"
        });
        continue;
      }

      // Check lineNumber is integer
      if (!Number.isInteger(patch.lineNumber)) {
        executionResult.failedPatches.push({
          index: i,
          patch,
          error: `lineNumber must be integer, got ${typeof patch.lineNumber}`
        });
        continue;
      }

      // Check lineNumber is positive
      if (patch.lineNumber < 1) {
        executionResult.failedPatches.push({
          index: i,
          patch,
          error: `lineNumber must be >= 1, got ${patch.lineNumber}`
        });
        continue;
      }

      // Check text property for write_replace_line and insert_line
      if ((patch.type === "write_replace_line" || patch.type === "insert_line")) {
        if (!patch.text) {
          executionResult.failedPatches.push({
            index: i,
            patch,
            error: `${patch.type} requires 'text' property`
          });
          continue;
        }
        if (typeof patch.text !== "string") {
          executionResult.failedPatches.push({
            index: i,
            patch,
            error: `text must be string, got ${typeof patch.text}`
          });
          continue;
        }
      }
    }

    // ============================================================
    // VALIDATION RESULT: Check if any patches failed validation
    // ============================================================
    if (executionResult.failedPatches.length > 0) {
      executionResult.error = `Validation failed for ${executionResult.failedPatches.length} patch(es)`;
      broadcast(job, "apply_patches.validation_error", {
        reason: "patch_validation_failed",
        failedCount: executionResult.failedPatches.length,
        totalCount: patches.length,
        failures: executionResult.failedPatches
      });
      return executionResult;
    }

    // ============================================================
    // EXECUTION STEP: Call controller.execute
    // ============================================================
    broadcast(job, "apply_patches.validating", {
      patchCount: patches.length,
      message: "All patches validated, executing..."
    });

    const controllerResult = await controller.execute("apply_patches", {
      patches: patches
    });

    // ============================================================
    // RESULT PROCESSING
    // ============================================================
    executionResult.success = controllerResult.success || controllerResult.ok;
    executionResult.appliedCount = controllerResult.appliedCount || patches.length;
    executionResult.newRev = controllerResult.newRev;
    executionResult.newText = controllerResult.newText;
    
    if (controllerResult.failedPatches) {
      executionResult.failedPatches = controllerResult.failedPatches;
    }

    // ============================================================
    // BROADCAST SUCCESS EVENT
    // ============================================================
    broadcast(job, "apply_patches.applied", {
      success: executionResult.success,
      appliedCount: executionResult.appliedCount,
      totalCount: patches.length,
      newRev: executionResult.newRev,
      failedCount: executionResult.failedPatches.length
    });

    // ============================================================
    // BROADCAST PAPER STATE EVENT
    // ============================================================
    broadcast(job, "paper.state", {
      currentRev: executionResult.newRev,
      lastOperation: "apply_patches",
      patchCount: executionResult.appliedCount
    });

    return executionResult;

  } catch (error) {
    // ============================================================
    // ERROR HANDLING
    // ============================================================
    executionResult.error = error.message;
    executionResult.success = false;

    broadcast(job, "apply_patches.exception", {
      reason: "execution_error",
      message: error.message,
      stack: error.stack
    });

    return executionResult;
  }
}

// ============================================================
// INTEGRATION WITH EXECUTOR DISPATCHER
// ============================================================

/**
 * Main executor function that routes tool calls
 * This shows how apply_patches integrates with other tools
 */
async function executeToolCall(toolName, params, controller, broadcast, job) {
  // Route to appropriate handler
  switch (toolName) {
    case "apply_patches":
      return executeApplyPatches(params.patches, controller, broadcast, job);
    
    case "search_paper":
      // ... other handlers
      break;
    
    default:
      throw new Error(`Unknown tool: ${toolName}`);
  }
}

export { executeApplyPatches, executeToolCall };
