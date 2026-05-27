export function getPage(projectName: string): string {
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>AgentMesh — ${projectName}</title>
<script src="https://cdn.tailwindcss.com"><\/script>
<style>
  body { font-family: 'Inter', 'Segoe UI', system-ui, sans-serif; }
  ::-webkit-scrollbar { width: 4px; height: 4px; }
  ::-webkit-scrollbar-track { background: #f1f5f9; }
  ::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 2px; }

  /* Agent cards */
  .agent-card { transition: box-shadow 0.3s; position: relative; }
  @keyframes glow { 0%,100%{box-shadow:0 0 0 1px #6366f130} 50%{box-shadow:0 0 0 3px #6366f140} }
  .agent-active  { border-color: #6366f1 !important; animation: glow 2s ease-in-out infinite; }
  .agent-blocked { border-color: #dc2626 !important; }

  /* Status badges */
  .badge-idle    { background:#dcfce7; color:#15803d; }
  .badge-active  { background:#dbeafe; color:#1d4ed8; }
  .badge-blocked { background:#fee2e2; color:#dc2626; }
  .badge-offline { background:#f3f4f6; color:#9ca3af; }

  /* Task cards */
  .task-card { transition: transform 0.1s, box-shadow 0.1s; cursor: pointer; }
  .task-card:hover { transform: translateY(-1px); box-shadow: 0 4px 12px rgba(0,0,0,0.1); }
  .bl-backlog   { border-left: 2px solid #9ca3af; }
  .bl-claimed   { border-left: 2px solid #3b82f6; }
  .bl-progress  { border-left: 2px solid #6366f1; }
  .bl-blocked   { border-left: 2px solid #ef4444; }
  .bl-review    { border-left: 2px solid #eab308; }
  .bl-done      { border-left: 2px solid #22c55e; }

  /* Feed */
  .bubble-note  { border-left: 3px solid #6366f1; }
  .bubble-ok    { border-left: 2px solid #22c55e66; }
  .bubble-warn  { border-left: 2px solid #ef444466; }
  .bubble-muted { border-left: 2px solid #e5e7eb; }

  /* Heartbeat */
  .hb-ok   { color: #d1d5db; }
  .hb-warn { color: #d97706; }
  .hb-dead { color: #dc2626; }

  /* Dropdown */
  .dropdown {
    position: absolute; right: 0; top: calc(100% + 4px); z-index: 60;
    min-width: 168px; background: #ffffff; border: 1px solid #e5e7eb;
    border-radius: 8px; box-shadow: 0 8px 24px rgba(0,0,0,0.12);
  }
  .dd-item {
    display: block; width: 100%; text-align: left; padding: 7px 12px;
    font-size: 12px; color: #374151; cursor: pointer; background: transparent;
    border: none; font-family: inherit; white-space: nowrap;
  }
  .dd-item:first-child { border-radius: 7px 7px 0 0; }
  .dd-item:last-child  { border-radius: 0 0 7px 7px; }
  .dd-item:hover { background: #f9fafb; color: #111827; }
  .dd-item.danger { color: #dc2626; }
  .dd-item.danger:hover { background: #fef2f2; color: #b91c1c; }
  .dd-sep { border: none; border-top: 1px solid #e5e7eb; margin: 3px 0; }

  /* Modal */
  .modal-back { background: rgba(15,23,42,0.45); backdrop-filter: blur(3px); }

  /* Tabs */
  .tab-on  { color: #111827; border-bottom: 2px solid #6366f1; }
  .tab-off { color: #9ca3af; border-bottom: 2px solid transparent; cursor: pointer; }
  .tab-off:hover { color: #6b7280; }

  /* Forms */
  input[type=text], select, textarea {
    background: #ffffff; border: 1px solid #d1d5db; color: #111827;
    border-radius: 6px; padding: 5px 9px; font-size: 12px; width: 100%;
    font-family: inherit; outline: none; box-sizing: border-box;
  }
  input[type=text]:focus, select:focus, textarea:focus { border-color: #6366f1; box-shadow: 0 0 0 2px #6366f120; }
  .btn-primary {
    background: #4f46e5; color: #fff; border: none; border-radius: 6px;
    padding: 5px 12px; font-size: 12px; cursor: pointer; font-family: inherit; font-weight: 600;
  }
  .btn-primary:hover { background: #4338ca; }
  .btn-ghost {
    background: transparent; color: #6b7280; border: 1px solid #d1d5db;
    border-radius: 6px; padding: 5px 10px; font-size: 12px; cursor: pointer; font-family: inherit;
  }
  .btn-ghost:hover { color: #374151; border-color: #9ca3af; }
  .role-pill {
    background: #f9fafb; color: #6b7280; border: 1px solid #d1d5db;
    border-radius: 20px; padding: 3px 10px; font-size: 11px; cursor: pointer;
    font-family: inherit; font-weight: 600;
  }
  .role-pill:hover { background: #eef2ff; color: #4338ca; border-color: #818cf8; }

  /* Backlog table */
  .bl-table { width: 100%; border-collapse: collapse; font-size: 12px; }
  .bl-table th {
    text-align: left; padding: 6px 12px; color: #6b7280; font-weight: 600;
    border-bottom: 1px solid #e5e7eb; white-space: nowrap; position: sticky; top: 0; background: #f9fafb;
  }
  .bl-table td { padding: 8px 12px; border-bottom: 1px solid #f3f4f6; vertical-align: middle; }
  .bl-table tbody tr { cursor: pointer; }
  .bl-table tbody tr:hover td { background: #f9fafb; }

  /* Progress */
  .progress-fill { transition: width 0.6s ease; }

  /* Idle alert pulse */
  @keyframes pulse-y { 0%,100%{opacity:1} 50%{opacity:0.65} }
  .idle-alert { animation: pulse-y 2.5s ease-in-out infinite; }

  #feed { scroll-behavior: smooth; }

  /* Panel resize handles */
  .rz-handle {
    flex: none; width: 5px; background: #e2e8f0;
    cursor: col-resize; position: relative; user-select: none;
    transition: background 0.15s;
  }
  .rz-handle::after {
    content: ''; position: absolute; top: 50%; left: 50%;
    transform: translate(-50%, -50%);
    width: 3px; height: 40px; background: #6366f1;
    border-radius: 2px; opacity: 0; transition: opacity 0.15s;
  }
  .rz-handle:hover, .rz-handle.rz-active { background: #c7d2fe; }
  .rz-handle:hover::after, .rz-handle.rz-active::after { opacity: 1; }

  /* Section headers */
  .sec-header {
    background: #f8fafc; border-bottom: 1px solid #cbd5e1;
    padding: 6px 12px; display: flex; align-items: center; justify-content: space-between;
  }
  .sec-title { font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.07em; }
</style>
</head>
<body class="bg-slate-50 text-gray-900 h-screen flex flex-col overflow-hidden" onclick="onBodyClick(event)">

<!-- ═══ HEADER ═══════════════════════════════════════════════════════════════ -->
<header class="flex-none bg-white border-b border-slate-300 px-5 py-2 flex items-center gap-4 shadow-sm">
  <div class="flex items-center gap-2 flex-none">
    <span class="text-gray-900 font-bold tracking-tight text-sm">AgentMesh</span>
    <span class="text-gray-300">/</span>
    <span class="text-indigo-600 font-semibold text-sm">${projectName}</span>
  </div>

  <div id="idle-alert" class="hidden idle-alert flex items-center gap-2 px-3 py-1 bg-yellow-50 border border-yellow-300 rounded-full text-xs text-yellow-700 flex-none">
    <span>⚠</span><span>Hay tareas pendientes sin agentes activos</span>
  </div>

  <div class="flex-1"></div>

  <div class="flex items-center gap-4 text-xs flex-none">
    <div class="flex items-center gap-2">
      <span class="text-gray-400">progreso</span>
      <div class="w-24 h-1.5 bg-gray-200 rounded-full overflow-hidden">
        <div id="progress-bar" class="h-full bg-green-500 rounded-full progress-fill" style="width:0%"></div>
      </div>
      <span id="progress-label" class="text-gray-400 font-mono">0/0</span>
    </div>
    <span id="msg-banner" class="hidden px-3 py-1 rounded-full font-medium text-xs"></span>
    <div class="flex items-center gap-1.5">
      <span id="live-dot" class="w-2 h-2 rounded-full bg-green-500 animate-pulse inline-block"></span>
      <span id="live-label" class="text-green-600 font-medium">en vivo</span>
      <span id="last-ts" class="text-gray-300 ml-1"></span>
    </div>
  </div>
</header>

<!-- ═══ BODY: 3 columnas ═════════════════════════════════════════════════════ -->
<div class="flex flex-1 overflow-hidden">

  <!-- ── SIDEBAR IZQUIERDO ──────────────────────────────────────────────── -->
  <aside id="panel-left" class="flex-none flex flex-col bg-white overflow-hidden" style="width:244px;min-width:160px;max-width:480px">

    <!-- Agentes -->
    <section class="flex-1 flex flex-col overflow-hidden min-h-0">
      <div class="sec-header flex-none">
        <div class="flex items-center gap-2">
          <span class="sec-title">Agentes</span>
          <span id="agent-count" class="text-xs text-slate-400 font-mono"></span>
        </div>
        <button onclick="toggleSpawnForm()" class="text-xs text-indigo-600 hover:text-indigo-800 font-semibold">+ Lanzar</button>
      </div>

      <div class="px-3 pt-3 pb-1 flex flex-col flex-1 overflow-hidden min-h-0">
        <!-- Lista (scroll interno) -->
        <div id="agents" class="space-y-1.5 overflow-y-auto flex-1 min-h-0"></div>

        <!-- Spawn form -->
        <div id="spawn-form" class="hidden mt-2 p-3 bg-gray-50 rounded-lg border border-gray-200 space-y-2 flex-none">
          <p class="text-xs text-gray-500">Elige un rol:</p>
          <div class="flex flex-wrap gap-1.5">
            <button onclick="doSpawn('backend')"      class="role-pill">backend</button>
            <button onclick="doSpawn('frontend')"     class="role-pill">frontend</button>
            <button onclick="doSpawn('qa')"           class="role-pill">qa</button>
            <button onclick="doSpawn('reviewer')"     class="role-pill">reviewer</button>
            <button onclick="doSpawn('integration')"  class="role-pill">integration</button>
            <button onclick="doSpawn('release')"      class="role-pill">release</button>
            <button onclick="doSpawn('scrum-master')" class="role-pill">scrum-master</button>
          </div>
          <div class="flex items-center gap-2">
            <label class="text-xs text-gray-400 whitespace-nowrap">rama base:</label>
            <input type="text" id="spawn-base" value="main" style="width:80px">
          </div>
          <p id="spawn-status" class="hidden text-xs text-yellow-600"></p>
        </div>
      </div>
    </section>

    <!-- Locks -->
    <section class="flex-none">
      <div class="sec-header" style="padding-top:4px;padding-bottom:4px">
        <span class="sec-title">Locks activos</span>
      </div>
      <div class="px-3 py-1.5">
        <div id="locks" class="space-y-1 overflow-y-auto" style="max-height:96px"></div>
      </div>
    </section>

  </aside>

  <!-- resize handle izquierdo -->
  <div id="rz-left" class="rz-handle"></div>

  <!-- ── CENTRO: tabs + contenido ───────────────────────────────────────── -->
  <main class="flex-1 flex flex-col overflow-hidden min-w-0">

    <!-- Tab bar -->
    <div class="flex-none border-b border-slate-300 px-5 flex items-center gap-5 bg-white">
      <button id="tab-btn-tablero" onclick="switchTab('tablero')" class="tab-on py-2 text-xs font-semibold">Tablero</button>
      <button id="tab-btn-backlog" onclick="switchTab('backlog')"  class="tab-off py-2 text-xs font-semibold">Backlog</button>
    </div>

    <!-- TABLERO -->
    <div id="tab-tablero" class="flex-1 overflow-hidden flex flex-col">
      <div id="kanban" class="flex-1 grid overflow-hidden" style="grid-template-columns:repeat(5,1fr)"></div>
    </div>

    <!-- BACKLOG (oculto por defecto) -->
    <div id="tab-backlog" class="hidden flex-1 flex-col overflow-hidden">

      <!-- Filtros + botón agregar -->
      <div class="flex-none px-4 py-2.5 border-b border-gray-200 flex items-center gap-2 bg-white">
        <select id="bl-filter-status" onchange="renderBacklog()" style="width:auto;padding:4px 8px">
          <option value="">Todos los estados</option>
          <option value="backlog">Pendiente</option>
          <option value="claimed">Reclamada</option>
          <option value="in_progress">En progreso</option>
          <option value="blocked">Bloqueada</option>
          <option value="review">Revisión</option>
          <option value="done">Completada</option>
          <option value="cancelled">Cancelada</option>
        </select>
        <select id="bl-filter-role" onchange="renderBacklog()" style="width:auto;padding:4px 8px">
          <option value="">Todos los roles</option>
          <option value="backend">backend</option>
          <option value="frontend">frontend</option>
          <option value="qa">qa</option>
          <option value="integration">integration</option>
          <option value="reviewer">reviewer</option>
          <option value="release">release</option>
          <option value="scrum-master">scrum-master</option>
        </select>
        <div class="flex-1"></div>
        <button onclick="toggleAddTask()" class="btn-primary">+ Nueva tarea</button>
      </div>

      <!-- Form nueva tarea (inline) -->
      <div id="add-task-form" class="hidden flex-none px-4 py-3 border-b border-gray-200 bg-gray-50">
        <div class="flex gap-2">
          <input type="text" id="task-title-input" placeholder="Título (requerido)" class="flex-1">
          <select id="task-role-select" style="width:110px">
            <option value="backend">backend</option>
            <option value="frontend">frontend</option>
            <option value="qa">qa</option>
            <option value="integration">integration</option>
            <option value="reviewer">reviewer</option>
            <option value="release">release</option>
            <option value="scrum-master">scrum-master</option>
          </select>
          <input type="text" id="task-desc-input" placeholder="Descripción" class="flex-1">
          <input type="text" id="task-ac-input" placeholder="Criterio de aceptación" class="flex-1">
          <button onclick="doAddTask()" class="btn-primary flex-none">Agregar</button>
          <button onclick="toggleAddTask()" class="btn-ghost flex-none">✕</button>
        </div>
        <p id="add-task-status" class="hidden text-xs text-yellow-600 mt-1.5"></p>
      </div>

      <!-- Tabla de tareas -->
      <div class="flex-1 overflow-y-auto bg-white">
        <table class="bl-table">
          <thead>
            <tr>
              <th>Tarea</th>
              <th>Rol</th>
              <th>Estado</th>
              <th>Agente</th>
              <th>PR</th>
            </tr>
          </thead>
          <tbody id="backlog-body"></tbody>
        </table>
        <p id="backlog-empty" class="hidden text-center text-gray-400 text-sm py-10">No hay tareas que coincidan.</p>
      </div>
    </div>

  </main>

  <!-- resize handle derecho -->
  <div id="rz-right" class="rz-handle"></div>

  <!-- ── DERECHA: actividad ──────────────────────────────────────────────── -->
  <aside id="panel-right" class="flex-none flex flex-col bg-white overflow-hidden" style="width:252px;min-width:160px;max-width:480px">
    <div class="sec-header flex-none">
      <span class="sec-title">Actividad</span>
      <span id="feed-count" class="text-xs text-slate-400 font-mono"></span>
    </div>
    <div class="flex-none px-4 py-1 border-b border-slate-200 flex gap-3 text-xs bg-white">
      <button id="filter-all"    onclick="setFilter('all')"    class="tab-on pb-0.5">todo</button>
      <button id="filter-notes"  onclick="setFilter('notes')"  class="tab-off pb-0.5">notas</button>
      <button id="filter-mcp"    onclick="setFilter('mcp')"    class="tab-off pb-0.5">MCP</button>
      <button id="filter-hooks"  onclick="setFilter('hooks')"  class="tab-off pb-0.5">acciones</button>
    </div>
    <div id="feed" class="flex-1 overflow-y-auto p-3 space-y-1 bg-slate-50"></div>
  </aside>

</div>

<!-- ═══ MODAL: detalle de tarea ═════════════════════════════════════════════ -->
<div id="task-modal" class="hidden fixed inset-0 z-50 flex items-center justify-center modal-back" onclick="onModalBackdrop(event)">
  <div class="bg-white border border-gray-200 rounded-xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden" onclick="event.stopPropagation()">
    <div class="flex items-start justify-between px-5 py-3.5 border-b border-gray-100">
      <h3 id="modal-title" class="text-sm font-semibold text-gray-900 leading-snug pr-4"></h3>
      <button onclick="closeModal()" class="text-gray-300 hover:text-gray-600 text-lg leading-none flex-none">✕</button>
    </div>
    <div class="px-5 py-4 space-y-4 overflow-y-auto" style="max-height:72vh">
      <div class="flex items-center gap-2 flex-wrap text-xs">
        <span id="modal-status" class="px-2 py-0.5 rounded font-mono font-semibold"></span>
        <span id="modal-role"   class="text-gray-400"></span>
        <span id="modal-agent"  class="ml-auto text-gray-400 font-mono"></span>
      </div>
      <div id="modal-desc-block">
        <p class="text-xs text-gray-400 uppercase tracking-widest mb-1">Descripción</p>
        <p id="modal-desc" class="text-sm text-gray-700 leading-relaxed"></p>
      </div>
      <div id="modal-ac-block">
        <p class="text-xs text-gray-400 uppercase tracking-widest mb-1">Criterio de aceptación</p>
        <p id="modal-ac" class="text-sm text-gray-700 leading-relaxed"></p>
      </div>
      <div id="modal-branch-block" class="hidden">
        <p class="text-xs text-gray-400 uppercase tracking-widest mb-1">Branch</p>
        <code id="modal-branch" class="text-xs text-indigo-600 font-mono"></code>
      </div>
      <div id="modal-pr-block" class="hidden">
        <p class="text-xs text-gray-400 uppercase tracking-widest mb-1">Pull Request</p>
        <a id="modal-pr" href="#" target="_blank" class="text-xs text-indigo-600 hover:underline break-all"></a>
      </div>
    </div>
  </div>
</div>

<script>
// ── estado global ────────────────────────────────────────────────────────────
var seenIds       = {};
var feedFilter    = 'all';
var currentTab    = 'tablero';
var activeDropdown = null;
var lastState     = null;
var PROJECT_NAME  = ${JSON.stringify(projectName)};

// ── utilidades ───────────────────────────────────────────────────────────────
function relTime(ms) {
  var d = Date.now() - ms;
  if (d < 10000)   return 'ahora';
  if (d < 60000)   return Math.round(d/1000) + 's';
  if (d < 3600000) return Math.round(d/60000) + 'm';
  return Math.round(d/3600000) + 'h';
}
function fmtTime(ms) { return new Date(ms).toISOString().slice(11,19); }
function esc(s) {
  if (s == null) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function hbClass(ms) {
  var age = Date.now() - ms;
  if (age > 120000) return 'hb-dead';
  if (age > 60000)  return 'hb-warn';
  return 'hb-ok';
}
function showMsg(text, isErr) {
  var el = document.getElementById('msg-banner');
  el.textContent = text;
  el.className = 'px-3 py-1 rounded-full font-medium text-xs ' +
    (isErr ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700');
  setTimeout(function(){ el.className = 'hidden'; }, 3500);
}

var ROLE_ICONS  = { orchestrator:'⚙', backend:'◈', frontend:'◉', integration:'⬡', qa:'◎', reviewer:'⊕', release:'⬆', 'scrum-master':'⟳' };
var ROLE_COLORS = { orchestrator:'text-purple-600', backend:'text-blue-600', frontend:'text-emerald-600',
  integration:'text-yellow-600', qa:'text-orange-600', reviewer:'text-pink-600', release:'text-cyan-600',
  'scrum-master':'text-teal-600' };
function rIcon(r)  { return ROLE_ICONS[r]  || '●'; }
function rColor(r) { return ROLE_COLORS[r] || 'text-gray-500'; }

function agentBadgeCls(st) {
  return ({idle:'badge-idle',working:'badge-active',in_progress:'badge-active',blocked:'badge-blocked',offline:'badge-offline'})[st] || 'badge-idle';
}
function agentBadgeTxt(st) {
  return ({idle:'inactivo',working:'conectado',in_progress:'trabajando',blocked:'bloqueado',offline:'offline'})[st] || st;
}

var TASK_BORDER = { backlog:'bl-backlog', claimed:'bl-claimed', in_progress:'bl-progress',
  blocked:'bl-blocked', review:'bl-review', done:'bl-done' };
function taskBorderCls(st) { return TASK_BORDER[st] || 'bl-backlog'; }

var TASK_LABELS = { backlog:'Pendiente', claimed:'Reclamada', in_progress:'En progreso',
  blocked:'Bloqueada', review:'Revisión', done:'Completada', cancelled:'Cancelada' };
function taskLbl(st) { return TASK_LABELS[st] || st; }

var STATUS_COLORS = { backlog:'text-gray-400', claimed:'text-blue-600', in_progress:'text-indigo-600',
  blocked:'text-red-600', review:'text-yellow-600', done:'text-green-600', cancelled:'text-gray-300' };
function statusColor(st) { return STATUS_COLORS[st] || 'text-gray-400'; }

var STATUS_BG = { backlog:'bg-gray-100 text-gray-600', claimed:'bg-blue-100 text-blue-700',
  in_progress:'bg-indigo-100 text-indigo-700', blocked:'bg-red-100 text-red-700',
  review:'bg-yellow-100 text-yellow-700', done:'bg-green-100 text-green-700',
  cancelled:'bg-gray-100 text-gray-400' };
function statusBg(st) { return STATUS_BG[st] || 'bg-gray-100 text-gray-600'; }

var EV_MAP = {
  // task lifecycle events
  'task.claimed':    { i:'⚡', t:'reclamó tarea',     c:'text-blue-600',    b:'bubble-ok' },
  'task.in_progress':{ i:'↻',  t:'en progreso',       c:'text-indigo-600',  b:'bubble-muted' },
  'task.review':     { i:'⊕',  t:'en revisión',       c:'text-yellow-600',  b:'bubble-ok' },
  'task.done':       { i:'✓',  t:'tarea completada',  c:'text-green-600',   b:'bubble-ok' },
  'task.blocked':    { i:'⚠',  t:'bloqueada',         c:'text-red-600',     b:'bubble-warn' },
  'task.created':    { i:'+',  t:'tarea creada',      c:'text-emerald-600', b:'bubble-ok' },
  'task.cancelled':  { i:'✕',  t:'cancelada',         c:'text-gray-400',    b:'bubble-muted' },
  'task.reassigned': { i:'⇄',  t:'reasignada',        c:'text-yellow-600',  b:'bubble-ok' },
  report_blocker:    { i:'⚠',  t:'blocker reportado', c:'text-red-600',     b:'bubble-warn' },
  acquire_lock:      { i:'🔒', t:'lock adquirido',    c:'text-yellow-600',  b:'bubble-muted' },
  release_lock:      { i:'🔓', t:'lock liberado',     c:'text-gray-400',    b:'bubble-muted' },
  leave_note:        { i:'✉',  t:'nota enviada',      c:'text-indigo-600',  b:'bubble-ok' },
  spawn_agent:       { i:'→',  t:'agente lanzado',    c:'text-purple-600',  b:'bubble-ok' },
  agent_stopped:     { i:'■',  t:'agente detenido',   c:'text-gray-400',    b:'bubble-muted' },
  // Option A — MCP tool calls
  'tool:claim_task':         { i:'⚡', t:'reclamó tarea',     c:'text-blue-600',    b:'bubble-ok' },
  'tool:update_task_status': { i:'↻',  t:'actualizó estado',  c:'text-indigo-600',  b:'bubble-muted' },
  'tool:force_task_status':  { i:'⟳',  t:'forzó estado',      c:'text-purple-600',  b:'bubble-warn' },
  'tool:acquire_lock':       { i:'🔒', t:'lock adquirido',    c:'text-yellow-600',  b:'bubble-muted' },
  'tool:report_blocker':     { i:'⚠',  t:'blocker reportado', c:'text-red-600',     b:'bubble-warn' },
  'tool:leave_note':         { i:'✉',  t:'envió nota',        c:'text-indigo-600',  b:'bubble-ok' },
  'tool:send_note':          { i:'✉',  t:'envió nota',        c:'text-indigo-600',  b:'bubble-ok' },
  'tool:create_task':        { i:'+',  t:'creó tarea',        c:'text-emerald-600', b:'bubble-ok' },
  'tool:reassign_task':      { i:'⇄',  t:'reasignó tarea',    c:'text-yellow-600',  b:'bubble-ok' },
  'tool:cancel_task':        { i:'✕',  t:'canceló tarea',     c:'text-gray-400',    b:'bubble-muted' },
  // Option B — Claude Code native tool calls (via hook)
  'hook:Edit':       { i:'✎',  t:'editó archivo',     c:'text-slate-500',   b:'bubble-muted' },
  'hook:Write':      { i:'✎',  t:'escribió archivo',  c:'text-slate-500',   b:'bubble-muted' },
  'hook:MultiEdit':  { i:'✎',  t:'editó archivos',    c:'text-slate-500',   b:'bubble-muted' },
  'hook:Bash':       { i:'$',  t:'ejecutó comando',   c:'text-slate-400',   b:'bubble-muted' },
  'hook:TodoWrite':  { i:'☑',  t:'actualizó TODOs',   c:'text-cyan-600',    b:'bubble-muted' },
  // legacy keys (fallback)
  claim_task:        { i:'⚡', t:'reclamó tarea',     c:'text-blue-600',    b:'bubble-ok' },
  create_task:       { i:'+',  t:'tarea creada',      c:'text-emerald-600', b:'bubble-ok' },
  reassign_task:     { i:'⇄',  t:'reasignada',        c:'text-yellow-600',  b:'bubble-ok' },
  cancel_task:       { i:'✕',  t:'cancelada',         c:'text-gray-400',    b:'bubble-muted' },
  update_task_status:{ i:'↻',  t:'actualizó estado',  c:'text-gray-400',    b:'bubble-muted' },
};
function evInfo(type) { return EV_MAP[type] || { i:'·', t: type||'evento', c:'text-gray-400', b:'bubble-muted' }; }

// ── tabs ─────────────────────────────────────────────────────────────────────
function switchTab(tab) {
  currentTab = tab;
  ['tablero','backlog'].forEach(function(t) {
    var el = document.getElementById('tab-' + t);
    var btn = document.getElementById('tab-btn-' + t);
    var on = t === tab;
    el.classList.toggle('hidden', !on);
    el.classList.toggle('flex', on);
    el.classList.toggle('flex-col', on);
    btn.className = (on ? 'tab-on' : 'tab-off') + ' py-2 text-xs font-semibold';
  });
  if (tab === 'backlog' && lastState) renderBacklog();
}

// ── dropdown ─────────────────────────────────────────────────────────────────
function openDropdown(id, evt) {
  if (evt) evt.stopPropagation(); // evitar que el click llegue a onBodyClick y cierre el dropdown
  if (activeDropdown === id) { closeDropdown(); return; }
  closeDropdown();
  activeDropdown = id;
  var dd = document.getElementById('dd-' + id);
  if (dd) dd.classList.remove('hidden');
}
function closeDropdown() {
  if (!activeDropdown) return;
  var dd = document.getElementById('dd-' + activeDropdown);
  if (dd) dd.classList.add('hidden');
  activeDropdown = null;
}
function onBodyClick(e) {
  if (!e.target.closest('[data-dd]') && !e.target.closest('.dropdown')) closeDropdown();
}

// ── render: agente card (shared) ─────────────────────────────────────────────
function renderAgentCard(a, isOrchestrator, num, instances) {
  var isActive  = a.status === 'working' || a.status === 'in_progress';
  var isBlocked = a.status === 'blocked';
  var isOffline = a.status === 'offline';
  var cardCls = isBlocked ? 'agent-blocked' : isActive ? 'agent-active' : '';
  var opCls   = isOffline ? 'opacity-40' : '';

  var taskHtml = '';
  if (a.current_task) {
    var dot = a.current_task.status === 'blocked' ? 'bg-red-500' : 'bg-indigo-500';
    taskHtml = '<div class="mt-1 flex items-start gap-1.5">' +
      '<span class="w-1.5 h-1.5 rounded-full flex-none mt-0.5 ' + dot + '"></span>' +
      '<span class="text-gray-400 text-xs leading-snug truncate" title="' + esc(a.current_task.title) + '">' + esc(a.current_task.title) + '</span>' +
    '</div>';
  }

  var ddId = 'dd-' + esc(a.id);
  var ddItems = [
    (!isOrchestrator && a.worktree_path)
      ? '<button class="dd-item" onclick="doCopyLaunch(\\'' + esc(a.id) + '\\')">⊙ Copiar comando</button>'
      : '',
    !isOrchestrator
      ? '<button class="dd-item" onclick="doNudge(\\'' + esc(a.id) + '\\')">↻ Forzar ciclo</button>'
      : '',
    '<button class="dd-item" onclick="doCopyId(\\'' + esc(a.id) + '\\')">⧉ Copiar ID</button>',
    !isOrchestrator ? '<hr class="dd-sep">' : '',
    !isOrchestrator
      ? '<button class="dd-item danger" onclick="doStop(\\'' + esc(a.id) + '\\')">■ Detener agente</button>'
      : '',
  ].filter(Boolean).join('');

  var bgCls = isOrchestrator
    ? 'bg-purple-50 border-purple-200'
    : 'bg-white border-gray-200';

  return '<div class="agent-card rounded-lg p-2.5 border shadow-sm ' + bgCls + ' ' + cardCls + ' ' + opCls + '">' +
    '<div class="flex items-center justify-between">' +
      '<div class="flex items-center gap-1.5">' +
        '<span class="' + rColor(a.role) + ' font-mono">' + rIcon(a.role) + '</span>' +
        '<span class="text-xs font-semibold text-gray-700">' + esc(a.role) + (num ? ' <span class="font-normal text-gray-400">' + num + '</span>' : '') + (instances ? ' <span class="text-gray-300 font-normal text-xs">×' + instances + '</span>' : '') + '</span>' +
      '</div>' +
      '<div class="flex items-center gap-1">' +
        '<span class="text-xs px-1.5 py-0.5 rounded font-mono ' + agentBadgeCls(a.status) + '">' + agentBadgeTxt(a.status) + '</span>' +
        '<div class="relative">' +
          '<button data-dd onclick="openDropdown(\\'' + esc(a.id) + '\\', event)" ' +
            'class="text-gray-300 hover:text-gray-600 px-1 text-sm leading-none">⋮</button>' +
          '<div id="' + ddId + '" class="dropdown hidden">' + ddItems + '</div>' +
        '</div>' +
      '</div>' +
    '</div>' +
    taskHtml +
    '<p class="text-xs mt-1 ' + hbClass(a.last_heartbeat) + '">' + relTime(a.last_heartbeat) + '</p>' +
  '</div>';
}

// ── render: agentes ──────────────────────────────────────────────────────────
var showHiddenAgents = false;
function toggleHiddenAgents() {
  showHiddenAgents = !showHiddenAgents;
  if (lastState) renderAgents(lastState.agents);
}
function isAgentHidden(a) {
  // idle = terminal cerrada (el dispatcher re-lanzará si hay trabajo)
  // offline = detenido explícitamente con agentmesh stop
  return a.status === 'idle' || a.status === 'offline';
}

function renderAgents(agents) {
  var orchestrator  = agents.find(function(a){ return a.role === 'orchestrator'; });
  var allWorkers    = agents.filter(function(a){ return a.role !== 'orchestrator'; });
  var activeWorkers = allWorkers.filter(function(a){ return !isAgentHidden(a); });

  // Per-role numbering for active workers (only label when >1 of same role)
  var roleCount = {};
  activeWorkers.forEach(function(a){ roleCount[a.role] = (roleCount[a.role] || 0) + 1; });
  var roleIdx = {};

  // Hidden workers: deduplicated by role — keep most-recent heartbeat per role
  var hiddenWorkers = allWorkers.filter(function(a){ return isAgentHidden(a); });
  var hiddenCount   = hiddenWorkers.length;
  var hiddenByRole  = {};
  var hiddenRoleTotal = {};
  hiddenWorkers.forEach(function(a) {
    hiddenRoleTotal[a.role] = (hiddenRoleTotal[a.role] || 0) + 1;
    if (!hiddenByRole[a.role] || a.last_heartbeat > hiddenByRole[a.role].last_heartbeat) {
      hiddenByRole[a.role] = a;
    }
  });
  var hiddenDeduped = Object.values(hiddenByRole);

  var active = activeWorkers.filter(function(a){ return a.status === 'working' || a.status === 'in_progress'; }).length;

  document.getElementById('agent-count').textContent = activeWorkers.length
    ? '(' + active + '/' + activeWorkers.length + ')'
    : '';

  var el = document.getElementById('agents');
  var html = '';

  if (orchestrator) {
    html += renderAgentCard(orchestrator, true, null, null);
    if (activeWorkers.length || hiddenCount) html += '<div class="border-t border-gray-100 my-1.5"></div>';
  }

  if (activeWorkers.length) {
    html += activeWorkers.map(function(a) {
      roleIdx[a.role] = (roleIdx[a.role] || 0) + 1;
      var num = roleCount[a.role] > 1 ? roleIdx[a.role] : null;
      return renderAgentCard(a, false, num, null);
    }).join('');
  } else if (!orchestrator) {
    html = '<p class="text-gray-400 text-xs">Sin agentes. Usa + Lanzar.</p>';
  } else {
    html += '<p class="text-gray-400 text-xs mt-1">Sin workers. Usa + Lanzar.</p>';
  }

  if (hiddenCount > 0) {
    html += '<button onclick="toggleHiddenAgents()" class="mt-1.5 text-xs text-gray-400 hover:text-gray-600 w-full text-left">'
      + (showHiddenAgents
          ? '▲ ocultar inactivos'
          : '▼ ' + hiddenCount + ' agente' + (hiddenCount > 1 ? 's' : '') + ' inactivo' + (hiddenCount > 1 ? 's' : ''))
      + '</button>';
    if (showHiddenAgents) {
      html += '<div class="mt-1.5 space-y-1.5">' +
        hiddenDeduped.map(function(a) {
          var total = hiddenRoleTotal[a.role];
          return renderAgentCard(a, false, null, total > 1 ? total : null);
        }).join('') +
      '</div>';
    }
  }

  el.innerHTML = html;

  // Restaurar dropdown abierto si el re-render del SSE lo destruyó
  if (activeDropdown) {
    var dd = document.getElementById('dd-' + activeDropdown);
    if (dd) dd.classList.remove('hidden');
    else activeDropdown = null; // el agente ya no existe
  }
}

// ── render: kanban (5 columnas) ──────────────────────────────────────────────
var COLS = [
  { label:'Pendiente',  statuses:['backlog'],               hdr:'text-gray-500',   bg:'bg-gray-50',      bdr:'border-gray-200' },
  { label:'En curso',   statuses:['claimed','in_progress'], hdr:'text-indigo-600', bg:'bg-indigo-50/60', bdr:'border-indigo-100' },
  { label:'Bloqueada',  statuses:['blocked'],               hdr:'text-red-600',    bg:'bg-red-50/60',    bdr:'border-red-100' },
  { label:'Revisión',   statuses:['review'],                hdr:'text-yellow-600', bg:'bg-yellow-50/60', bdr:'border-yellow-100' },
  { label:'Completada', statuses:['done'],                  hdr:'text-green-600',  bg:'bg-green-50/40',  bdr:'border-green-100' },
];

function renderKanban(tasks, agents) {
  var agentById = {};
  agents.forEach(function(a){ agentById[a.id] = a; });

  var countable = tasks.filter(function(t){ return t.status !== 'cancelled'; });
  var done  = countable.filter(function(t){ return t.status === 'done'; }).length;
  var total = countable.length;
  var pct   = total > 0 ? Math.round(done / total * 100) : 0;
  document.getElementById('progress-bar').style.width = pct + '%';
  document.getElementById('progress-label').textContent = done + '/' + total;

  document.getElementById('kanban').innerHTML = COLS.map(function(col) {
    var colTasks = tasks.filter(function(t){ return col.statuses.indexOf(t.status) >= 0; });
    var cards = colTasks.length
      ? colTasks.map(function(t) {
          var agent = t.assigned_agent_id ? agentById[t.assigned_agent_id] : null;
          var agentTag = agent
            ? '<span class="' + rColor(agent.role) + ' text-xs">' + rIcon(agent.role) + '</span>'
            : '';
          return '<div class="task-card ' + taskBorderCls(t.status) + ' bg-white border border-gray-100 rounded p-2 mb-1.5 shadow-sm" onclick="openModal(\\'' + esc(t.id) + '\\')">' +
            '<p class="text-xs text-gray-700 leading-snug truncate" title="' + esc(t.title) + '">' + esc(t.title) + '</p>' +
            '<div class="flex items-center justify-between mt-1">' +
              '<span class="text-xs ' + rColor(t.role_required) + '">' + esc(t.role_required) + '</span>' +
              agentTag +
            '</div>' +
          '</div>';
        }).join('')
      : '<p class="text-gray-300 text-xs mt-1">—</p>';

    return '<div class="' + col.bg + ' border-r ' + col.bdr + ' last:border-r-0 flex flex-col overflow-hidden">' +
      '<div class="flex items-center justify-between px-3 py-2 flex-none border-b ' + col.bdr + '">' +
        '<span class="text-xs font-semibold uppercase tracking-widest ' + col.hdr + '">' + col.label + '</span>' +
        '<span class="text-xs text-gray-300 font-mono">' + colTasks.length + '</span>' +
      '</div>' +
      '<div class="flex-1 overflow-y-auto p-2.5">' + cards + '</div>' +
    '</div>';
  }).join('');
}

// ── render: backlog ──────────────────────────────────────────────────────────
function renderBacklog() {
  if (!lastState) return;
  var fStatus = document.getElementById('bl-filter-status').value;
  var fRole   = document.getElementById('bl-filter-role').value;
  var agentById = {};
  lastState.agents.forEach(function(a){ agentById[a.id] = a; });

  var tasks = lastState.tasks.filter(function(t) {
    if (t.status === 'cancelled') return false;
    if (fStatus && t.status !== fStatus) return false;
    if (fRole   && t.role_required !== fRole) return false;
    return true;
  });

  var tbody = document.getElementById('backlog-body');
  var empty = document.getElementById('backlog-empty');
  if (!tasks.length) { tbody.innerHTML = ''; empty.classList.remove('hidden'); return; }
  empty.classList.add('hidden');

  tbody.innerHTML = tasks.map(function(t) {
    var agent = t.assigned_agent_id ? agentById[t.assigned_agent_id] : null;
    var agentHtml = agent
      ? '<span class="' + rColor(agent.role) + ' text-xs">' + rIcon(agent.role) + ' ' + esc(agent.role) + '</span>'
      : '<span class="text-gray-300">—</span>';
    var prHtml = t.pr_url
      ? '<a href="' + esc(t.pr_url) + '" target="_blank" onclick="event.stopPropagation()" class="text-indigo-600 hover:underline">↗</a>'
      : '—';
    return '<tr onclick="openModal(\\'' + esc(t.id) + '\\')">' +
      '<td class="max-w-xs"><p class="truncate text-gray-700 text-xs">' + esc(t.title) + '</p></td>' +
      '<td><span class="' + rColor(t.role_required) + ' text-xs">' + esc(t.role_required) + '</span></td>' +
      '<td><span class="' + statusColor(t.status) + ' text-xs">' + taskLbl(t.status) + '</span></td>' +
      '<td>' + agentHtml + '</td>' +
      '<td class="text-gray-400 text-xs">' + prHtml + '</td>' +
    '</tr>';
  }).join('');
}

// ── render: locks ────────────────────────────────────────────────────────────
function renderLocks(locks) {
  var el = document.getElementById('locks');
  if (!locks.length) { el.innerHTML = '<p class="text-gray-300 text-xs">ninguno</p>'; return; }
  el.innerHTML = locks.map(function(l) {
    var mins = Math.max(0, Math.round((l.expires_at - Date.now()) / 60000));
    return '<div class="flex items-center gap-1.5 text-xs">' +
      '<span class="w-1.5 h-1.5 rounded-full bg-yellow-500 flex-none"></span>' +
      '<span class="text-indigo-600 truncate flex-1" title="' + esc(l.path_glob) + '">' + esc(l.path_glob) + '</span>' +
      '<span class="text-gray-400 flex-none whitespace-nowrap">' + esc(l.agent_role || l.agent_id.slice(0,6)) + ' · ' + mins + 'm</span>' +
    '</div>';
  }).join('');
}

// ── render: idle alert ───────────────────────────────────────────────────────
function renderIdleAlert(state) {
  var hasBacklog = (state.task_counts['backlog'] || 0) > 0;
  var workers = state.agents.filter(function(a){ return a.role !== 'orchestrator'; });
  var noneActive = workers.length === 0 || workers.every(function(a){
    return a.status === 'idle' || a.status === 'offline';
  });
  document.getElementById('idle-alert').classList.toggle('hidden', !(hasBacklog && noneActive));
}

// ── modal ────────────────────────────────────────────────────────────────────
function openModal(taskId) {
  if (!lastState) return;
  var task = lastState.tasks.find(function(t){ return t.id === taskId; });
  if (!task) return;

  var agentById = {};
  lastState.agents.forEach(function(a){ agentById[a.id] = a; });
  var agent = task.assigned_agent_id ? agentById[task.assigned_agent_id] : null;

  document.getElementById('modal-title').textContent = task.title;

  var stEl = document.getElementById('modal-status');
  stEl.textContent = taskLbl(task.status);
  stEl.className = 'px-2 py-0.5 rounded font-mono font-semibold text-xs ' + statusBg(task.status);

  document.getElementById('modal-role').textContent = task.role_required;
  document.getElementById('modal-agent').textContent = agent ? rIcon(agent.role) + ' ' + agent.role : '';

  var showBlock = function(blockId, textId, value, skip) {
    var show = value && value !== skip;
    document.getElementById(blockId).classList.toggle('hidden', !show);
    if (show) document.getElementById(textId).textContent = value;
  };
  showBlock('modal-desc-block', 'modal-desc', task.description, '-');
  showBlock('modal-ac-block',   'modal-ac',   task.acceptance_criteria, 'A definir');

  var branchBlock = document.getElementById('modal-branch-block');
  if (task.branch_name) {
    document.getElementById('modal-branch').textContent = task.branch_name;
    branchBlock.classList.remove('hidden');
  } else { branchBlock.classList.add('hidden'); }

  var prBlock = document.getElementById('modal-pr-block');
  if (task.pr_url) {
    var prEl = document.getElementById('modal-pr');
    prEl.href = task.pr_url; prEl.textContent = task.pr_url;
    prBlock.classList.remove('hidden');
  } else { prBlock.classList.add('hidden'); }

  document.getElementById('task-modal').classList.remove('hidden');
}
function closeModal() { document.getElementById('task-modal').classList.add('hidden'); }
function onModalBackdrop(e) { if (e.target === document.getElementById('task-modal')) closeModal(); }

// ── acciones ─────────────────────────────────────────────────────────────────
function toggleSpawnForm() { document.getElementById('spawn-form').classList.toggle('hidden'); }

function toggleAddTask() {
  var f = document.getElementById('add-task-form');
  f.classList.toggle('hidden');
  if (!f.classList.contains('hidden'))
    setTimeout(function(){ document.getElementById('task-title-input').focus(); }, 40);
}

function doSpawn(role) {
  var base = document.getElementById('spawn-base').value.trim() || 'main';
  var st = document.getElementById('spawn-status');
  st.textContent = 'Lanzando ' + role + '…'; st.classList.remove('hidden');
  fetch('/api/agents/spawn', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role: role, base_branch: base }),
  }).then(function(r){ return r.json(); }).then(function(d) {
    if (d.error) { st.textContent = d.error; showMsg(d.error, true); return; }
    st.classList.add('hidden');
    document.getElementById('spawn-form').classList.add('hidden');
    showMsg('Agente ' + role + ' lanzado.');
  }).catch(function(e){ st.textContent = String(e); showMsg(String(e), true); });
}

function doStop(agentId) {
  closeDropdown();
  if (!confirm('¿Detener este agente?')) return;
  fetch('/api/agents/' + agentId + '/stop', { method: 'POST' })
    .then(function(r){ return r.json(); })
    .then(function(d){ d.error ? showMsg(d.error, true) : showMsg('Agente detenido.'); });
}

function doNudge(agentId) {
  closeDropdown();
  fetch('/api/agents/' + agentId + '/nudge', { method: 'POST' })
    .then(function(r){ return r.json(); })
    .then(function(d){ d.error ? showMsg(d.error, true) : showMsg('Ciclo forzado — el agente lo tomará en su próxima iteración.'); });
}

function doCopyLaunch(agentId) {
  closeDropdown();
  if (!lastState) return;
  var agent = lastState.agents.find(function(a){ return a.id === agentId; });
  if (!agent || !agent.worktree_path) return;
  navigator.clipboard.writeText('cd "' + agent.worktree_path + '" && claude --dangerously-skip-permissions')
    .then(function(){ showMsg('Comando copiado.'); })
    .catch(function(){ showMsg('No se pudo copiar', true); });
}

function doCopyId(agentId) {
  closeDropdown();
  navigator.clipboard.writeText(agentId)
    .then(function(){ showMsg('ID copiado.'); })
    .catch(function(){ showMsg('No se pudo copiar', true); });
}

function doAddTask() {
  var title = document.getElementById('task-title-input').value.trim();
  var role  = document.getElementById('task-role-select').value;
  var desc  = document.getElementById('task-desc-input').value.trim() || '-';
  var ac    = document.getElementById('task-ac-input').value.trim()   || 'A definir';
  if (!title) { showMsg('El título es requerido', true); return; }
  var st = document.getElementById('add-task-status');
  st.textContent = 'Agregando…'; st.classList.remove('hidden');
  fetch('/api/tasks', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: title, role_required: role, description: desc, acceptance_criteria: ac }),
  }).then(function(r){ return r.json(); }).then(function(d) {
    st.classList.add('hidden');
    if (d.error) { showMsg(d.error, true); return; }
    ['task-title-input','task-desc-input','task-ac-input'].forEach(function(id){
      document.getElementById(id).value = '';
    });
    document.getElementById('add-task-form').classList.add('hidden');
    showMsg('Tarea agregada.');
  }).catch(function(e){ st.textContent = String(e); showMsg(String(e), true); });
}

// ── actividad ────────────────────────────────────────────────────────────────
function setFilter(f) {
  feedFilter = f;
  ['all','notes','mcp','hooks'].forEach(function(k) {
    document.getElementById('filter-' + k).className =
      (k === f ? 'tab-on' : 'tab-off') + ' pb-0.5 text-xs';
  });
  Array.from(document.getElementById('feed').children).forEach(function(el) {
    el.style.display = (f === 'all' || el.dataset.type === f) ? '' : 'none';
  });
}

function appendActivity(items) {
  var feed = document.getElementById('feed');
  var atBottom = feed.scrollHeight - feed.scrollTop <= feed.clientHeight + 80;
  var added = false;
  items.forEach(function(item) {
    if (seenIds[item.id]) return;
    seenIds[item.id] = true;
    var el = buildActivityEl(item);
    var matchesFilter = feedFilter === 'all' || el.dataset.type === feedFilter;
    if (!matchesFilter) el.style.display = 'none';
    feed.appendChild(el);
    added = true;
  });
  if (added && atBottom) feed.scrollTop = feed.scrollHeight;
  var n = Object.keys(seenIds).length;
  document.getElementById('feed-count').textContent = n ? n + '' : '';
}

function buildActivityEl(item) {
  var el = document.createElement('div');
  el.id = 'ai-' + item.id;
  if (item.type === 'note') {
    el.dataset.type = 'notes';
    var from = item.from_role || (item.from_id ? item.from_id.slice(0,8) : 'sistema');
    var to   = item.to_role   || (item.to_id   ? item.to_id.slice(0,8)  : 'broadcast');
    el.className = 'bubble-note bg-indigo-50 rounded-lg px-3 py-2';
    el.innerHTML =
      '<div class="flex items-center gap-1.5 mb-1">' +
        '<span class="text-indigo-700 font-semibold text-xs">' + esc(from) + '</span>' +
        '<span class="text-gray-300 text-xs">→</span>' +
        '<span class="text-purple-700 font-semibold text-xs">' + esc(to) + '</span>' +
        '<span class="ml-auto text-gray-300 text-xs font-mono">' + fmtTime(item.ts) + '</span>' +
      '</div>' +
      '<p class="text-gray-600 text-xs leading-relaxed whitespace-pre-wrap break-words">' + esc(item.content) + '</p>';
  } else {
    var evType = item.event_type || '';
    el.dataset.type = evType.startsWith('hook:') ? 'hooks' : evType.startsWith('tool:') ? 'mcp' : 'mcp';
    var info = evInfo(evType);
    var agentHtml = item.agent_role
      ? '<span class="' + rColor(item.agent_role) + ' text-xs flex-none">' + rIcon(item.agent_role) + '</span>'
      : '';
    var detailHtml = item.detail
      ? '<span class="text-gray-400 text-xs truncate">' + esc(item.detail) + '</span>'
      : '';
    el.className = info.b + ' bg-white rounded px-2.5 py-1 flex items-center gap-1.5 overflow-hidden border border-gray-100';
    el.innerHTML =
      '<span class="text-gray-300 text-xs flex-none font-mono">' + fmtTime(item.ts) + '</span>' +
      '<span class="' + info.c + ' text-xs flex-none">' + info.i + '</span>' +
      agentHtml +
      '<span class="text-gray-500 text-xs flex-none">' + info.t + '</span>' +
      (detailHtml ? detailHtml : '');
  }
  return el;
}

// ── SSE ──────────────────────────────────────────────────────────────────────
fetch('/api/default-branch').then(function(r){ return r.json(); }).then(function(d) {
  if (d.branch) { var el = document.getElementById('spawn-base'); if (el) el.value = d.branch; }
});

var source = new EventSource('/events');

source.onmessage = function(e) {
  var state = JSON.parse(e.data);
  lastState = state;
  renderAgents(state.agents);
  renderKanban(state.tasks, state.agents);
  renderLocks(state.active_locks);
  renderIdleAlert(state);
  appendActivity(state.activity);
  if (currentTab === 'backlog') renderBacklog();
  document.getElementById('last-ts').textContent = new Date().toISOString().slice(11,19);
};

source.onerror = function() {
  document.getElementById('live-dot').className = 'w-2 h-2 rounded-full bg-red-500 inline-block';
  document.getElementById('live-label').textContent = 'desconectado';
  document.getElementById('live-label').className = 'text-red-500 font-medium';
};

source.onopen = function() {
  document.getElementById('live-dot').className = 'w-2 h-2 rounded-full bg-green-500 animate-pulse inline-block';
  document.getElementById('live-label').textContent = 'en vivo';
  document.getElementById('live-label').className = 'text-green-600 font-medium';
};

// ── panel resize ─────────────────────────────────────────────────────────────
(function() {
  var rz = null;

  function startResize(handleId, panelId, direction) {
    var handle = document.getElementById(handleId);
    if (!handle) return;
    handle.addEventListener('mousedown', function(e) {
      var panel = document.getElementById(panelId);
      rz = { panel: panel, handle: handle, startX: e.clientX, startW: panel.offsetWidth, dir: direction };
      handle.classList.add('rz-active');
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      e.preventDefault();
    });
  }

  startResize('rz-left',  'panel-left',  1);   // drag right = wider
  startResize('rz-right', 'panel-right', -1);  // drag left  = wider

  document.addEventListener('mousemove', function(e) {
    if (!rz) return;
    var delta = (e.clientX - rz.startX) * rz.dir;
    var min = parseInt(rz.panel.style.minWidth) || 160;
    var max = parseInt(rz.panel.style.maxWidth) || 480;
    var w = Math.max(min, Math.min(max, rz.startW + delta));
    rz.panel.style.width = w + 'px';
  });

  document.addEventListener('mouseup', function() {
    if (!rz) return;
    rz.handle.classList.remove('rz-active');
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    rz = null;
  });
})();
<\/script>
</body>
</html>`;
}
