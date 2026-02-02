# 📁 Proposed Folder Structure - Batch Patch System v1.0.0

## Architecture Overview

```
lmeel/
├── src/                          # Production code (3 layers)
│   ├── core/                     # Layer 1-3: Semantics, Normalizer, Executor
│   │   ├── PATCH_SEMANTICS.js
│   │   ├── PATCH_NORMALIZER.js
│   │   ├── PATCH_EXECUTOR.js
│   │   └── INVARIANT_ENFORCER.js
│   │
│   ├── observability/            # Phase C: Logging + Metrics
│   │   ├── LOGGER.js
│   │   └── METRICS.js
│   │
│   └── production/               # Phase 05: Feature flags + Monitoring
│       ├── FEATURE_FLAGS.js
│       └── MONITORING.js
│
├── phases/                       # Phase-specific code and docs
│   ├── 00-baseline/
│   │   ├── TOOLS_ARRAY.js        # Moved from root
│   │   └── BASELINE_ARCHITECTURE.md
│   │
│   ├── 01-tools/
│   │   └── [docs/reference only]
│   │
│   ├── 02-executor/
│   │   ├── EXECUTOR_HANDLER.js   # Moved from root
│   │   └── PATCH_MODE_IMPLEMENTATION.md
│   │
│   ├── 03-normalization/
│   │   ├── CONTROLLER_ACTION.js  # Moved from root
│   │   └── [DESC sort documentation]
│   │
│   ├── 04-integration/
│   │   └── INTEGRATION_TEST.js   # Moved from root
│   │
│   ├── audit/
│   │   ├── AUDIT_REPORT.md
│   │   └── AUDIT_CLEARANCE.md
│   │
│   ├── A-invariants/
│   │   └── INVARIANTS.md
│   │
│   ├── B-architecture/
│   │   └── [3-layer reference]
│   │
│   ├── C-observability/
│   │   └── OBSERVABILITY.md
│   │
│   ├── D-resilience/
│   │   └── [resilience testing reference]
│   │
│   ├── E-failure/
│   │   └── FAILURE_MODEL.md
│   │
│   └── 05-production/
│       ├── ALERTING.md
│       ├── DEPLOYMENT.md
│       ├── PHASE_05_COMPLETE.md
│       └── PHASE_05_SUMMARY.txt
│
├── tests/                        # All test files organized by phase
│   ├── 00-baseline.js
│   ├── 01-tools.js
│   ├── 02-executor.js
│   ├── 03-normalization.js
│   ├── 03-normalization-audit.js
│   ├── 04-integration.js
│   ├── audit-suite.js
│   ├── A-invariants.js
│   ├── B-layers.js
│   ├── C-observability.js
│   ├── D-resilience.js
│   └── 05-production/
│       ├── feature-flags.js
│       ├── monitoring.js
│       └── integration.js
│
├── docs/                         # Consolidated documentation
│   ├── ARCHITECTURE.md           # Copy of BASELINE_ARCHITECTURE
│   ├── API_REFERENCE.md
│   ├── FAILURE_MODEL.md
│   ├── OBSERVABILITY.md
│   ├── ALERTING.md
│   ├── DEPLOYMENT.md
│   ├── TỔNG_KẾT.md              # Vietnamese summary
│   └── structure/
│       └── FOLDER_STRUCTURE.md   # This file
│
├── promp.md                      # Systems engineering principles (keep in root)
└── README.md                     # New: Quick start guide
```

---

## File Mapping: Old → New

### Core Engine (src/core/)
```
PATCH_SEMANTICS.js          → src/core/PATCH_SEMANTICS.js
PATCH_NORMALIZER.js         → src/core/PATCH_NORMALIZER.js
PATCH_EXECUTOR.js           → src/core/PATCH_EXECUTOR.js
INVARIANT_ENFORCER.js       → src/core/INVARIANT_ENFORCER.js
```

### Observability (src/observability/)
```
LOGGER.js                   → src/observability/LOGGER.js
METRICS.js                  → src/observability/METRICS.js
```

### Production (src/production/)
```
FEATURE_FLAGS.js            → src/production/FEATURE_FLAGS.js
MONITORING.js               → src/production/MONITORING.js
```

