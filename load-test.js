#!/usr/bin/env node

/**
 * load-test.js
 * 
 * Load testing: Measure performance with 1k, 10k, 100k patches
 * Tests latency, memory, throughput
 */

const PatchSemantics = require('./src/core/PATCH_SEMANTICS');
const PatchNormalizer = require('./src/core/PATCH_NORMALIZER');
const PatchExecutor = require('./src/core/PATCH_EXECUTOR');
const Logger = require('./src/observability/LOGGER');
const Metrics = require('./src/observability/METRICS');

const logger = new Logger({ level: 'INFO', batchId: 'load-test' });
const metrics = new Metrics();

// Generate random patches for load test
function generatePatches(count) {
  const patches = [];
  for (let i = 0; i < count; i++) {
    const type = Math.random() > 0.5 ? 'REPLACE' : 'INSERT';
    patches.push({
      type,
      path: `line_${Math.floor(i / 10) + 1}`,
      old: type === 'REPLACE' ? `old_${i}` : undefined,
      new: `new_${i}_value_${Math.random().toString(36).substr(2, 9)}`,
      reason: `Auto-patch ${i}`
    });
  }
  return patches;
}

// Test function
function runLoadTest(patchCount) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`LOAD TEST: ${patchCount} patches`);
  console.log(`${'='.repeat(60)}\n`);

  // Generate test data
  const startGenerate = process.memoryUsage().heapUsed;
  const patches = generatePatches(patchCount);
  const endGenerate = process.memoryUsage().heapUsed;
  const generateMemory = (endGenerate - startGenerate) / 1024 / 1024;

  console.log(`📊 Generated ${patchCount} patches (${generateMemory.toFixed(2)}MB memory)\n`);

  // Create test document
  const testDoc = {
    lines: Array(100).fill(null).map((_, i) => `line_${i + 1}_original_content`),
    revision: 'v1',
    lineCount: 100
  };

  // === LAYER 1: SEMANTICS ===
  console.log('🔍 Layer 1: Semantics Analysis');
  const t1Start = Date.now();
  const m1Start = process.memoryUsage().heapUsed;
  
  const semantics = new PatchSemantics();
  const analysis = semantics.analyze(patches);
  
  const m1End = process.memoryUsage().heapUsed;
  const t1Duration = Date.now() - t1Start;
  const m1Memory = (m1End - m1Start) / 1024 / 1024;

  console.log(`   ✅ Time: ${t1Duration}ms`);
  console.log(`   ✅ Memory: ${m1Memory.toFixed(2)}MB`);
  console.log(`   ✅ Result: ${analysis.totalPatches} patches analyzed\n`);

  // === LAYER 2: NORMALIZATION ===
  console.log('📋 Layer 2: Normalization');
  const t2Start = Date.now();
  const m2Start = process.memoryUsage().heapUsed;
  
  const normalizer = new PatchNormalizer();
  const normalized = normalizer.normalize(patches, testDoc);
  
  const m2End = process.memoryUsage().heapUsed;
  const t2Duration = Date.now() - t2Start;
  const m2Memory = (m2End - m2Start) / 1024 / 1024;

  console.log(`   ✅ Time: ${t2Duration}ms`);
  console.log(`   ✅ Memory: ${m2Memory.toFixed(2)}MB`);
  console.log(`   ✅ Result: ${normalized.length} normalized patches\n`);

  // === LAYER 3: EXECUTION ===
  console.log('⚙️  Layer 3: Execution');
  const t3Start = Date.now();
  const m3Start = process.memoryUsage().heapUsed;
  
  const executor = new PatchExecutor();
  const result = executor.execute(normalized, testDoc, `v1`, `v${Math.random().toString(36).substr(2, 5)}`);
  
  const m3End = process.memoryUsage().heapUsed;
  const t3Duration = Date.now() - t3Start;
  const m3Memory = (m3End - m3Start) / 1024 / 1024;

  console.log(`   ✅ Time: ${t3Duration}ms`);
  console.log(`   ✅ Memory: ${m3Memory.toFixed(2)}MB`);
  console.log(`   ✅ Applied: ${result.appliedCount} patches\n`);

  // === TOTAL ===
  const totalTime = t1Duration + t2Duration + t3Duration;
  const totalMemory = m1Memory + m2Memory + m3Memory;
  const throughput = patchCount / (totalTime / 1000);

  console.log(`📈 SUMMARY`);
  console.log(`   Total Time: ${totalTime}ms`);
  console.log(`   Total Memory: ${totalMemory.toFixed(2)}MB`);
  console.log(`   Throughput: ${throughput.toFixed(0)} patches/sec`);
  console.log(`   Per-Patch Latency: ${(totalTime / patchCount).toFixed(3)}ms\n`);

  return {
    patchCount,
    time: totalTime,
    memory: totalMemory,
    throughput,
    latency: totalTime / patchCount
  };
}

// Run tests
console.log('╔════════════════════════════════════════════════════════╗');
console.log('║           LOAD TEST: Performance Measurement            ║');
console.log('║   Testing with 1k, 10k, 100k patches                   ║');
console.log('╚════════════════════════════════════════════════════════╝');

const results = [];
const testSizes = [1000, 10000, 100000];

for (const size of testSizes) {
  try {
    const result = runLoadTest(size);
    results.push(result);
  } catch (err) {
    console.error(`❌ Failed for ${size} patches:`, err.message);
  }
}

// === COMPARISON ===
console.log(`\n${'='.repeat(60)}`);
console.log('COMPARISON ACROSS LOAD SIZES');
console.log(`${'='.repeat(60)}\n`);

console.log('Patch Count | Time (ms) | Memory (MB) | Throughput | Latency (ms)');
console.log('-'.repeat(60));
for (const r of results) {
  const line = 
    `${r.patchCount.toString().padEnd(11)} | ` +
    `${r.time.toString().padEnd(9)} | ` +
    `${r.memory.toFixed(2).padEnd(11)} | ` +
    `${r.throughput.toFixed(0).padEnd(10)} | ` +
    `${r.latency.toFixed(4)}`;
  console.log(line);
}

console.log('\n✅ Load test complete!');
console.log('\nKEY METRICS:');
console.log(`   1. Linear scaling? ${results[1].time / results[0].time < 12 ? '✅ YES' : '❌ NO'}`);
console.log(`   2. Memory efficient? ${results[1].memory / results[0].memory < 12 ? '✅ YES' : '❌ NO'}`);
console.log(`   3. Throughput stable? ${Math.abs(results[0].throughput - results[1].throughput) / results[0].throughput < 0.2 ? '✅ YES' : '❌ NO'}`);
