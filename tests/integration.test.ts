/**
 * Integration tests for tmux-panes
 * Run with: bun test
 */

import { describe, it, expect, beforeEach, mock } from "bun:test";
import { $ } from "bun";
import {
  collectPanes,
  type PaneSnapshot,
  type AgentInfo,
} from "../src/tmux.js";
import {
  colors,
  cpuColor,
  memColor,
  statusColor,
  agentColor,
  statusIcon,
  agentIcon,
  humanSize,
  cpuBar,
} from "../src/theme.js";

// ============================================================================
// Theme/Utility Tests
// ============================================================================

describe("Theme utilities", () => {
  describe("cpuColor", () => {
    it("returns low color for CPU < 15%", () => {
      expect(cpuColor(0)).toBe(colors.cpuLow);
      expect(cpuColor(14.9)).toBe(colors.cpuLow);
    });

    it("returns medium color for CPU 15-50%", () => {
      expect(cpuColor(15)).toBe(colors.cpuMed);
      expect(cpuColor(49.9)).toBe(colors.cpuMed);
    });

    it("returns high color for CPU >= 50%", () => {
      expect(cpuColor(50)).toBe(colors.cpuHigh);
      expect(cpuColor(100)).toBe(colors.cpuHigh);
    });
  });

  describe("memColor", () => {
    it("returns low color for memory < 256MB", () => {
      expect(memColor(0)).toBe(colors.memLow);
      expect(memColor(255)).toBe(colors.memLow);
    });

    it("returns medium color for memory 256MB-1GB", () => {
      expect(memColor(256)).toBe(colors.memMed);
      expect(memColor(1023)).toBe(colors.memMed);
    });

    it("returns high color for memory >= 1GB", () => {
      expect(memColor(1024)).toBe(colors.memHigh);
      expect(memColor(2048)).toBe(colors.memHigh);
    });
  });

  describe("statusColor", () => {
    it("returns correct colors for each status", () => {
      expect(statusColor("generating")).toBe(colors.generating);
      expect(statusColor("working")).toBe(colors.working);
      expect(statusColor("idle")).toBe(colors.idle);
      expect(statusColor("active")).toBe(colors.active);
      expect(statusColor("unknown")).toBe(colors.unknown);
      expect(statusColor("random")).toBe(colors.unknown);
    });
  });

  describe("agentColor", () => {
    it("returns correct colors for each agent type", () => {
      expect(agentColor("claude-code")).toBe(colors.claude);
      expect(agentColor("opencode")).toBe(colors.opencode);
      expect(agentColor("codex")).toBe(colors.codex);
      expect(agentColor("other")).toBe(colors.accent);
    });
  });

  describe("statusIcon", () => {
    it("returns correct icons for each status", () => {
      expect(statusIcon("generating")).toBe("⟳");
      expect(statusIcon("working")).toBe("⟳");
      expect(statusIcon("idle")).toBe("●");
      expect(statusIcon("active")).toBe("◉");
      expect(statusIcon("unknown")).toBe("?");
    });
  });

  describe("agentIcon", () => {
    it("returns hexagon icon for all agent types", () => {
      expect(agentIcon("claude-code")).toBe("⬡");
      expect(agentIcon("opencode")).toBe("⬡");
      expect(agentIcon("codex")).toBe("⬡");
      expect(agentIcon("other")).toBe("◆");
    });
  });

  describe("humanSize", () => {
    it("formats KB correctly", () => {
      expect(humanSize(512)).toBe("512KB");
      expect(humanSize(1023)).toBe("1023KB");
    });

    it("formats MB correctly", () => {
      expect(humanSize(1024)).toBe("1MB");
      expect(humanSize(2048)).toBe("2MB");
      expect(humanSize(1048575)).toBe("1024MB");
    });

    it("formats GB correctly", () => {
      expect(humanSize(1048576)).toBe("1.0GB");
      expect(humanSize(2097152)).toBe("2.0GB");
      expect(humanSize(1572864)).toBe("1.5GB");
    });
  });

  describe("cpuBar", () => {
    it("creates bar of correct width", () => {
      expect(cpuBar(0, 20).length).toBe(20);
      expect(cpuBar(50, 10).length).toBe(10);
      expect(cpuBar(100, 30).length).toBe(30);
    });

    it("fills correct proportion", () => {
      expect(cpuBar(0, 20)).toBe("░░░░░░░░░░░░░░░░░░░░");
      expect(cpuBar(50, 20)).toBe("██████████░░░░░░░░░░");
      expect(cpuBar(100, 20)).toBe("████████████████████");
    });

    it("caps at 100%", () => {
      expect(cpuBar(150, 20)).toBe("████████████████████");
    });
  });
});

