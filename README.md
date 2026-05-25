# AgentMesh

Sistema de orquestación multi-agente para **Claude Code**. Permite coordinar varios agentes de Claude trabajando en paralelo sobre un mismo proyecto, cada uno en su propio git worktree, comunicándose a través de un servidor MCP compartido.

---

## Cómo funciona

```
Usuario
  └─► Orquestador (Claude Code corriendo en el directorio del proyecto)
         ├─► Agente backend   (worktree propio, rama propia)
         ├─► Agente frontend  (worktree propio, rama propia)
         ├─► Agente QA        (worktree propio, rama propia)
         └─► Scrum Master     (monitor del pipeline, ciclo autónomo)
```

- Cada agente corre en una terminal separada con `claude --dangerously-skip-permissions`
- Se coordinan a través de tareas, notas y locks en una base de datos SQLite compartida
- El orquestador planifica y coordina; los workers ejecutan; el Scrum Master vigila el pipeline
- Dashboard web en tiempo real para ver el estado del equipo

---

## Requisitos

- **Node.js** >= 20
- **pnpm** >= 9 — `npm install -g pnpm`
- **Claude Code** instalado globalmente — `npm install -g @anthropic-ai/claude-code`
- **Git** >= 2.20 (soporte de worktrees)
- Windows 10/11 (el loop autónomo de agentes usa PowerShell)

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

### 1. Ir al directorio del proyecto

AgentMesh trabaja sobre un repositorio git existente. Si no tenés uno:

```bash
mkdir mi-proyecto && cd mi-proyecto
git init
git commit --allow-empty -m "init"
```

### 2. Iniciar AgentMesh en el proyecto

Ejecutar **desde dentro del directorio del proyecto**:

```bash
cd C:/Projects/mi-proyecto
agentmesh start
```

Este comando hace todo en uno:
- Inicializa la config global de AgentMesh (`~/.agentmesh/`) si no existe
- Registra el proyecto en la base de datos
- Crea el agente orquestador
- Escribe `CLAUDE.md` y `.mcp.json` en el directorio
- Abre el dashboard web en `http://localhost:4000`

> Tiene una opción de puerto: `agentmesh start --port 3000`

### 3. Iniciar el orquestador

En otra terminal, en el mismo directorio del proyecto:

```bash
cd C:/Projects/mi-proyecto
claude
```

Claude Code lee automáticamente el `CLAUDE.md` generado por `start` y se convierte en el orquestador. Desde ahí se coordina todo.

### 4. Dashboard web (opcional, sin bloquear)

Si querés abrir el dashboard en una sesión separada sin que `start` bloquee la terminal:

```bash
agentmesh web --project "mi-proyecto"
# con puerto específico:
agentmesh web --project "mi-proyecto" --port 4000
```

---

## Comandos CLI

### Proyecto

| Comando | Descripción |
|---|---|
| `agentmesh start [--port N]` | Inicia AgentMesh en el directorio actual (registra proyecto + orquestador + abre web) |
| `agentmesh project list` | Lista todos los proyectos registrados |
| `agentmesh project create <nombre> --repo <ruta>` | Registra un proyecto manualmente |
| `agentmesh project show <nombre_o_id>` | Muestra detalles del proyecto (agentes, conteo de tareas) |
| `agentmesh project reset <nombre_o_id>` | Limpia todos los agentes, tareas, notas y eventos del proyecto (no toca el código) |

### Agentes

| Comando | Descripción |
|---|---|
| `agentmesh spawn <rol> --project <nombre>` | Lanza un agente worker en un nuevo worktree |
| `agentmesh spawn <rol> --project <nombre> --from <rama>` | Especifica la rama base del worktree |
| `agentmesh stop <agent_id>` | Marca el agente como offline y libera sus locks |
| `agentmesh stop <agent_id> --remove-worktree` | Ídem + elimina el worktree del disco |
| `agentmesh status --project <nombre>` | Dashboard en terminal: agentes, tareas, locks |
| `agentmesh status --project <nombre> --watch` | Refresca cada 2 segundos |

### Tareas y notas

| Comando | Descripción |
|---|---|
| `agentmesh tasks --project <nombre>` | Lista tareas |
| `agentmesh tasks --project <nombre> --status in_progress` | Filtra por estado |
| `agentmesh tasks --project <nombre> --role backend` | Filtra por rol |
| `agentmesh notes --project <nombre>` | Lista notas entre agentes |
| `agentmesh notes --project <nombre> --unread` | Solo notas no leídas |

