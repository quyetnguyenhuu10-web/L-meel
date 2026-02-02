const { EventEmitter } = require('events');

/**
 * MONITORING.js - Production Monitoring & Observability Export
 * 
 * Mục đích: Thu thập metrics từ hệ thống patch và export cho monitoring tools
 * - Tích hợp với Prometheus, DataDog, CloudWatch, etc
 * - Real-time performance tracking
 * - Error rate monitoring
 * - Resource usage tracking
 * 
 * Sử dụng:
 * const monitor = new ProductionMonitor();
 * monitor.recordPatchBatch(batchId, { applied: 5, failed: 0, duration: 123 });
 * monitor.getMetrics() → Prometheus format
 */

class ProductionMonitor extends EventEmitter {
  constructor() {
    super();

    // Core metrics buckets
    this.metrics = {
      batches: {
        total: 0,
        succeeded: 0,
        failed: 0,
        totalDuration: 0
      },
      patches: {
        total: 0,
        applied: 0,
        failed: 0
      },
      operations: {
        replace: 0,
        insert: 0,
        delete: 0
      },
      invariants: {
        total_violations: 0,
        by_type: {} // {INVARIANT_NAME: count}
      },
      errors: {
        normalization_failed: 0,
        execution_failed: 0,
        out_of_bounds: 0,
        duplicate_operations: 0,
        other: 0
      },
      performance: {
        semantics_latency_ms: [],
        normalizer_latency_ms: [],
        executor_latency_ms: [],
        total_latency_ms: []
      },
      resources: {
        memory_peak_mb: 0,
        memory_current_mb: 0
      }
    };

    // Time-series data (last N events)
    this.eventLog = [];
    this.maxEventLog = 1000;

    // Alerts
    this.alerts = [];
    this.thresholds = {
      errorRatePercent: 5,      // Alert if error rate > 5%
      latencyMs: 1000,           // Alert if batch > 1 second
      invariantViolations: 10    // Alert if violations/hour > 10
    };
  }

  /**
   * Record batch patch execution
   * @param {object} batchEvent - {
   *   batchId,
   *   patchCount,
   *   applied,
   *   failed,
   *   duration,
   *   operations: {replace, insert, delete},
   *   invariantViolations: [...]
   * }
   */
  recordPatchBatch(batchEvent) {
    const {
      batchId,
      patchCount,
      applied,
      failed,
      duration,
      operations = {},
      invariantViolations = [],
      success
    } = batchEvent;

    // Batch metrics
    this.metrics.batches.total++;
    if (success) {
      this.metrics.batches.succeeded++;
    } else {
      this.metrics.batches.failed++;
    }
    this.metrics.batches.totalDuration += duration;

    // Patch metrics
    this.metrics.patches.total += patchCount;
    this.metrics.patches.applied += applied;
    this.metrics.patches.failed += failed;

    // Operation metrics
    this.metrics.operations.replace += operations.replace || 0;
    this.metrics.operations.insert += operations.insert || 0;
    this.metrics.operations.delete += operations.delete || 0;

    // Invariant violations
    invariantViolations.forEach(violation => {
      this.metrics.invariants.total_violations++;
      const type = violation.type || 'unknown';
      this.metrics.invariants.by_type[type] =
        (this.metrics.invariants.by_type[type] || 0) + 1;
    });

    // Performance latency
    this.metrics.performance.total_latency_ms.push(duration);

    // Keep last N records only
    if (this.metrics.performance.total_latency_ms.length > 1000) {
      this.metrics.performance.total_latency_ms.shift();
    }

    // Event log
    this._addEventLog({
      timestamp: new Date().toISOString(),
      type: 'batch',
      batchId,
      success,
      applied,
      failed,
      duration
    });

    // Check thresholds
    this._checkThresholds();

    // Emit event
    this.emit('batch-recorded', { batchId, success, applied, failed, duration });
  }

