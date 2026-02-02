#!/usr/bin/env node

/**
 * load-test-simple.js
 * 
 * Simplified load testing: Measure performance with 1k, 10k patches
 * Tests latency and memory usage
 */

const assert = require('assert');

// Load production modules
const PatchExecutor = require('./src/core/PATCH_EXECUTOR');

console.log('╔════════════════════════════════════════════════════════╗');
console.log('║           LOAD TEST: Performance Measurement            ║');
console.log('║   Testing with 1k, 10k patches                         ║');
console.log('╚════════════════════════════════════════════════════════╝\n');

// Generate random patches
function generatePatches(count) {
  const patches = [];
  for (let i = 0; i < count; i++) {
    const type = i % 3 === 0 ? 'REPLACE' : i % 3 === 1 ? 'INSERT' : 'DELETE';
    patches.push({
      type,
      path: `line_${(i % 50) + 1}`,
      old: type !== 'INSERT' ? `old_${i}` : undefined,
      new: type !== 'DELETE' ? `new_${i}` : undefined,
    });
  }
  return patches;
}

// Test one load size
function runTest(patchCount) {
  console.log(`${'='.repeat(60)}`);
  console.log(`TEST: ${patchCount} patches`);
  console.log(`${'='.repeat(60)}\n`);

  // Create document
  const doc = {
    lines: Array(100).fill(null).map((_, i) => `line_${i + 1}`),
    revision: 'v1'
  };

  // Generate patches
  const t0 = Date.now();
  const m0 = process.memoryUsage().heapUsed;
  const patches = generatePatches(patchCount);
  const m1 = process.memoryUsage().heapUsed;

  console.log(`📊 Data Generation`);
  console.log(`   Memory: +${((m1 - m0) / 1024 / 1024).toFixed(2)}MB\n`);

  // Apply patches
  const tStart = Date.now();
  const mStart = process.memoryUsage().heapUsed;
  
  const executor = new PatchExecutor();
  let successCount = 0;
  let failCount = 0;

  for (const patch of patches) {
    try {
      const result = executor.execute(
        [patch],
        doc,
        doc.revision,
        `v2_${Math.random().toString(36).substr(2, 5)}`
      );
      if (result && result.appliedCount > 0) {
        successCount++;
      } else {
        failCount++;
      }
    } catch (e) {
      failCount++;
    }
  }

  const mEnd = process.memoryUsage().heapUsed;
  const tEnd = Date.now();

  const duration = tEnd - tStart;
  const memory = (mEnd - mStart) / 1024 / 1024;
  const throughput = patchCount / (duration / 1000);
  const latency = duration / patchCount;

  console.log(`⚙️  Execution Results`);
  console.log(`   Success: ${successCount} patches`);
  console.log(`   Failed: ${failCount} patches`);
  console.log(`   Duration: ${duration}ms`);
  console.log(`   Memory used: ${memory.toFixed(2)}MB`);
  console.log(`   Throughput: ${throughput.toFixed(0)} patches/sec`);
  console.log(`   Avg latency: ${latency.toFixed(4)}ms/patch\n`);

  return {
    patchCount,
    duration,
    memory,
    throughput,
    latency,
    success: successCount,
    failed: failCount
  };
}

// Run tests
const results = [];
const sizes = [1000, 10000];

for (const size of sizes) {
  const result = runTest(size);
  results.push(result);
}

// Comparison
console.log(`${'='.repeat(60)}`);
console.log('PERFORMANCE SUMMARY');
console.log(`${'='.repeat(60)}\n`);

console.log('Load    | Duration | Memory   | Throughput | Latency');
console.log('--------|----------|----------|------------|--------');
for (const r of results) {
  console.log(
    `${r.patchCount.toString().padEnd(7)} | ` +
    `${r.duration.toString().padEnd(8)}ms | ` +
    `${r.memory.toFixed(2).padEnd(8)}MB | ` +
    `${r.throughput.toFixed(0).padEnd(10)}/s | ` +
    `${r.latency.toFixed(4)}ms`
  );
}

// Analysis
console.log('\n📈 ANALYSIS');
const ratio = results[1].duration / results[0].duration;
console.log(`   10x load → ${ratio.toFixed(1)}x time (linear? ${ratio < 15 ? '✅' : '❌'})`);
console.log(`   Memory efficient? ${results[1].memory / results[0].memory < 15 ? '✅' : '❌'}`);
console.log(`   Stable throughput? ${Math.abs(results[0].throughput - results[1].throughput) / results[0].throughput < 0.3 ? '✅' : '❌'}`);

console.log('\n✅ Load test complete!');
