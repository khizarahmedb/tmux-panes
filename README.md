# tmux-panes

A compact TUI dashboard for monitoring tmux panes and AI agent sessions. Built with [OpenTUI](https://opentui.com) for differential rendering and a fixed top summary bar.

## Features

- **Fixed top summary** — active agents, visible panes, agent resource usage, tmux resource usage, and system CPU/memory stay pinned at the top
- **Scrollable pane list only** — the summary stays fixed while the pane list scrolls
- **Compact cards** — denser single-column cards fit more panes per window
- **Live monitoring** — real-time CPU and memory for every tmux pane
- **AI agent detection** — automatically identifies Claude Code, OpenCode, and Codex sessions
- **Agent metadata** — shows model, provider, token/context usage, and generation status
- **Smart filtering** — hide shell-idle panes with `i`, cycle pane filter with `f`
- **Sorting** — sort by CPU or memory usage
- **Graceful errors** — render an in-app error panel or stale-data banner instead of crashing
- **No flicker** — OpenTUI's differential rendering only updates changed components

## What it shows

For AI agent panes:
- Agent type (Claude Code / OpenCode / Codex)
- Model name (e.g. `Opus 4.6`, `GPT-5.4`, `MiniMax M2.5`)
- Provider (Anthropic, OpenAI, etc.)
- Status: `⟳ generating`, `⟳ working`, `● idle`
- Token usage (OpenCode: `51.7K (25%)`)
- CPU and memory
- Primary process / PID summary

For regular panes:
- Process name, PID, CPU, memory
- Pane dimensions
- Active/background indicator

## Install

```bash
# Requires Bun (https://bun.sh)
curl -fsSL https://bun.sh/install | bash

# Clone and install
git clone https://github.com/khizarahmedb/tmux-panes.git
cd tmux-panes
bun install

# Run directly
bun run src/index.ts

# Or use the launcher script
./bin/tmux-panes

# Or link globally
bun link
```

## Usage

```bash
# Launch the TUI dashboard
tmux-panes

# With options
tmux-panes --idle        # Show idle shell panes
tmux-panes -i 5          # 5 second refresh interval (default: 2)

# Run from the repo directly
./bin/tmux-panes
```

### Keyboard shortcuts

| Key | Action |
|-----|--------|
| `q` | Quit |
| `i` | Toggle shell-idle panes |
| `f` | Cycle filter: all / active / idle |
| `s` | Sort by CPU usage |
| `m` | Sort by memory usage |
| `r` | Force refresh |
| `Ctrl+C` | Quit |

Mouse scroll works in the pane list only.

## How it works

1. Queries `tmux list-panes` for pane metadata
2. Reads `ps` for per-pane process CPU/memory
3. Captures recent pane output via `tmux capture-pane`
4. Detects Claude Code / OpenCode / Codex and extracts model/status/usage
5. Collects system CPU/memory for the fixed summary bar
6. Renders a fixed summary + scrollable pane list with OpenTUI
7. Refreshes every 2 seconds with differential rendering

## Layout

- **Top bar**: controls, active agent counts, visible pane counts, tmux resource usage, and system resource usage
- **Middle list**: compact pane cards, scrollable independently from the summary
- **Error handling**: if live refresh fails, tmux-panes shows either:
  - an in-app error panel on first load, or
  - the last good snapshot with a stale-data banner

## Notes

- The pane list is intentionally scrollable; the entire app is not.
- Shell-idle panes are hidden by default unless enabled with `--idle` or `i`.
- Filtering with `f` cycles between `all`, `active`, and `idle` panes.

## Requirements

- [Bun](https://bun.sh) >= 1.0
- tmux (any recent version)
- macOS or Linux

## Tech stack

- [OpenTUI](https://opentui.com) — native Zig TUI core with TypeScript bindings
- [Yoga](https://yogalayout.dev) — CSS flexbox layout engine
- [Bun](https://bun.sh) — JavaScript runtime

## License

MIT
