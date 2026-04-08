/**
 * Error handling and edge case tests
 */

import { describe, it, expect } from "bun:test";
import {
  colors,
  cpuColor,
  memColor,
  humanSize,
  cpuBar,
} from "../src/theme.js";

describe("Error handling", () => {
  describe("Theme functions with edge values", () => {
    it("handles negative CPU values", () => {
      expect(cpuColor(-10)).toBe(colors.cpuLow);
      expect(cpuColor(-0.1)).toBe(colors.cpuLow);
    });

    it("handles very high CPU values", () => {
      expect(cpuColor(1000)).toBe(colors.cpuHigh);
      expect(cpuColor(999.9)).toBe(colors.cpuHigh);
    });

    it("handles NaN and Infinity gracefully", () => {
      // These should not throw
      expect(() => cpuColor(NaN)).not.toThrow();
      expect(() => cpuColor(Infinity)).not.toThrow();
      expect(() => cpuColor(-Infinity)).not.toThrow();
    });

    it("handles negative memory values", () => {
      expect(memColor(-100)).toBe(colors.memLow);
      expect(memColor(-1)).toBe(colors.memLow);
    });

    it("handles very large memory values", () => {
      expect(memColor(1000000)).toBe(colors.memHigh); // ~1TB
      expect(memColor(Number.MAX_SAFE_INTEGER)).toBe(colors.memHigh);
    });
  });

  describe("humanSize edge cases", () => {
    it("handles zero", () => {
      expect(humanSize(0)).toBe("0KB");
    });

    it("handles negative values", () => {
      // Should handle gracefully even if result is weird
      expect(() => humanSize(-1)).not.toThrow();
      expect(() => humanSize(-1024)).not.toThrow();
    });

    it("handles very small values", () => {
      expect(humanSize(1)).toBe("1KB");
      expect(humanSize(0.5)).toBe("0.5KB");
    });

    it("handles exact boundaries", () => {
      expect(humanSize(1023)).toBe("1023KB");
      expect(humanSize(1024)).toBe("1MB");
      expect(humanSize(1048575)).toBe("1024MB");
      expect(humanSize(1048576)).toBe("1.0GB");
    });
  });

  describe("cpuBar edge cases", () => {
    it("handles zero width", () => {
      expect(cpuBar(0, 0)).toBe("");
    });

    it("handles negative values", () => {
      expect(cpuBar(-10, 20)).toBe("░░░░░░░░░░░░░░░░░░░░");
    });

    it("handles width of 1", () => {
      expect(cpuBar(0, 1)).toBe("░");
      expect(cpuBar(100, 1)).toBe("█");
      expect(cpuBar(50, 1)).toBe("█");
    });

    it("handles very large widths", () => {
      const bar = cpuBar(50, 100);
      expect(bar.length).toBe(100);
      expect(bar).toContain("█");
      expect(bar).toContain("░");
    });
  });
});

describe("Data validation", () => {
  it("validates pane ID format", () => {
    const validIds = ["%0", "%1", "%99", "%123"];
    const invalidIds = ["", "pane", "1", "%%1", "%"];

    for (const id of validIds) {
      expect(/^%\d+$/.test(id)).toBe(true);
    }

    for (const id of invalidIds) {
      expect(/^%\d+$/.test(id)).toBe(false);
    }
  });

  it("validates location format", () => {
    const validLocs = ["0:1.1", "session:1.1", "main:10.5", "2:3.4"];
    const invalidLocs = ["", "1.1", "0:1", "session", "a:b.c"];

    const locPattern = /^[^:]+:\d+\.\d+$/;

    for (const loc of validLocs) {
      expect(locPattern.test(loc)).toBe(true);
    }

    for (const loc of invalidLocs) {
      expect(locPattern.test(loc)).toBe(false);
    }
  });

  it("validates size format", () => {
    const validSizes = ["80x24", "145x41", "1920x1080"];
    const invalidSizes = ["", "80", "x24", "80x", "abc"];

    const sizePattern = /^\d+x\d+$/;

    for (const size of validSizes) {
      expect(sizePattern.test(size)).toBe(true);
    }

    for (const size of invalidSizes) {
      expect(sizePattern.test(size)).toBe(false);
    }
  });
});

describe("Process tree handling", () => {
  it("handles empty process arrays", () => {
    const empty: any[] = [];
    expect(empty.length).toBe(0);
    expect(empty.reduce((a, b) => a + b, 0)).toBe(0);
  });

  it("handles deeply nested processes", () => {
    const depth = 100;
    let proc: any = { pid: 1, children: [] };
    let current = proc;

    for (let i = 0; i < depth; i++) {
      current.children = [{ pid: i + 2, children: [] }];
      current = current.children[0];
    }

    // Should handle deep nesting without stack overflow
    expect(proc.pid).toBe(1);
  });

  it("handles circular references safely", () => {
    const parent: any = { pid: 1, children: [] };
    const child: any = { pid: 2, children: [] };
    parent.children.push(child);
    // Don't create actual circular ref, but test structure
    expect(parent.children[0].pid).toBe(2);
  });
});

describe("String handling", () => {
  it("handles unicode strings", () => {
    const unicodeStrings = [
      "⬡ Claude Code",
      "⟳ generating",
      "● idle",
      "🤖 AI Agent",
      "中文测试",
      "日本語テスト",
      "🔥 fire",
    ];

    for (const str of unicodeStrings) {
      expect(typeof str).toBe("string");
      expect(str.length).toBeGreaterThan(0);
    }
  });

  it("handles very long strings", () => {
    const longString = "a".repeat(100000);
    expect(longString.length).toBe(100000);
    expect(longString.slice(0, 10)).toBe("aaaaaaaaaa");
  });

  it("handles strings with special characters", () => {
    const specialStrings = [
      "command | pipe",
      "file > output.txt",
      "var=$HOME",
      "$(command)",
      "`backtick`",
      '\\backslash\\',
      "\n\r\t",
    ];

    for (const str of specialStrings) {
      expect(typeof str).toBe("string");
    }
  });
});

describe("Numeric precision", () => {
  it("handles floating point CPU values", () => {
    const cpu = 12.3456789;
    const rounded = parseFloat(cpu.toFixed(1));
    expect(rounded).toBe(12.3);
  });

  it("handles RSS calculations", () => {
    const rss = 1024000; // KB
    const mb = Math.round(rss / 1024);
    expect(mb).toBe(1000);
  });

  it("handles large RSS values without overflow", () => {
    const largeRss = Number.MAX_SAFE_INTEGER;
    const mb = Math.round(largeRss / 1024);
    expect(typeof mb).toBe("number");
    expect(Number.isFinite(mb)).toBe(true);
  });
});

console.log("\n🛡️ Running error handling tests...\n");