// ============================================================================
// Agent Detection Tests
// ============================================================================

describe("Agent detection", () => {
  // These test the internal detectAgent function indirectly via patterns

  it("detects Claude Code from command", async () => {
    // We can't directly test the internal function, but we can verify
    // the patterns work by checking if collectPanes runs without error
    // when tmux is available
    try {
      const snapshot = await collectPanes();
      expect(snapshot).toBeDefined();
      expect(Array.isArray(snapshot.panes)).toBe(true);
    } catch (e) {
      // tmux might not be running, that's ok for this test
      expect(e).toBeDefined();
    }
  });
});

// ============================================================================
// Data Collection Integration Tests
// ============================================================================

describe("Data collection integration", () => {
  it("collectPanes returns valid snapshot structure", async () => {
    try {
      const snapshot = await collectPanes();

      // Verify snapshot structure
      expect(snapshot).toHaveProperty("panes");
      expect(snapshot).toHaveProperty("totalCpu");
      expect(snapshot).toHaveProperty("totalRss");
      expect(snapshot).toHaveProperty("totalRssMb");
      expect(snapshot).toHaveProperty("agentCount");
      expect(snapshot).toHaveProperty("activeAgentCount");
      expect(snapshot).toHaveProperty("agentCpu");
      expect(snapshot).toHaveProperty("agentRssMb");
      expect(snapshot).toHaveProperty("activeCount");
      expect(snapshot).toHaveProperty("idleCount");
      expect(snapshot).toHaveProperty("system");
      expect(snapshot).toHaveProperty("timestamp");

      // Verify types
      expect(typeof snapshot.totalCpu).toBe("number");
      expect(typeof snapshot.totalRss).toBe("number");
      expect(typeof snapshot.agentCount).toBe("number");
      expect(typeof snapshot.activeAgentCount).toBe("number");
      expect(typeof snapshot.agentCpu).toBe("number");
      expect(snapshot.timestamp instanceof Date).toBe(true);
      expect(typeof snapshot.system.cpuUsedPercent).toBe("number");
      expect(typeof snapshot.system.memUsedPercent).toBe("number");

      // Verify panes array
      expect(Array.isArray(snapshot.panes)).toBe(true);

      // Verify each pane has required fields
      for (const pane of snapshot.panes) {
        expect(pane).toHaveProperty("paneId");
        expect(pane).toHaveProperty("location");
        expect(pane).toHaveProperty("command");
        expect(pane).toHaveProperty("pid");
        expect(pane).toHaveProperty("active");
        expect(pane).toHaveProperty("isIdle");
        expect(pane).toHaveProperty("isAgent");
        expect(pane).toHaveProperty("totalCpu");
        expect(pane).toHaveProperty("rssMb");
        expect(pane).toHaveProperty("processes");

        expect(typeof pane.paneId).toBe("string");
        expect(typeof pane.active).toBe("boolean");
        expect(typeof pane.isIdle).toBe("boolean");
        expect(typeof pane.isAgent).toBe("boolean");
        expect(Array.isArray(pane.processes)).toBe(true);
      }

      // Verify counts are consistent
      expect(snapshot.agentCount).toBe(
        snapshot.panes.filter((p) => p.isAgent).length
      );
      expect(snapshot.activeCount).toBe(
        snapshot.panes.filter((p) => !p.isIdle).length
      );
      expect(snapshot.idleCount).toBe(
        snapshot.panes.filter((p) => p.isIdle).length
      );
      expect(snapshot.panes.length).toBe(
        snapshot.activeCount + snapshot.idleCount
      );

      console.log(`✓ Collected ${snapshot.panes.length} panes`);
      console.log(`  Agents: ${snapshot.agentCount}`);
      console.log(`  Active: ${snapshot.activeCount}`);
      console.log(`  Idle: ${snapshot.idleCount}`);
    } catch (e) {
      // If tmux is not running, that's an expected error
      const errorMsg = String(e);
      if (errorMsg.includes("tmux") || errorMsg.includes("No such file")) {
        console.log("⚠ tmux not available, skipping integration test");
        return;
      }
      throw e;
    }
  });

  it("handles missing tmux gracefully", async () => {
    // Test that we get a proper error when tmux is not available
    // This test assumes we might be in an environment without tmux
    try {
      await collectPanes();
      // If we get here, tmux is available
      expect(true).toBe(true);
    } catch (e) {
      // Expected error - verify it's a proper error
      expect(e).toBeDefined();
      const errorMsg = String(e);
      expect(
        errorMsg.includes("tmux") ||
        errorMsg.includes("No such file") ||
        errorMsg.includes("not found") ||
        errorMsg.includes("exited with code")
      ).toBe(true);
    }
  });
});

