# AgentMesh

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](https://nodejs.org)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

Multi-agent orchestration for **Claude Code**. Coordinate multiple Claude agents working in parallel on the same project — each in its own git worktree, communicating through a shared MCP server.

---

## How it works

```
User
  └─► Orchestrator (Claude Code in the project directory)
         ├─► Backend agent   (own worktree, own branch)
         ├─► Frontend agent  (own worktree, own branch)
         ├─► QA agent        (own worktree, own branch)
         └─► Scrum Master    (pipeline monitor, autonomous loop)
```

- Each agent runs in a separate terminal with `claude --dangerously-skip-permissions`
- Agents coordinate through tasks, notes, and locks in a shared SQLite database
- The orchestrator plans and delegates; workers execute; the Scrum Master monitors the pipeline
- Real-time web dashboard to track the whole team

---

## Requirements

- **Node.js** >= 20
- **pnpm** >= 9 — `npm install -g pnpm`
- **Claude Code** installed globally — `npm install -g @anthropic-ai/claude-code`
- **Git** >= 2.20 (worktree support)
- **OS**: Linux, macOS, or Windows 10/11

> On Linux, at least one terminal emulator must be installed for auto-launch: `gnome-terminal`, `konsole`, `xfce4-terminal`, or `xterm`. On macOS, Terminal.app is used. On Windows, Windows Terminal (`wt`) or PowerShell.

---

## Installation

```bash
# 1. Clone the repo
git clone https://github.com/mnovoaq/Agentmesh.git
cd Agentmesh

# 2. Install dependencies
pnpm install

# 3. Build all packages
pnpm build

# 4. Install the CLI globally
pnpm --filter @agentmesh/cli link --global
```

Verify installation:

```bash
agentmesh --version
# 0.1.0
```

---

## Quick start

### 1. Go to your project directory

AgentMesh works on an existing git repository. If you don't have one:

```bash
mkdir my-project && cd my-project
git init
git commit --allow-empty -m "init"
```

### 2. Start AgentMesh

Run **from inside your project directory**:

```bash
cd /path/to/my-project
agentmesh start
```

This does everything in one step:
- Initializes the global AgentMesh config (`~/.agentmesh/`) if it doesn't exist
- Registers the project in the database
- Creates the orchestrator agent
- Writes `CLAUDE.md` and `.mcp.json` in the directory
- Opens the web dashboard at `http://localhost:4000`

> Custom port: `agentmesh start --port 3000`

### 3. Start the orchestrator

In another terminal, in the same project directory:

```bash
cd /path/to/my-project
claude
```

Claude Code reads the generated `CLAUDE.md` automatically and acts as the orchestrator. Everything is coordinated from there.

### 4. Web dashboard (optional, non-blocking)

To open the dashboard in a separate session without blocking the terminal:

```bash
agentmesh web --project "my-project"
# with a specific port:
agentmesh web --project "my-project" --port 4000
```

---

## CLI Reference

### Project

| Command | Description |
|---|---|
| `agentmesh start [--port N]` | Start AgentMesh in the current directory (registers project + orchestrator + opens web) |
| `agentmesh project list` | List all registered projects |
| `agentmesh project create <name> --repo <path>` | Register a project manually |
| `agentmesh project show <name_or_id>` | Show project details (agents, task counts) |
| `agentmesh project reset <name_or_id>` | Clear all agents, tasks, notes, and events for a project (code is untouched) |

### Agents

| Command | Description |
|---|---|
| `agentmesh spawn <role> --project <name>` | Register a worker agent in a new worktree and auto-launch it in a terminal |
| `agentmesh spawn <role> --project <name> --from <branch>` | Specify the base branch for the worktree |
| `agentmesh dispatcher --project <name>` | Lightweight daemon that activates workers only when tasks are available (zero idle polling) |
| `agentmesh dispatcher --project <name> --interval <seconds>` | Change poll interval (default: 30s) |
| `agentmesh stop <agent_id>` | Mark agent as offline and release its locks |
| `agentmesh stop <agent_id> --remove-worktree` | Same + delete the worktree from disk |
| `agentmesh status --project <name>` | Terminal dashboard: agents, tasks, locks |
| `agentmesh status --project <name> --watch` | Auto-refresh every 2 seconds |

### Tasks and notes

| Command | Description |
|---|---|
| `agentmesh tasks --project <name>` | List tasks |
| `agentmesh tasks --project <name> --status in_progress` | Filter by status |
| `agentmesh tasks --project <name> --role backend` | Filter by role |
| `agentmesh notes --project <name>` | List notes between agents |
| `agentmesh notes --project <name> --unread` | Unread notes only |

### Merge and maintenance

| Command | Description |
|---|---|
| `agentmesh merge <task_id>` | Verify preconditions for merge (status + CI) |
| `agentmesh merge <task_id> --auto` | Execute the merge directly without a release agent |
| `agentmesh merge <task_id> --auto --into main` | Specify target branch (default: main) |
| `agentmesh prune` | Remove agents offline >24h, expired locks, and events >30d |
| `agentmesh prune --agent-ttl 48` | Change offline agent TTL to 48 hours |

### Available roles

| Role | Function |
|---|---|
| `backend` | APIs, server logic, database |
| `frontend` | UI, components, styles |
| `qa` | Unit and integration tests |
| `integration` | Cross-service integration, end-to-end tests |
| `reviewer` | Code review before merge |
| `release` | Versioning, changelogs, deploy |
| `scrum-master` | Autonomous pipeline monitor — detects blocked or idle agents |

---

## Web dashboard

```bash
agentmesh web --project "my-project"
```

Shows in real time:

- **Left sidebar** — active agents with their current task and heartbeat
- **Center** — Kanban board with all tasks by status
- **Right sidebar** — activity feed with filters: all / notes / MCP / actions

Panels are resizable by dragging the dividers.

---

## Repo structure

```
packages/
  cli/          "agentmesh" CLI — all commands
  mcp-server/   MCP server — tools used by agents (tasks, locks, notes)
  shared/       Shared TypeScript types and Zod schemas
  web/          Web dashboard (Express + SSE + Tailwind)

agents/
  _common.md        Base instructions for all workers
  orchestrator.md   Orchestrator protocol
  scrum-master.md   Scrum Master protocol
  backend.md        Backend role instructions
  frontend.md       Frontend role instructions
  qa.md             QA role instructions
  (etc.)
```

---

## Typical workflow

```bash
# 1. Go to your project and launch AgentMesh
cd /path/to/my-app
agentmesh start               # registers project + writes CLAUDE.md + opens dashboard

# 2. In another terminal: start the orchestrator
cd /path/to/my-app
claude                        # reads CLAUDE.md and acts as orchestrator

# The orchestrator analyzes the project and proposes a roadmap.
# Once approved, it creates tasks in AgentMesh.

# 3. The orchestrator starts the dispatcher (once per session, before the first spawn)
agentmesh dispatcher --project my-app

# 4. Register worktrees for each role
# (the dispatcher activates workers automatically when tasks are available)
agentmesh spawn backend --project my-app
agentmesh spawn frontend --project my-app
agentmesh spawn qa --project my-app

# 5. Monitor progress
# → In the web dashboard (http://localhost:4000)
# → Or in the terminal:
agentmesh status --project my-app --watch

# 6. When a task is done, merge it
agentmesh merge <task_id> --auto --into main

# 7. Clean AgentMesh records to start a new session
agentmesh project reset my-app
```

---

## Dispatcher — event-driven worker activation

The dispatcher is a lightweight process (no LLM) that replaces continuous polling by each worker:

**Without dispatcher (before):** each worker runs `claude -p` every 90 seconds, paying the full context cost even when idle — wasted tokens.

**With dispatcher:** workers are single-pass processes. They start, complete all available tasks for their role, and exit. The dispatcher re-activates them when new work appears.

```
[Dispatcher — pure SQL, no LLM]
   ↓ polls DB every 30s
   ↓ detects: role "backend" has 2 available tasks, no active worker
   → opens terminal with claude in the backend worktree

[Backend worker]
   → get_notes + get_my_tasks
   → claims task 1, works, done
   → claims task 2, works, done
   → no more tasks → exits

[Dispatcher] → next poll → frontend unblocked → activates frontend
```

**Estimated savings:** 50–70% fewer tokens in typical sprints (workers are idle 60–70% of the time).

The dispatcher is started by the orchestrator before the first `spawn`. It only needs to run once per session.

---

## Resetting a project

To delete only the AgentMesh records and start fresh — **without touching the project code**:

```bash
agentmesh project reset my-app
```

This removes: agents, tasks, notes, events, and locks. The project directory and its git history remain intact.

> Worktrees in `.worktrees/` stay on disk — remove them manually or with `agentmesh stop <id> --remove-worktree` before resetting.

---

## Updating

```bash
git pull
pnpm install
pnpm build
```

No need to reinstall the CLI globally — `pnpm link` already points to the locally compiled files.

---

## Troubleshooting

**`agentmesh: command not found`**
→ Make sure `pnpm --filter @agentmesh/cli link --global` was run and that the pnpm global bin directory is in your PATH.

**Agent doesn't appear in the dashboard**
→ The agent registers its heartbeat on the first MCP call. It may take ~30 seconds to show as active.

**Error "not a git repository"**
→ The project directory must have git. Run `git init && git commit --allow-empty -m "init"`.

**Terminal doesn't open automatically on Linux**
→ Install a supported terminal emulator: `gnome-terminal`, `konsole`, `xfce4-terminal`, or `xterm`. Then run `agentmesh spawn` again.

**Worktrees from previous sessions remain in `.worktrees/`**
→ Remove them manually or use `agentmesh stop <agent_id> --remove-worktree` before resetting.

**`agentmesh merge` says the branch doesn't exist**
→ The task must have a `branch_name` assigned, or the agent that worked on it must have it in its record.

**The dispatcher doesn't activate workers even though there are backlog tasks**
→ Verify that worktrees exist (`agentmesh status --project <name>`). The dispatcher only activates agents already registered with a valid `worktree_path`. If none exist, run `agentmesh spawn <role>` first.

**A worker activates and exits immediately without doing anything**
→ Tasks may have unresolved dependencies. Check with `agentmesh tasks --project <name>` that dependencies are in `done` status.

---

## Contributing

Contributions are welcome — bug reports, feature requests, new agent roles, or code.

See [CONTRIBUTING.md](CONTRIBUTING.md) for how to get started.

## License

MIT — see [LICENSE](LICENSE).
