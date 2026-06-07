// ============================================================
// LIFESTYLE — Habits & Entraînements
// ============================================================

const FR_MONTHS_LS = {
  'janv.':'01','févr.':'02','mars':'03','avr.':'04',
  'mai':'05','juin':'06','juil.':'07','août':'08',
  'sept.':'09','oct.':'10','nov.':'11','déc.':'12',
};

const HABIT_COLORS = {
  red:   '#64dcff',
  blue:  '#3b82f6',
  green: '#22c55e',
  yellow:'#facc15',
  slate: '#64748b',
};

// Day-of-week → planned session (0=Sun, 1=Mon, …, 6=Sat)
const WEEK_PLAN = {
  1: { label:'Push',   color:'#64dcff' },
  2: { label:'Course', color:'#22d3ee' },
  3: { label:'Pull',   color:'#a855f7' },
  4: { label:'Course', color:'#22d3ee' },
  5: { label:'Legs',   color:'#f97316' },
  6: { label:'Full',   color:'#facc15' },
  0: { label:'Repos',  color:'#64748b' },
};

const C = {
  primary:'#64dcff', purple:'#a855f7', orange:'#f97316',
  yellow:'#facc15',  green:'#22d3ee',
};

// ---- State ----
let habits      = [];
let completions = {};   // { habitId: Set<dateStr> }  (only amounts > 0)
let workoutSets = [];
let habitTrendChart = null;
let volumeChart     = null;
const todayStr = new Date().toISOString().split('T')[0];

// ============================================================
// INIT
// ============================================================
document.addEventListener('DOMContentLoaded', async () => {
  Chart.defaults.color       = '#64748b';
  Chart.defaults.borderColor = 'rgba(255,255,255,0.05)';
  Chart.defaults.font.family = 'Space Grotesk';

  initTabs();

  // Load both tabs in parallel (non-blocking — each renders independently)
  initHabitsTab();
  initWorkoutsTab();
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
// ── HABITS TAB ──────────────────────────────────────────────
// ============================================================
async function initHabitsTab() {
  await loadHabits();
  initHabitImport();
}

async function loadHabits() {
  const [habitsRes, compsRes] = await Promise.all([
    db.from('habits').select('*').order('order_index'),
    db.from('habit_completions').select('habit_id, date, amount_of_completions').gte('date', daysAgo(30)),
  ]);

  habits = habitsRes.data || [];

  // Index completions (only positive amounts count as "done")
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

  // Synthetic deterministic id = habit_id + date (unique per constraint)
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
// ── WORKOUTS TAB ─────────────────────────────────────────────
// ============================================================
async function initWorkoutsTab() {
  await loadWorkouts();
  initWorkoutImport();
}

async function loadWorkouts() {
  const { data, error } = await db
    .from('workout_sets')
    .select('workout_date, workout_title, exercise_title, weight_kg, reps')
    .not('weight_kg', 'is', null)
    .not('reps', 'is', null)
    .order('workout_date');

  workoutSets = data || [];
  renderWorkoutStats();
  renderWeekPlan();
  renderVolumeChart();
  renderTopExercises();
}

// ---- Workout stats ----
function renderWorkoutStats() {
  const fomStr = firstOfMonth();
  const monthSets = workoutSets.filter(s => s.workout_date >= fomStr);

  const sessions = new Set(monthSets.map(s => s.workout_date)).size;
  setEl('w-sessions', sessions + ' séance' + (sessions !== 1 ? 's' : ''));

  const volume = monthSets.reduce((sum, s) => sum + (s.weight_kg || 0) * (s.reps || 0), 0);
  setEl('w-volume', Math.round(volume).toLocaleString('fr-FR') + ' kg');

  const topEx = findTopExercise(monthSets);
  setEl('w-top-exercise', topEx || '—');

  const dow  = new Date().getDay();
  const next = WEEK_PLAN[dow];
  setEl('w-next', next?.label || '—');
}

function findTopExercise(sets) {
  if (!sets.length) return null;
  const byEx = {};
  sets.forEach(s => {
    const e1rm = (s.weight_kg || 0) * (1 + (s.reps || 0) / 30);
    if (!byEx[s.exercise_title]) byEx[s.exercise_title] = [];
    byEx[s.exercise_title].push(e1rm);
  });
  let best = null, bestProg = -Infinity;
  Object.entries(byEx).forEach(([ex, e1rms]) => {
    if (e1rms.length < 2) return;
    const prog = e1rms[e1rms.length - 1] - e1rms[0];
    if (prog > bestProg) { bestProg = prog; best = ex; }
  });
  return best;
}

// ---- Week plan ----
function renderWeekPlan() {
  const container = document.getElementById('week-plan');
  if (!container) return;

  const DAY_LABELS = ['Dim','Lun','Mar','Mer','Jeu','Ven','Sam'];

  // date → Set of workout titles
  const workoutByDate = {};
  workoutSets.forEach(s => {
    if (!workoutByDate[s.workout_date]) workoutByDate[s.workout_date] = new Set();
    workoutByDate[s.workout_date].add(s.workout_title);
  });

  const weekDays = getCurrentWeekDays();

  container.innerHTML = weekDays.map(({ label, date }) => {
    const d      = new Date(date + 'T12:00:00');
    const dow    = d.getDay();
    const plan   = WEEK_PLAN[dow];
    const isToday = date === todayStr;
    const isPast  = date < todayStr;
    const titles  = workoutByDate[date];

    let statusHtml = '';
    if (titles) {
      const titleStr = [...titles].join(', ');
      statusHtml = `<div class="plan-status plan-status--done">✓ FAIT</div>
        <div class="plan-title">${titleStr}</div>`;
    } else if (isPast && plan.label !== 'Repos') {
      statusHtml = `<div class="plan-status plan-status--missed">MANQUÉ</div>`;
    }

    return `<div class="plan-col${isToday ? ' plan-col--today' : ''}">
      <div class="plan-col__day">${label}</div>
      <div class="plan-col__date">${formatDateShort(date)}</div>
      <div class="plan-badge"
           style="background:${plan.color}22;border:1px solid ${plan.color}44;color:${plan.color};">
        ${plan.label}
      </div>
      ${statusHtml}
    </div>`;
  }).join('');
}

// ---- Volume chart (8 weeks) ----
function renderVolumeChart() {
  const noData = document.getElementById('volume-chart-nodata');

  if (!workoutSets.length) { noData && (noData.style.display = 'flex'); return; }

  const weekMap = {};
  workoutSets.forEach(s => {
    const w = getWeekStart(s.workout_date);
    weekMap[w] = (weekMap[w] || 0) + (s.weight_kg || 0) * (s.reps || 0);
  });

  const weeks = Object.keys(weekMap).sort().slice(-8);
  if (!weeks.length) { noData && (noData.style.display = 'flex'); return; }
  noData && (noData.style.display = 'none');

  const ctx = document.getElementById('volume-chart').getContext('2d');
  if (volumeChart) volumeChart.destroy();

  volumeChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: weeks.map(w => 'S' + getWeekNumber(new Date(w + 'T12:00:00'))),
      datasets: [{
        label: 'Volume (kg×reps)',
        data:  weeks.map(w => Math.round(weekMap[w])),
        backgroundColor: hexA(C.purple, 0.35),
        borderColor:     C.purple,
        borderWidth: 1, borderRadius: 5,
      }],
    },
    options: chartOpts(),
  });
}