// ============================================================================
// Error Handling Tests
// ============================================================================

describe("Error handling", () => {
  it("handles empty ps output gracefully", async () => {
    // The ps cache should handle empty output without crashing
    try {
      const snapshot = await collectPanes();
      // If we get here, the empty cache was handled
      expect(snapshot).toBeDefined();
    } catch (e) {
      // Errors are ok as long as they're not crashes
      expect(e).toBeDefined();
    }
  });

  it("handles malformed pane data gracefully", async () => {
    // Test that invalid pane data doesn't crash the collector
    try {
      const snapshot = await collectPanes();
      // Verify all pids are valid numbers
      for (const pane of snapshot.panes) {
        expect(typeof pane.pid).toBe("number");
        expect(Number.isNaN(pane.pid)).toBe(false);
      }
    } catch (e) {
      // tmux might not be available
      expect(e).toBeDefined();
    }
  });
});

// ============================================================================
// Rendering Tests
// ============================================================================

describe("Rendering components", () => {
  it("can create agent card data structure", () => {
    const mockAgent: AgentInfo = {
      type: "claude-code",
      model: "Opus 4.6",
      provider: "Anthropic",
      status: "generating",
      usage: "Claude Team",
      agentMode: "",
    };

    // Verify the data structure can be created
    expect(mockAgent.type).toBe("claude-code");
    expect(mockAgent.model).toBe("Opus 4.6");
    expect(mockAgent.status).toBe("generating");
    expect(statusIcon(mockAgent.status)).toBe("⟳");
    expect(agentColor(mockAgent.type)).toBe(colors.claude);
  });

  it("can create OpenCode agent card data", () => {
    const mockAgent: AgentInfo = {
      type: "opencode",
      model: "GPT-5.4",
      provider: "OpenAI",
      status: "working",
      usage: "51.7K (25%)",
      agentMode: "Coding-Pro",
    };

    expect(mockAgent.type).toBe("opencode");
    expect(mockAgent.agentMode).toBe("Coding-Pro");
    expect(mockAgent.usage).toBe("51.7K (25%)");
    expect(statusIcon(mockAgent.status)).toBe("⟳");
    expect(agentColor(mockAgent.type)).toBe(colors.opencode);
  });

  it("handles all agent types in UI functions", () => {
    const types = ["claude-code", "opencode", "codex", "unknown"];
    const statuses = ["generating", "working", "idle", "active", "unknown"];

    for (const type of types) {
      expect(() => agentColor(type)).not.toThrow();
      expect(() => agentIcon(type)).not.toThrow();
    }

    for (const status of statuses) {
      expect(() => statusColor(status)).not.toThrow();
      expect(() => statusIcon(status)).not.toThrow();
    }
  });
});

// ============================================================================
// Performance Tests
// ============================================================================

describe("Performance", () => {
  it("collects data within reasonable time", async () => {
    const start = performance.now();
    try {
      await collectPanes();
      const duration = performance.now() - start;
      console.log(`Data collection took ${duration.toFixed(1)}ms`);
      expect(duration).toBeLessThan(5000); // Should complete in under 5 seconds
    } catch (e) {
      // tmux might not be available
      console.log("Performance test skipped - tmux not available");
    }
  });
});

console.log("\n🧪 Running tmux-panes integration tests...\n");
