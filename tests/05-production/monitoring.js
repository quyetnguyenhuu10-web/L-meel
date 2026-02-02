const assert = require('assert');
const { ProductionMonitor } = require('../../src/production/MONITORING');

// ============ Test Suite: Production Monitoring ============

console.log('\n=== PHASE 05.2 TEST: Production Monitoring ===\n');

// TEST 1A: Record patch batch
console.log('TEST 1A: Record patch batch');
{
  const monitor = new ProductionMonitor();
  monitor.reset();

  monitor.recordPatchBatch({
    batchId: 'batch-001',
    patchCount: 10,
    applied: 8,
    failed: 2,
    duration: 50,
    operations: { replace: 4, insert: 3, delete: 3 },
    success: true
  });

  const metrics = monitor.getMetrics();
  assert.strictEqual(metrics.batches.total, 1);
  assert.strictEqual(metrics.batches.succeeded, 1);
  assert.strictEqual(metrics.patches.total, 10);
  assert.strictEqual(metrics.patches.applied, 8);
  assert.strictEqual(metrics.patches.failed, 2);
  assert.strictEqual(metrics.operations.replace, 4);
  assert.strictEqual(metrics.operations.insert, 3);
  assert.strictEqual(metrics.operations.delete, 3);

  console.log('✅ TEST 1A: PASS\n');
}

// TEST 2A: Multiple batches
console.log('TEST 2A: Multiple batches');
{
  const monitor = new ProductionMonitor();
  monitor.reset();

  monitor.recordPatchBatch({
    batchId: 'batch-001',
    patchCount: 5,
    applied: 5,
    failed: 0,
    duration: 30,
    success: true
  });

  monitor.recordPatchBatch({
    batchId: 'batch-002',
    patchCount: 8,
    applied: 6,
    failed: 2,
    duration: 60,
    success: false
  });

  const metrics = monitor.getMetrics();
  assert.strictEqual(metrics.batches.total, 2);
  assert.strictEqual(metrics.batches.succeeded, 1);
  assert.strictEqual(metrics.batches.failed, 1);
  assert.strictEqual(metrics.patches.total, 13);
  assert.strictEqual(metrics.patches.applied, 11);
  assert.strictEqual(metrics.patches.failed, 2);
  assert.strictEqual(metrics.batches.totalDuration, 90);

  console.log('✅ TEST 2A: PASS\n');
}

// TEST 3A: Invariant violations tracking
console.log('TEST 3A: Invariant violations tracking');
{
  const monitor = new ProductionMonitor();
  monitor.reset();

  monitor.recordPatchBatch({
    batchId: 'batch-001',
    patchCount: 5,
    applied: 3,
    failed: 2,
    duration: 100,
    invariantViolations: [
      { type: 'INVARIANT_001_OUT_OF_BOUNDS' },
      { type: 'INVARIANT_002_DUPLICATE' },
      { type: 'INVARIANT_001_OUT_OF_BOUNDS' }
    ],
    success: false
  });

  const metrics = monitor.getMetrics();
  assert.strictEqual(metrics.invariants.total_violations, 3);
  assert.strictEqual(metrics.invariants.by_type['INVARIANT_001_OUT_OF_BOUNDS'], 2);
  assert.strictEqual(metrics.invariants.by_type['INVARIANT_002_DUPLICATE'], 1);

  console.log('✅ TEST 3A: PASS\n');
}

// TEST 4A: Error recording
console.log('TEST 4A: Error recording');
{
  const monitor = new ProductionMonitor();
  monitor.reset();

  monitor.recordError('normalization_failed', { reason: 'Invalid patch' });
  monitor.recordError('execution_failed', { reason: 'Out of bounds' });
  monitor.recordError('out_of_bounds', { line: 100 });
  monitor.recordError('unknown_type', {}); // Should go to 'other'

  const metrics = monitor.getMetrics();
  assert.strictEqual(metrics.errors.normalization_failed, 1);
  assert.strictEqual(metrics.errors.execution_failed, 1);
  assert.strictEqual(metrics.errors.out_of_bounds, 1);
  assert.strictEqual(metrics.errors.other, 1);

  console.log('✅ TEST 4A: PASS\n');
}

// TEST 5A: Layer latencies
console.log('TEST 5A: Layer latencies');
{
  const monitor = new ProductionMonitor();
  monitor.reset();

  monitor.recordLayerLatencies({
    semantics_ms: 10,
    normalizer_ms: 15,
    executor_ms: 25
  });

  monitor.recordLayerLatencies({
    semantics_ms: 12,
    normalizer_ms: 18,
    executor_ms: 20
  });

  const metrics = monitor.getMetrics();
  assert.strictEqual(metrics.performance.semantics_latency_ms.length, 2);
  assert.strictEqual(metrics.performance.normalizer_latency_ms.length, 2);
  assert.strictEqual(metrics.performance.executor_latency_ms.length, 2);
  assert.deepStrictEqual(
    metrics.performance.semantics_latency_ms,
    [10, 12]
  );

  console.log('✅ TEST 5A: PASS\n');
}

// TEST 6A: Prometheus format export
console.log('TEST 6A: Prometheus format export');
{
  const monitor = new ProductionMonitor();
  monitor.reset();

  monitor.recordPatchBatch({
    batchId: 'batch-001',
    patchCount: 10,
    applied: 8,
    failed: 2,
    duration: 50,
    operations: { replace: 4, insert: 3, delete: 3 },
    success: true
  });

  const prometheus = monitor.getPrometheusMetrics();

  // Check format
  assert(prometheus.includes('# HELP batch_patches_total'));
  assert(prometheus.includes('# TYPE batch_patches_total counter'));
  assert(prometheus.includes('batch_patches_total{status="succeeded"} 1'));
  assert(prometheus.includes('patches_total{status="applied"} 8'));
  assert(prometheus.includes('patch_operations_total{type="replace"} 4'));
  assert(prometheus.includes('batch_duration_ms{quantile="avg"}'));

  console.log('✅ TEST 6A: PASS\n');
}

