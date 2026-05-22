# AgentMesh — Sistema de Orquestación Multi-Agente para Claude Code

> **Documento técnico + prompt operativo.** Está escrito para que un agente Claude Code, ejecutándose en un repositorio vacío, pueda construir el sistema completo siguiendo las fases definidas. También sirve como referencia técnica permanente del proyecto.

---

## 0. Cómo usar este documento

Si sos **Claude Code** leyendo esto en un repo vacío: tu trabajo es implementar el sistema descrito acá, fase por fase, sin saltar fases. Antes de empezar:

1. Leé el documento completo.
2. Si detectás ambigüedades, contradicciones o decisiones técnicas que cuestionarías, **listalas antes de tocar código** y esperá confirmación humana.
3. Implementá una fase a la vez. Al terminar cada fase, verificá los criterios de aceptación de esa fase y reportá antes de continuar.
4. No agregues funcionalidad fuera del scope de la fase actual. La disciplina de scope es parte del diseño.

Si sos **humano** revisando este doc: las secciones 1-3 son el "por qué", 4-9 son el "qué", 10-13 son el "cómo se usa y cómo se construye", y 14 es el contrato de ejecución con Claude Code.

---

## 1. Resumen ejecutivo

**AgentMesh** es una capa de coordinación que permite correr múltiples instancias de Claude Code en paralelo sobre uno o varios proyectos, sin que se pisen entre sí y manteniendo trazabilidad de quién hizo qué.

Tres componentes principales:

1. **MCP Server** central que expone operaciones de coordinación (claim de tareas, comunicación entre agentes, locks, estado del proyecto). Es la fuente única de verdad.
2. **Definiciones de agentes** (skill files Markdown) que se cargan en cada Claude Code worker y le dan un rol específico (orquestador, backend, frontend, QA, reviewer, release).
3. **CLI** para uso humano: crear proyectos, ver estado del board, lanzar agentes en worktrees, hacer merges.

El aislamiento físico se resuelve con **git worktrees** (un worktree por agente worker, un branch por feature). La coordinación lógica se resuelve vía MCP. El orquestador es otro Claude Code, no un componente custom: lee el backlog, descompone tareas y las deja en el board para que los workers las reclamen.

---

## 2. Problema y motivación

Correr varios Claude Code en paralelo es posible pero frágil:

- **Colisiones de archivos** si dos agentes editan el mismo módulo sin saberlo.
- **Comunicación informal** (logs sueltos, archivos `NOTES.md`) que no es transaccional y se desincroniza.
- **Sin estado compartido** no hay forma de que un agente sepa qué está haciendo otro, qué está bloqueado, o qué quedó pendiente.
- **El humano se convierte en bus de mensajes** entre agentes, lo que mata la ganancia del paralelismo.

AgentMesh resuelve esto poniendo la coordinación en una capa explícita, estructurada y consultable.

---

## 3. Visión y principios de diseño

1. **MCP como backbone.** Toda comunicación entre agentes pasa por el MCP server. Nada de logs sueltos ni convenciones implícitas.
2. **Estado en disco, no en memoria de agentes.** El backlog, tareas, locks y notas viven en SQLite. Los agentes son stateless entre sesiones.
3. **Aislamiento físico vía git.** Cada worker trabaja en su worktree con su branch. Conflictos los resuelve git al merge, no las convenciones.
4. **El orquestador es un agente, no código.** Esto baja la complejidad del backend y deja el "criterio" en un LLM, no en reglas hardcodeadas.
5. **Adapter pattern para storage.** SQLite por defecto, con interfaz abstracta para enchufar el sistema de tasks interno de la empresa en una fase posterior.
6. **MVP primero, features después.** Web UI, métricas, integraciones con Slack, etc., son post-MVP.
7. **Locks explícitos, no implícitos.** Los workers declaran qué áreas del código tocan; el MCP rechaza claims que colisionen.
8. **Idempotencia.** Las operaciones del MCP son idempotentes donde sea posible (re-claim de la misma tarea es no-op, no error).

---

## 4. Arquitectura del sistema

### 4.1 Componentes

```
┌─────────────────────────────────────────────────────────────────┐
│                         HUMANO (vos)                            │
│  - Crea proyectos vía CLI                                       │
│  - Lanza agentes en worktrees                                   │
│  - Revisa el dashboard de estado                                │
│  - Hace merges finales                                          │
└──────────────┬──────────────────────────────────────────────────┘
               │
               ▼
        ┌──────────────┐
        │     CLI      │  (Node.js, comandos: init, project, status, spawn, merge)
        └──────┬───────┘
               │
               ▼
┌─────────────────────────────────────────────────────────────────┐
│                      MCP SERVER (stdio)                         │
│  Expone tools a Claude Code:                                    │
│  - get_my_tasks, claim_task, update_task_status                 │
│  - leave_note, get_notes, broadcast                             │
│  - acquire_lock, release_lock                                   │
│  - get_project_status, list_agents                              │
│  - create_task, decompose_task (orchestrator-only)              │
│                                                                 │
│  Backend: StorageAdapter (interface)                            │
│   └─ SQLiteAdapter (default)                                    │
│   └─ InternalSystemAdapter (post-MVP, stub en MVP)              │
└────────────────────────┬────────────────────────────────────────┘
                         │
        ┌────────────────┼────────────────┬─────────────────┐
        ▼                ▼                ▼                 ▼
┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│ Orchestrator │ │  Worker A    │ │  Worker B    │ │  Reviewer    │
│ (Claude Code)│ │ (Claude Code)│ │ (Claude Code)│ │ (Claude Code)│
│              │ │              │ │              │ │              │
│ Worktree:    │ │ Worktree:    │ │ Worktree:    │ │ Worktree:    │
│ main         │ │ feat/auth    │ │ feat/billing │ │ review-pool  │
└──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘
```

