# 📊 OBSERVABILITY SPECIFICATION

**Phase:** C (Production Observability)  
**Date:** 2 tháng 2, 2026  
**Goal:** Structured logging + metrics for all 3 layers

---

## 1. Logging Architecture

### 1.1 Structured Logging Pattern

All logs follow consistent structure:
```javascript
{
  timestamp: ISO8601,
  level: "INFO|WARN|ERROR|DEBUG",
  layer: "SEMANTICS|NORMALIZER|EXECUTOR",
  batchId: UUID,
  snapshotLength: number,
  patchCount: number,
  message: string,
  details: { ...context }
}
```

### 1.2 Logger Interface

```javascript
class Logger {
  info(context, message)     // Normal operation
  warn(context, message)     // Non-blocking issues
  error(context, message)    // Failed patches
  debug(context, message)    // Detailed trace (dev only)
}
```

### 1.3 Log Levels

- **INFO:** Batch start/end, layer transitions, patch counts
- **WARN:** Semantic coupling detected, mixed patch types, edge conditions
- **ERROR:** Invariant violations, failed patches, state corruption
- **DEBUG:** Per-patch details, intermediate state, validation steps

---

## 2. Layer-Specific Logging

### Layer 1: PATCH_SEMANTICS

**On Entry:**
```javascript
logger.info({
  layer: "SEMANTICS",
  batchId,
  snapshotLength,
  patchCount
}, "Analyzing patch semantics");
```

**On Analysis Complete:**
```javascript
logger.info({
  layer: "SEMANTICS",
  batchId,
  totalPatches: semantics.summary.totalPatches,
  replaceCount: semantics.summary.replaceCount,
  insertCount: semantics.summary.insertCount,
  deleteCount: semantics.summary.deleteCount,
  expectedFinalLength: semantics.summary.expectedFinalLength,
  independent: semantics.areIndependent()
}, "Semantics analysis complete");
```

**Warnings:**
```javascript
if (!semantics.areIndependent()) {
  logger.warn({
    layer: "SEMANTICS",
    batchId,
    message: "Semantic coupling detected: patches reference same lines"
  });
}
```

### Layer 2: PATCH_NORMALIZER

**On Entry:**
```javascript
logger.info({
  layer: "NORMALIZER",
  batchId,
  patchCount,
  snapshotFrozen: Object.isFrozen(snapshotLines)
}, "Normalizing patches");
```

**Validation Steps:**
```javascript
logger.debug({
  layer: "NORMALIZER",
  batchId,
  step: "enforcing_snapshot_ssot"
}, "Validating snapshot SSOT");

logger.debug({
  layer: "NORMALIZER",
  batchId,
  step: "enforcing_desc_order"
}, "Verifying DESC order");

logger.debug({
  layer: "NORMALIZER",
  batchId,
  step: "enforcing_insert_bounds"
}, "Validating INSERT bounds");

logger.debug({
  layer: "NORMALIZER",
  batchId,
  step: "enforcing_independent"
}, "Checking patch independence");
```

**On Normalization Complete:**
```javascript
logger.info({
  layer: "NORMALIZER",
  batchId,
  replaceDescOrder: organized.replaceDesc.map(p => p.lineNumber),
  insertDescOrder: organized.insertDesc.map(p => p.lineNumber),
  deleteDescOrder: organized.deleteDesc.map(p => p.lineNumber),
  warnings: warnings.length
}, "Normalization complete");

warnings.forEach(w => {
  logger.warn({
    layer: "NORMALIZER",
    batchId,
    warning: w
  });
});
```

### Layer 3: PATCH_EXECUTOR

**On Entry:**
```javascript
logger.info({
  layer: "EXECUTOR",
  batchId,
  snapshotLength: normalized.snapshotLength,
  replaceCount: normalized.organized.replaceDesc.length,
  insertCount: normalized.organized.insertDesc.length,
  deleteCount: normalized.organized.deleteDesc.length
}, "Starting patch execution");
```

