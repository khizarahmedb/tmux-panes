/**
 * tmux data collection — reads pane info, process stats, and agent metadata
 */

import { $ } from "bun";

export interface PaneProcess {
  pid: number;
  cpu: number;
  rss: number; // KB
  command: string;
  children: PaneProcess[];
}

export interface SystemStats {
  cpuUsedPercent: number;
  memUsedPercent: number;
  memUsedMb: number;
  memTotalMb: number;
}

export interface AgentInfo {
  type: "claude-code" | "opencode" | "codex" | "unknown";
  model: string;
  provider: string;
  status: "generating" | "working" | "idle" | "active" | "unknown";
  usage: string; // e.g. "51.7K (25%)"
  agentMode: string; // e.g. "Web-Researcher", "Coding-Pro"
}

export interface TmuxPane {
  paneId: string;
  location: string; // session:window.pane
  title: string;
  command: string;
  pid: number;
  width: number;
  height: number;
  active: boolean;
  // Computed
  displayCommand: string;
  isIdle: boolean;
  isAgent: boolean;
  agent?: AgentInfo;
  totalCpu: number;
  totalRss: number; // KB
  rssMb: number;
  processCount: number;
  processes: PaneProcess[];
}

export interface PaneSnapshot {
  panes: TmuxPane[];
  totalCpu: number;
  totalRss: number;
  totalRssMb: number;
  agentCount: number;
  activeAgentCount: number;
  agentCpu: number;
  agentRss: number;
  agentRssMb: number;
  activeCount: number;
  idleCount: number;
  system: SystemStats;
  timestamp: Date;
}

// Cache ps output per collection cycle
let psCache: string = "";

interface PsEntry {
  pid: number;
  ppid: number;
  cpu: number;
  rss: number;
  command: string;
}

async function refreshPsCache(): Promise<void> {
  try {
    const result = await $`ps -eo pid,ppid,%cpu,%mem,rss,command`.text();
    psCache = result;
  } catch {
    psCache = "";
  }
}

function getChildProcesses(parentPid: number): PaneProcess[] {
  const children: PaneProcess[] = [];
  const lines = psCache.split("\n");

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const parts = trimmed.split(/\s+/);
    if (parts.length < 6) continue;

    const pid = parseInt(parts[0]);
    const ppid = parseInt(parts[1]);
    const cpu = parseFloat(parts[2]) || 0;
    const rss = parseInt(parts[4]) || 0;
    const command = parts.slice(5).join(" ");

    if (ppid === parentPid && !isNaN(pid)) {
      const grandchildren = getChildProcesses(pid);
      children.push({ pid, cpu, rss, command, children: grandchildren });
    }
  }
  return children;
}

function getPsEntries(): PsEntry[] {
  const entries: PsEntry[] = [];
  const lines = psCache.split("\n");

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const parts = trimmed.split(/\s+/);
    if (parts.length < 6) continue;

    const pid = parseInt(parts[0]);
    const ppid = parseInt(parts[1]);
    const cpu = parseFloat(parts[2]) || 0;
    const rss = parseInt(parts[4]) || 0;
    const command = parts.slice(5).join(" ");

    if (!Number.isNaN(pid)) {
      entries.push({ pid, ppid, cpu, rss, command });
    }
  }

  return entries;
}

function getProcessByPid(pid: number): PsEntry | undefined {
  return getPsEntries().find((entry) => entry.pid === pid);
}

function flattenProcesses(procs: PaneProcess[]): PaneProcess[] {
  const flat: PaneProcess[] = [];
  for (const p of procs) {
    flat.push(p);
    flat.push(...flattenProcesses(p.children));
  }
  return flat;
}

async function capturePaneContent(paneId: string): Promise<string> {
  try {
    const result = await $`tmux capture-pane -t ${paneId} -p -S -50`.text();
    return result;
  } catch {
    return "";
  }
}