### 4.2 Flujo de datos (caso típico)

1. Humano: `agentmesh project create "API de facturación"` → se crea row en `projects`.
2. Humano lanza el orquestador: `agentmesh spawn orchestrator --project=facturacion`.
3. Orquestador (Claude Code con role `orchestrator`) recibe el brief, llama a `create_task` N veces para descomponer en tareas atómicas con dependencias.
4. Humano lanza workers: `agentmesh spawn worker --role=backend --project=facturacion`.
5. Worker arranca, llama a `get_my_tasks(role=backend)`, recibe lista de tareas elegibles (sin deps pendientes, sin lock conflict).
6. Worker llama a `claim_task(task_id)` y a `acquire_lock(paths=["src/api/billing/**"])`. Si OK, empieza a trabajar.
7. Worker trabaja en su worktree, commitea en su branch.
8. Si necesita coordinar con otro agente: `leave_note(to=agent_id, content="...")`.
9. Al terminar: `update_task_status(task_id, "done")` → `release_lock`.
10. Orquestador (corriendo periódicamente o invocado por humano) revisa estado y crea tareas de revisión/integración.
11. Reviewer reclama task de review, ejecuta `gh pr create` o equivalente.
12. Humano hace merge o invoca `agentmesh merge` que delega a un agente Release.

### 4.3 Decisión clave: ¿por qué el orquestador es un agente y no código?

Porque la descomposición de un brief en tareas atómicas, con dependencias y estimaciones razonables, requiere criterio. Un sistema de reglas se queda corto en cuanto el dominio cambia. Un LLM con un rol claro y acceso a las mismas tools MCP (más unas extras como `create_task` y `decompose_brief`) hace el trabajo bien y permanece flexible.

---

## 5. Stack técnico

Decisiones cerradas (no abrir debate en MVP):

| Aspecto | Decisión | Razón |
|---|---|---|
| Lenguaje MCP server | **TypeScript** (Node.js >= 20) | SDK MCP oficial maduro, mismo runtime que CLI |
| MCP SDK | `@modelcontextprotocol/sdk` | Oficial Anthropic |
| Transporte MCP | **stdio** | Estándar para tools locales, simple |
| DB | **SQLite** vía `better-sqlite3` | Cero deps, archivo único, transaccional, fácil debug |
| ORM/Query builder | **Drizzle ORM** | Type-safe, migraciones simples, sin ceremonia |
| CLI framework | **commander** | Probado, simple |
| Logging | **pino** | Performante, JSON estructurado |
| Testing | **vitest** | Rápido, compatible con TS nativo |
| Lint/Format | **biome** | Reemplaza ESLint+Prettier, una sola tool |
| Package manager | **pnpm** | Workspaces nativos, rápido |
| Estructura | **monorepo** con pnpm workspaces | Compartir tipos entre MCP server y CLI |

**Dependencias de runtime mínimas:**
- `@modelcontextprotocol/sdk`
- `better-sqlite3`
- `drizzle-orm`
- `commander`
- `pino`
- `zod` (validación de inputs MCP)
- `nanoid` (IDs)

**Dependencias de dev:**
- `typescript`, `tsx` (ejecutar TS directo)
- `vitest`
- `@biomejs/biome`
- `@types/node`, `@types/better-sqlite3`
- `drizzle-kit` (migraciones)

---

## 6. Modelo de datos

### 6.1 Esquema SQLite

