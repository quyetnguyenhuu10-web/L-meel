# API Documentation Guide

## Quick Start

### Generate JSDoc HTML documentation:
```bash
npm install --save-dev jsdoc docdash
npm run docs
```

### View documentation:
```bash
open docs/api/index.html
```

## Core API

### Layer 1: PATCH_SEMANTICS
```javascript
const PatchSemantics = require('./src/core/PATCH_SEMANTICS');
const semantics = new PatchSemantics();

// Analyze patches for safety
const analysis = semantics.analyze(patches);
// Returns: { totalPatches, replaceCount, insertCount, deleteCount, ... }
```

### Layer 2: PATCH_NORMALIZER
```javascript
const PatchNormalizer = require('./src/core/PATCH_NORMALIZER');
const normalizer = new PatchNormalizer();

// Normalize and validate patches
const normalized = normalizer.normalize(patches, document);
// Returns: [{ path, type, old, new, revision, ... }, ...]
```

### Layer 3: PATCH_EXECUTOR
```javascript
const PatchExecutor = require('./src/core/PATCH_EXECUTOR');
const executor = new PatchExecutor();

// Execute patches on document
const result = executor.execute(patches, doc, 'v1', 'v2');
// Returns: { appliedCount, failedCount, beforeRev, afterRev, ... }
```

## Observability

### Logger
```javascript
const Logger = require('./src/observability/LOGGER');
const logger = new Logger({ level: 'INFO', batchId: 'batch-1' });

logger.info('Processing started', { patches: 100 });
logger.warn('Large batch detected', { size: 5000 });
logger.error('Execution failed', { reason: 'invariant_violation' });
```

### Metrics
```javascript
const Metrics = require('./src/observability/METRICS');
const metrics = new Metrics();

metrics.recordBatchProcessing(batchId, durationMs, patchCount);
metrics.recordError(errorType, layerName);
metrics.exportPrometheus(); // Get Prometheus format
```

## Production

### Feature Flags
```javascript
const { FeatureFlags } = require('./src/production/FEATURE_FLAGS');
const flags = new FeatureFlags();

flags.enable('batch-patches-v1', { percentage: 25 });
if (flags.isEnabled('batch-patches-v1', userId)) {
  // Run new code for 25% of users
}
```

### Monitoring
```javascript
const { ProductionMonitor } = require('./src/production/MONITORING');
const monitor = new ProductionMonitor();

monitor.recordBatch(result, durationMs);
monitor.checkAlerts(); // Returns: { level, message, ... }
monitor.exportMetrics(); // Prometheus format
```

## Phase Specifications

| Phase | Module | Purpose |
|-------|--------|---------|
| 00 | TOOLS_ARRAY | 15 built-in tools + batch patch handler |
| 02 | EXECUTOR_HANDLER | Validate + broadcast patches |
| 03 | CONTROLLER_ACTION | DESC sort + revision tracking |
| 04 | INTEGRATION_TEST | Full 3-layer pipeline |
| A | INVARIANTS | 7 core safety laws |
| C | OBSERVABILITY | Logging + metrics specification |
| 05 | Feature Flags + Monitoring | Production rollout system |

## Examples

### Example 1: Simple patch execution
```javascript
const patches = [
  { type: 'REPLACE', path: 'line_1', old: 'hello', new: 'hi' },
  { type: 'INSERT', path: 'line_2', new: 'world' }
];

const doc = {
  lines: ['hello', 'goodbye'],
  revision: 'v1'
};

const executor = new PatchExecutor();
const result = executor.execute(patches, doc, 'v1', 'v2');

console.log(result.appliedCount); // 2
```

### Example 2: Feature flag rollout
```javascript
const flags = new FeatureFlags();
flags.enable('new-algorithm', { percentage: 10 });

for (const user of users) {
  if (flags.isEnabled('new-algorithm', user.id)) {
    executeNewAlgorithm(user);
  } else {
    executeOldAlgorithm(user);
  }
}

// Gradually increase
flags.scale('new-algorithm', 50); // 50% of users
```

### Example 3: Monitoring alerts
```javascript
const monitor = new ProductionMonitor();

// After processing batch
monitor.recordBatch(result, 150); // 150ms

// Check for alerts
const alerts = monitor.checkAlerts();
alerts.forEach(alert => {
  if (alert.level === 'CRITICAL') {
    pagerDuty.trigger(alert);
  }
});
```

## Performance Benchmarks

| Metric | Value | Status |
|--------|-------|--------|
| Throughput | 10,953 patches/sec | ✅ Excellent |
| Latency | 0.0913ms/patch | ✅ Low |
| Memory per patch | 0.11KB | ✅ Efficient |
| Code Coverage | 86.43% | ✅ Good |

## Testing

Run tests by phase:
```bash
npm run test:00    # Baseline
npm run test:A     # Invariants
npm run test:B     # 3-layer architecture
npm run test:C     # Observability
npm run test:D     # Resilience
npm run test:05-features  # Feature flags
npm run test:all-phases   # Everything
```

## Troubleshooting

### "Invariant violated" error
- Check `INVARIANT_ENFORCER.js` for 7 laws
- Most common: patch order, line count mismatch
- See `phases/A-invariants/INVARIANTS.md`

### Low throughput
- Profile with `npm run profile`
- Check memory usage and GC behavior
- Monitor network/disk I/O if applicable

### Feature flag not working
- Check flag name (case-sensitive)
- Verify percentage in [0-100]
- Check `.feature-flags.json` exists

## Contributing

When adding new features:
1. Add JSDoc comments to functions
2. Update this API documentation
3. Add tests in `tests/` directory
4. Run `npm run coverage` to check coverage
5. Run `npm run profile` to check performance

## API Stability

| Module | Stability | Since |
|--------|-----------|-------|
| PATCH_SEMANTICS | Stable | v1.0.0 |
| PATCH_NORMALIZER | Stable | v1.0.0 |
| PATCH_EXECUTOR | Stable | v1.0.0 |
| INVARIANT_ENFORCER | Stable | Phase A |
| LOGGER | Stable | Phase C |
| METRICS | Stable | Phase C |
| FEATURE_FLAGS | Stable | Phase 05 |
| MONITORING | Stable | Phase 05 |

---

**Last Updated**: February 2, 2026  
**Version**: 1.0.0  
**Status**: Production Ready
