// ============================================================
// LIFESTYLE — Habits & Routine
// ============================================================

const HABIT_COLORS = {
  red:   '#64dcff',
  blue:  '#3b82f6',
  green: '#22c55e',
  yellow:'#facc15',
  slate: '#64748b',
};

const C = {
  primary:'#64dcff', purple:'#a855f7', orange:'#f97316',
  yellow:'#facc15',  green:'#22d3ee',
};

// ---- State ----
let habits      = [];
let completions = {};
let habitTrendChart = null;
const todayStr = new Date().toISOString().split('T')[0];

// ============================================================
// INIT
// ============================================================
document.addEventListener('DOMContentLoaded', async () => {
  Chart.defaults.color       = '#64748b';
  Chart.defaults.borderColor = 'rgba(255,255,255,0.05)';
  Chart.defaults.font.family = 'Space Grotesk';

  initTabs();
  await loadHabits();
  initHabitImport();
});

// ============================================================
// TABS
// ============================================================
function initTabs() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(`panel-${btn.dataset.tab}`).classList.add('active');
    });
  });
}

// ============================================================
// HABITS
// ============================================================
async function loadHabits() {
  const [habitsRes, compsRes] = await Promise.all([
    db.from('habits').select('*').order('order_index'),
    db.from('habit_completions').select('habit_id, date, amount_of_completions').gte('date', daysAgo(30)),
  ]);

  habits = habitsRes.data || [];

  completions = {};
  (compsRes.data || []).forEach(c => {
    if (c.amount_of_completions > 0) {
      if (!completions[c.habit_id]) completions[c.habit_id] = new Set();
      completions[c.habit_id].add(c.date);
    }
  });

  renderHabitStats();
  renderWeekGrid();
  renderHabitList();
  renderTrendChart();
}

// ---- Stats ----
function renderHabitStats() {
  const active = habits.filter(h => !h.archived);

  const todayDone = active.filter(h => completions[h.id]?.has(todayStr)).length;
  setEl('h-today', `${todayDone}/${active.length}`);

  setEl('h-streak',      calcStreak(active) + ' j');
  setEl('h-best',        calcBestStreak(active) + ' j');

  const days = getLast30Days();
  const possible = days.length * active.length;
  const done = days.reduce((sum, d) =>
    sum + active.filter(h => completions[h.id]?.has(d)).length, 0);
  setEl('h-rate', possible > 0 ? Math.round(done / possible * 100) + '%' : '—');
}

function calcStreak(active) {
  if (!active.length) return 0;
  const todayAllDone = active.every(h => completions[h.id]?.has(todayStr));
  let streak = todayAllDone ? 1 : 0;
  const cursor = new Date();
  cursor.setDate(cursor.getDate() - 1);
  for (let i = 0; i < 365; i++) {
    const d = cursor.toISOString().split('T')[0];
    if (!active.every(h => completions[h.id]?.has(d))) break;
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

function calcBestStreak(active) {
  if (!active.length) return 0;
  let best = 0, cur = 0;
  getLast30Days().forEach(d => {
    if (active.every(h => completions[h.id]?.has(d))) { cur++; best = Math.max(best, cur); }
    else cur = 0;
  });
  return best;
}

function getLast30Days() {
  const days = [];
  const d = new Date();
  for (let i = 0; i < 30; i++) {
    days.unshift(d.toISOString().split('T')[0]);
    d.setDate(d.getDate() - 1);
  }
  return days;
}

// ---- Week grid ----
function renderWeekGrid() {
  const container = document.getElementById('week-grid');
  if (!container) return;
  const active = habits.filter(h => !h.archived);
  const weekDays = getCurrentWeekDays();

  container.innerHTML = weekDays.map(({ label, date }) => {
    const isToday = date === todayStr;
    const dots = active.map(h => {
      const done  = completions[h.id]?.has(date);
      const color = HABIT_COLORS[h.color] || '#64dcff';
      return `<div class="habit-dot-row">
        <div class="habit-dot habit-dot--${done ? 'done' : 'empty'}"
             style="background:${done ? color : 'transparent'};border-color:${color};color:${color};"></div>
        <div class="habit-dot-name">${h.name}</div>
      </div>`;
    }).join('');

    return `<div class="week-col${isToday ? ' week-col--today' : ''}">
      <div class="week-col__label">${label}</div>
      <div class="week-col__date">${formatDateShort(date)}</div>
      ${dots || '<div style="color:var(--text-dim);font-size:9px;text-align:center;">—</div>'}
    </div>`;
  }).join('');
}

function getCurrentWeekDays() {
  const DAY_LABELS = ['Dim','Lun','Mar','Mer','Jeu','Ven','Sam'];
  const today = new Date();
  const dow   = today.getDay();
  const monday = new Date(today);
  monday.setDate(today.getDate() - (dow === 0 ? 6 : dow - 1));
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return { label: DAY_LABELS[d.getDay()], date: d.toISOString().split('T')[0] };
  });
}

