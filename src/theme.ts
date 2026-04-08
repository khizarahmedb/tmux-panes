/**
 * Color theme and styling constants
 */

export const colors = {
  // Agent type colors
  claude: "#B87CE8",    // purple
  opencode: "#00D4AA",  // teal
  codex: "#4ADE80",     // green

  // Status colors
  generating: "#FBBF24", // yellow
  working: "#F59E0B",    // amber
  idle: "#4ADE80",       // green
  active: "#60A5FA",     // blue
  unknown: "#6B7280",    // gray

  // Resource colors
  cpuLow: "#4ADE80",     // green
  cpuMed: "#FBBF24",     // yellow
  cpuHigh: "#EF4444",    // red

  memLow: "#4ADE80",
  memMed: "#FBBF24",
  memHigh: "#EF4444",

  // UI colors
  headerBg: "#1E1E2E",
  cardBg: "#181825",
  cardBorder: "#313244",
  cardBorderAgent: "#45475A",
  footerBg: "#1E1E2E",
  dimText: "#6C7086",
  normalText: "#CDD6F4",
  brightText: "#FFFFFF",
  accent: "#89B4FA",
  separator: "#313244",
} as const;

export function cpuColor(value: number): string {
  if (value >= 50) return colors.cpuHigh;
  if (value >= 15) return colors.cpuMed;
  return colors.cpuLow;
}

export function memColor(mb: number): string {
  if (mb >= 1024) return colors.memHigh;
  if (mb >= 256) return colors.memMed;
  return colors.memLow;
}

export function statusColor(status: string): string {
  switch (status) {
    case "generating": return colors.generating;
    case "working": return colors.working;
    case "idle": return colors.idle;
    case "active": return colors.active;
    default: return colors.unknown;
  }
}

export function agentColor(type: string): string {
  switch (type) {
    case "claude-code": return colors.claude;
    case "opencode": return colors.opencode;
    case "codex": return colors.codex;
    default: return colors.accent;
  }
}

export function statusIcon(status: string): string {
  switch (status) {
    case "generating": return "⟳";
    case "working": return "⟳";
    case "idle": return "●";
    case "active": return "◉";
    default: return "?";
  }
}

export function agentIcon(type: string): string {
  switch (type) {
    case "claude-code": return "⬡";
    case "opencode": return "⬡";
    case "codex": return "⬡";
    default: return "◆";
  }
}

export function humanSize(kb: number): string {
  if (kb >= 1048576) return `${(kb / 1048576).toFixed(1)}GB`;
  if (kb >= 1024) return `${Math.round(kb / 1024)}MB`;
  return `${kb}KB`;
}

export function cpuBar(value: number, width: number = 20): string {
  const filled = Math.max(0, Math.min(Math.round(value / (100 / width)), width));
  return "█".repeat(filled) + "░".repeat(width - filled);
}