// ---- Top 5 exercises with sparklines ----
function renderTopExercises() {
  const container = document.getElementById('top-exercises');
  if (!container) return;

  if (!workoutSets.length) {
    container.innerHTML = '<p style="color:var(--text-dim);font-size:13px;text-align:center;padding:32px;">Aucune donnée d\'entraînement. Importez un CSV Hevy.</p>';
    return;
  }

  // Group by exercise → date → max e1RM
  const byEx = {};
  workoutSets.forEach(s => {
    const e1rm = (s.weight_kg || 0) * (1 + (s.reps || 0) / 30);
    if (!byEx[s.exercise_title]) byEx[s.exercise_title] = {};
    byEx[s.exercise_title][s.workout_date] =
      Math.max(byEx[s.exercise_title][s.workout_date] || 0, e1rm);
  });

  const top5 = Object.entries(byEx)
    .map(([name, byDate]) => {
      const dates  = Object.keys(byDate).sort();
      const e1rms  = dates.map(d => byDate[d]);
      return { name, e1rms, maxE1RM: Math.max(...e1rms) };
    })
    .sort((a, b) => b.maxE1RM - a.maxE1RM)
    .slice(0, 5);

  container.innerHTML = top5.map(ex => {
    const last8   = ex.e1rms.slice(-8);
    const first   = last8[0];
    const last    = last8[last8.length - 1];
    const up      = last > first + 0.1;
    const down    = last < first - 0.1;
    const trend   = up ? '↑' : down ? '↓' : '→';
    const tColor  = up ? '#22c55e' : down ? '#f87171' : '#94a3b8';

    return `<div class="exercise-row">
      <div class="exercise-row__info">
        <div class="exercise-row__name">${ex.name}</div>
        <div class="exercise-row__sub">1RM estimé max : ${ex.maxE1RM.toFixed(1)} kg</div>
      </div>
      ${generateSparkline(last8)}
      <div class="exercise-row__trend" style="color:${tColor};">${trend}</div>
    </div>`;
  }).join('') || '<p style="color:var(--text-dim);font-size:13px;text-align:center;padding:32px;">Aucun exercice.</p>';
}

function generateSparkline(values) {
  if (!values || values.length < 2) {
    return `<svg width="80" height="32" viewBox="0 0 80 32">
      <line x1="0" y1="16" x2="80" y2="16" stroke="#475569" stroke-width="1" stroke-dasharray="4,4"/>
    </svg>`;
  }
  const W = 80, H = 32;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * W;
    const y = H - ((v - min) / range) * (H - 4) - 2;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  const color = values[values.length - 1] > values[0] + 0.1 ? '#22c55e' : '#f87171';
  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    <polyline points="${pts}" fill="none" stroke="${color}" stroke-width="1.5"
              stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;
}