### Merge y mantenimiento

| Comando | Descripción |
|---|---|
| `agentmesh merge <task_id>` | Verifica precondiciones para mergear (status + CI) |
| `agentmesh merge <task_id> --auto` | Ejecuta el merge directamente sin agente release |
| `agentmesh merge <task_id> --auto --into main` | Especifica rama destino (default: main) |
| `agentmesh prune` | Elimina agentes offline >24h, locks expirados y eventos >30d |
| `agentmesh prune --agent-ttl 48` | Cambia el TTL de agentes offline a 48 horas |

### Roles disponibles para spawn

| Rol | Función |
|---|---|
| `backend` | APIs, lógica de servidor, base de datos |
| `frontend` | UI, componentes, estilos |
| `qa` | Tests unitarios y de integración |
| `integration` | Integración entre servicios, tests end-to-end |
| `reviewer` | Revisión de código antes del merge |
| `release` | Versionado, changelogs, deploy |
| `scrum-master` | Monitor autónomo del pipeline — detecta agentes bloqueados o inactivos |

---

## Dashboard web

```bash
agentmesh web --project "mi-proyecto"
```

Muestra en tiempo real:

- **Sidebar izquierdo** — agentes activos con su tarea actual y heartbeat
- **Centro** — tablero Kanban con todas las tareas por estado
- **Sidebar derecho** — feed de actividad con filtros: todo / notas / MCP / acciones

Los paneles son redimensionables arrastrando los separadores.

---

## Estructura del monorepo

```
packages/
  cli/          CLI "agentmesh" — todos los comandos
  mcp-server/   Servidor MCP — herramientas que usan los agentes (tareas, locks, notas)
  shared/       Tipos TypeScript y esquemas Zod compartidos
  web/          Dashboard web (Express + SSE + Tailwind)

agents/
  _common.md        Instrucciones base para todos los workers
  orchestrator.md   Protocolo del orquestador
  scrum-master.md   Protocolo del Scrum Master
  backend.md        Instrucciones del rol backend
  frontend.md       Instrucciones del rol frontend
  qa.md             Instrucciones del rol QA
  (etc.)
```

---

## Flujo típico de trabajo

```bash
# 1. Ir al proyecto y lanzar AgentMesh
cd C:/Projects/mi-app
agentmesh start               # registra proyecto + escribe CLAUDE.md + abre dashboard

# 2. En otra terminal: iniciar el orquestador
cd C:/Projects/mi-app
claude                        # lee CLAUDE.md y actúa como orquestador

# El orquestador analiza el proyecto, propone un roadmap al usuario,
# y al obtener aprobación crea las tareas y spawna los workers.

# 3. Monitorear el progreso
# → En el dashboard web (http://localhost:4000)
# → O en terminal:
agentmesh status --project mi-app --watch

# 4. Cuando una etapa termina, mergear las tareas completadas
agentmesh merge <task_id> --auto --into main

# 5. Limpiar los registros de AgentMesh para comenzar una nueva sesión
agentmesh project reset mi-app
```

---

## Limpiar un proyecto (reset AgentMesh)

Para borrar solo los registros de AgentMesh y empezar de nuevo — **sin tocar el código del proyecto**:

```bash
agentmesh project reset mi-app
```

Esto elimina: agentes, tareas, notas, eventos y locks. El directorio del proyecto y su historial git quedan intactos.

> Los worktrees en `.worktrees/` quedan en disco — eliminarlos manualmente o con `agentmesh stop <id> --remove-worktree` antes del reset.

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
→ Verificar que `pnpm --filter @agentmesh/cli link --global` se ejecutó y que el directorio de binarios globales de pnpm está en el PATH.

**El agente no aparece en el dashboard**  
→ El agente registra su heartbeat con la primera llamada MCP. Puede tardar ~30 segundos en aparecer activo.

**Error "not a git repository"**  
→ El directorio del proyecto debe tener git. Ejecutar `git init && git commit --allow-empty -m "init"`.

**Worktrees de sesiones anteriores siguen en `.worktrees/`**  
→ Eliminarlos manualmente o usar `agentmesh stop <agent_id> --remove-worktree` antes de hacer el reset.

**`agentmesh merge` dice que la rama no existe**  
→ La tarea debe tener `branch_name` asignado, o el agente que la trabajó debe tenerlo en su registro.
