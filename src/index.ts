#!/usr/bin/env bun
/**
 * tmux-panes — A beautiful TUI dashboard for monitoring tmux panes
 * Built with OpenTUI for flicker-free differential rendering
 */

import {
  createCliRenderer,
  Box,
  Text,
  ScrollBox,
  vstyles,
  type CliRenderer,
} from "@opentui/core";
import { collectPanes, type TmuxPane, type PaneSnapshot, type PaneProcess } from "./tmux.js";
import * as theme from "./theme.js";

// State
let showIdle = false;
let sortBy: "default" | "cpu" | "mem" = "default";
let renderer: CliRenderer;
let updateTimer: ReturnType<typeof setInterval>;

// Parse CLI args
const args = process.argv.slice(2);
if (args.includes("--idle")) showIdle = true;
const intervalIdx = args.indexOf("-i");
const refreshInterval = intervalIdx !== -1 ? (parseInt(args[intervalIdx + 1]) || 2) * 1000 : 2000;

if (args.includes("-h") || args.includes("--help")) {
  console.log(`tmux-panes — Live TUI monitor for tmux panes with AI agent detection

Usage: tmux-panes [options]

Options:
  --idle        Show idle shell panes (hidden by default)
  -i <seconds>  Refresh interval (default: 2)
  -h, --help    Show this help

Keyboard:
  q, Ctrl+C     Quit
  i              Toggle idle panes
  s              Sort by CPU
  m              Sort by memory
  r              Force refresh`);
  process.exit(0);
}

function buildProcessTree(procs: PaneProcess[], depth: number = 0): string {
  let result = "";
  for (const p of procs) {
    const shortCmd = (p.command.split(" ")[0] || "").split("/").pop() || "?";
    const indent = depth === 0 ? "  ├─ " : "  │  └─ ";
    const cpuStr = `${p.cpu.toFixed(1)}%`;
    const memStr = `${Math.round(p.rss / 1024)}MB`;
    result += `${indent}PID ${p.pid}  ${shortCmd}  ${cpuStr}  ${memStr}\n`;
    if (p.children.length > 0) {
      result += buildProcessTree(p.children, depth + 1);
    }
  }
  return result;
}

function buildAgentCard(pane: TmuxPane): ReturnType<typeof Box> {
  const agent = pane.agent!;
  const color = theme.agentColor(agent.type);
  const icon = theme.agentIcon(agent.type);
  const stColor = theme.statusColor(agent.status);
  const stIcon = theme.statusIcon(agent.status);

  const agentLabel = agent.type === "claude-code" ? "Claude Code"
    : agent.type === "opencode" ? "OpenCode"
    : agent.type === "codex" ? "Codex" : agent.type;

  // Header line
  let headerText = `${icon} ${agentLabel}  ${pane.paneId}  ${pane.location}`;
  if (pane.title && pane.title !== "Khizars-MacBook-Pro.local" && pane.title !== pane.displayCommand) {
    headerText += `  ${pane.title}`;
  }

  // Model line
  let modelText = "";
  if (agent.agentMode && agent.model) {
    modelText = `  Model:    ${agent.agentMode} · ${agent.model}`;
  } else if (agent.model) {
    modelText = `  Model:    ${agent.model}`;
  }
  if (agent.provider) modelText += `  (${agent.provider})`;

  // Status line
  let statusText = `  Status:   ${stIcon} ${agent.status}`;
  if (agent.usage) statusText += `  │  Tokens: ${agent.usage}`;

  // Resources line
  const cpuStr = `${pane.totalCpu.toFixed(1)}%`;
  const bar = theme.cpuBar(pane.totalCpu, 20);
  const resourceText = `  Resources: CPU ${cpuStr} ${bar}  MEM ${pane.rssMb}MB`;

  // Process tree
  const procTree = pane.processes.length > 0 ? buildProcessTree(pane.processes) : "";

  const content = [headerText, modelText, statusText, resourceText, procTree].filter(Boolean).join("\n");

  return Box(
    {
      width: "100%",
      border: true,
      borderColor: color,
      borderStyle: "single",
      padding: 0,
      paddingLeft: 1,
      paddingRight: 1,
      marginBottom: 1,
    },
    Text({
      content,
      fg: theme.colors.normalText,
    })
  );
}

function buildRegularCard(pane: TmuxPane): ReturnType<typeof Box> {
  const icon = pane.active ? "▶" : pane.isIdle ? "○" : "◉";
  const iconColor = pane.active ? theme.colors.idle : pane.isIdle ? theme.colors.dimText : theme.colors.normalText;

  let headerText = `${icon} ${pane.paneId}  ${pane.location}  ${pane.displayCommand}`;
  if (pane.title && pane.title !== "Khizars-MacBook-Pro.local" && pane.title !== pane.displayCommand) {
    headerText += `  ${pane.title}`;
  }

  const cpuStr = `${pane.totalCpu.toFixed(1)}%`;
  const bar = theme.cpuBar(pane.totalCpu, 20);
  const resourceText = `  CPU ${cpuStr} ${bar}  MEM ${pane.rssMb}MB  Procs: ${pane.processCount}  ${pane.width}x${pane.height}`;

  const procTree = pane.processes.length > 0 ? buildProcessTree(pane.processes) : "";
  const content = [headerText, resourceText, procTree].filter(Boolean).join("\n");

  return Box(
    {
      width: "100%",
      border: true,
      borderColor: theme.colors.cardBorder,
      borderStyle: "single",
      padding: 0,
      paddingLeft: 1,
      paddingRight: 1,
      marginBottom: 1,
    },
    Text({
      content,
      fg: theme.colors.dimText,
    })
  );
}