**Phase Progress:**
```javascript
// Phase 1: REPLACE
logger.debug({
  layer: "EXECUTOR",
  batchId,
  phase: "REPLACE",
  order: normalized.organized.replaceDesc.map(p => p.lineNumber)
}, "Applying REPLACE patches");

// Phase 2: INSERT
logger.debug({
  layer: "EXECUTOR",
  batchId,
  phase: "INSERT",
  order: normalized.organized.insertDesc.map(p => p.lineNumber)
}, "Applying INSERT patches");

// Phase 3: DELETE
logger.debug({
  layer: "EXECUTOR",
  batchId,
  phase: "DELETE",
  order: normalized.organized.deleteDesc.map(p => p.lineNumber)
}, "Applying DELETE patches");
```

**Per-Patch Execution:**
```javascript
logger.debug({
  layer: "EXECUTOR",
  batchId,
  patchIndex: i,
  type: patch.type,
  lineNumber: patch.lineNumber,
  action: "applying"
}, `Applying patch ${i}`);

if (error) {
  logger.error({
    layer: "EXECUTOR",
    batchId,
    patchIndex: i,
    type: patch.type,
    lineNumber: patch.lineNumber,
    errorMessage: error.message
  });
}
```

**On Execution Complete:**
```javascript
logger.info({
  layer: "EXECUTOR",
  batchId,
  appliedCount: result.appliedCount,
  failedCount: result.failedPatches.length,
  beforeRev: beforeRev,
  afterRev: result.newRev,
  finalLineCount: result.newText.split('\n').length
}, "Execution complete");
```

**On Error:**
```javascript
if (!result.success) {
  logger.error({
    layer: "EXECUTOR",
    batchId,
    failedPatches: result.failedPatches.map(p => ({
      index: p.index,
      type: p.type,
      lineNumber: p.lineNumber,
      error: p.error
    }))
  }, "Patch execution failed");
}
```

---

## 3. Metrics Collection

### 3.1 Counter Metrics

Track discrete events:
- `batches_started` - Total batch attempts
- `batches_completed` - Successfully completed batches
- `batches_failed` - Failed batches (partial or full)
- `patches_applied` - Individual patches applied
- `patches_failed` - Individual patches failed
- `invariant_violations` - Hard-stop violations encountered
- `semantic_couplings_detected` - Mixed patch type warnings

### 3.2 Gauge Metrics

Current system state:
- `batch_size_current` - Current batch size
- `working_lines_count` - Current line count
- `snapshot_length` - Snapshot size

### 3.3 Histogram Metrics

Timing & distribution:
- `semantics_duration_ms` - Time to analyze semantics
- `normalizer_duration_ms` - Time to normalize patches
- `executor_duration_ms` - Time to execute patches
- `batch_duration_ms` - Total batch time
- `batch_size_distribution` - Histogram of batch sizes

---

## 4. Metrics Interface

```javascript
class Metrics {
  // Counters
  increment(name, value = 1, tags = {})
  
  // Gauges
  setGauge(name, value, tags = {})
  
  // Histograms
  recordHistogram(name, value, tags = {})
  
  // Timers
  startTimer(name)
  endTimer(name, timerObj, tags = {})
}

// Usage:
const timerSemantics = metrics.startTimer('semantics');
// ... do work ...
metrics.endTimer('semantics', timerSemantics, { batchId });
```

---

## 5. Integration Points

### 5.1 PATCH_SEMANTICS.js

```javascript
constructor(snapshotLines, patches, { logger, metrics }) {
  this.logger = logger;
  this.metrics = metrics;
  
  this.logger.info({
    layer: "SEMANTICS",
    snapshotLength: snapshotLines.length,
    patchCount: patches.length
  }, "Analyzing");
  
  const timer = this.metrics.startTimer('semantics');
  // ... analysis ...
  this.metrics.endTimer('semantics', timer);
}
```

### 5.2 PATCH_NORMALIZER.js

```javascript
static normalize(snapshotLines, patches, { logger, metrics }) {
  logger.info({
    layer: "NORMALIZER",
    patchCount: patches.length
  }, "Normalizing");
  
  const timer = metrics.startTimer('normalizer');
  // ... normalization ...
  metrics.endTimer('normalizer', timer);
  
  return { ...result, appliedLogger: logger, appliedMetrics: metrics };
}
```