// ============================================================
// HEVY CSV IMPORT
// ============================================================
function initWorkoutImport() {
  const dropZone  = document.getElementById('workout-drop-zone');
  const fileInput = document.getElementById('workout-file');
  if (!dropZone) return;

  dropZone.addEventListener('dragover',  e => { e.preventDefault(); dropZone.classList.add('drag-over'); });
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
  dropZone.addEventListener('drop', e => {
    e.preventDefault(); dropZone.classList.remove('drag-over');
    const f = e.dataTransfer.files[0]; if (f) processWorkoutCSV(f);
  });
  dropZone.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', e => { if (e.target.files[0]) processWorkoutCSV(e.target.files[0]); });
}

function parseFrenchDate(str) {
  if (!str?.trim()) return null;
  const m = str.trim().match(/^(\d{1,2})\s+(\S+)\s+(\d{4}),\s+(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const [,day, mon, year, h, min] = m;
  const mm = FR_MONTHS_LS[mon];
  if (!mm) return null;
  return new Date(`${year}-${mm}-${day.padStart(2,'0')}T${h.padStart(2,'0')}:${min}:00`);
}

function detectSessionType(title) {
  const t = (title || '').toLowerCase();
  if (/legs|jambes/.test(t))    return 'legs';
  if (/push|poitrine/.test(t))  return 'push';
  if (/pull|dos/.test(t))       return 'pull';
  if (/full/.test(t))           return 'full';
  return 'other';
}

async function processWorkoutCSV(file) {
  const statusEl   = document.getElementById('workout-import-status');
  const progressEl = document.getElementById('workout-import-progress');
  const resultEl   = document.getElementById('workout-import-result');

  statusEl.textContent = 'Analyse du fichier CSV…';
  progressEl.style.width = '5%';
  resultEl.textContent = '';

  Papa.parse(file, {
    header: true, skipEmptyLines: true,
    complete: async res => {
      const sets = res.data.map(row => {
        const st = parseFrenchDate(row['start_time']);
        const et = parseFrenchDate(row['end_time']);
        if (!st || !row['exercise_title']) return null;
        const title = (row['title'] || '').trim();
        return {
          workout_title:    title,
          workout_date:     st.toISOString().split('T')[0],
          start_time:       st.toISOString(),
          end_time:         et?.toISOString() || null,
          exercise_title:   (row['exercise_title'] || '').trim(),
          set_index:        parseInt(row['set_index'])    || 0,
          set_type:         (row['set_type']   || 'normal').trim(),
          weight_kg:        row['weight_kg']        ? parseFloat(row['weight_kg'])        : null,
          reps:             row['reps']              ? parseInt(row['reps'])               : null,
          distance_km:      row['distance_km']       ? parseFloat(row['distance_km'])      : null,
          duration_seconds: row['duration_seconds']  ? parseInt(row['duration_seconds'])   : null,
          rpe:              row['rpe']               ? parseFloat(row['rpe'])              : null,
        };
      }).filter(Boolean);

      if (!sets.length) {
        statusEl.textContent = 'Aucune ligne valide.';
        progressEl.style.width = '0%';
        return;
      }

      const CHUNK = 200; let done = 0, errors = 0;
      for (let i = 0; i < sets.length; i += CHUNK) {
        const { error } = await db.from('workout_sets').upsert(
          sets.slice(i, i + CHUNK),
          { onConflict: 'start_time,exercise_title,set_index', ignoreDuplicates: false }
        );
        if (error) { console.error(error); errors++; }
        done += Math.min(CHUNK, sets.length - i);
        progressEl.style.width = `${Math.round(done / sets.length * 100)}%`;
        statusEl.textContent = `Import : ${done}/${sets.length}…`;
      }

      progressEl.style.width = '100%';
      resultEl.innerHTML = errors === 0
        ? `<span class="ok">✓ Import terminé — ${sets.length} séries.</span>`
        : `<span class="warn">Import terminé avec ${errors} erreur(s).</span>`;
      showToast(`${sets.length} séries importées`, 'success');

      await loadWorkouts();
    },
    error: err => {
      showToast('Erreur CSV', 'error');
      statusEl.textContent = err.message;
    },
  });
}

// ============================================================
// CHART OPTIONS (shared)
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

function today()        { return new Date().toISOString().split('T')[0]; }
function daysAgo(n)     { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().split('T')[0]; }
function firstOfMonth() { const d = new Date(); d.setDate(1); return d.toISOString().split('T')[0]; }

function getWeekStart(dateStr) {
  const d   = new Date(dateStr + 'T12:00:00');
  const day = d.getDay();
  d.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
  return d.toISOString().split('T')[0];
}

function getWeekNumber(d) {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil(((date - yearStart) / 86400000 + 1) / 7);
}

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
