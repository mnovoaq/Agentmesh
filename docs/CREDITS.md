# Credits

## gstack — Garry Tan

The engineering judgment embedded in the agent role templates (`agents/`) draws inspiration from the slash command criteria in the [gstack](https://github.com/garrytan/gstack) project by Garry Tan (licensed MIT).

Specifically adapted (not copied) from:

| gstack skill | AgentMesh template | What was adapted |
|---|---|---|
| `/autoplan`, `/plan-eng-review` | `orchestrator.md` | Decomposition criteria, completeness bias, parallelism detection, scope-complexity gate |
| `/review` | `reviewer.md` | Pre-emit verification rule (cite exact line), confidence gate ≥7, Fix-First classification (AUTO-FIX vs ASK) |
| `/qa`, `/qa-only` | `qa.md` | Test-as-user principle, evidence-first documentation, 3-strike escalation rule |
| `/ship`, `/land-and-deploy` | `release.md` | CI gate, post-rebase test run, CHANGELOG generation, post-deploy verification |
| `/investigate` | `backend.md` | 3-strike debugging rule, root-cause-before-fix principle, scope lock, regression test requirement |

The paradigm is fundamentally different: gstack is human-driven (slash commands invoked at specific moments), AgentMesh agents are autonomous and coordinate via MCP tools. The adaptation rewrites the criteria as self-regulating rules for continuous operation.
