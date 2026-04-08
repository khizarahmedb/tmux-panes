#!/usr/bin/env bun
/**
 * tmux-panes — compact TUI monitor for tmux panes
 */

import {
  createCliRenderer,
  Box,
  Text,
  ScrollBox,
  type CliRenderer,
} from "@opentui/core";
import { collectPanes, type PaneProcess, type PaneSnapshot, type TmuxPane } from "./tmux.js";
import * as theme from "./theme.js";

type SortMode = "default" | "cpu" | "mem";
type FilterMode = "all" | "active" | "idle";

let showIdle = false;
let sortBy: SortMode = "default";
let filterMode: FilterMode = "all";
let renderer: CliRenderer;
let updateTimer: ReturnType<typeof setInterval>;
let lastSnapshot: PaneSnapshot | null = null;
let lastError: string | null = null;

const args = process.argv.slice(2);
if (args.includes("--idle")) showIdle = true;
const intervalIdx = args.indexOf("-i");
const refreshInterval = intervalIdx !== -1 ? (parseInt(args[intervalIdx + 1]) || 2) * 1000 : 2000;

if (args.includes("-h") || args.includes("--help")) {
  console.log(`tmux-panes — compact live monitor for tmux panes

Usage: tmux-panes [options]

Options:
  --idle        Include shell-idle panes by default
  -i <seconds>  Refresh interval (default: 2)
  -h, --help    Show this help

Keyboard:
  q, Ctrl+C     Quit
  i             Toggle shell-idle panes
  f             Cycle filter (all / active / idle)
  s             Sort by CPU
  m             Sort by memory
  r             Force refresh`);
  process.exit(0);
}

function clearRoot(): void {
  if (!renderer) return;
  for (const child of [...renderer.root.getChildren()]) {
    renderer.root.remove(child.id);
  }
}

function safeExit(code: number, message?: string, error?: unknown): never {
  if (updateTimer) clearInterval(updateTimer);

  if (renderer) {
    try {
      renderer.destroy();
    } catch {
      // best-effort restore
    }
  }

  if (message) {
    const output = code === 0 ? console.log : console.error;
    output(message);
    if (error) output(error);
  }

  process.exit(code);
}

function panePrimaryProcess(procs: PaneProcess[]): string {
  const primary = procs[0];
  if (!primary) return "";
  const cmd = (primary.command.split(" ")[0] || "").split("/").pop() || "?";
  return `pid ${primary.pid} ${cmd}`;
}

function compactLocation(pane: TmuxPane): string {
  return pane.title && pane.title !== "Khizars-MacBook-Pro.local" && pane.title !== pane.displayCommand
    ? `${pane.location} · ${pane.title}`
    : pane.location;
}

function buildAgentCard(pane: TmuxPane): ReturnType<typeof Box> {
  const agent = pane.agent!;
  const agentLabel = agent.type === "claude-code"
    ? "Claude"
    : agent.type === "opencode"
      ? "OpenCode"
      : agent.type === "codex"
        ? "Codex"
        : agent.type;

  const line1 = `${theme.agentIcon(agent.type)} ${agentLabel}  ${pane.paneId}  ${compactLocation(pane)}  ${theme.statusIcon(agent.status)} ${agent.status}`;
  const modelLabel = agent.agentMode && agent.model
    ? `${agent.agentMode} · ${agent.model}`
    : agent.model || agent.provider || pane.displayCommand;
  const line2 = [
    modelLabel,
    agent.provider ? `(${agent.provider})` : "",
    `cpu ${pane.totalCpu.toFixed(1)}%`,
    `mem ${pane.rssMb}MB`,
    agent.usage ? `ctx ${agent.usage}` : "",
    panePrimaryProcess(pane.processes),
  ].filter(Boolean).join("  │  ");

  return Box(
    {
      width: "100%",
      border: true,
      borderStyle: "single",
      borderColor: theme.agentColor(agent.type),
      paddingLeft: 1,
      paddingRight: 1,
      marginBottom: 1,
    },
    Text({
      content: `${line1}\n${line2}`,
      fg: theme.colors.normalText,
    }),
  );
}

function buildRegularCard(pane: TmuxPane): ReturnType<typeof Box> {
  const icon = pane.active ? "▶" : pane.isIdle ? "○" : "◉";
  const line1 = `${icon} ${pane.displayCommand}  ${pane.paneId}  ${compactLocation(pane)}`;
  const line2 = [
    `cpu ${pane.totalCpu.toFixed(1)}%`,
    `mem ${pane.rssMb}MB`,
    `procs ${pane.processCount}`,
    `${pane.width}x${pane.height}`,
    panePrimaryProcess(pane.processes),
  ].filter(Boolean).join("  │  ");

  return Box(
    {
      width: "100%",
      border: true,
      borderStyle: "single",
      borderColor: theme.colors.cardBorder,
      paddingLeft: 1,
      paddingRight: 1,
      marginBottom: 1,
    },
    Text({
      content: `${line1}\n${line2}`,
      fg: theme.colors.dimText,
    }),
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
      sorted.sort((a, b) => {
        if (a.isAgent && !b.isAgent) return -1;
        if (!a.isAgent && b.isAgent) return 1;
        return a.location.localeCompare(b.location);
      });
  }
  return sorted;
}

function applyFilter(panes: TmuxPane[]): TmuxPane[] {
  let filtered = panes;

  if (!showIdle) {
    filtered = filtered.filter((pane) => !pane.isIdle);
  }

  switch (filterMode) {
    case "active":
      return filtered.filter((pane) => !pane.isIdle && (!pane.agent || pane.agent.status !== "idle"));
    case "idle":
      return panes.filter((pane) => pane.isIdle || pane.agent?.status === "idle");
    default:
      return filtered;
  }
}