```sql
-- Proyectos
CREATE TABLE projects (
  id TEXT PRIMARY KEY,                -- nanoid
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  repo_path TEXT NOT NULL,            -- path absoluto al repo del proyecto
  status TEXT NOT NULL DEFAULT 'active',  -- active | paused | archived
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Sprints (opcional en MVP, útil para agrupar)
CREATE TABLE sprints (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',  -- active | done | cancelled
  created_at INTEGER NOT NULL
);

-- Agentes registrados
CREATE TABLE agents (
  id TEXT PRIMARY KEY,                -- nanoid, persistente por worker session
  role TEXT NOT NULL,                 -- orchestrator | backend | frontend | qa | reviewer | release | integration
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  worktree_path TEXT,                 -- nullable para orchestrator que opera en main
  branch_name TEXT,
  status TEXT NOT NULL DEFAULT 'idle',  -- idle | working | blocked | offline
  last_heartbeat INTEGER NOT NULL,
  spawned_at INTEGER NOT NULL
);

-- Tareas
CREATE TABLE tasks (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  sprint_id TEXT REFERENCES sprints(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  acceptance_criteria TEXT NOT NULL,  -- markdown, qué define "done"
  role_required TEXT NOT NULL,        -- qué rol puede tomarla
  status TEXT NOT NULL DEFAULT 'backlog',  -- backlog | claimed | in_progress | blocked | review | done | cancelled
  assigned_agent_id TEXT REFERENCES agents(id) ON DELETE SET NULL,
  priority INTEGER NOT NULL DEFAULT 3,  -- 1 (alta) a 5 (baja)
  estimated_effort TEXT,              -- 'XS','S','M','L','XL' o null
  branch_name TEXT,                   -- branch destino sugerido
  pr_url TEXT,                        -- llenado por reviewer/release
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  completed_at INTEGER
);

-- Dependencias entre tareas
CREATE TABLE task_dependencies (
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  depends_on_task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  PRIMARY KEY (task_id, depends_on_task_id)
);

-- Locks sobre paths del repo
CREATE TABLE locks (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  path_glob TEXT NOT NULL,            -- ej: "src/api/billing/**"
  agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  task_id TEXT REFERENCES tasks(id) ON DELETE SET NULL,
  acquired_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL         -- TTL, default 2h, renovable
);

-- Notas / mensajes entre agentes
CREATE TABLE notes (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  from_agent_id TEXT REFERENCES agents(id) ON DELETE SET NULL,
  to_agent_id TEXT REFERENCES agents(id) ON DELETE SET NULL,  -- null = broadcast
  to_role TEXT,                       -- alternativa a to_agent_id: dirigir por rol
  task_id TEXT REFERENCES tasks(id) ON DELETE SET NULL,
  content TEXT NOT NULL,
  read INTEGER NOT NULL DEFAULT 0,    -- 0 | 1
  created_at INTEGER NOT NULL
);

-- Audit log
CREATE TABLE events (
  id TEXT PRIMARY KEY,
  project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
  agent_id TEXT REFERENCES agents(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,           -- task.claimed, task.completed, lock.acquired, note.left, etc.
  payload TEXT NOT NULL,              -- JSON
  created_at INTEGER NOT NULL
);

-- Índices clave
CREATE INDEX idx_tasks_project_status ON tasks(project_id, status);
CREATE INDEX idx_tasks_assigned ON tasks(assigned_agent_id) WHERE assigned_agent_id IS NOT NULL;
CREATE INDEX idx_locks_project ON locks(project_id);
CREATE INDEX idx_notes_to_agent_unread ON notes(to_agent_id, read);
CREATE INDEX idx_agents_project_status ON agents(project_id, status);
```

### 6.2 Storage Adapter (interfaz)

Definida en `packages/shared/src/storage.ts`. La implementación SQLite vive en `packages/mcp-server/src/storage/sqlite.ts`. Un futuro `InternalSystemAdapter` implementa la misma interfaz contra la API interna de la empresa.

```typescript
export interface StorageAdapter {
  // Projects
  createProject(input: CreateProjectInput): Promise<Project>;
  getProject(id: string): Promise<Project | null>;
  listProjects(): Promise<Project[]>;

  // Agents
  registerAgent(input: RegisterAgentInput): Promise<Agent>;
  heartbeatAgent(id: string): Promise<void>;
  listAgents(projectId: string): Promise<Agent[]>;

  // Tasks
  createTask(input: CreateTaskInput): Promise<Task>;
  getTask(id: string): Promise<Task | null>;
  listTasks(filter: TaskFilter): Promise<Task[]>;
  claimTask(taskId: string, agentId: string): Promise<ClaimResult>;
  updateTaskStatus(taskId: string, status: TaskStatus, agentId: string): Promise<Task>;

  // Locks
  acquireLock(input: AcquireLockInput): Promise<LockResult>;
  releaseLock(lockId: string, agentId: string): Promise<void>;
  listLocks(projectId: string): Promise<Lock[]>;

  // Notes
  leaveNote(input: LeaveNoteInput): Promise<Note>;
  getNotesForAgent(agentId: string, includeRead: boolean): Promise<Note[]>;
  markNoteRead(noteId: string): Promise<void>;

  // Events (audit)
  logEvent(input: LogEventInput): Promise<void>;
}
```

---

## 7. Especificación del MCP Server

El server se llama `agentmesh-mcp` y se conecta vía stdio. Cada Claude Code worker arranca con una env var `AGENTMESH_AGENT_ID` (asignada por el CLI al spawnearlo) que se usa como contexto implícito en cada call.

### 7.1 Herramientas expuestas

Todas las herramientas validan inputs con `zod` y devuelven JSON con shape estable. Errores se devuelven con un campo `error: string` y `code: string` (no como excepciones MCP, para que el agente pueda razonar sobre ellos).

#### 7.1.1 `get_my_tasks`

Devuelve tareas que el agente actual puede tomar (rol coincide, deps cumplidas, sin lock conflict) o que ya tomó.

```
Input: {
  status?: "backlog" | "claimed" | "in_progress" | "blocked" | "review",  // default: ["backlog", "claimed", "in_progress"]
  include_unclaimable?: boolean  // default false
}
Output: {
  claimable: Task[],
  mine: Task[],     // tareas asignadas a este agente
  blocked: Task[]   // tareas con deps no cumplidas (si include_unclaimable)
}
```

#### 7.1.2 `claim_task`

Reclama una tarea. Idempotente: si ya está reclamada por el mismo agente, devuelve OK.

```
Input: { task_id: string, paths_to_lock?: string[] }
Output: { success: boolean, task: Task, locks: Lock[], error?: string, code?: string }
Códigos de error:
  - TASK_NOT_FOUND
  - TASK_ALREADY_CLAIMED  (por otro agente)
  - ROLE_MISMATCH
  - DEPS_NOT_MET
  - LOCK_CONFLICT  (con detalle de qué paths chocan y con quién)
```

#### 7.1.3 `update_task_status`