  /**
   * Record layer latencies (from observability integration)
   * @param {object} latencies - {
   *   semantics_ms,
   *   normalizer_ms,
   *   executor_ms
   * }
   */
  recordLayerLatencies(latencies) {
    const { semantics_ms, normalizer_ms, executor_ms } = latencies;

    if (semantics_ms !== undefined) {
      this.metrics.performance.semantics_latency_ms.push(semantics_ms);
    }
    if (normalizer_ms !== undefined) {
      this.metrics.performance.normalizer_latency_ms.push(normalizer_ms);
    }
    if (executor_ms !== undefined) {
      this.metrics.performance.executor_latency_ms.push(executor_ms);
    }

    // Keep last 500
    [this.metrics.performance.semantics_latency_ms,
     this.metrics.performance.normalizer_latency_ms,
     this.metrics.performance.executor_latency_ms].forEach(arr => {
      if (arr.length > 500) arr.shift();
    });
  }

  /**
   * Record error (not matched to batch)
   * @param {string} errorType - 'normalization', 'execution', 'out_of_bounds', etc
   * @param {object} details - error details
   */
  recordError(errorType, details) {
    const type = errorType.toLowerCase();
    if (this.metrics.errors[type] !== undefined) {
      this.metrics.errors[type]++;
    } else {
      this.metrics.errors.other++;
    }

    this._addEventLog({
      timestamp: new Date().toISOString(),
      type: 'error',
      errorType,
      details
    });

    this.emit('error-recorded', { errorType, details });
  }

  /**
   * Update memory metrics
   */
  recordMemory() {
    try {
      const memUsage = process.memoryUsage();
      const heapMb = Math.round(memUsage.heapUsed / 1024 / 1024 * 100) / 100;
      
      this.metrics.resources.memory_current_mb = heapMb;
      if (heapMb > this.metrics.resources.memory_peak_mb) {
        this.metrics.resources.memory_peak_mb = heapMb;
      }
    } catch (err) {
      // Ignore
    }
  }

  /**
   * Get all metrics (summary)
   * @returns {object}
   */
  getMetrics() {
    return JSON.parse(JSON.stringify(this.metrics)); // Deep copy
  }

  /**
   * Get Prometheus-format metrics (for scraping)
   * @returns {string}
   */
  getPrometheusMetrics() {
    let output = '';

    // HELP & TYPE
    output += `# HELP batch_patches_total Total batches processed\n`;
    output += `# TYPE batch_patches_total counter\n`;
    output += `batch_patches_total{status="total"} ${this.metrics.batches.total}\n`;
    output += `batch_patches_total{status="succeeded"} ${this.metrics.batches.succeeded}\n`;
    output += `batch_patches_total{status="failed"} ${this.metrics.batches.failed}\n\n`;

    // Patches
    output += `# HELP patches_total Total patches in all batches\n`;
    output += `# TYPE patches_total counter\n`;
    output += `patches_total{status="total"} ${this.metrics.patches.total}\n`;
    output += `patches_total{status="applied"} ${this.metrics.patches.applied}\n`;
    output += `patches_total{status="failed"} ${this.metrics.patches.failed}\n\n`;

    // Operations
    output += `# HELP patch_operations_total Operations by type\n`;
    output += `# TYPE patch_operations_total counter\n`;
    output += `patch_operations_total{type="replace"} ${this.metrics.operations.replace}\n`;
    output += `patch_operations_total{type="insert"} ${this.metrics.operations.insert}\n`;
    output += `patch_operations_total{type="delete"} ${this.metrics.operations.delete}\n\n`;

    // Invariant violations
    output += `# HELP invariant_violations_total Invariant violations\n`;
    output += `# TYPE invariant_violations_total counter\n`;
    output += `invariant_violations_total ${this.metrics.invariants.total_violations}\n`;
    for (const [type, count] of Object.entries(this.metrics.invariants.by_type)) {
      output += `invariant_violations_total{type="${type}"} ${count}\n`;
    }
    output += '\n';

    // Errors
    output += `# HELP errors_total Errors by type\n`;
    output += `# TYPE errors_total counter\n`;
    for (const [type, count] of Object.entries(this.metrics.errors)) {
      output += `errors_total{type="${type}"} ${count}\n`;
    }
    output += '\n';

    // Performance latencies
    const avgLatency = this._average(this.metrics.performance.total_latency_ms);
    const p50Latency = this._percentile(this.metrics.performance.total_latency_ms, 50);
    const p95Latency = this._percentile(this.metrics.performance.total_latency_ms, 95);
    const p99Latency = this._percentile(this.metrics.performance.total_latency_ms, 99);

    output += `# HELP batch_duration_ms Batch processing duration\n`;
    output += `# TYPE batch_duration_ms gauge\n`;
    output += `batch_duration_ms{quantile="avg"} ${avgLatency.toFixed(2)}\n`;
    output += `batch_duration_ms{quantile="p50"} ${p50Latency.toFixed(2)}\n`;
    output += `batch_duration_ms{quantile="p95"} ${p95Latency.toFixed(2)}\n`;
    output += `batch_duration_ms{quantile="p99"} ${p99Latency.toFixed(2)}\n\n`;

    // Memory
    output += `# HELP memory_mb Process memory usage\n`;
    output += `# TYPE memory_mb gauge\n`;
    output += `memory_mb{type="current"} ${this.metrics.resources.memory_current_mb}\n`;
    output += `memory_mb{type="peak"} ${this.metrics.resources.memory_peak_mb}\n\n`;

    return output;
  }