// ---- Trend chart ----
function renderTrendChart() {
  const noData = document.getElementById('habit-chart-nodata');
  const active  = habits.filter(h => !h.archived);

  if (!active.length) { noData && (noData.style.display = 'flex'); return; }
  noData && (noData.style.display = 'none');

  const days   = getLast30Days();
  const data   = days.map(d => active.filter(h => completions[h.id]?.has(d)).length);
  const total  = active.length;
  const ctx    = document.getElementById('habit-trend-chart').getContext('2d');

  if (habitTrendChart) habitTrendChart.destroy();
  habitTrendChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: days.map(d => formatDate(d)),
      datasets: [
        {
          label: 'Habits complétés',
          data,
          backgroundColor: data.map(v => hexA(C.primary, v >= total ? 0.55 : 0.25)),
          borderColor:     data.map(v => v >= total ? C.primary : hexA(C.primary, 0.45)),
          borderWidth: 1, borderRadius: 4, order: 2,
        },
        {
          label: `Objectif (${total})`,
          data: Array(days.length).fill(total),
          type: 'line',
          borderColor: hexA(C.purple, 0.65),
          borderWidth: 1.5, borderDash: [6, 4],
          pointRadius: 0, fill: false, order: 1,
        },
      ],
    },
    options: chartOpts(),
  });
}

// ---- Habit list (today, toggleable) ----
function renderHabitList() {
  const container = document.getElementById('habit-list');
  if (!container) return;
  const active = habits.filter(h => !h.archived);

  if (!active.length) {
    container.innerHTML = '<p style="color:var(--text-dim);font-size:13px;text-align:center;padding:40px;">Aucun habit actif — importez un fichier HabitKit.</p>';
    setEl('h-today-detail', '');
    return;
  }

  container.innerHTML = active.map(h => {
    const done  = completions[h.id]?.has(todayStr);
    const color = HABIT_COLORS[h.color] || '#64dcff';
    return `<div class="habit-row${done ? ' habit-row--done' : ''}" onclick="toggleCompletion('${h.id}')">
      <div class="habit-check${done ? ' habit-check--done' : ''}"
           style="${done ? `background:${color};border-color:${color};` : `border-color:${color}55;`}">
        ${done ? '✓' : ''}
      </div>
      <div class="habit-row__name">${h.name}</div>
      <div class="habit-color-dot" style="background:${color};"></div>
    </div>`;
  }).join('');

  const done = active.filter(h => completions[h.id]?.has(todayStr)).length;
  setEl('h-today-detail', `${done}/${active.length} aujourd'hui`);
  setEl('h-today', `${done}/${active.length}`);
}

// ---- Toggle completion ----
async function toggleCompletion(habitId) {
  const isDone = completions[habitId]?.has(todayStr);
  const newAmount = isDone ? 0 : 1;

  const compId = `${habitId.slice(0, 32)}_${todayStr}`;

  const { error } = await db.from('habit_completions').upsert(
    { id: compId, habit_id: habitId, date: todayStr, amount_of_completions: newAmount },
    { onConflict: 'habit_id,date' }
  );
  if (error) { showToast('Erreur mise à jour', 'error'); return; }

  if (isDone) {
    completions[habitId]?.delete(todayStr);
  } else {
    if (!completions[habitId]) completions[habitId] = new Set();
    completions[habitId].add(todayStr);
  }

  renderHabitList();
  renderHabitStats();
  renderTrendChart();
}

// ---- HabitKit JSON import ----
function initHabitImport() {
  const dropZone = document.getElementById('habit-drop-zone');
  const fileInput = document.getElementById('habit-file');
  if (!dropZone) return;

  dropZone.addEventListener('dragover',  e => { e.preventDefault(); dropZone.classList.add('drag-over'); });
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
  dropZone.addEventListener('drop', e => {
    e.preventDefault(); dropZone.classList.remove('drag-over');
    const f = e.dataTransfer.files[0]; if (f) parseHabitKitJSON(f);
  });
  dropZone.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', e => { if (e.target.files[0]) parseHabitKitJSON(e.target.files[0]); });
}