function detectAgent(command: string, capture: string): AgentInfo | undefined {
  const lastLines = capture.split("\n").slice(-10).join("\n");

  // Claude Code detection
  if (command.includes("claude") || capture.includes("Claude Code")) {
    let model = "";
    const modelMatch = capture.match(/Opus [0-9.]+ \([^)]+\)|Sonnet [0-9.]+ \([^)]+\)|Haiku [0-9.]+/);
    if (modelMatch) {
      model = modelMatch[0];
    } else {
      const modelMatch2 = capture.match(/claude-opus-[\w-]+|claude-sonnet-[\w-]+|claude-haiku-[\w-]+/);
      if (modelMatch2) model = modelMatch2[0];
    }

    const provider = "Anthropic";
    let status: AgentInfo["status"] = "unknown";

    if (lastLines.includes("esc to interrupt") || lastLines.includes("Esc to interrupt")) {
      status = "generating";
    } else if (lastLines.includes("❯") || lastLines.includes("Press up to edit") || capture.includes("Claude Code v")) {
      status = "idle";
    } else if (/⠋|⠙|⠹|⠸|⠼|⠴|⠦|⠧|⠇|⠏/.test(lastLines)) {
      status = "working";
    }

    let usage = "";
    const planMatch = capture.match(/Claude (Team|Pro|Max|Free)/);
    if (planMatch) usage = planMatch[0];

    return { type: "claude-code", model, provider, status, usage, agentMode: "" };
  }

  // OpenCode detection
  if (command.includes("opencode") || capture.toLowerCase().includes("opencode")) {
    let model = "";
    const modelPatterns = [
      /GPT-[0-9.]+/i,
      /kimi-[a-z0-9.-]+/i,
      /glm-[0-9]+/i,
      /MiniMax [A-Za-z0-9. ]+/i,
      /Qwen[0-9a-z.+-]+/i,
      /Claude [0-9.]+/i,
      /o[134]-[\w]+/i,
      /grok-[\w]+/i,
    ];
    for (const pat of modelPatterns) {
      const m = lastLines.match(pat);
      if (m) { model = m[0].trim(); break; }
    }

    const provider = lastLines.match(/OpenAI|Anthropic|Google|Mistral|Zen/)?.[0] || "OpenCode";

    let status: AgentInfo["status"] = "active";
    if (lastLines.includes("esc interrupt")) {
      status = "generating";
    } else if (/[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏⠂⠐▣]/.test(lastLines)) {
      status = "working";
    } else if (lastLines.includes("Ask anything") || lastLines.includes("/status")) {
      status = "idle";
    }

    let usage = "";
    const usageMatch = lastLines.match(/[0-9.]+K?\s*\([0-9]+%\)/);
    if (usageMatch) usage = usageMatch[0];

    let agentMode = "";
    const modeMatch = lastLines.match(/Coding-Pro|Web-Researcher|Code-Reviewer|Requirements-Analyzer|Planner/);
    if (modeMatch) agentMode = modeMatch[0];

    return { type: "opencode", model, provider, status, usage, agentMode };
  }

  // Codex detection
  if (command.includes("codex")) {
    return { type: "codex", model: "Codex", provider: "OpenAI", status: "active", usage: "", agentMode: "" };
  }

  return undefined;
}

export async function collectPanes(): Promise<PaneSnapshot> {
  await refreshPsCache();

  const tmuxOutput = await $`tmux list-panes -a -F '#{pane_id}|#{session_name}:#{window_index}.#{pane_index}|#{pane_title}|#{pane_current_command}|#{pane_pid}|#{pane_width}x#{pane_height}|#{?pane_active,active,bg}'`.text();

  const panes: TmuxPane[] = [];
  const lines = tmuxOutput.trim().split("\n");

  // Collect pane captures in parallel for agent detection
  const rawPanes = lines.map((line) => {
    const [paneId, location, title, command, pidStr, sizeStr, activeStr] = line.split("|");
    const [w, h] = (sizeStr || "0x0").split("x").map(Number);
    return { paneId, location, title, command, pid: parseInt(pidStr), width: w, height: h, active: activeStr === "active" };
  });

  const captures = await Promise.all(
    rawPanes.map(async (p) => {
      const children = getChildProcesses(p.pid);
      const allProcs = flattenProcesses(children);
      const mainCmd = allProcs.find((c) => !c.command.match(/^-?(zsh|bash|fish)$/))?.command || p.command;
      const displayCommand = (mainCmd.split(" ")[0] || "").split("/").pop() || p.command;

      const isShellOnly = children.length === 0 && /^(zsh|bash|fish)$/.test(displayCommand);

      // Only capture pane content for potential agent panes
      let capture = "";
      if (!isShellOnly) {
        capture = await capturePaneContent(p.paneId);
      }

      return { ...p, children, allProcs, displayCommand, isShellOnly, capture };
    })
  );

  let totalCpu = 0;
  let totalRss = 0;
  let agentCount = 0;
  let activeAgentCount = 0;
  let agentCpu = 0;
  let agentRss = 0;
  let activeCount = 0;
  let idleCount = 0;

  for (const c of captures) {
    const rootEntry = getProcessByPid(c.pid);
    const includeRoot = !!rootEntry && !/^-?(zsh|bash|fish|sh)$/.test(c.command);
    const paneProcesses = includeRoot && rootEntry
      ? [{ pid: rootEntry.pid, cpu: rootEntry.cpu, rss: rootEntry.rss, command: rootEntry.command, children: c.children }]
      : c.children;
    const flattened = flattenProcesses(paneProcesses);
    const paneTotalCpu = flattened.reduce((sum, p) => sum + p.cpu, 0);
    const paneTotalRss = flattened.reduce((sum, p) => sum + p.rss, 0);

    const agent = c.isShellOnly ? undefined : detectAgent(c.displayCommand, c.capture);

    const pane: TmuxPane = {
      paneId: c.paneId,
      location: c.location,
      title: c.title,
      command: c.command,
      pid: c.pid,
      width: c.width,
      height: c.height,
      active: c.active,
      displayCommand: c.displayCommand,
      isIdle: c.isShellOnly,
      isAgent: !!agent,
      agent,
      totalCpu: parseFloat(paneTotalCpu.toFixed(1)),
      totalRss: paneTotalRss,
      rssMb: Math.round(paneTotalRss / 1024),
      processCount: flattened.length,
      processes: paneProcesses,
    };

    panes.push(pane);
    totalCpu += paneTotalCpu;
    totalRss += paneTotalRss;

    if (c.isShellOnly) {
      idleCount++;
    } else {
      activeCount++;
      if (agent) {
        agentCount++;
        agentCpu += paneTotalCpu;
        agentRss += paneTotalRss;
        if (agent.status !== "idle" && agent.status !== "unknown") activeAgentCount++;
      }
    }
  }

  const system = await collectSystemStats();

  return {
    panes,
    totalCpu: parseFloat(totalCpu.toFixed(1)),
    totalRss,
    totalRssMb: Math.round(totalRss / 1024),
    agentCount,
    activeAgentCount,
    agentCpu: parseFloat(agentCpu.toFixed(1)),
    agentRss,
    agentRssMb: Math.round(agentRss / 1024),
    activeCount,
    idleCount,
    system,
    timestamp: new Date(),
  };
}

