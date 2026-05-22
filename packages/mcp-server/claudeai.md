 antes de escribir desde cero los archivos en agents/, cloná https://github.com/garrytan/gstack en un directorio temporal y revisá sus skills relevantes para nuestros roles. Específicamente:

Orchestrator → mirá /office-hours, /plan-ceo-review, /plan-eng-review, /autoplan
Reviewer → /review, /investigate, /cso
QA Worker → /qa, /qa-only
Release Engineer → /ship, /land-and-deploy, /canary, /document-release
Frontend Worker → /plan-design-review, /design-review

Adaptá los prompts a nuestro contexto: nuestros roles operan vía MCP tools (no slash commands), son autónomos (no human-driven), y deben respetar las reglas no negociables de _common.md. Reescribí, no copies tal cual — gstack está pensado para single-user, nosotros para coordinación multi-agente. Conservá los créditos a gstack y su licencia MIT en docs/CREDITS.md.