async function parseHabitKitJSON(file) {
  const statusEl   = document.getElementById('habit-import-status');
  const progressEl = document.getElementById('habit-import-progress');
  const resultEl   = document.getElementById('habit-import-result');

  statusEl.textContent = 'Lecture du fichier…';
  progressEl.style.width = '5%';
  resultEl.textContent = '';

  try {
    const text = await file.text();
    const json = JSON.parse(text);

    const habitsData = (json.habits || []).map(h => ({
      id:          h.id,
      name:        h.name,
      color:       h.color || null,
      icon:        h.icon  || null,
      archived:    h.archived || false,
      order_index: h.orderIndex || 0,
      created_at:  h.createdAt || null,
    }));

    const catsData = (json.categories || []).map(c => ({
      id:          c.id,
      name:        c.name,
      icon:        c.icon  || null,
      order_index: c.orderIndex || 0,
    }));

    const compsData = (json.completions || []).map(c => ({
      id:                    c.id,
      habit_id:              c.habitId,
      date:                  new Date(c.date).toISOString().split('T')[0],
      amount_of_completions: c.amountOfCompletions || 1,
    }));

    progressEl.style.width = '15%';
    statusEl.textContent = `Import de ${habitsData.length} habits…`;

    const CHUNK = 100;
    for (let i = 0; i < habitsData.length; i += CHUNK) {
      const { error } = await db.from('habits').upsert(habitsData.slice(i, i + CHUNK), { onConflict: 'id' });
      if (error) console.error('habits upsert error', error);
    }

    progressEl.style.width = '35%';
    statusEl.textContent = `Import de ${catsData.length} catégories…`;

    if (catsData.length) {
      await db.from('habit_categories').upsert(catsData, { onConflict: 'id' });
    }

    progressEl.style.width = '45%';
    statusEl.textContent = `Import de ${compsData.length} completions…`;

    let done = 0;
    const CCHUNK = 200;
    for (let i = 0; i < compsData.length; i += CCHUNK) {
      const { error } = await db.from('habit_completions')
        .upsert(compsData.slice(i, i + CCHUNK), { onConflict: 'habit_id,date' });
      if (error) console.error('completions upsert error', error);
      done += Math.min(CCHUNK, compsData.length - i);
      progressEl.style.width = `${45 + Math.round(done / (compsData.length || 1) * 50)}%`;
      statusEl.textContent = `Completions : ${done}/${compsData.length}…`;
    }

    progressEl.style.width = '100%';
    resultEl.innerHTML = `<span class="ok">✓ Import terminé — ${habitsData.length} habits · ${compsData.length} completions importées</span>`;
    showToast(`Import réussi : ${habitsData.length} habits`, 'success');

    await loadHabits();
  } catch (err) {
    statusEl.textContent = 'Erreur : ' + err.message;
    progressEl.style.width = '0%';
    resultEl.innerHTML = `<span class="warn">Echec de l'import : ${err.message}</span>`;
    showToast('Erreur import JSON', 'error');
  }
}

// ============================================================
// CHART OPTIONS
// ============================================================
function chartOpts() {
  return {
    responsive: true, maintainAspectRatio: false,
    interaction: { mode:'index', intersect:false },
    plugins: {
      legend: {
        labels: { color:'#94a3b8', font:{ family:'Space Grotesk', size:12 }, boxWidth:18, padding:16 },
      },
      tooltip: {
        backgroundColor:'rgba(7,7,20,0.97)', titleColor:'#64dcff', bodyColor:'#e2e8f0',
        borderColor:'rgba(100,220,255,0.25)', borderWidth:1, padding:12, cornerRadius:8,
        titleFont:{ family:'Orbitron', size:11 }, bodyFont:{ family:'Space Grotesk', size:13 },
      },
    },
    scales: {
      x: {
        grid: { color:'rgba(255,255,255,0.04)' },
        ticks: { color:'#475569', font:{ family:'Space Grotesk', size:11 }, maxRotation:45, maxTicksLimit:12 },
      },
      y: {
        grid: { color:'rgba(255,255,255,0.04)' },
        ticks: { color:'#475569', font:{ family:'Space Grotesk', size:11 } },
      },
    },
  };
}

// ============================================================
// UTILS
// ============================================================
function formatDate(str) {
  const d = new Date(str + (str.length === 10 ? 'T12:00:00' : ''));
  return d.toLocaleDateString('fr-FR', { day:'2-digit', month:'short' });
}

function formatDateShort(str) {
  const d = new Date(str + 'T12:00:00');
  return d.toLocaleDateString('fr-FR', { day:'2-digit', month:'2-digit' });
}

function daysAgo(n) { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().split('T')[0]; }

function hexA(hex, a) {
  const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
  return `rgba(${r},${g},${b},${a})`;
}

function setEl(id, val) { const el = document.getElementById(id); if (el) el.textContent = val; }

function showToast(msg, type = 'success') {
  const t = document.createElement('div');
  t.className = `toast toast--${type}`; t.textContent = msg;
  document.body.appendChild(t);
  requestAnimationFrame(() => t.classList.add('show'));
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 400); }, 3800);
}