```
Input: {
  task_id: string,
  status: "in_progress" | "blocked" | "review" | "done",
  notes?: string,        // free-text
  pr_url?: string        // si status=review
}
Output: { task: Task }
```

Reglas:
- Solo el agente asignado puede mover la tarea.
- `done` libera locks asociados automáticamente.
- `blocked` requiere `notes` no vacío.

#### 7.1.4 `report_blocker`

Atajo conveniente que setea status `blocked` + deja un `note` broadcast al rol `orchestrator`.

```
Input: { task_id: string, reason: string, needs_role?: string }
Output: { task: Task, note: Note }
```

#### 7.1.5 `acquire_lock`

```
Input: {
  paths: string[],       // globs, ej ["src/api/auth/**", "migrations/*"]
  task_id?: string,      // opcional, asocia el lock a una task
  ttl_minutes?: number   // default 120
}
Output: { success: boolean, locks: Lock[], conflicts?: ConflictInfo[], error?: string }
```

Detección de conflictos: dos globs colisionan si existe al menos un path matcheable por ambos. Implementación MVP: usar `micromatch` y matcheo conservador (en duda, considerar conflicto).

#### 7.1.6 `release_lock`

```
Input: { lock_id: string }
Output: { success: boolean }
```

#### 7.1.7 `leave_note`

```
Input: {
  content: string,
  to_agent_id?: string,   // o
  to_role?: string,       // o ninguno = broadcast al proyecto
  task_id?: string
}
Output: { note: Note }
```

#### 7.1.8 `get_notes`

```
Input: { include_read?: boolean }   // default false
Output: { notes: Note[] }
```

Llamada implícita: el server marca como leídas las notas devueltas.

#### 7.1.9 `get_project_status`

```
Input: {}    // usa project_id del agente actual
Output: {
  project: Project,
  agents: AgentSummary[],
  tasks_by_status: Record<TaskStatus, number>,
  recent_events: Event[]   // últimos 20
}
```

#### 7.1.10 Tools exclusivas del orquestador

El server identifica el rol del agente (por `agents.role`) y rechaza estas si no es orchestrator:

- `create_task(input: CreateTaskInput): Task`
- `update_task_dependencies(task_id, depends_on: string[])`
- `decompose_brief(brief: string, target_roles: string[]): Task[]` — esta tool no genera tareas mágicamente; le devuelve al orquestador una **plantilla estructurada** que tiene que completar (es decir, valida formato, no inventa contenido).
- `reassign_task(task_id, to_agent_id)`
- `cancel_task(task_id, reason)`

### 7.2 Heartbeat y desconexión

Cada agente debe llamar a una tool implícita `heartbeat` (o cualquier otra tool, que actúa como heartbeat) al menos cada 5 minutos. Si pasan >10 minutos sin actividad, el agente se marca como `offline` y sus tareas en `in_progress` vuelven a `claimed` (no a `backlog`, para que el humano decida si reasignar).

### 7.3 Manejo de errores

- Errores de validación de input → `code: VALIDATION_ERROR`, mensaje descriptivo.
- Errores de negocio (deps, locks, ownership) → códigos específicos arriba.
- Errores de DB / inesperados → `code: INTERNAL_ERROR`, log con stack, mensaje genérico al agente.

---

## 8. Definiciones de agentes (roles)

Cada rol vive como un archivo Markdown en `agents/`. Cuando el CLI hace `spawn`, copia el archivo al `CLAUDE.md` del worktree correspondiente (o lo inyecta como system prompt via `--append-system-prompt` si Claude Code lo soporta en su versión actual).

Todos los roles comparten una **sección común** que define el contrato con el MCP, y agregan sus propias responsabilidades.

### 8.1 Plantilla común (header de todos los roles)

```markdown
# Sos un agente de AgentMesh

Tu ID de agente: ${AGENTMESH_AGENT_ID}
Tu rol: ${ROLE}
Tu proyecto: ${PROJECT_NAME}
Tu worktree: ${WORKTREE_PATH}
Tu branch: ${BRANCH_NAME}

## Reglas no negociables

1. **Toda acción coordinada pasa por las MCP tools de agentmesh.** Nada de leer/escribir archivos de coordinación a mano, nada de asumir estado.
2. **Antes de empezar a trabajar en una tarea, siempre:**
   - Llamá a `get_my_tasks` para ver qué hay.
   - Llamá a `get_notes` para leer mensajes pendientes.
   - Si vas a tomar una tarea, llamá a `claim_task` con los paths que vas a tocar declarados en `paths_to_lock`.
3. **Nunca edites archivos fuera de tu lock.** Si necesitás tocar algo más, ampliá el lock antes (otro `acquire_lock`) o coordiná vía `leave_note`.
4. **Reportá blockers temprano.** Si después de un intento razonable de resolver algo seguís trabado, llamá a `report_blocker`. No te quedes loopeando.
5. **Al terminar una tarea:** corré los tests/lints del proyecto, hacé commit con mensaje convencional, y llamá a `update_task_status(status="review", pr_url=...)`. Después esperá feedback (vía `get_notes`) o tomá la siguiente tarea.
6. **Heartbeat implícito:** cualquier call MCP cuenta como heartbeat. Si vas a estar pensando >5 min sin llamar nada, hacé un `get_project_status` de vez en cuando.
```

### 8.2 Rol: Orchestrator

Responsabilidades específicas:

