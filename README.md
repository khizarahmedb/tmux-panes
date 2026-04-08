# tmux-panes

A beautiful TUI dashboard for monitoring tmux panes with AI agent detection. Built with [OpenTUI](https://opentui.com) for flicker-free differential rendering.

## Features

- **Live monitoring** — real-time CPU, memory, and process tree for every tmux pane
- **AI agent detection** — automatically identifies Claude Code, OpenCode, and Codex sessions
- **Agent metadata** — shows model name, provider, token usage, and generation status
- **Smart filtering** — hides idle shell panes by default, toggle with `i`
- **Sorting** — sort by CPU or memory usage
- **Scrollable** — mouse wheel support for long pane lists
- **No flicker** — OpenTUI's differential rendering only updates changed components

## What it shows

For AI agent panes:
- Agent type (Claude Code / OpenCode / Codex)
- Model name (e.g. `Opus 4.6`, `GPT-5.4`, `MiniMax M2.5`)
- Provider (Anthropic, OpenAI, etc.)
- Status: `⟳ generating`, `⟳ working`, `● idle`
- Token usage (OpenCode: `51.7K (25%)`)
- CPU/memory with visual bar graphs
- Full process tree

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
```

### Keyboard shortcuts

| Key | Action |
|-----|--------|
| `q` | Quit |
| `i` | Toggle idle panes |
| `s` | Sort by CPU usage |
| `m` | Sort by memory usage |
| `r` | Force refresh |
| `Ctrl+C` | Quit |

Mouse scroll works in the pane list.

## How it works

1. Queries `tmux list-panes` for all pane metadata
2. Reads `ps` for CPU/memory/process trees per pane PID
3. Captures the last 50 lines of each active pane via `tmux capture-pane`
4. Parses pane content to detect AI agents and extract model/status/usage
5. Renders everything with OpenTUI's component-based layout engine
6. Refreshes every 2 seconds with differential rendering (only changed components update)

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
