#!/usr/bin/env bun
/**
 * Test runner script for tmux-panes
 * Runs all test suites and generates a report
 */

import { $ } from "bun";

const tests = [
  { file: "tests/agent-detection.test.ts", name: "Agent Detection" },
  { file: "tests/error-handling.test.ts", name: "Error Handling" },
  { file: "tests/integration.test.ts", name: "Integration" },
];

console.log("\n" + "=".repeat(70));
console.log(" 🧪 tmux-panes Test Suite");
console.log("=".repeat(70) + "\n");

let passed = 0;
let failed = 0;

for (const test of tests) {
  console.log(`\n📋 Running ${test.name} Tests...`);
  console.log("-".repeat(70));

  try {
    const result = await $`bun test ${test.file}`.nothrow();

    if (result.exitCode === 0) {
      console.log(`\n✅ ${test.name} tests passed`);
      passed++;
    } else {
      console.log(`\n❌ ${test.name} tests failed`);
      failed++;
    }
  } catch (e) {
    console.log(`\n❌ ${test.name} tests error: ${e}`);
    failed++;
  }
}

console.log("\n" + "=".repeat(70));
console.log(" 📊 Test Summary");
console.log("=".repeat(70));
console.log(`\n   Passed: ${passed}/${tests.length}`);
console.log(`   Failed: ${failed}/${tests.length}`);
console.log(`   Total:  ${tests.length}`);

if (failed === 0) {
  console.log("\n🎉 All tests passed!");
  process.exit(0);
} else {
  console.log("\n⚠️  Some tests failed");
  process.exit(1);
}