- Recibir el brief del proyecto (del humano, vía CLAUDE.md o conversación inicial).
- Descomponer en tareas atómicas con criterios de aceptación claros, asignando `role_required` apropiado.
- Definir dependencias entre tareas.
- Revisar `get_project_status` periódicamente; reasignar tareas si un agente quedó offline.
- Responder notas que le mandan workers (especialmente blockers).
- NO escribir código de features. Solo orquesta.

System prompt extra:

```markdown
## Tus reglas adicionales como Orchestrator

- Cuando descomponés un brief, apuntá a tareas de 1-4 horas de trabajo (effort S o M). Si una sale más grande, descomponela.
- Cada tarea debe tener acceptance_criteria verificable. Si no podés escribir el criterio, la tarea está mal definida.
- Usá dependencias con criterio: solo cuando una tarea genuinamente requiere output de otra. Sobre-dependencias matan el paralelismo.
- Cuando un worker reporta blocker, tu primera acción es leer la nota completa y la tarea. Después decidís: (a) crear una sub-task que desbloquea, (b) reasignar, (c) cancelar y rediseñar.
- Distribuí carga: revisá `agents` y evitá tener un rol con 10 tareas y otro con cero.
```

### 8.3 Roles workers: Backend, Frontend, Integration, QA, Reviewer, Release

Patrón común: cada uno se especifica por el tipo de tarea que toma + reglas técnicas propias.

**Backend Worker:**
```markdown
## Rol: Backend Worker
Tomás tareas con role_required=backend. Trabajás en endpoints, lógica de dominio, migraciones, integraciones server-side.
Reglas técnicas:
- Tests unitarios obligatorios para lógica nueva.
- Migraciones de DB son tarea separada de lógica que las usa.
- Antes de tocar un módulo de API existente, leé los tests que ya tiene.
```

**Frontend Worker:**
```markdown
## Rol: Frontend Worker
Tomás tareas con role_required=frontend. UI, componentes, integración con APIs.
Reglas técnicas:
- Si una task implica un cambio de contrato de API, leave_note al backend worker antes.
- Stack y librerías a usar: las del proyecto. Si no hay convención clara, leave_note al orchestrator.
```

**Integration Worker:**
```markdown
## Rol: Integration Worker
Tomás tareas de integraciones con sistemas externos (APIs de terceros, webhooks, colas).
Reglas técnicas:
- Adapters detrás de interfaces, nunca acoplar lógica de dominio al cliente del proveedor.
- Tests con mocks/fixtures, no contra el servicio real.
```

**QA Worker:**
```markdown
## Rol: QA Worker
Tomás tareas con role_required=qa. Tests E2E, regresión, validación de criterios de aceptación.
Reglas técnicas:
- No modificás código de feature. Si encontrás bug, abrís una task nueva (leave_note al orchestrator para que la cree) y dejás un report en la task original.
- Cada bug fix verificado genera un test de regresión.
```

**Reviewer:**
```markdown
## Rol: Reviewer
Tomás tareas con status=review. Hacés code review.
Reglas técnicas:
- Revisás: completitud vs acceptance_criteria, calidad de tests, seguridad básica (OWASP top 10 quick check), performance obvia.
- Si aprobás: update_task_status(done). Si rechazás: dejás notes específicas en la task y la mandás de vuelta a in_progress, asignándola al agente original.
```

**Release Engineer:**
```markdown
## Rol: Release Engineer
Tomás tareas de merge, despliegue, post-mortem.
Reglas técnicas:
- Verificás CI verde antes de mergear.
- Hacés squash o rebase según convención del proyecto (chequear CONTRIBUTING.md).
- Tag de release + notas auto-generadas del diff.
```

---

## 9. CLI: interfaz humana

Binario: `agentmesh` (alias corto: `am`).

### 9.1 Comandos

```
agentmesh init
  # Crea ~/.agentmesh/db.sqlite, corre migraciones, escribe config base.

agentmesh project create <name> --repo <path> [--description <text>]
  # Registra un proyecto.

agentmesh project list
  # Lista proyectos con resumen de estado.

agentmesh project show <name>
  # Detalle: agentes activos, tasks por status, locks vigentes, últimos eventos.

agentmesh spawn <role> --project <name> [--branch <branch>] [--from <base-branch>]
  # 1. Crea worktree en ../<project>-<role>-<short_id>
  # 2. Crea branch <branch> desde <from> (default: main)
  # 3. Genera AGENTMESH_AGENT_ID, lo registra en agents
  # 4. Escribe el CLAUDE.md del worktree con la plantilla del rol
  # 5. Imprime el comando exacto para arrancar Claude Code en ese worktree

agentmesh status [--project <name>] [--watch]
  # Dashboard ASCII en terminal. Con --watch refresca cada 2s.

agentmesh tasks [--project <name>] [--status <s>] [--role <r>] [--agent <id>]
  # Lista tareas filtradas.

agentmesh task show <task_id>
  # Detalle de una task: descripción, criterios, deps, notes asociadas, eventos.

agentmesh task create --project <name> --title <t> --role <r> [--from-file <path>]
  # Atajo para crear tareas a mano (sin orchestrator).

agentmesh notes [--unread] [--agent <id>]
  # Inspeccionar notas. Útil para debuggear.

agentmesh merge <task_id>
  # Asistente de merge: verifica done + CI + lanza agente Release para ejecutar.

agentmesh stop <agent_id>
  # Marca agente como offline, libera sus locks, suelta tareas in_progress.

agentmesh prune
  # Limpia agentes offline >24h, locks vencidos, eventos >30 días.
```