// TEST 7A: Alert generation (error rate)
console.log('TEST 7A: Alert generation (error rate)');
{
  const monitor = new ProductionMonitor();
  monitor.reset();
  monitor.thresholds.errorRatePercent = 30; // 30% threshold

  // Add 9 failed batches out of 10 (90% error rate)
  for (let i = 0; i < 9; i++) {
    monitor.recordPatchBatch({
      batchId: `batch-${i}`,
      patchCount: 1,
      applied: 0,
      failed: 1,
      duration: 10,
      success: false
    });
  }

  monitor.recordPatchBatch({
    batchId: 'batch-ok',
    patchCount: 1,
    applied: 1,
    failed: 0,
    duration: 10,
    success: true
  });

  const alerts = monitor.getAlerts();
  // Should have HIGH_ERROR_RATE alert
  const errorAlert = alerts.find(a => a.type === 'HIGH_ERROR_RATE');
  assert(errorAlert !== undefined, 'Should have HIGH_ERROR_RATE alert');

  console.log('✅ TEST 7A: PASS\n');
}

// TEST 8A: Alert generation (slow batch)
console.log('TEST 8A: Alert generation (slow batch)');
{
  const monitor = new ProductionMonitor();
  monitor.reset();
  monitor.thresholds.latencyMs = 100; // 100ms threshold

  // Record slow batch
  monitor.recordPatchBatch({
    batchId: 'slow-batch',
    patchCount: 100,
    applied: 100,
    failed: 0,
    duration: 500, // Way over threshold
    success: true
  });

  const alerts = monitor.getAlerts();
  const slowAlert = alerts.find(a => a.type === 'SLOW_BATCH');
  assert(slowAlert !== undefined, 'Should have SLOW_BATCH alert');
  assert.strictEqual(slowAlert.details.duration_ms, 500);

  console.log('✅ TEST 8A: PASS\n');
}

// TEST 9A: Event log
console.log('TEST 9A: Event log');
{
  const monitor = new ProductionMonitor();
  monitor.reset();

  monitor.recordPatchBatch({
    batchId: 'batch-001',
    patchCount: 5,
    applied: 5,
    failed: 0,
    duration: 20,
    success: true
  });

  monitor.recordError('normalization_failed', { reason: 'Bad patch' });

  const eventLog = monitor.getEventLog();
  assert.strictEqual(eventLog.length, 2);
  assert.strictEqual(eventLog[0].type, 'batch');
  assert.strictEqual(eventLog[0].batchId, 'batch-001');
  assert.strictEqual(eventLog[1].type, 'error');
  assert.strictEqual(eventLog[1].errorType, 'normalization_failed');

  console.log('✅ TEST 9A: PASS\n');
}

// TEST 10A: Memory tracking
console.log('TEST 10A: Memory tracking');
{
  const monitor = new ProductionMonitor();
  monitor.reset();

  monitor.recordMemory();
  let metrics = monitor.getMetrics();
  assert(metrics.resources.memory_current_mb >= 0, 'Memory should be recorded');

  // Peak should match current (no higher yet)
  assert.strictEqual(
    metrics.resources.memory_peak_mb,
    metrics.resources.memory_current_mb
  );

  console.log('✅ TEST 10A: PASS\n');
}

// TEST 11A: Event listeners (emit events)
console.log('TEST 11A: Event listeners');
{
  const monitor = new ProductionMonitor();
  monitor.reset();

  let batchEvent = null;
  monitor.on('batch-recorded', (event) => {
    batchEvent = event;
  });

  monitor.recordPatchBatch({
    batchId: 'batch-001',
    patchCount: 5,
    applied: 5,
    failed: 0,
    duration: 20,
    success: true
  });

  assert(batchEvent !== null, 'Event should be emitted');
  assert.strictEqual(batchEvent.batchId, 'batch-001');
  assert.strictEqual(batchEvent.applied, 5);

  console.log('✅ TEST 11A: PASS\n');
}

// TEST 12A: Latency percentiles
console.log('TEST 12A: Latency percentiles (p50, p95, p99)');
{
  const monitor = new ProductionMonitor();
  monitor.reset();

  // Add 100 batches with varying latencies
  for (let i = 0; i < 100; i++) {
    monitor.recordPatchBatch({
      batchId: `batch-${i}`,
      patchCount: 1,
      applied: 1,
      failed: 0,
      duration: i + 1, // 1, 2, 3, ..., 100
      success: true
    });
  }

  const prometheus = monitor.getPrometheusMetrics();

  // Check that percentiles are calculated
  assert(prometheus.includes('batch_duration_ms{quantile="p50"}'));
  assert(prometheus.includes('batch_duration_ms{quantile="p95"}'));
  assert(prometheus.includes('batch_duration_ms{quantile="p99"}'));

  console.log('✅ TEST 12A: PASS\n');
}

console.log('=== PHASE 05.2 SUMMARY ===');
console.log('✅ All 12 tests passed');
console.log('✅ Batch recording working');
console.log('✅ Prometheus export ready');
console.log('✅ Alert generation active');
console.log('✅ Event listeners working');
console.log('✅ Monitoring infrastructure complete\n');