  /**
   * Get recent alerts
   * @returns {array}
   */
  getAlerts() {
    return [...this.alerts].slice(-100); // Last 100 alerts
  }

  /**
   * Get event log
   * @returns {array}
   */
  getEventLog() {
    return [...this.eventLog];
  }

  /**
   * Reset all metrics (for testing)
   */
  reset() {
    this.metrics = {
      batches: { total: 0, succeeded: 0, failed: 0, totalDuration: 0 },
      patches: { total: 0, applied: 0, failed: 0 },
      operations: { replace: 0, insert: 0, delete: 0 },
      invariants: { total_violations: 0, by_type: {} },
      errors: {
        normalization_failed: 0,
        execution_failed: 0,
        out_of_bounds: 0,
        duplicate_operations: 0,
        other: 0
      },
      performance: {
        semantics_latency_ms: [],
        normalizer_latency_ms: [],
        executor_latency_ms: [],
        total_latency_ms: []
      },
      resources: { memory_peak_mb: 0, memory_current_mb: 0 }
    };
    this.eventLog = [];
    this.alerts = [];
  }

  // ============ Private Methods ============

  _addEventLog(event) {
    this.eventLog.push(event);
    if (this.eventLog.length > this.maxEventLog) {
      this.eventLog.shift();
    }
  }

  _checkThresholds() {
    const { batches, patches, performance } = this.metrics;

    // Error rate
    if (batches.total > 0) {
      const errorRate = (batches.failed / batches.total) * 100;
      if (errorRate > this.thresholds.errorRatePercent) {
        this._addAlert('HIGH_ERROR_RATE', {
          rate: errorRate.toFixed(2) + '%',
          threshold: this.thresholds.errorRatePercent + '%'
        });
      }
    }

    // Latency
    const lastLatencies = performance.total_latency_ms.slice(-10);
    lastLatencies.forEach(latency => {
      if (latency > this.thresholds.latencyMs) {
        this._addAlert('SLOW_BATCH', { duration_ms: latency });
      }
    });
  }

  _addAlert(type, details) {
    this.alerts.push({
      timestamp: new Date().toISOString(),
      type,
      details
    });

    if (this.alerts.length > 1000) {
      this.alerts.shift();
    }

    this.emit('alert', { type, details });
  }

  _average(arr) {
    if (arr.length === 0) return 0;
    return arr.reduce((a, b) => a + b, 0) / arr.length;
  }

  _percentile(arr, p) {
    if (arr.length === 0) return 0;
    const sorted = [...arr].sort((a, b) => a - b);
    const index = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, index)];
  }
}

module.exports = {
  ProductionMonitor
};