async function collectSystemStats(): Promise<SystemStats> {
  try {
    if (process.platform === "darwin") {
      const [topOutput, memSizeOutput, vmStatOutput] = await Promise.all([
        $`top -l 1 -n 0`.text(),
        $`sysctl -n hw.memsize`.text(),
        $`vm_stat`.text(),
      ]);

      const cpuMatch = topOutput.match(/CPU usage:\s+([\d.]+)% user,\s+([\d.]+)% sys,\s+([\d.]+)% idle/i);
      const cpuUsedPercent = cpuMatch
        ? parseFloat((parseFloat(cpuMatch[1]) + parseFloat(cpuMatch[2])).toFixed(1))
        : 0;

      const totalMemMb = Math.round(parseInt(memSizeOutput.trim(), 10) / 1024 / 1024);
      const pageSizeMatch = vmStatOutput.match(/page size of (\d+) bytes/);
      const pageSize = pageSizeMatch ? parseInt(pageSizeMatch[1], 10) : 4096;
      const pageCount = (name: string) => {
        const match = vmStatOutput.match(new RegExp(`${name}:\\s+(\\d+)\\.`));
        return match ? parseInt(match[1], 10) : 0;
      };

      const usedPages =
        pageCount("Pages active") +
        pageCount("Pages wired down") +
        pageCount("Pages occupied by compressor") +
        pageCount("Pages speculative");
      const memUsedMb = Math.round((usedPages * pageSize) / 1024 / 1024);
      const memUsedPercent = totalMemMb > 0 ? parseFloat(((memUsedMb / totalMemMb) * 100).toFixed(1)) : 0;

      return { cpuUsedPercent, memUsedPercent, memUsedMb, memTotalMb: totalMemMb };
    }

    const [topOutput, freeOutput] = await Promise.all([
      $`top -bn1`.text(),
      $`free -m`.text(),
    ]);

    const cpuMatch = topOutput.match(/%Cpu\(s\):\s+([\d.]+) us,\s+([\d.]+) sy,.*?\s+([\d.]+) id/);
    const cpuUsedPercent = cpuMatch
      ? parseFloat((100 - parseFloat(cpuMatch[3])).toFixed(1))
      : 0;

    const memLine = freeOutput.split("\n").find((line) => line.startsWith("Mem:"));
    if (memLine) {
      const parts = memLine.trim().split(/\s+/);
      const totalMemMb = parseInt(parts[1], 10) || 0;
      const memUsedMb = parseInt(parts[2], 10) || 0;
      const memUsedPercent = totalMemMb > 0 ? parseFloat(((memUsedMb / totalMemMb) * 100).toFixed(1)) : 0;
      return { cpuUsedPercent, memUsedPercent, memUsedMb, memTotalMb: totalMemMb };
    }
  } catch {
    // fall through to safe default
  }

  return { cpuUsedPercent: 0, memUsedPercent: 0, memUsedMb: 0, memTotalMb: 0 };
}