function buildSummaryBar(snapshot: PaneSnapshot, filteredPanes: TmuxPane[]): ReturnType<typeof Box> {
  const sortLabel = sortBy === "default" ? "default" : sortBy;
  const time = snapshot.timestamp.toLocaleTimeString("en-US", { hour12: false });

  return Box(
    {
      width: "100%",
      backgroundColor: theme.colors.headerBg,
      paddingTop: 0,
      paddingBottom: 0,
    },
    Text({
      content: `  [q] quit  [i] shell-idle:${showIdle ? "on" : "off"}  [f] filter:${filterMode}  [s] cpu  [m] mem  [r] refresh  ${time}`,
      fg: theme.colors.dimText,
    }),
    Text({
      content: `  agents ${snapshot.activeAgentCount}/${snapshot.agentCount} active  │  visible ${filteredPanes.length}/${snapshot.panes.length} panes  │  agent cpu ${snapshot.agentCpu.toFixed(1)}%  │  agent mem ${snapshot.agentRssMb}MB  │  tmux cpu ${snapshot.totalCpu.toFixed(1)}%  │  tmux mem ${snapshot.totalRssMb}MB`,
      fg: theme.colors.normalText,
    }),
    Text({
      content: `  system cpu ${snapshot.system.cpuUsedPercent.toFixed(1)}%  │  system mem ${snapshot.system.memUsedMb}MB/${snapshot.system.memTotalMb}MB (${snapshot.system.memUsedPercent.toFixed(1)}%)  │  sort ${sortLabel}${lastError ? `  │  stale data: ${lastError}` : ""}`,
      fg: lastError ? theme.colors.generating : theme.colors.dimText,
    }),
  );
}

function buildErrorPanel(message: string): ReturnType<typeof Box> {
  return Box(
    {
      width: "100%",
      border: true,
      borderStyle: "single",
      borderColor: theme.colors.cpuHigh,
      paddingLeft: 1,
      paddingRight: 1,
      marginTop: 1,
    },
    Text({
      content: `tmux-panes could not load tmux data.\n\n${message}\n\nTry: tmux list-panes -a\nPress [r] to retry or [q] to quit.`,
      fg: theme.colors.brightText,
    }),
  );
}

function renderSnapshot(snapshot: PaneSnapshot): void {
  const filteredPanes = sortPanes(applyFilter(snapshot.panes));
  const cards = filteredPanes.map((pane) => pane.isAgent ? buildAgentCard(pane) : buildRegularCard(pane));

  clearRoot();
  renderer.root.add(
    Box(
      {
        width: "100%",
        height: "100%",
        flexDirection: "column",
      },
      buildSummaryBar(snapshot, filteredPanes),
      lastError ? Box(
        {
          width: "100%",
          border: true,
          borderStyle: "single",
          borderColor: theme.colors.generating,
          paddingLeft: 1,
          paddingRight: 1,
        },
        Text({
          content: "showing last successful snapshot — press [r] to retry live refresh",
          fg: theme.colors.brightText,
        }),
      ) : Box({ width: 0, height: 0 }),
      ScrollBox(
        {
          width: "100%",
          flexGrow: 1,
          scrollY: true,
          stickyScroll: false,
          viewportCulling: true,
        },
        Box(
          {
            width: "100%",
            flexDirection: "column",
            padding: 1,
          },
          ...cards,
        ),
      ),
    ),
  );
  renderer.requestRender();
}

function renderError(message: string): void {
  clearRoot();
  renderer.root.add(
    Box(
      {
        width: "100%",
        height: "100%",
        flexDirection: "column",
        padding: 1,
      },
      Box(
        {
          width: "100%",
          backgroundColor: theme.colors.headerBg,
        },
        Text({
          content: "  [q] quit  [r] retry",
          fg: theme.colors.dimText,
        }),
      ),
      buildErrorPanel(message),
    ),
  );
  renderer.requestRender();
}

async function buildView(): Promise<void> {
  try {
    const snapshot = await collectPanes();
    lastSnapshot = snapshot;
    lastError = null;
    renderSnapshot(snapshot);
  } catch (err) {
    lastError = err instanceof Error ? err.message : String(err);

    if (lastSnapshot) {
      renderSnapshot(lastSnapshot);
      return;
    }

    renderError(lastError);
  }
}

async function main() {
  if (!process.stdin.isTTY) {
    safeExit(1, "Error: tmux-panes must be run in an interactive terminal\nTip: Run directly in your shell, not through a pipe or script");
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
    safeExit(1, "Error initializing TUI renderer.\nTip: Make sure your terminal supports alternate screen mode.", err);
  }

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
      case "f":
        filterMode = filterMode === "all" ? "active" : filterMode === "active" ? "idle" : "all";
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

  await buildView();
  updateTimer = setInterval(() => {
    buildView();
  }, refreshInterval);
}

function cleanup() {
  safeExit(0);
}

process.on("SIGINT", cleanup);
process.on("SIGTERM", cleanup);
process.on("uncaughtException", (err) => {
  safeExit(1, "\n❌ Uncaught error while running tmux-panes.", err);
});
process.on("unhandledRejection", (err) => {
  safeExit(1, "\n❌ Unhandled promise rejection while running tmux-panes.", err);
});

main().catch((err) => {
  safeExit(1, "\n❌ Fatal error while starting tmux-panes.", err);
});