### Phase 00 (phases/00-baseline/)
```
TOOLS_ARRAY.js              → phases/00-baseline/TOOLS_ARRAY.js
BASELINE_ARCHITECTURE.md    → phases/00-baseline/BASELINE_ARCHITECTURE.md
```

### Phase 02 (phases/02-executor/)
```
EXECUTOR_HANDLER.js         → phases/02-executor/EXECUTOR_HANDLER.js
PATCH_MODE_IMPLEMENTATION.md→ phases/02-executor/PATCH_MODE_IMPLEMENTATION.md
```

### Phase 03 (phases/03-normalization/)
```
CONTROLLER_ACTION.js        → phases/03-normalization/CONTROLLER_ACTION.js
```

### Phase 04 (phases/04-integration/)
```
INTEGRATION_TEST.js         → phases/04-integration/INTEGRATION_TEST.js
```

### Audit (phases/audit/)
```
AUDIT_REPORT.md             → phases/audit/AUDIT_REPORT.md
AUDIT_CLEARANCE.md          → phases/audit/AUDIT_CLEARANCE.md
```

### Phase A (phases/A-invariants/)
```
INVARIANTS.md               → phases/A-invariants/INVARIANTS.md
```

### Phase C (phases/C-observability/)
```
OBSERVABILITY.md            → phases/C-observability/OBSERVABILITY.md
```

### Phase E (phases/E-failure/)
```
FAILURE_MODEL.md            → phases/E-failure/FAILURE_MODEL.md
```

### Phase 05 (phases/05-production/)
```
ALERTING.md                 → phases/05-production/ALERTING.md
DEPLOYMENT.md               → phases/05-production/DEPLOYMENT.md
PHASE_05_COMPLETE.md        → phases/05-production/PHASE_05_COMPLETE.md
PHASE_05_SUMMARY.txt        → phases/05-production/PHASE_05_SUMMARY.txt
```

### Tests (tests/)
```
test-phase-00.js            → tests/00-baseline.js
test-phase-01.js            → tests/01-tools.js
test-phase-02.js            → tests/02-executor.js
test-phase-03.js            → tests/03-normalization.js
test-phase-03-5.js          → tests/03-normalization-audit.js
test-phase-04.js            → tests/04-integration.js
test-invariants.js          → tests/A-invariants.js
test-layers.js              → tests/B-layers.js
test-observability.js       → tests/C-observability.js
test-resilience.js          → tests/D-resilience.js
test-feature-flags.js       → tests/05-production/feature-flags.js
test-monitoring.js          → tests/05-production/monitoring.js
test-phase-05-integration.js→ tests/05-production/integration.js
```

### Documentation (docs/)
```
API_REFERENCE.md            → docs/API_REFERENCE.md (copy)
TỔNG_KẾT.md                 → docs/TỔNG_KẾT.md (copy)
[Phase docs already above]
```

---

## Import/Require Updates Needed

### 1. Core Layer Imports (in src/core/)

**PATCH_NORMALIZER.js:**
```javascript
// OLD
const INVARIANT_ENFORCER = require('./INVARIANT_ENFORCER');

// NEW
const INVARIANT_ENFORCER = require('./INVARIANT_ENFORCER');
```
✅ No change (same folder)

---

### 2. Observability Integration (in src/)

**PATCH_SEMANTICS.js, PATCH_NORMALIZER.js, PATCH_EXECUTOR.js:**
```javascript
// OLD (not present, will add)
// NEW
const { Logger } = require('../observability/LOGGER');
const { Metrics } = require('../observability/METRICS');
```

---

### 3. Phase 00 Imports (phases/00-baseline/)

**TOOLS_ARRAY.js:**
```javascript
// OLD (in root)
// NEW (in phase)
module.exports = TOOLS;  // No change needed, it's standalone
```

---

### 4. Phase 02 Imports (phases/02-executor/)

**EXECUTOR_HANDLER.js:**
```javascript
// OLD
const { validateAndExecutePatches, broadcastPatchEvent } = require('./EXECUTOR_HANDLER.js');

// NEW (if referenced from elsewhere)
// Update in test files:
const { validateAndExecutePatches, broadcastPatchEvent } = require('../../phases/02-executor/EXECUTOR_HANDLER.js');
```

---

### 5. Phase 03 Imports (phases/03-normalization/)