function sortPanes(panes: TmuxPane[]): TmuxPane[] {
  const sorted = [...panes];
  switch (sortBy) {
    case "cpu":
      sorted.sort((a, b) => b.totalCpu - a.totalCpu);
      break;
    case "mem":
      sorted.sort((a, b) => b.totalRss - a.totalRss);
      break;
    default:
      // agents first, then by location
      sorted.sort((a, b) => {
        if (a.isAgent && !b.isAgent) return -1;
        if (!a.isAgent && b.isAgent) return 1;
        return a.location.localeCompare(b.location);
      });
  }
  return sorted;
}

// Keep references to update in place
let headerText: ReturnType<typeof Text> | null = null;
let footerText: ReturnType<typeof Text> | null = null;
let contentBox: ReturnType<typeof ScrollBox> | null = null;

function buildHeader(snapshot: PaneSnapshot): ReturnType<typeof Box> {
  const time = snapshot.timestamp.toLocaleTimeString("en-US", { hour12: false });
  const sortLabel = sortBy === "default" ? "" : ` [sort: ${sortBy}]`;

  headerText = Text({
    content: `  ◆ TMUX PANE MONITOR${sortLabel}                                      ${time}  `,
    fg: theme.colors.brightText,
  });

  return Box(
    {
      width: "100%",
      backgroundColor: theme.colors.headerBg,
      paddingTop: 0,
      paddingBottom: 0,
    },
    headerText,
    Text({
      content: "  [q] quit  [i] idle  [s] cpu sort  [m] mem sort  [r] refresh",
      fg: theme.colors.dimText,
    })
  );
}

function buildFooter(snapshot: PaneSnapshot): ReturnType<typeof Box> {
  const cpuCol = theme.cpuColor(snapshot.totalCpu);
  const memCol = theme.memColor(snapshot.totalRssMb);
  const idleStr = !showIdle && snapshot.idleCount > 0 ? `  +${snapshot.idleCount} idle` : "";

  footerText = Text({
    content: `  ${snapshot.agentCount} agents  ${snapshot.activeCount} visible${idleStr}  │  CPU ${snapshot.totalCpu.toFixed(1)}%  │  MEM ${snapshot.totalRssMb}MB (${theme.humanSize(snapshot.totalRss)})  │  ${refreshInterval / 1000}s`,
    fg: theme.colors.normalText,
  });

  return Box(
    {
      width: "100%",
      backgroundColor: theme.colors.footerBg,
    },
    footerText
  );
}

async function buildView(): Promise<void> {
  let snapshot;
  try {
    snapshot = await collectPanes();
  } catch (err) {
    console.error("\n❌ Error collecting tmux data:", err);
    console.error("\nTip: Make sure tmux is installed and running");
    console.error("   Run 'tmux list-panes -a' to verify");
    process.exit(1);
  }

  let filteredPanes = snapshot.panes;
  if (!showIdle) {
    filteredPanes = filteredPanes.filter((p) => !p.isIdle);
  }
  filteredPanes = sortPanes(filteredPanes);

  // Clear root and rebuild
  renderer.root.clear();

  // Layout: header + scrollable content + footer
  const header = buildHeader(snapshot);

  const cards = filteredPanes.map((pane) =>
    pane.isAgent ? buildAgentCard(pane) : buildRegularCard(pane)
  );

  contentBox = ScrollBox(
    {
      width: "100%",
      flexGrow: 1,
      scrollY: true,
      stickyScroll: false,
    },
    Box(
      {
        width: "100%",
        flexDirection: "column",
        padding: 1,
      },
      ...cards
    )
  );

  const footer = buildFooter(snapshot);

  renderer.root.add(
    Box(
      {
        width: "100%",
        height: "100%",
        flexDirection: "column",
      },
      header,
      contentBox,
      footer
    )
  );

  renderer.requestRender();
}

async function main() {
  // Check if running in a terminal
  if (!process.stdin.isTTY) {
    console.error("Error: tmux-panes must be run in an interactive terminal");
    console.error("Tip: Run directly in your shell, not through a pipe or script");
    process.exit(1);
  }

  try {
    renderer = await createCliRenderer({
      exitOnCtrlC: true,
      screenMode: "alternate-screen",
      useMouse: true,
      targetFps: 30,
      maxFps: 60,
    });
  } catch (err) {
    console.error("Error initializing TUI renderer:", err);
    console.error("Tip: Make sure your terminal supports alternate screen mode");
    process.exit(1);
  }

  // Keyboard handling
  renderer.keyInput.on("keypress", (event) => {
    const key = event.name || event.sequence;

    switch (key) {
      case "q":
        cleanup();
        break;
      case "i":
        showIdle = !showIdle;
        buildView();
        break;
      case "s":
        sortBy = sortBy === "cpu" ? "default" : "cpu";
        buildView();
        break;
      case "m":
        sortBy = sortBy === "mem" ? "default" : "mem";
        buildView();
        break;
      case "r":
        buildView();
        break;
    }
  });

  // Initial render
  await buildView();

  // Periodic refresh
  updateTimer = setInterval(() => {
    buildView();
  }, refreshInterval);
}

function cleanup() {
  if (updateTimer) clearInterval(updateTimer);
  if (renderer) renderer.destroy();
  process.exit(0);
}

process.on("SIGINT", cleanup);
process.on("SIGTERM", cleanup);

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
