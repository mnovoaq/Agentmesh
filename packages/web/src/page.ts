export function getPage(projectName: string): string {
  return `<!DOCTYPE html>
<html lang="en" class="dark">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>AgentMesh — ${projectName}</title>
<script src="https://cdn.tailwindcss.com"><\/script>
<script>tailwind.config = { darkMode: 'class' }<\/script>
<style>
  body { font-family: 'JetBrains Mono', 'Fira Code', monospace; }
  .bubble-note { border-left: 3px solid #6366f1; }
  .bubble-event { border-left: 3px solid #374151; }
  .status-idle     { background:#052e16; color:#4ade80; }
  .status-working  { background:#0c1a4e; color:#60a5fa; }
  .status-blocked  { background:#3b0a0a; color:#f87171; }
  .status-offline  { background:#1f2937; color:#6b7280; }
  #feed { scroll-behavior: smooth; }
</style>
</head>
<body class="bg-gray-950 text-gray-100 h-screen flex flex-col overflow-hidden">

<!-- HEADER -->
<header class="flex items-center justify-between px-5 py-3 bg-gray-900 border-b border-gray-800 flex-none">
  <div class="flex items-center gap-3">
    <span class="text-white font-bold tracking-tight">AgentMesh</span>
    <span class="text-gray-500">/</span>
    <span class="text-indigo-400 font-semibold">${projectName}</span>
  </div>
  <div class="flex items-center gap-2 text-xs">
    <span id="live-dot" class="inline-block w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
    <span id="live-label" class="text-green-400 font-medium">live</span>
    <span id="last-ts" class="text-gray-600 ml-3"></span>
  </div>
</header>

<!-- BODY -->
<div class="flex flex-1 overflow-hidden">

  <!-- LEFT SIDEBAR -->
  <aside class="w-72 flex-none flex flex-col border-r border-gray-800 bg-gray-900 overflow-y-auto">

    <!-- Agents -->
    <section class="p-4 border-b border-gray-800">
      <h2 class="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-3">Agents</h2>
      <div id="agents" class="space-y-2"></div>
    </section>

    <!-- Tasks -->
    <section class="p-4 border-b border-gray-800">
      <h2 class="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-3">Tasks</h2>
      <div id="task-counts" class="space-y-2"></div>
    </section>

    <!-- Locks -->
    <section class="p-4">
      <h2 class="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-2">Active Locks</h2>
      <div id="locks" class="space-y-1.5 text-xs"></div>
    </section>

  </aside>

  <!-- ACTIVITY FEED -->
  <main class="flex-1 flex flex-col overflow-hidden bg-gray-950">
    <div class="px-5 py-3 border-b border-gray-800 flex items-center gap-3">
      <h2 class="text-xs font-semibold text-gray-500 uppercase tracking-widest">Activity</h2>
      <span id="feed-count" class="text-xs text-gray-700"></span>
    </div>
    <div id="feed" class="flex-1 overflow-y-auto px-5 py-4 space-y-2"></div>
  </main>

</div>

<script>
var seenIds = {};
var feed = document.getElementById('feed');
var agentsEl = document.getElementById('agents');
var countsEl = document.getElementById('task-counts');
var locksEl = document.getElementById('locks');
var feedCount = document.getElementById('feed-count');

function relTime(ms) {
  var diff = Date.now() - ms;
  if (diff < 10000) return 'just now';
  if (diff < 60000) return Math.round(diff/1000) + 's ago';
  if (diff < 3600000) return Math.round(diff/60000) + 'm ago';
  return Math.round(diff/3600000) + 'h ago';
}

function fmtTime(ms) {
  return new Date(ms).toISOString().slice(11,19);
}

function statusClass(st) {
  if (st === 'idle') return 'status-idle';
  if (st === 'working' || st === 'in_progress') return 'status-working';
  if (st === 'blocked') return 'status-blocked';
  return 'status-offline';
}

function taskStatusColor(st) {
  var m = {
    backlog:'bg-gray-600', claimed:'bg-blue-600',
    in_progress:'bg-indigo-500', blocked:'bg-red-600',
    review:'bg-yellow-500', done:'bg-green-600', cancelled:'bg-gray-700'
  };
  return m[st] || 'bg-gray-600';
}

function roleIcon(role) {
  var m = {
    orchestrator:'⚙', backend:'◈', frontend:'◉', integration:'⬡',
    qa:'◎', reviewer:'◈', release:'⬆'
  };
  return m[role] || '●';
}

function renderAgents(agents) {
  if (!agents.length) { agentsEl.innerHTML = '<p class="text-gray-600 text-xs">No agents</p>'; return; }
  agentsEl.innerHTML = agents.map(function(a) {
    var sc = statusClass(a.status);
    var task = a.current_task
      ? '<p class="text-gray-400 text-xs mt-1 truncate">' + escHtml(a.current_task.title) + '</p>'
      : '';
    var branch = a.branch_name
      ? '<p class="text-gray-600 text-xs mt-0.5 truncate">' + escHtml(a.branch_name) + '</p>'
      : '';
    var hb = '<p class="text-gray-600 text-xs mt-0.5">' + relTime(a.last_heartbeat) + '</p>';
    return '<div class="bg-gray-800 rounded-lg p-3">' +
      '<div class="flex items-center justify-between">' +
        '<div class="flex items-center gap-2">' +
          '<span class="text-base">' + roleIcon(a.role) + '</span>' +
          '<span class="text-sm font-medium text-gray-200">' + escHtml(a.role) + '</span>' +
        '</div>' +
        '<span class="text-xs px-2 py-0.5 rounded font-mono ' + sc + '">' + escHtml(a.status) + '</span>' +
      '</div>' +
      task + branch + hb +
    '</div>';
  }).join('');
}

function renderCounts(counts) {
  var order = ['backlog','claimed','in_progress','blocked','review','done','cancelled'];
  var total = order.reduce(function(s,k){ return s + (counts[k]||0); }, 0);
  if (!total) { countsEl.innerHTML = '<p class="text-gray-600 text-xs">No tasks</p>'; return; }
  countsEl.innerHTML = order.filter(function(s){ return counts[s]>0; }).map(function(s) {
    var n = counts[s] || 0;
    var pct = total ? Math.round(n/total*100) : 0;
    return '<div>' +
      '<div class="flex justify-between text-xs mb-1">' +
        '<span class="text-gray-400">' + s.replace('_',' ') + '</span>' +
        '<span class="text-gray-400 font-medium">' + n + '</span>' +
      '</div>' +
      '<div class="h-1 bg-gray-700 rounded-full overflow-hidden">' +
        '<div class="h-full rounded-full ' + taskStatusColor(s) + '" style="width:' + pct + '%"></div>' +
      '</div>' +
    '</div>';
  }).join('');
}

function renderLocks(locks) {
  if (!locks.length) { locksEl.innerHTML = '<p class="text-gray-700">none</p>'; return; }
  locksEl.innerHTML = locks.map(function(l) {
    var left = Math.max(0, Math.round((l.expires_at - Date.now()) / 60000));
    return '<div class="text-gray-400">' +
      '<span class="text-indigo-400">' + escHtml(l.path_glob) + '</span>' +
      '<span class="text-gray-600"> → ' + escHtml(l.agent_role||l.agent_id.slice(0,8)) + ' · ' + left + 'm</span>' +
    '</div>';
  }).join('');
}

function escHtml(s) {
  if (s == null) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function createActivityItem(item) {
  var el = document.createElement('div');
  el.id = 'ai-' + item.id;
  if (item.type === 'note') {
    var from = item.from_role || (item.from_id ? item.from_id.slice(0,8) : 'system');
    var to = item.to_role || (item.to_id ? item.to_id.slice(0,8) : 'broadcast');
    el.className = 'bubble-note bg-gray-900 rounded-lg px-4 py-3';
    el.innerHTML =
      '<div class="flex items-center gap-2 mb-1.5">' +
        '<span class="text-indigo-400 font-semibold text-xs">' + escHtml(from) + '</span>' +
        '<span class="text-gray-600 text-xs">→</span>' +
        '<span class="text-purple-400 font-semibold text-xs">' + escHtml(to) + '</span>' +
        '<span class="ml-auto text-gray-600 text-xs">' + fmtTime(item.ts) + '</span>' +
      '</div>' +
      '<p class="text-gray-200 text-sm leading-relaxed whitespace-pre-wrap">' + escHtml(item.content) + '</p>';
  } else {
    var agent = item.agent_role || (item.agent_id ? item.agent_id.slice(0,8) : '');
    var evLabel = escHtml(item.event_type || '');
    var detail = item.detail ? ' · ' + escHtml(item.detail) : '';
    el.className = 'bubble-event bg-gray-900/50 rounded px-3 py-1.5 flex items-baseline gap-2';
    el.innerHTML =
      '<span class="text-gray-700 text-xs flex-none">' + fmtTime(item.ts) + '</span>' +
      '<span class="text-gray-500 text-xs font-medium">' + evLabel + '</span>' +
      (agent ? '<span class="text-gray-600 text-xs">' + escHtml(agent) + '</span>' : '') +
      '<span class="text-gray-700 text-xs">' + detail + '</span>';
  }
  return el;
}

function appendActivity(items) {
  var atBottom = feed.scrollHeight - feed.scrollTop <= feed.clientHeight + 80;
  var added = false;
  items.forEach(function(item) {
    if (seenIds[item.id]) return;
    seenIds[item.id] = true;
    feed.appendChild(createActivityItem(item));
    added = true;
  });
  if (added && atBottom) feed.scrollTop = feed.scrollHeight;
  var total = Object.keys(seenIds).length;
  feedCount.textContent = total ? total + ' items' : '';
}

var source = new EventSource('/events');

source.onmessage = function(e) {
  var state = JSON.parse(e.data);
  renderAgents(state.agents);
  renderCounts(state.task_counts);
  renderLocks(state.active_locks);
  appendActivity(state.activity);
  document.getElementById('last-ts').textContent = new Date().toISOString().slice(11,19) + ' UTC';
};

source.onerror = function() {
  document.getElementById('live-dot').className = 'inline-block w-2 h-2 rounded-full bg-red-500';
  document.getElementById('live-label').textContent = 'disconnected';
  document.getElementById('live-label').className = 'text-red-400 font-medium';
};

source.onopen = function() {
  document.getElementById('live-dot').className = 'inline-block w-2 h-2 rounded-full bg-green-500 animate-pulse';
  document.getElementById('live-label').textContent = 'live';
  document.getElementById('live-label').className = 'text-green-400 font-medium';
};
<\/script>
</body>
</html>`
}