**CONTROLLER_ACTION.js:**
```javascript
// OLD
export { applyPatchesAction, MockPaper };

// NEW (change to CommonJS if needed)
module.exports = { applyPatchesAction, MockPaper };
```

---

### 6. Test Files (tests/)

**tests/00-baseline.js:**
```javascript
// OLD
const TOOLS = require('./TOOLS_ARRAY');

// NEW
const TOOLS = require('../phases/00-baseline/TOOLS_ARRAY');
```

**tests/02-executor.js:**
```javascript
// OLD
const { validateAndExecutePatches } = require('./EXECUTOR_HANDLER');

// NEW
const { validateAndExecutePatches } = require('../phases/02-executor/EXECUTOR_HANDLER');
```

**tests/03-normalization.js:**
```javascript
// OLD
const { applyPatchesAction, MockPaper } = require('./CONTROLLER_ACTION');

// NEW
const { applyPatchesAction, MockPaper } = require('../phases/03-normalization/CONTROLLER_ACTION');
```

**tests/A-invariants.js:**
```javascript
// OLD
const { InvariantViolation, enforceSnapshotSSoT } = require('./INVARIANT_ENFORCER');

// NEW
const { InvariantViolation, enforceSnapshotSSoT } = require('../src/core/INVARIANT_ENFORCER');
```

**tests/C-observability.js:**
```javascript
// OLD
const { Logger } = require('./LOGGER');
const { Metrics } = require('./METRICS');

// NEW
const { Logger } = require('../src/observability/LOGGER');
const { Metrics } = require('../src/observability/METRICS');
```

**tests/05-production/feature-flags.js:**
```javascript
// OLD
const { FeatureFlags } = require('./FEATURE_FLAGS');

// NEW
const { FeatureFlags } = require('../../src/production/FEATURE_FLAGS');
```

---

## Dependency Graph (Validated Linear Chain)

```
Phase 00 (TOOLS_ARRAY)
  ↓
Phase 01 (Tool Schema) - references TOOLS_ARRAY
  ↓
Phase 02 (EXECUTOR_HANDLER) - processes patches
  ↓
Phase 03 (CONTROLLER_ACTION) - applies via applyPatchesAction
  ↓
Phase 04 (INTEGRATION_TEST) - validates full pipeline
  ↓
Phase Audit - validates snapshot, DESC sort, coupling
  ↓
Phase A (INVARIANT_ENFORCER) - formalizes 7 laws
  ↓
Phase B (3-Layer Architecture) - semantic + normalize + execute
  ↓
Phase C (LOGGER + METRICS) - observability layer
  ↓
Phase D (Resilience Tests) - stress/fuzz/chaos
  ↓
Phase E (FAILURE_MODEL) - explicit error handling
  ↓
Phase 05 (FEATURE_FLAGS, MONITORING) - production readiness
  ↓
[Future Phase 06] - advanced features

✅ No circular dependencies
✅ Each phase depends only on earlier phases
✅ Clean linear progression
```

---

## Benefits of This Structure

| Aspect | Benefit |
|--------|---------|
| **Clarity** | Each folder has clear responsibility |
| **Scalability** | Easy to add Phase 06, 07, etc |
| **Testing** | Tests mirror source organization |
| **Maintenance** | Changing Phase N doesn't affect others |
| **Documentation** | Specs live near implementation |
| **Dependency Management** | Forward-only dependencies (no cycles) |
| **Onboarding** | New team members see phases clearly |
| **CI/CD** | Can test phases independently |

---

## Commands to Verify

After reorganizing, these should all pass:

```bash
# Test core 3-layer
node tests/A-invariants.js
node tests/B-layers.js
node tests/C-observability.js

# Test production features
node tests/05-production/feature-flags.js
node tests/05-production/monitoring.js
node tests/05-production/integration.js

# Run all tests
for f in tests/*.js; do node "$f" || exit 1; done
for f in tests/05-production/*.js; do node "$f" || exit 1; done
```

---

## Next Steps

1. ✅ Create folder structure
2. ✅ Move files to appropriate locations
3. ✅ Update all import paths
4. ✅ Verify all tests pass
5. ✅ Commit to git with message: "Refactor: Reorganize into clean folder structure"
6. ✅ Create README.md with structure overview

---

*Document created for production-grade reorganization*
*Version: 1.0*
*Status: Ready for implementation*
