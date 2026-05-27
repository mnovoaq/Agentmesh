# Contributing to AgentMesh

Thank you for your interest in contributing! AgentMesh is an open source project and we welcome contributions of all kinds.

## Ways to contribute

- **Bug reports** — open an issue describing the problem, steps to reproduce, and expected behavior
- **Feature requests** — open an issue with your idea and use case
- **Code** — fix bugs, implement features, improve docs
- **Agent roles** — propose new agent role definitions under `agents/`
- **Examples** — share real-world workflows that worked well for you

## Development setup

```bash
git clone https://github.com/mnovoaq/agentmesh.git
cd agentmesh
pnpm install
pnpm build
pnpm --filter @agentmesh/cli link --global
```

Run tests:
```bash
pnpm test
```

## Project structure

```
packages/
  cli/          CLI commands (agentmesh start, spawn, status, etc.)
  mcp-server/   MCP server — tools used by agents (tasks, locks, notes)
  shared/       TypeScript types and Zod schemas
  web/          Web dashboard (Express + SSE)

agents/         Role definitions (markdown prompts for each agent type)
docs/           Architecture decisions and credits
```

## Submitting a pull request

1. Fork the repo and create a branch: `git checkout -b feat/my-feature`
2. Make your changes and add tests if applicable
3. Run `pnpm build && pnpm test` — make sure everything passes
4. Commit with a clear message: `feat: add X`, `fix: Y`, `docs: update Z`
5. Open a PR describing what you changed and why

## Adding a new agent role

Agent roles live in `agents/`. Each file is a markdown prompt that Claude Code uses when spawned with that role. To add a new role:

1. Create `agents/your-role.md` following the structure of existing roles
2. Register it in `packages/cli/src/commands/spawn.ts`
3. Open a PR with a real example of the role being useful

## Commit convention

We use [Conventional Commits](https://www.conventionalcommits.org/):

- `feat:` new feature
- `fix:` bug fix
- `docs:` documentation only
- `refactor:` code change without feature/fix
- `test:` adding or updating tests
- `chore:` tooling, deps, config

## Questions?

Open an issue — no question is too small.