### 9.2 Configuración

`~/.agentmesh/config.json`:
```json
{
  "db_path": "~/.agentmesh/db.sqlite",
  "default_storage_adapter": "sqlite",
  "log_level": "info",
  "lock_default_ttl_minutes": 120,
  "heartbeat_timeout_minutes": 10
}
```

`.mcp.json` (generado en cada worktree por `spawn`):
```json
{
  "mcpServers": {
    "agentmesh": {
      "command": "agentmesh-mcp",
      "env": {
        "AGENTMESH_AGENT_ID": "<id-asignado>",
        "AGENTMESH_DB_PATH": "/home/user/.agentmesh/db.sqlite"
      }
    }
  }
}
```

---

## 10. Workflow operativo paso a paso

**Caso: arrancar un proyecto nuevo "API de facturación".**

```bash
# 1. Setup inicial (una sola vez por máquina)
agentmesh init

# 2. Registrar el proyecto
cd ~/work/facturacion-api
agentmesh project create facturacion --repo $(pwd) --description "API REST de facturación electrónica"

# 3. Lanzar el orquestador (lee el brief del CLAUDE.md del repo + lo que le pongas)
agentmesh spawn orchestrator --project facturacion
# Output:
#   Worktree creado: ../facturacion-orchestrator-x7k2
#   Agent ID: ag_x7k2p9
#   Para arrancar:
#     cd ../facturacion-orchestrator-x7k2 && claude

# 4. En esa terminal, abrís Claude Code y le decís:
#   "Leé las MCP tools de agentmesh, revisá el brief del proyecto en BRIEF.md
#    y descomponé en tasks. Apuntá a 15-25 tasks para el MVP."
# Claude Code descompone y llama a create_task N veces.

# 5. En otra terminal:
agentmesh status --project facturacion --watch
# Ya ves las tasks en backlog.

# 6. Lanzá workers (en terminales nuevas o tabs nuevas):
agentmesh spawn worker --role backend --project facturacion
agentmesh spawn worker --role backend --project facturacion   # un segundo backend si hay paralelismo
agentmesh spawn worker --role frontend --project facturacion
agentmesh spawn worker --role qa --project facturacion

# 7. En cada terminal, arrancás Claude Code con el comando que te imprimió `spawn`.
#    Cada uno ya tiene su CLAUDE.md con el rol y la conexión MCP configurada.

# 8. Los workers empiezan a reclamar y trabajar. Vos ves todo en `status --watch`.

# 9. Cuando una task va a status=review, lanzá un reviewer (o tenelo permanente):
agentmesh spawn worker --role reviewer --project facturacion

# 10. Cuando reviewer aprueba (status=done), si querés merge automático:
agentmesh merge <task_id>
#  o hacés el merge a mano por PR.
```

---

## 11. Estructura del repositorio

```
agentmesh/
├── package.json                    # pnpm workspace root
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── biome.json
├── README.md
├── AGENTMESH_SPEC.md               # este documento
├── .mcp.json.example
│
├── packages/
│   ├── shared/                     # tipos y utilidades compartidas
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── index.ts
│   │       ├── types.ts            # Project, Task, Agent, etc.
│   │       ├── storage.ts          # StorageAdapter interface
│   │       └── schemas.ts          # zod schemas
│   │
│   ├── mcp-server/                 # el MCP server
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── drizzle.config.ts
│   │   ├── migrations/
│   │   │   └── 0001_init.sql
│   │   └── src/
│   │       ├── index.ts            # entry point (stdio)
│   │       ├── server.ts           # MCP server setup
│   │       ├── tools/              # una tool por archivo
│   │       │   ├── get-my-tasks.ts
│   │       │   ├── claim-task.ts
│   │       │   ├── update-task-status.ts
│   │       │   ├── acquire-lock.ts
│   │       │   ├── release-lock.ts
│   │       │   ├── leave-note.ts
│   │       │   ├── get-notes.ts
│   │       │   ├── report-blocker.ts
│   │       │   ├── get-project-status.ts
│   │       │   ├── create-task.ts            # orchestrator-only
│   │       │   ├── update-task-dependencies.ts
│   │       │   ├── reassign-task.ts
│   │       │   └── cancel-task.ts
│   │       ├── storage/
│   │       │   ├── sqlite.ts       # SQLiteAdapter
│   │       │   └── schema.ts       # drizzle schema
│   │       ├── logic/              # lógica que no depende de transporte
│   │       │   ├── lock-conflict.ts
│   │       │   ├── deps-resolver.ts
│   │       │   └── heartbeat.ts
│   │       └── utils/
│   │           ├── auth.ts         # quien es el agente actual
│   │           └── logger.ts
│   │
│   └── cli/
│       ├── package.json
│       ├── tsconfig.json
│       └── src/
│           ├── index.ts            # bin entry
│           ├── commands/
│           │   ├── init.ts
│           │   ├── project.ts
│           │   ├── spawn.ts
│           │   ├── status.ts
│           │   ├── tasks.ts
│           │   ├── notes.ts
│           │   ├── merge.ts
│           │   ├── stop.ts
│           │   └── prune.ts
│           ├── worktree.ts         # helpers git worktree
│           └── render.ts           # output ASCII tables / dashboard
│
├── agents/                         # plantillas de roles
│   ├── _common.md                  # header común
│   ├── orchestrator.md
│   ├── backend.md
│   ├── frontend.md
│   ├── integration.md
│   ├── qa.md
│   ├── reviewer.md
│   └── release.md
│
├── scripts/
│   ├── dev.sh                      # corre mcp-server en watch
│   └── test-e2e.sh                 # smoke test multi-agente
│
└── docs/
    ├── ARCHITECTURE.md             # versión más densa de las secciones 4-7
    ├── USAGE.md                    # versión usuario-friendly de la sección 10
    └── EXTENDING.md                # cómo agregar roles / cómo escribir un adapter custom
```

