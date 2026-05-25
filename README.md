# AgentMesh

Sistema de orquestación multi-agente para **Claude Code**. Permite coordinar varios agentes de Claude trabajando en paralelo sobre un mismo proyecto, cada uno en su propio git worktree, comunicándose a través de un servidor MCP compartido.

---

## Cómo funciona

```
Usuario
  └─► Orquestador (Claude Code + CLAUDE.md)
         ├─► Agente backend   (worktree propio, rama propia)
         ├─► Agente frontend  (worktree propio, rama propia)
         ├─► Agente QA        (worktree propio, rama propia)
         └─► Scrum Master     (monitor del pipeline, ciclo autónomo)
```

- Cada agente corre en una terminal separada con `claude --dangerously-skip-permissions`
- Se coordinan a través de tareas, notas y locks en una base de datos SQLite compartida
- El orquestador planifica, los workers ejecutan, el Scrum Master vigila
- Dashboard web en tiempo real para ver el estado del equipo

---

## Requisitos

- **Node.js** >= 20
- **pnpm** >= 9 — `npm install -g pnpm`
- **Claude Code** instalado globalmente — `npm install -g @anthropic-ai/claude-code`
- **Git** >= 2.20 (soporte de worktrees)
- Windows 10/11 (el loop de agentes usa PowerShell)

---

## Instalación

```bash
# 1. Clonar el repo
git clone https://github.com/mnovoa81/Agentmesh.git
cd Agentmesh

# 2. Instalar dependencias
pnpm install

# 3. Compilar todos los paquetes
pnpm build

# 4. Instalar el CLI globalmente
pnpm --filter @agentmesh/cli link --global
```

Verificar que quedó instalado:

```bash
agentmesh --version
# 0.1.0
```

---

## Primer uso

### 1. Inicializar AgentMesh

```bash
agentmesh init
```

Crea `~/.agentmesh/config.json` con la ruta de la base de datos SQLite.

### 2. Registrar un proyecto

```bash
agentmesh start --name "mi-proyecto" --path "C:/Projects/mi-proyecto"
```

El `--path` debe apuntar a un repositorio git existente.

### 3. Lanzar el orquestador

```bash
agentmesh spawn orchestrator --project "mi-proyecto"
```

Esto crea un worktree, escribe un `CLAUDE.md` con el protocolo del orquestador y abre una terminal nueva con Claude Code corriendo en modo autónomo.

El orquestador toma el control desde ahí: analiza el proyecto, propone tareas y lanza los agentes worker.

### 4. Abrir el dashboard web

```bash
agentmesh web --project "mi-proyecto" --open
```

Abre `http://localhost:4000` con el estado en tiempo real del equipo: agentes, tareas, actividad y locks.

---

## Comandos CLI

| Comando | Descripción |
|---|---|
| `agentmesh init` | Configuración inicial de AgentMesh |
| `agentmesh start --name X --path Y` | Registrar un nuevo proyecto |
| `agentmesh spawn <rol> --project X` | Lanzar un agente en un worktree nuevo |
| `agentmesh status --project X` | Ver estado de agentes y tareas |
| `agentmesh web --project X [--port N] [--open]` | Abrir el dashboard web |
| `agentmesh tasks --project X` | Listar tareas |
| `agentmesh notes --project X` | Ver notas entre agentes |
| `agentmesh merge <task_id>` | Mergear el branch de una tarea completada |
| `agentmesh stop <agent_id>` | Detener un agente |
| `agentmesh prune --project X` | Eliminar agentes offline y locks expirados |
| `agentmesh project list` | Listar proyectos registrados |

### Roles disponibles

| Rol | Función |
|---|---|
| `orchestrator` | Planifica, crea tareas, coordina el equipo |
| `backend` | Implementa APIs, lógica de servidor, DB |
| `frontend` | Implementa UI, componentes, estilos |
| `qa` | Tests unitarios y de integración |
| `integration` | Integración entre servicios, end-to-end |
| `reviewer` | Revisión de código antes del merge |
| `release` | Versionado, changelogs, deploy |
| `scrum-master` | Monitor autónomo del pipeline — detecta agentes bloqueados o inactivos |

---

## Dashboard web

```bash
agentmesh web --project "mi-proyecto" --open
```

El dashboard muestra en tiempo real:

- **Sidebar izquierdo** — agentes activos con su tarea actual y heartbeat
- **Centro** — tablero Kanban con todas las tareas por estado
- **Sidebar derecho** — feed de actividad (notas entre agentes, herramientas MCP usadas, archivos editados)

Los paneles son redimensionables con drag. El feed tiene filtros: **todo / notas / MCP / acciones**.

---

## Estructura del monorepo

```
packages/
  cli/          CLI "agentmesh" — comandos init, spawn, web, merge, etc.
  mcp-server/   Servidor MCP — herramientas que usan los agentes (tareas, locks, notas)
  shared/       Tipos TypeScript y esquemas Zod compartidos
  web/          Dashboard web (Express + SSE + Tailwind)

agents/
  _common.md        Instrucciones base para todos los workers
  orchestrator.md   Protocolo del orquestador
  scrum-master.md   Protocolo del Scrum Master
  backend.md        Instrucciones específicas del rol backend
  frontend.md       ídem frontend
  qa.md             ídem QA
  (etc.)
```

---

## Flujo típico de trabajo

```
1. agentmesh start --name "mi-app" --path "C:/Projects/mi-app"
2. agentmesh spawn orchestrator --project "mi-app"
   → El orquestador analiza el proyecto y propone un roadmap
   → Aprobás el roadmap en la conversación con el orquestador
   → El orquestador crea las tareas y lanza los agentes worker
3. agentmesh web --project "mi-app" --open
   → Ves el progreso en tiempo real
4. Cuando una etapa termina:
   agentmesh merge <task_id>   ← por cada tarea completada
5. El orquestador avanza a la siguiente etapa
```

---

## Limpiar un proyecto (reset AgentMesh)

Para volver a empezar con un proyecto sin borrar el código:

```bash
# Opción A: desde el dashboard web → botón de reset por proyecto
# Opción B: manual — solo borra registros de AgentMesh, nunca el código
agentmesh prune --project "mi-app" --full
```

> **Importante:** "limpiar el proyecto" en AgentMesh significa borrar los agentes, tareas, notas y worktrees de `.worktrees/`. Nunca toca el directorio principal del proyecto ni su historial git.

---

## Cómo actualizar

```bash
git pull
pnpm install
pnpm build
```

No hace falta reinstalar el CLI global — `pnpm link` ya apunta a los archivos compilados localmente.

---

## Troubleshooting

**`agentmesh: command not found`**
→ Verificar que `pnpm link --global` se ejecutó y que el directorio de binarios globales de pnpm está en el PATH.

**El agente no aparece en el dashboard**
→ El agente necesita hacer al menos una llamada MCP para registrar su heartbeat. Esperá que arranque el primer ciclo (puede tardar ~30 segundos).

**Error "not a git repository"**
→ El `--path` del proyecto debe ser un repositorio git con al menos un commit. Ejecutar `git init && git commit --allow-empty -m "init"` si es nuevo.

**Worktrees de sesiones anteriores siguen en `.worktrees/`**
→ Eliminar manualmente la carpeta `.worktrees/` dentro del proyecto y ejecutar `agentmesh prune --project X`.