### 5.3 PATCH_EXECUTOR.js

```javascript
static execute(snapshotLines, normalized, paper, { logger, metrics }) {
  logger.info({
    layer: "EXECUTOR",
    snapshotLength: normalized.snapshotLength,
    appliedCount: normalized.organized.replaceDesc.length + 
                  normalized.organized.insertDesc.length +
                  normalized.organized.deleteDesc.length
  }, "Starting execution");
  
  const timer = metrics.startTimer('executor');
  // ... execution ...
  metrics.endTimer('executor', timer);
  
  return { ...result, appliedLogger: logger, appliedMetrics: metrics };
}
```

---

## 6. Example: Full Pipeline with Observability

```javascript
const batchId = generateUUID();
const logger = new Logger();
const metrics = new Metrics();
const observability = { logger, metrics, batchId };

// Layer 1: Semantics
const semantics = new PatchSemantics(snapshot, patches, observability);
logger.info({ batchId }, `Analyzed: ${semantics.summary.totalPatches} patches`);

// Layer 2: Normalizer
const normalized = PatchNormalizer.normalize(snapshot, patches, observability);
logger.info({ batchId }, `Normalized: DESC order verified`);

// Layer 3: Executor
const result = PatchExecutor.execute(snapshot, normalized, paper, observability);
logger.info({ 
  batchId,
  appliedCount: result.appliedCount,
  newRev: result.newRev 
}, `Execution complete`);

// Metrics output
console.log("Metrics:");
console.log(`- Semantics: ${metrics.getHistogram('semantics')}ms`);
console.log(`- Normalizer: ${metrics.getHistogram('normalizer')}ms`);
console.log(`- Executor: ${metrics.getHistogram('executor')}ms`);
console.log(`- Total batch: ${metrics.getHistogram('batch')}ms`);
```

---

## 7. Log Filtering & Output

### 7.1 Environment Variables

```bash
# Log level filter
LOG_LEVEL=INFO|WARN|ERROR|DEBUG

# Enable metrics collection
METRICS_ENABLED=true

# Metrics output format
METRICS_FORMAT=json|prometheus|stdout

# Batch tracing
TRACE_BATCH_ID=<uuid>  # Only log this batch
```

### 7.2 Log Output Format

**Console (Development):**
```
[2026-02-02T10:30:45.123Z] [INFO] [SEMANTICS] [batch-uuid-123]
  Analyzing patch semantics
  Snapshot: 5 lines, Patches: 3
```

**JSON (Production):**
```json
{
  "timestamp": "2026-02-02T10:30:45.123Z",
  "level": "INFO",
  "layer": "SEMANTICS",
  "batchId": "batch-uuid-123",
  "snapshotLength": 5,
  "patchCount": 3,
  "message": "Analyzing patch semantics"
}
```

---

## 8. Monitoring & Alerting

### 8.1 Key Alerts

- **InvariantViolation** → CRITICAL alert
- **Patches failed > 10%** → HIGH alert
- **Semantic coupling detected** → MEDIUM alert
- **Batch duration > 5000ms** → MEDIUM alert

### 8.2 Dashboards (Example)

- Batch success rate: 99%
- Average batch size: 3 patches
- Average batch latency: 150ms
- Failed patches: 5/month
- Invariant violations: 0/month

---

## 9. Testing Observability

See `test-observability.js` for:
- Verify logger called at correct points
- Verify metrics recorded correctly
- Verify log levels appropriate
- Verify sensitive data not logged
- Verify performance overhead < 5%

---

## Summary

**Observability enables:**
- ✅ Real-time monitoring of batch application
- ✅ Debugging failed patches quickly
- ✅ Performance tracking (layer latency)
- ✅ Production alerting (invariant violations)
- ✅ Usage analytics (batch size, frequency)
- ✅ Compliance (audit trail)

**Zero overhead in production via environment configuration.**