---

## 12. Fases de implementación

Cada fase termina con commit verde, tests passing, y demo verificable. **No saltees fases.**

### Fase 0 — Bootstrap del monorepo
- Inicializar pnpm workspaces.
- TypeScript config base.
- Biome config.
- Vitest config.
- `package.json` raíz con scripts: `build`, `test`, `lint`, `dev`.
- Tres paquetes vacíos: `shared`, `mcp-server`, `cli`.
- **Aceptación:** `pnpm install && pnpm build && pnpm test` corre sin error (aunque no haga nada útil aún).

### Fase 1 — Shared types y storage adapter interface
- `packages/shared/src/types.ts` con todos los types del modelo de datos.
- `packages/shared/src/schemas.ts` con zod schemas para inputs MCP.
- `packages/shared/src/storage.ts` con la interface `StorageAdapter`.
- Tests de los schemas (casos válidos e inválidos).
- **Aceptación:** todos los tipos compilan, los schemas tienen tests con coverage >80%.

### Fase 2 — SQLite adapter
- Drizzle schema en `packages/mcp-server/src/storage/schema.ts` matcheando exactamente el SQL de sección 6.1.
- Migración inicial.
- Implementación de `SQLiteAdapter` que implementa `StorageAdapter`.
- Tests de integración del adapter (CRUD + cases de borde: claim race, lock conflict, dep no cumplida).
- **Aceptación:** suite de tests del adapter passing, incluyendo concurrency tests (claims simultáneos resuelven a un solo ganador).

### Fase 3 — MCP server con tools básicas (worker side)
- Setup MCP server con `@modelcontextprotocol/sdk` vía stdio.
- Tools implementadas: `get_my_tasks`, `claim_task`, `update_task_status`, `acquire_lock`, `release_lock`, `leave_note`, `get_notes`, `report_blocker`, `get_project_status`.
- Auth: lectura de `AGENTMESH_AGENT_ID` de env, resolución a `agents` row.
- Heartbeat implícito en cualquier tool.
- Logger pino estructurado.
- Tests E2E con un cliente MCP de prueba (puede ser un script de test que abre el server por stdio y manda calls).
- **Aceptación:** un test simula 2 agentes reclamando la misma task, solo uno gana; otro test simula 2 acquire_lock con paths colisionantes, solo el primero gana.

### Fase 4 — Tools del orquestador
- `create_task`, `update_task_dependencies`, `reassign_task`, `cancel_task`.
- Gate de rol: solo agentes con role=orchestrator pueden invocarlas.
- Tests de autorización.
- **Aceptación:** un agente con rol backend que intenta `create_task` recibe error con code `FORBIDDEN`.

### Fase 5 — CLI básica
- Comandos: `init`, `project create`, `project list`, `project show`, `tasks`, `task show`, `notes`.
- Render de tablas ASCII con tabular formatting.
- Sin spawn todavía.
- **Aceptación:** se puede crear un proyecto, crear tasks a mano desde la CLI, verlas listadas.

### Fase 6 — CLI: spawn de agentes
- Comando `spawn <role>` que:
  - Crea worktree con `git worktree add`.
  - Genera agent_id, registra en DB.
  - Renderiza el CLAUDE.md del worktree (concat de `_common.md` + `<role>.md` + variables sustituidas).
  - Genera `.mcp.json` en el worktree.
  - Imprime el comando para arrancar Claude Code.
- Comando `stop <agent_id>`.
- Comando `prune`.
- **Aceptación:** `spawn backend` deja un worktree con CLAUDE.md correcto y .mcp.json funcional. Abrir Claude Code ahí y pedirle `get_project_status` devuelve datos.

### Fase 7 — Status dashboard + watch mode
- `status --watch` refresca cada 2s.
- Muestra: agentes activos con su task actual, tasks por status (counts), locks vigentes, últimos 10 eventos.
- **Aceptación:** corriendo con 3 agentes activos, el dashboard refleja cambios en <3s.

### Fase 8 — Plantillas de roles completas
- Los 7 archivos en `agents/` con system prompts pulidos.
- Documentación de cómo editar las plantillas.
- **Aceptación:** un test manual: lanzar un orchestrator + 2 backends + 1 reviewer, darle un brief de 5 features, completar 1 ciclo end-to-end (brief → tasks → done → review → done).

### Fase 9 — Merge command
- `agentmesh merge <task_id>` que verifica done + CI + delega a un Release agent (o ejecuta merge directo si --auto).
- **Aceptación:** task con PR mergeable se mergea; task con CI roja no se mergea.

### Fase 10 — Hardening
- Tests de stress: 10 agentes simultáneos, 100 tasks, asegurarse de que no haya deadlocks ni race conditions.
- Manejo de crashes del MCP server (reconnect del cliente).
- Cleanup automático de locks expirados.
- **Aceptación:** suite de stress test passing 5 veces seguidas sin flakes.

### Fase 11 (post-MVP) — Adapter para sistema interno
- Implementación de `InternalSystemAdapter` contra la API de la empresa.
- Config para switchear adapter sin código.
- **Aceptación:** test E2E corriendo contra el sistema interno en staging.

---

## 13. Criterios de aceptación globales

El sistema se considera "MVP listo" cuando se cumplen TODOS estos puntos:

1. ✅ `pnpm install && pnpm build && pnpm test` pasa en clean checkout.
2. ✅ Coverage de tests >75% en `mcp-server` y `shared`.
3. ✅ Un humano sin contexto previo puede, leyendo solo `docs/USAGE.md`, crear un proyecto, lanzar 2 agentes y completar 1 ciclo end-to-end en <15 minutos.
4. ✅ Stress test con 10 agentes / 100 tasks completa sin race conditions ni deadlocks.
5. ✅ Crash y reinicio del MCP server no corrompe DB ni pierde tasks.
6. ✅ Toda operación destructiva en CLI (stop, prune, cancel) requiere confirmación o flag `--yes`.
7. ✅ Logs estructurados con request_id correlacionable entre tool call y eventos en DB.
8. ✅ README en root tiene quickstart de <2 min hasta primer agente corriendo.

---

## 14. Instrucciones para Claude Code (contrato de ejecución)

Si estás leyendo esto como agente Claude Code que va a construir el sistema:

**Antes de empezar:**

1. Confirmá que estás en un repo vacío o uno solo con este `AGENTMESH_SPEC.md`.
2. Leé el documento completo dos veces.
3. Listame (al humano) cualquiera de estos casos:
   - Ambigüedades en specs de tools.
   - Decisiones técnicas que cuestionarías.
   - Dependencias o asunciones que ves problemáticas.
   - Riesgos de implementación que detectes.
4. **Esperá feedback antes de tocar código.** No empieces a programar hasta que el humano apruebe.

**Durante la implementación:**

5. Trabajá fase por fase, en orden. No saltees ni adelantes.
6. Al terminar cada fase:
   - Corré los tests y lint.
   - Hacé commit con mensaje convencional (`feat(phase-X): ...`).
   - Reportá al humano: qué se hizo, qué tests pasaron, qué decisiones tomaste que no estaban en el spec, qué dejás para la fase siguiente.
   - **Esperá luz verde** antes de pasar a la siguiente fase.
7. Si te encontrás con un caso no cubierto por el spec:
   - Documentá la decisión en `docs/DECISIONS.md` (formato ADR corto: contexto, decisión, alternativas).
   - Marcá `// AGENTMESH_DECISION: <ref ADR>` en el código.
   - Mencionalo en el reporte de fase.
8. Si una decisión del spec se demuestra mala en la práctica, decílo. No la implementes en silencio "mejor". Proponé un cambio, esperá decisión, después implementá.

**Código:**

9. TypeScript strict. Nada de `any` salvo en bordes con librerías sin tipos (documentar por qué).
10. Tests al lado del código (`foo.ts` + `foo.test.ts`) salvo tests de integración que viven en `tests/`.
11. Comentarios: solo cuando explican el *por qué*, no el *qué*. El código debe ser legible por sí mismo.
12. Errores siempre con tipos discriminados (`{ ok: true, value } | { ok: false, code, message }`) o excepciones tipadas, nunca strings sueltos.

**Comunicación con el humano durante el build:**

13. Si una fase te lleva más de lo esperado, pará y reportá. No silencies dificultades.
14. Usá los acceptance criteria de cada fase como check-list explícito en tu reporte.
15. Al cerrar el MVP (fase 10), generá un `RELEASE_NOTES.md` con el resumen de capacidades y limitaciones conocidas.

---

## Apéndice A — Glosario rápido

- **Worker**: instancia de Claude Code con rol no-orchestrator que ejecuta tareas de código.
- **Orquestador**: instancia de Claude Code con rol orchestrator que descompone briefs y administra el backlog.
- **Worktree**: directorio de trabajo aislado de git (`git worktree`).
- **Lock**: reserva exclusiva sobre uno o más globs de paths, por TTL.
- **Note**: mensaje estructurado entre agentes, persistente en DB.
- **Brief**: descripción inicial del proyecto que el orquestador descompone en tareas.

## Apéndice B — Fuera de scope del MVP

Para evitar scope creep, lo siguiente NO entra en MVP y va para roadmap:

- Web UI / dashboard gráfico.
- Integraciones con Slack / Teams / email.
- Métricas de productividad por agente.
- Soporte multi-máquina (cluster de workers en distintas máquinas).
- Persistencia de contexto entre sesiones de un mismo agente (más allá de notes).
- Replay / time-travel de eventos.
- LLM-based code review automatizado (queda en manos del Reviewer agent).
- Integración con CI/CD providers más allá de chequear que CI esté verde.

## Apéndice C — Referencias

- Model Context Protocol: https://modelcontextprotocol.io
- Claude Code docs: https://docs.anthropic.com/en/docs/claude-code
- Git worktrees: https://git-scm.com/docs/git-worktree
- Drizzle ORM: https://orm.drizzle.team
- Inspiración (no copia): gstack (Garry Tan) — `github.com/garrytan/gstack`. AgentMesh toma la idea de roles especializados pero implementa coordinación autónoma vía MCP en lugar de orquestación human-driven via slash commands.
