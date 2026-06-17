// ============================================================
// LIFESTYLE — Journal, Calendrier, Habitudes, Suivi, Export
// ============================================================

const MEAL_TYPES = [
  { key: 'breakfast',       label: 'Petit déjeuner' },
  { key: 'morning_snack',   label: 'Collation matin' },
  { key: 'lunch',           label: 'Déjeuner' },
  { key: 'afternoon_snack', label: 'Collation après-midi' },
  { key: 'dinner',          label: 'Dîner' },
  { key: 'evening_snack',   label: 'Collation soir' },
];

const MEAL_COLORS = {
  breakfast:'#64dcff', morning_snack:'#a855f7', lunch:'#22c55e',
  afternoon_snack:'#facc15', dinner:'#f97316', evening_snack:'#22d3ee',
};

const MEASURE_LABELS = {
  weight_kg:'Poids (kg)', chest_cm:'Poitrine (cm)', shoulder_cm:'Épaules (cm)',
  waist_cm:'Tour de taille (cm)', hips_cm:'Hanches (cm)', glutes_cm:'Fesses (cm)',
  left_arm_cm:'Bras gauche (cm)', right_arm_cm:'Bras droit (cm)', forearm_cm:'Avant-bras (cm)',
  left_thigh_cm:'Cuisse gauche (cm)', right_thigh_cm:'Cuisse droite (cm)',
  calf_cm:'Mollet (cm)', neck_cm:'Cou (cm)', body_fat_pct:'Masse grasse (%)',
};

const NUTRITION_LABELS = {
  calories:'Calories (kcal)', protein_g:'Protéines (g)',
  carbs_g:'Glucides (g)', fat_g:'Lipides (g)', fiber_g:'Fibres (g)',
};

const ACT_ICONS  = { walk:'🚶', run:'🏃', bike:'🚴', gym:'🏋️' };
const ACT_LABELS = { walk:'Marche', run:'Course à pied', bike:'Vélo', gym:'Musculation' };
const GYM_LABELS = { push:'Push', pull:'Pull', legs:'Legs', upper:'Upper', lower:'Lower', full_body:'Full Body' };

const HABIT_COLORS = {
  red:'#64dcff', blue:'#3b82f6', green:'#22c55e', yellow:'#facc15', slate:'#64748b',
};

const C = {
  primary:'#64dcff', purple:'#a855f7', orange:'#f97316', yellow:'#facc15', green:'#22d3ee',
};

// ── State ──────────────────────────────────────────────────
let stepsChart = null, measurementsChart = null, nutritionChart = null, habitTrendChart = null;
let journalDate = today();
let habits = [], completions = {};
let calYear = new Date().getFullYear(), calMonth = new Date().getMonth();

// ── Init ───────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  Chart.defaults.color       = '#64748b';
  Chart.defaults.borderColor = 'rgba(255,255,255,0.05)';
  Chart.defaults.font.family = 'Space Grotesk';

  initTabs();
  initJournal();
  initMeasurementForm();
  initActivityForm();
  initExportTab();
  initCalendar();
  initHabitImport();

  await Promise.all([loadDashboard(), loadHabits()]);
  loadStepsChart();
  loadMeasurementsChart();
  loadNutritionChart();
});

// ── Tabs ───────────────────────────────────────────────────
function initTabs() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(`panel-${btn.dataset.tab}`).classList.add('active');
      setTimeout(() => window.dispatchEvent(new Event('resize')), 60);
      if (btn.dataset.tab === 'calendrier') loadCalendar();
      if (btn.dataset.tab === 'habitudes')  renderTrendChart();
    });
  });

  document.querySelectorAll('.suivi-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.suivi-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('#panel-suivi [id^="suivi-"]').forEach(p => p.style.display = 'none');
      btn.classList.add('active');
      document.getElementById(`suivi-${btn.dataset.suivi}`).style.display = '';
      setTimeout(() => window.dispatchEvent(new Event('resize')), 60);
    });
  });

  const mSel = document.getElementById('measurement-select');
  const nSel = document.getElementById('nutrition-select');
  if (mSel) mSel.addEventListener('change', () => loadMeasurementsChart(mSel.value));
  if (nSel) nSel.addEventListener('change', () => loadNutritionChart(nSel.value));
}

// ── Dashboard ──────────────────────────────────────────────
async function loadDashboard() {
  const [mRes, nRes, sRes] = await Promise.all([
    db.from('measurements').select('weight_kg').not('weight_kg','is',null).order('date',{ascending:false}).limit(1),
    db.from('nutrition').select('calories').gte('date', daysAgo(7)),
    db.from('daily_steps').select('steps').gte('date', daysAgo(7)),
  ]);
  if (mRes.data?.length) setEl('stat-weight',  `${mRes.data[0].weight_kg} kg`);
  if (nRes.data?.length) setEl('stat-calories', `${Math.round(avg(nRes.data.map(d => d.calories)))} kcal/j`);
  if (sRes.data?.length) setEl('stat-steps',    `${Math.round(avg(sRes.data.map(d => d.steps))).toLocaleString('fr-FR')} pas`);
}

// ── Journal ────────────────────────────────────────────────
function initJournal() {
  const dateInput = document.getElementById('j-date');
  dateInput.value = journalDate;
  document.getElementById('j-prev').addEventListener('click', () => changeJournalDate(-1));
  document.getElementById('j-next').addEventListener('click', () => changeJournalDate(1));
  document.getElementById('j-today').addEventListener('click', () => {
    journalDate = today(); dateInput.value = journalDate; loadJournalData();
  });
  dateInput.addEventListener('change', () => { journalDate = dateInput.value; loadJournalData(); });
  document.getElementById('j-steps-save').addEventListener('click', async () => {
    const val = parseInt(document.getElementById('j-steps').value);
    if (!val || val < 0) return;
    const { error } = await db.from('daily_steps').upsert({ date: journalDate, steps: val }, { onConflict: 'date' });
    if (error) { showToast(`Erreur : ${error.message}`, 'error'); return; }
    showToast('Pas enregistrés', 'success');
    loadStepsChart(); loadDashboard();
  });
  buildMealCards();
  loadJournalData();
}

function changeJournalDate(delta) {
  const d = new Date(journalDate + 'T12:00:00');
  d.setDate(d.getDate() + delta);
  journalDate = d.toISOString().split('T')[0];
  document.getElementById('j-date').value = journalDate;
  loadJournalData();
}

function buildMealCards() {
  document.getElementById('meals-grid').innerHTML = MEAL_TYPES.map(({ key, label }) => `
    <div class="meal-card" id="mc-${key}">
      <div class="meal-card__header" onclick="toggleMealDone('${key}')">
        <div class="meal-check" id="chk-${key}">✓</div>
        <span class="meal-label">${label}</span>
        <span class="meal-kcal-tag" id="kcal-tag-${key}">— kcal</span>
      </div>
      <div class="meal-card__body">
        <input type="text" class="meal-desc" id="desc-${key}" placeholder="Contenu du repas…" />
        <div class="meal-macros-labels"><span>kcal</span><span>Prot</span><span>Gluc</span><span>Lip</span><span>Fib</span></div>
        <div class="meal-macros">
          <input type="number" id="kcal-${key}" placeholder="—" min="0" />
          <input type="number" id="prot-${key}" placeholder="—" min="0" step="0.1" />
          <input type="number" id="gluc-${key}" placeholder="—" min="0" step="0.1" />
          <input type="number" id="lip-${key}"  placeholder="—" min="0" step="0.1" />
          <input type="number" id="fib-${key}"  placeholder="—" min="0" step="0.1" />
        </div>
        <button class="btn btn--primary btn--sm" style="margin-top:4px;" onclick="saveMeal('${key}')">Enregistrer</button>
      </div>
    </div>`).join('');
}

async function loadJournalData() {
  const [mealsRes, actsRes, stepsRes] = await Promise.all([
    db.from('meals').select('*').eq('date', journalDate),
    db.from('activities').select('*').eq('date', journalDate).order('created_at'),
    db.from('daily_steps').select('steps').eq('date', journalDate).maybeSingle(),
  ]);
  renderMealCards(mealsRes.data || []);
  renderActivities(actsRes.data || []);
  document.getElementById('j-steps').value = stepsRes.data?.steps ?? '';
}

function renderMealCards(meals) {
  const byType = {};
  meals.forEach(m => { byType[m.meal_type] = m; });
  MEAL_TYPES.forEach(({ key }) => {
    const m    = byType[key];
    const card = document.getElementById(`mc-${key}`);
    const chk  = document.getElementById(`chk-${key}`);
    const tag  = document.getElementById(`kcal-tag-${key}`);
    if (m) {
      document.getElementById(`desc-${key}`).value = m.description || '';
      document.getElementById(`kcal-${key}`).value = m.calories    ?? '';
      document.getElementById(`prot-${key}`).value = m.protein_g   ?? '';
      document.getElementById(`gluc-${key}`).value = m.carbs_g     ?? '';
      document.getElementById(`lip-${key}`).value  = m.fat_g       ?? '';
      document.getElementById(`fib-${key}`).value  = m.fiber_g     ?? '';
      card.classList.toggle('meal-card--done', !!m.done);
      chk.classList.toggle('meal-check--done', !!m.done);
      tag.textContent = m.calories ? `${m.calories} kcal` : '— kcal';
    } else {
      document.getElementById(`desc-${key}`).value = '';
      ['kcal','prot','gluc','lip','fib'].forEach(f => { document.getElementById(`${f}-${key}`).value = ''; });
      card.classList.remove('meal-card--done');
      chk.classList.remove('meal-check--done');
      tag.textContent = '— kcal';
    }
  });
  updateDailyTotals(meals);
}

async function toggleMealDone(mealType) {
  const card   = document.getElementById(`mc-${mealType}`);
  const isDone = card.classList.contains('meal-card--done');
  const { data: existing } = await db.from('meals').select('id').eq('date', journalDate).eq('meal_type', mealType).maybeSingle();
  if (existing) await db.from('meals').update({ done: !isDone }).eq('id', existing.id);
  else await db.from('meals').upsert({ date: journalDate, meal_type: mealType, done: true }, { onConflict: 'date,meal_type' });
  await loadJournalData();
  syncNutritionTable(journalDate);
  loadNutritionChart();
}

async function saveMeal(mealType) {
  const entry = {
    date:        journalDate,
    meal_type:   mealType,
    done:        document.getElementById(`mc-${mealType}`).classList.contains('meal-card--done'),
    description: document.getElementById(`desc-${mealType}`).value.trim() || null,
    calories:    numI(document.getElementById(`kcal-${mealType}`).value),
    protein_g:   numF(document.getElementById(`prot-${mealType}`).value),
    carbs_g:     numF(document.getElementById(`gluc-${mealType}`).value),
    fat_g:       numF(document.getElementById(`lip-${mealType}`).value),
    fiber_g:     numF(document.getElementById(`fib-${mealType}`).value),
  };
  const { error } = await db.from('meals').upsert(entry, { onConflict: 'date,meal_type' });
  if (error) { showToast(`Erreur : ${error.message}`, 'error'); return; }
  showToast('Repas enregistré', 'success');
  await loadJournalData();
  syncNutritionTable(journalDate);
  loadNutritionChart(); loadDashboard();
}

function updateDailyTotals(meals) {
  const done = meals.filter(m => m.done);
  const sum  = f => done.reduce((s, m) => s + (m[f] || 0), 0);
  const n    = done.length;
  setEl('j-total-kcal', n ? Math.round(sum('calories')).toLocaleString('fr-FR') : '—');
  setEl('j-total-prot', n ? sum('protein_g').toFixed(1) : '—');
  setEl('j-total-gluc', n ? sum('carbs_g').toFixed(1)   : '—');
  setEl('j-total-lip',  n ? sum('fat_g').toFixed(1)     : '—');
  setEl('j-total-fib',  n ? sum('fiber_g').toFixed(1)   : '—');
}

async function syncNutritionTable(date) {
  const { data: meals } = await db.from('meals').select('*').eq('date', date);
  const done = (meals || []).filter(m => m.done);
  await db.from('nutrition').upsert({
    date,
    calories:  Math.round(done.reduce((s,m) => s + (m.calories   || 0), 0)) || null,
    protein_g: done.reduce((s,m) => s + (m.protein_g || 0), 0) || null,
    carbs_g:   done.reduce((s,m) => s + (m.carbs_g   || 0), 0) || null,
    fat_g:     done.reduce((s,m) => s + (m.fat_g     || 0), 0) || null,
    fiber_g:   done.reduce((s,m) => s + (m.fiber_g   || 0), 0) || null,
  }, { onConflict: 'date' });
}

// ── Calendar ───────────────────────────────────────────────
function initCalendar() {
  document.getElementById('cal-prev').addEventListener('click', () => changeCalMonth(-1));
  document.getElementById('cal-next').addEventListener('click', () => changeCalMonth(1));
}

async function changeCalMonth(delta) {
  const d = new Date(calYear, calMonth + delta);
  calYear = d.getFullYear(); calMonth = d.getMonth();
  await loadCalendar();
}

async function loadCalendar() {
  const first = `${calYear}-${String(calMonth+1).padStart(2,'0')}-01`;
  const last  = new Date(calYear, calMonth+1, 0).toISOString().split('T')[0];
  setEl('cal-month-label', new Date(calYear, calMonth).toLocaleDateString('fr-FR', { month:'long', year:'numeric' }).toUpperCase());
  const { data } = await db.from('meals').select('date, done, calories, meal_type').gte('date', first).lte('date', last);
  renderCalendar(data || []);
}

function renderCalendar(meals) {
  const DAY_HDRS = ['Lun','Mar','Mer','Jeu','Ven','Sam','Dim'];
  const todayStr = today();
  let html = DAY_HDRS.map(d => `<div class="cal-day-hdr">${d}</div>`).join('');
  const firstDow = (new Date(calYear, calMonth, 1).getDay() + 6) % 7;
  for (let i = 0; i < firstDow; i++) html += '<div class="cal-cell cal-cell--empty"></div>';
  const daysInMonth = new Date(calYear, calMonth+1, 0).getDate();
  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr   = `${calYear}-${String(calMonth+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
    const isToday   = dateStr === todayStr;
    const dayMeals  = meals.filter(m => m.date === dateStr && m.done);
    const totalKcal = dayMeals.reduce((s, m) => s + (m.calories || 0), 0);
    const dots      = dayMeals.map(m => `<div class="cal-dot" style="background:${MEAL_COLORS[m.meal_type]||C.primary};"></div>`).join('');
    html += `<div class="cal-cell${isToday ? ' cal-cell--today' : ''}" onclick="goToJournalDate('${dateStr}')">
      <div class="cal-cell__day">${day}</div>
      ${dots ? `<div class="cal-cell__dots">${dots}</div>` : ''}
      ${totalKcal > 0 ? `<div class="cal-cell__kcal">${Math.round(totalKcal)} kcal</div>` : ''}
    </div>`;
  }
  document.getElementById('cal-grid').innerHTML = html;
}

function goToJournalDate(dateStr) {
  journalDate = dateStr;
  document.getElementById('j-date').value = dateStr;
  loadJournalData();
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  document.querySelector('[data-tab="journal"]').classList.add('active');
  document.getElementById('panel-journal').classList.add('active');
}

// ── Habits ─────────────────────────────────────────────────
async function loadHabits() {
  const [habRes, comRes] = await Promise.all([
    db.from('habits').select('*').order('order_index'),
    db.from('habit_completions').select('habit_id, date, amount_of_completions').gte('date', daysAgo(30)),
  ]);
  habits = habRes.data || [];
  completions = {};
  (comRes.data || []).forEach(c => {
    if (c.amount_of_completions > 0) {
      if (!completions[c.habit_id]) completions[c.habit_id] = new Set();
      completions[c.habit_id].add(c.date);
    }
  });
  renderHabitStats(); renderWeekGrid(); renderHabitList();
}

function renderHabitStats() {
  const todayStr = today();
  const active   = habits.filter(h => !h.archived);
  const todayDone = active.filter(h => completions[h.id]?.has(todayStr)).length;
  setEl('h-today', `${todayDone}/${active.length}`);
  setEl('h-streak', calcStreak(active) + ' j');
  setEl('h-best',   calcBestStreak(active) + ' j');
  const days = getLast30Days(), possible = days.length * active.length;
  const done = days.reduce((s, d) => s + active.filter(h => completions[h.id]?.has(d)).length, 0);
  setEl('h-rate', possible > 0 ? Math.round(done / possible * 100) + '%' : '—');
}

function calcStreak(active) {
  if (!active.length) return 0;
  const todayStr = today();
  let streak = active.every(h => completions[h.id]?.has(todayStr)) ? 1 : 0;
  const cursor = new Date(); cursor.setDate(cursor.getDate() - 1);
  for (let i = 0; i < 365; i++) {
    const d = cursor.toISOString().split('T')[0];
    if (!active.every(h => completions[h.id]?.has(d))) break;
    streak++; cursor.setDate(cursor.getDate() - 1);
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
  const days = []; const d = new Date();
  for (let i = 0; i < 30; i++) { days.unshift(d.toISOString().split('T')[0]); d.setDate(d.getDate() - 1); }
  return days;
}

function renderWeekGrid() {
  const container = document.getElementById('week-grid');
  if (!container) return;
  const active   = habits.filter(h => !h.archived);
  const todayStr = today();
  const DAY_LABELS = ['Dim','Lun','Mar','Mer','Jeu','Ven','Sam'];
  const todayD = new Date(); const dow = todayD.getDay();
  const monday = new Date(todayD); monday.setDate(todayD.getDate() - (dow === 0 ? 6 : dow - 1));
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday); d.setDate(monday.getDate() + i);
    return { label: DAY_LABELS[d.getDay()], date: d.toISOString().split('T')[0] };
  });
  container.innerHTML = weekDays.map(({ label, date }) => {
    const isToday = date === todayStr;
    const dots = active.map(h => {
      const done = completions[h.id]?.has(date);
      const color = HABIT_COLORS[h.color] || C.primary;
      return `<div class="habit-dot-row">
        <div class="habit-dot habit-dot--${done ? 'done' : 'empty'}" style="background:${done ? color : 'transparent'};border-color:${color};color:${color};"></div>
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

function renderTrendChart() {
  const noData = document.getElementById('habit-chart-nodata');
  const active = habits.filter(h => !h.archived);
  if (!active.length) { if (noData) noData.style.display = 'flex'; return; }
  if (noData) noData.style.display = 'none';
  const days  = getLast30Days();
  const data  = days.map(d => active.filter(h => completions[h.id]?.has(d)).length);
  const total = active.length;
  const ctx   = document.getElementById('habit-trend-chart').getContext('2d');
  if (habitTrendChart) habitTrendChart.destroy();
  habitTrendChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: days.map(d => formatDateShort(d)),
      datasets: [
        { label:'Habits complétés', data, backgroundColor:data.map(v => hexA(C.primary, v>=total?0.55:0.25)), borderColor:data.map(v => v>=total?C.primary:hexA(C.primary,0.45)), borderWidth:1, borderRadius:4, order:2 },
        { label:`Objectif (${total})`, data:Array(days.length).fill(total), type:'line', borderColor:hexA(C.purple,0.65), borderWidth:1.5, borderDash:[6,4], pointRadius:0, fill:false, order:1 },
      ],
    },
    options: chartOpts(),
  });
}

function renderHabitList() {
  const container = document.getElementById('habit-list');
  if (!container) return;
  const active   = habits.filter(h => !h.archived);
  const todayStr = today();
  if (!active.length) {
    container.innerHTML = '<p style="color:var(--text-dim);font-size:13px;text-align:center;padding:40px;">Aucun habit actif — importez un fichier HabitKit.</p>';
    setEl('h-today-detail', ''); return;
  }
  container.innerHTML = active.map(h => {
    const done  = completions[h.id]?.has(todayStr);
    const color = HABIT_COLORS[h.color] || C.primary;
    return `<div class="habit-row${done?' habit-row--done':''}" onclick="toggleCompletion('${h.id}')">
      <div class="habit-check${done?' habit-check--done':''}" style="${done?`background:${color};border-color:${color};`:`border-color:${color}55;`}">${done?'✓':''}</div>
      <div class="habit-row__name">${h.name}</div>
      <div class="habit-color-dot" style="background:${color};"></div>
    </div>`;
  }).join('');
  const done = active.filter(h => completions[h.id]?.has(todayStr)).length;
  setEl('h-today-detail', `${done}/${active.length} aujourd'hui`);
  setEl('h-today', `${done}/${active.length}`);
}

async function toggleCompletion(habitId) {
  const todayStr = today();
  const isDone   = completions[habitId]?.has(todayStr);
  const compId   = `${habitId.slice(0,32)}_${todayStr}`;
  const { error } = await db.from('habit_completions').upsert(
    { id:compId, habit_id:habitId, date:todayStr, amount_of_completions: isDone ? 0 : 1 },
    { onConflict:'habit_id,date' }
  );
  if (error) { showToast('Erreur mise à jour', 'error'); return; }
  if (isDone) completions[habitId]?.delete(todayStr);
  else { if (!completions[habitId]) completions[habitId] = new Set(); completions[habitId].add(todayStr); }
  renderHabitList(); renderHabitStats();
}

function initHabitImport() {
  const dropZone  = document.getElementById('habit-drop-zone');
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
  statusEl.textContent = 'Lecture du fichier…'; progressEl.style.width = '5%'; resultEl.textContent = '';
  try {
    const json       = JSON.parse(await file.text());
    const habitsData = (json.habits || []).map(h => ({ id:h.id, name:h.name, color:h.color||null, icon:h.icon||null, archived:h.archived||false, order_index:h.orderIndex||0, created_at:h.createdAt||null }));
    const catsData   = (json.categories || []).map(c => ({ id:c.id, name:c.name, icon:c.icon||null, order_index:c.orderIndex||0 }));
    const compsData  = (json.completions || []).map(c => ({ id:c.id, habit_id:c.habitId, date:new Date(c.date).toISOString().split('T')[0], amount_of_completions:c.amountOfCompletions||1 }));
    progressEl.style.width = '15%'; statusEl.textContent = `Import de ${habitsData.length} habits…`;
    for (let i = 0; i < habitsData.length; i += 100) await db.from('habits').upsert(habitsData.slice(i,i+100), { onConflict:'id' });
    progressEl.style.width = '35%'; statusEl.textContent = `Import de ${catsData.length} catégories…`;
    if (catsData.length) await db.from('habit_categories').upsert(catsData, { onConflict:'id' });
    progressEl.style.width = '45%'; statusEl.textContent = `Import de ${compsData.length} completions…`;
    let done = 0;
    for (let i = 0; i < compsData.length; i += 200) {
      await db.from('habit_completions').upsert(compsData.slice(i,i+200), { onConflict:'habit_id,date' });
      done += Math.min(200, compsData.length - i);
      progressEl.style.width = `${45 + Math.round(done/(compsData.length||1)*50)}%`;
      statusEl.textContent = `Completions : ${done}/${compsData.length}…`;
    }
    progressEl.style.width = '100%';
    resultEl.innerHTML = `<span class="ok">✓ Import terminé — ${habitsData.length} habits · ${compsData.length} completions</span>`;
    showToast(`Import réussi : ${habitsData.length} habits`, 'success');
    await loadHabits();
  } catch (err) {
    statusEl.textContent = 'Erreur : ' + err.message; progressEl.style.width = '0%';
    resultEl.innerHTML = `<span class="warn">Echec : ${err.message}</span>`;
    showToast('Erreur import JSON', 'error');
  }
}

// ── Activity form ──────────────────────────────────────────
const ACT_FIELDS = {
  walk: ['ag-distance','ag-steps','ag-hr'],
  run:  ['ag-distance','ag-steps','ag-pace','ag-hr','ag-elev','ag-desc'],
  bike: ['ag-distance','ag-speed','ag-hr','ag-elev','ag-power','ag-desc'],
  gym:  ['ag-gym'],
};
const ALL_ACT_GROUPS = ['ag-distance','ag-steps','ag-pace','ag-speed','ag-hr','ag-elev','ag-power','ag-desc','ag-gym'];

function setActivityFields(type) {
  const show = ACT_FIELDS[type] || [];
  ALL_ACT_GROUPS.forEach(id => { const el = document.getElementById(id); if (el) el.style.display = show.includes(id) ? '' : 'none'; });
  const placeholders = { run:'Footing facile, fractionné 10×400m…', bike:'Sortie endurance, intervalles…' };
  const descEl = document.getElementById('act-desc');
  if (descEl && placeholders[type]) descEl.placeholder = placeholders[type];
}

function updatePace() {
  const type = document.getElementById('act-type-val').value;
  const dur  = parseFloat(document.getElementById('act-duration').value);
  const dist = parseFloat(document.getElementById('act-distance')?.value);
  if (type === 'run' && dur > 0 && dist > 0) {
    const pace = dur / dist, m = Math.floor(pace), s = Math.round((pace - m) * 60);
    setEl('act-pace-display', `${m}:${s.toString().padStart(2,'0')}/km`);
  } else if (type === 'run') {
    setEl('act-pace-display', '—');
  }
  if (type === 'bike' && dur > 0 && dist > 0) {
    const spEl = document.getElementById('act-speed');
    if (spEl && !spEl.value) spEl.value = ((dist / dur) * 60).toFixed(1);
  }
}

function initActivityForm() {
  document.querySelectorAll('.act-type-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.act-type-btn').forEach(b => b.classList.remove('act-type-btn--active'));
      btn.classList.add('act-type-btn--active');
      document.getElementById('act-type-val').value = btn.dataset.type;
      setActivityFields(btn.dataset.type);
    });
  });
  ['act-duration','act-distance'].forEach(id => document.getElementById(id)?.addEventListener('input', updatePace));
  document.getElementById('activity-form').addEventListener('submit', async e => {
    e.preventDefault();
    const type = document.getElementById('act-type-val').value;
    const entry = {
      date:         journalDate, type,
      duration_min: numI(document.getElementById('act-duration').value),
      distance_km:  type !== 'gym' ? numF(document.getElementById('act-distance')?.value) : null,
      steps:        (type === 'walk' || type === 'run') ? numI(document.getElementById('act-steps').value) : null,
      avg_hr_bpm:   type !== 'gym' ? numI(document.getElementById('act-hr')?.value)    : null,
      elevation_m:  (type === 'run' || type === 'bike') ? numI(document.getElementById('act-elev')?.value)  : null,
      avg_speed_kmh:type === 'bike' ? numF(document.getElementById('act-speed')?.value) : null,
      avg_power_w:  type === 'bike' ? numI(document.getElementById('act-power')?.value) : null,
      description:  (type === 'run' || type === 'bike') ? (document.getElementById('act-desc').value.trim() || null) : null,
      session_type: type === 'gym' ? document.getElementById('act-session-type').value : null,
    };
    const { error } = await db.from('activities').insert(entry);
    if (error) { showToast(`Erreur : ${error.message}`, 'error'); return; }
    showToast('Activité ajoutée', 'success');
    e.target.reset();
    document.getElementById('act-type-val').value = 'walk';
    const spEl = document.getElementById('act-speed'); if (spEl) spEl.value = '';
    setActivityFields('walk');
    document.querySelectorAll('.act-type-btn').forEach(b => b.classList.toggle('act-type-btn--active', b.dataset.type === 'walk'));
    setEl('act-pace-display', '—');
    await loadJournalData();
  });
}

function renderActivities(activities) {
  const list = document.getElementById('activity-list');
  if (!activities.length) { list.innerHTML = ''; return; }
  list.innerHTML = activities.map(a => {
    const icon  = ACT_ICONS[a.type] || '•';
    const label = ACT_LABELS[a.type] || a.type;
    const parts = [];
    if (a.duration_min) parts.push(`${a.duration_min} min`);
    if (a.distance_km)  parts.push(`${a.distance_km} km`);
    if (a.type === 'run' && a.duration_min && a.distance_km) {
      const p = a.duration_min / a.distance_km;
      parts.push(`${Math.floor(p)}:${String(Math.round((p%1)*60)).padStart(2,'0')}/km`);
    }
    const speed = a.avg_speed_kmh || (a.type === 'bike' && a.duration_min && a.distance_km ? a.distance_km / a.duration_min * 60 : null);
    if (a.type === 'bike' && speed) parts.push(`${parseFloat(speed).toFixed(1)} km/h`);
    if (a.avg_hr_bpm)   parts.push(`♥ ${a.avg_hr_bpm} bpm`);
    if (a.elevation_m)  parts.push(`↗ ${a.elevation_m} m`);
    if (a.avg_power_w)  parts.push(`⚡ ${a.avg_power_w} W`);
    if (a.steps)        parts.push(`${a.steps.toLocaleString('fr-FR')} pas`);
    if (a.session_type) parts.push(GYM_LABELS[a.session_type] || a.session_type);
    if (a.description)  parts.push(a.description);
    return `<div class="activity-item">
      <div class="activity-item__icon">${icon}</div>
      <div class="activity-item__info">
        <div class="activity-item__title">${label}</div>
        <div class="activity-item__sub">${parts.join(' · ')}</div>
      </div>
      <button class="activity-item__del" onclick="deleteActivity('${a.id}')">✕</button>
    </div>`;
  }).join('');
}

async function deleteActivity(id) {
  const { error } = await db.from('activities').delete().eq('id', id);
  if (error) { showToast(`Erreur : ${error.message}`, 'error'); return; }
  showToast('Activité supprimée', 'success');
  await loadJournalData();
}

// ── Measurement form ───────────────────────────────────────
function initMeasurementForm() {
  const form = document.getElementById('measurement-form');
  if (!form) return;
  form.querySelector('[name="date"]').value = today();
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const fd = Object.fromEntries(new FormData(e.target));
    const entry = { date: fd.date };
    ['weight_kg','body_fat_pct','neck_cm','shoulder_cm','chest_cm','waist_cm','hips_cm','glutes_cm',
     'left_arm_cm','right_arm_cm','forearm_cm','left_thigh_cm','right_thigh_cm','calf_cm']
      .forEach(f => { const v = numF(fd[f]); if (v !== null) entry[f] = v; });
    const { error } = await db.from('measurements').upsert(entry, { onConflict:'date' });
    if (error) { showToast(`Erreur : ${error.message}`, 'error'); return; }
    showToast('Mensuration enregistrée', 'success');
    e.target.reset(); form.querySelector('[name="date"]').value = today();
    loadMeasurementsChart(); loadDashboard();
  });
}

// ── Steps chart ────────────────────────────────────────────
async function loadStepsChart() {
  const noData = document.getElementById('steps-chart-nodata');
  const { data } = await db.from('daily_steps').select('date, steps').order('date').limit(60);
  if (!data?.length) { if (noData) noData.style.display = 'flex'; return; }
  if (noData) noData.style.display = 'none';
  const GOAL = 10000;
  const ctx  = document.getElementById('steps-chart').getContext('2d');
  if (stepsChart) stepsChart.destroy();
  stepsChart = new Chart(ctx, {
    type:'bar',
    data: {
      labels: data.map(d => formatDate(d.date)),
      datasets: [
        { label:'Pas', data:data.map(d => d.steps), backgroundColor:data.map(d => d.steps>=GOAL?hexA(C.green,0.45):hexA(C.purple,0.35)), borderColor:data.map(d => d.steps>=GOAL?C.green:C.purple), borderWidth:1, borderRadius:4 },
        { label:`Objectif ${GOAL.toLocaleString('fr-FR')}`, data:Array(data.length).fill(GOAL), type:'line', borderColor:hexA(C.orange,0.6), borderWidth:1.5, borderDash:[6,4], pointRadius:0, fill:false },
      ],
    },
    options: chartOpts(),
  });
}

// ── Measurements chart ─────────────────────────────────────
async function loadMeasurementsChart(metric) {
  const sel    = document.getElementById('measurement-select');
  const field  = metric || sel?.value || 'weight_kg';
  const noData = document.getElementById('measurements-chart-nodata');
  const { data } = await db.from('measurements').select(`date, ${field}`).not(field,'is',null).order('date');
  if (!data?.length) { if (noData) noData.style.display = 'flex'; return; }
  if (noData) noData.style.display = 'none';
  const ctx = document.getElementById('measurements-chart').getContext('2d');
  if (measurementsChart) measurementsChart.destroy();
  measurementsChart = new Chart(ctx, {
    type:'line',
    data: {
      labels: data.map(d => formatDate(d.date)),
      datasets: [{ label:MEASURE_LABELS[field]||field, data:data.map(d => d[field]),
        borderColor:C.primary, backgroundColor:hexA(C.primary,0.09), borderWidth:2,
        pointBackgroundColor:C.primary, pointRadius:4, pointHoverRadius:7, tension:0.35, fill:true }],
    },
    options: chartOpts(),
  });
}

// ── Nutrition chart ────────────────────────────────────────
async function loadNutritionChart(macro) {
  const sel    = document.getElementById('nutrition-select');
  const field  = macro || sel?.value || 'calories';
  const noData = document.getElementById('nutrition-chart-nodata');
  const { data } = await db.from('nutrition').select('date, calories, protein_g, carbs_g, fat_g, fiber_g').order('date');
  if (!data?.length) { if (noData) noData.style.display = 'flex'; return; }
  if (noData) noData.style.display = 'none';
  const values  = data.map(d => d[field] ?? 0);
  const movAvg  = values.map((_,i) => { const w=values.slice(Math.max(0,i-6),i+1); return +(w.reduce((a,b)=>a+b,0)/w.length).toFixed(1); });
  const colorMap = { calories:C.orange, protein_g:C.primary, carbs_g:C.yellow, fat_g:C.purple, fiber_g:C.green };
  const color   = colorMap[field] || C.primary;
  const ctx     = document.getElementById('nutrition-chart').getContext('2d');
  if (nutritionChart) nutritionChart.destroy();
  nutritionChart = new Chart(ctx, {
    type:'bar',
    data: {
      labels: data.map(d => formatDate(d.date)),
      datasets: [
        { label:NUTRITION_LABELS[field], data:values, backgroundColor:hexA(color,0.25), borderColor:color, borderWidth:1, borderRadius:4, order:2 },
        { label:'Moy. 7 jours', data:movAvg, type:'line', borderColor:hexA(color,0.85), backgroundColor:'transparent', borderWidth:2.5, pointRadius:0, tension:0.4, fill:false, order:1 },
      ],
    },
    options: chartOpts(),
  });
}

// ── Export PDF ─────────────────────────────────────────────
function initExportTab() {
  document.getElementById('export-from').value = daysAgo(6);
  document.getElementById('export-to').value   = today();
  document.getElementById('export-btn').addEventListener('click', async () => {
    const from = document.getElementById('export-from').value;
    const to   = document.getElementById('export-to').value;
    const withAct = document.getElementById('export-activities').checked;
    const withStp = document.getElementById('export-steps').checked;
    const status  = document.getElementById('export-status');
    const btn     = document.getElementById('export-btn');
    if (!from || !to || from > to) { showToast('Période invalide', 'error'); return; }
    btn.disabled = true; btn.textContent = 'Génération…'; status.textContent = 'Chargement des données…';
    try { await generateNutritionPDF(from, to, withAct, withStp); status.textContent = 'PDF généré avec succès.'; }
    catch (err) { status.textContent = 'Erreur : ' + err.message; showToast('Erreur lors de la génération', 'error'); }
    finally { btn.disabled = false; btn.textContent = 'Générer le PDF'; }
  });
}

function setExportRange(days) {
  document.getElementById('export-from').value = daysAgo(days - 1);
  document.getElementById('export-to').value   = today();
}

async function generateNutritionPDF(from, to, withAct, withStp) {
  const [mealsRes, actsRes, stepsRes] = await Promise.all([
    db.from('meals').select('*').gte('date', from).lte('date', to).order('date'),
    withAct ? db.from('activities').select('*').gte('date', from).lte('date', to).order('date').order('created_at') : Promise.resolve({ data:[] }),
    withStp ? db.from('daily_steps').select('*').gte('date', from).lte('date', to).order('date') : Promise.resolve({ data:[] }),
  ]);
  const meals = mealsRes.data||[], activities = actsRes.data||[], stepsData = stepsRes.data||[];
  const days  = getDaysInRange(from, to);
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation:'portrait', unit:'mm', format:'a4' });

  doc.setFillColor(14,22,50); doc.rect(0,0,210,42,'F');
  doc.setFont('helvetica','bold'); doc.setFontSize(18); doc.setTextColor(100,220,255);
  doc.text('Journal Nutritionnel', 105, 17, { align:'center' });
  doc.setFont('helvetica','normal'); doc.setFontSize(10); doc.setTextColor(170,200,230);
  doc.text(`${formatDateFull(from)}  ->  ${formatDateFull(to)}`, 105, 27, { align:'center' });
  doc.text(`Genere le ${formatDateFull(today())}`, 105, 34, { align:'center' });
  doc.setTextColor(0);
  let y = 50;
  const totals = { kcal:0, prot:0, gluc:0, lip:0, fib:0, n:0 };

  for (const date of days) {
    const dayMeals = meals.filter(m => m.date === date);
    const dayActs  = activities.filter(a => a.date === date);
    const daySteps = stepsData.find(s => s.date === date);
    if (!dayMeals.length && !dayActs.length && !daySteps) continue;
    if (y + 22 > 272) { doc.addPage(); y = 15; }
    doc.setFillColor(22,44,80); doc.roundedRect(10,y,190,8,1,1,'F');
    doc.setFont('helvetica','bold'); doc.setFontSize(9); doc.setTextColor(100,220,255);
    doc.text(formatDateFull(date), 14, y+5.5);
    if (daySteps) { doc.setTextColor(180,210,240); doc.text(`${daySteps.steps.toLocaleString('fr-FR')} pas`, 196, y+5.5, { align:'right' }); }
    doc.setTextColor(0); y += 11;
    if (dayMeals.length) {
      const body=[]; let dK=0,dP=0,dG=0,dL=0,dF=0,hasDone=false;
      MEAL_TYPES.forEach(({ key, label }) => {
        const m = dayMeals.find(x => x.meal_type === key); if (!m) return;
        const done = m.done;
        body.push([
          { content:label, styles:{ textColor:done?[0,120,160]:[140,140,140], fontStyle:done?'bold':'normal' } },
          { content:m.description||'', styles:{ textColor:done?[30,30,30]:[160,160,160], fontStyle:done?'normal':'italic' } },
          { content:done&&m.calories!=null?String(m.calories):'', styles:{ halign:'right' } },
          { content:done&&m.protein_g!=null?m.protein_g.toFixed(1):'', styles:{ halign:'right' } },
          { content:done&&m.carbs_g!=null?m.carbs_g.toFixed(1):'', styles:{ halign:'right' } },
          { content:done&&m.fat_g!=null?m.fat_g.toFixed(1):'', styles:{ halign:'right' } },
          { content:done&&m.fiber_g!=null?m.fiber_g.toFixed(1):'', styles:{ halign:'right' } },
        ]);
        if (done) { hasDone=true; dK+=m.calories||0; dP+=m.protein_g||0; dG+=m.carbs_g||0; dL+=m.fat_g||0; dF+=m.fiber_g||0; }
      });
      if (hasDone) {
        const tot={fillColor:[235,244,255]};
        body.push([
          { content:'TOTAL', styles:{ ...tot, fontStyle:'bold', textColor:[20,60,110] } },
          { content:'', styles:tot },
          { content:Math.round(dK).toString(), styles:{ ...tot, halign:'right', fontStyle:'bold', textColor:[20,60,110] } },
          { content:dP.toFixed(1), styles:{ ...tot, halign:'right', fontStyle:'bold', textColor:[20,60,110] } },
          { content:dG.toFixed(1), styles:{ ...tot, halign:'right', fontStyle:'bold', textColor:[20,60,110] } },
          { content:dL.toFixed(1), styles:{ ...tot, halign:'right', fontStyle:'bold', textColor:[20,60,110] } },
          { content:dF.toFixed(1), styles:{ ...tot, halign:'right', fontStyle:'bold', textColor:[20,60,110] } },
        ]);
        totals.kcal+=dK; totals.prot+=dP; totals.gluc+=dG; totals.lip+=dL; totals.fib+=dF; totals.n++;
      }
      doc.autoTable({ startY:y, head:[['Repas','Contenu','kcal','Prot','Gluc','Lip','Fib']], body,
        theme:'grid', headStyles:{ fillColor:[30,60,110], textColor:255, fontSize:8, fontStyle:'bold', cellPadding:2.5 },
        bodyStyles:{ fontSize:8, cellPadding:2 },
        columnStyles:{ 0:{cellWidth:33},1:{cellWidth:63},2:{cellWidth:16,halign:'right'},3:{cellWidth:19,halign:'right'},4:{cellWidth:19,halign:'right'},5:{cellWidth:19,halign:'right'},6:{cellWidth:21,halign:'right'} },
        margin:{ left:10, right:10 } });
      y = doc.lastAutoTable.finalY + 3;
    }
    if (withAct && dayActs.length) {
      if (y > 268) { doc.addPage(); y = 15; }
      const actStr = dayActs.map(a => {
        const p=[ACT_LABELS[a.type]||a.type];
        if(a.duration_min) p.push(`${a.duration_min} min`);
        if(a.distance_km)  p.push(`${a.distance_km} km`);
        if(a.session_type) p.push(GYM_LABELS[a.session_type]||a.session_type);
        if(a.avg_hr_bpm)   p.push(`${a.avg_hr_bpm} bpm`);
        if(a.description)  p.push(a.description);
        return p.join(' · ');
      }).join('  |  ');
      doc.setFont('helvetica','italic'); doc.setFontSize(8); doc.setTextColor(80,90,130);
      doc.text(`Activite : ${actStr}`, 12, y, { maxWidth:186 });
      doc.setTextColor(0); doc.setFont('helvetica','normal'); y += 7;
    }
    y += 5;
  }
  if (totals.n > 0) {
    if (y + 55 > 272) { doc.addPage(); y = 15; }
    doc.setFillColor(14,22,50); doc.rect(0,y,210,10,'F');
    doc.setFont('helvetica','bold'); doc.setFontSize(11); doc.setTextColor(100,220,255);
    doc.text('Resume de la periode', 105, y+7, { align:'center' }); doc.setTextColor(0); y += 14;
    const n = totals.n;
    const rows = [
      ['Calories moyennes / jour',  `${Math.round(totals.kcal/n)} kcal`],
      ['Proteines moyennes / jour', `${(totals.prot/n).toFixed(1)} g`],
      ['Glucides moyens / jour',    `${(totals.gluc/n).toFixed(1)} g`],
      ['Lipides moyens / jour',     `${(totals.lip/n).toFixed(1)} g`],
      ['Fibres moyennes / jour',    `${(totals.fib/n).toFixed(1)} g`],
      ['Jours avec donnees',        `${n} / ${days.length}`],
    ];
    if (stepsData.length) rows.push(['Pas moyens / jour', `${Math.round(stepsData.reduce((s,d)=>s+d.steps,0)/stepsData.length).toLocaleString('fr-FR')} pas`]);
    doc.autoTable({ startY:y, body:rows, theme:'striped', bodyStyles:{ fontSize:9 },
      columnStyles:{ 0:{ fontStyle:'bold', cellWidth:130 }, 1:{ halign:'right', cellWidth:60 } },
      margin:{ left:10, right:10 } });
  }
  doc.save(`journal-nutritionnel-${from}-au-${to}.pdf`);
}

function getDaysInRange(from, to) {
  const days=[]; const d=new Date(from+'T12:00:00'); const end=new Date(to+'T12:00:00');
  while (d <= end) { days.push(d.toISOString().split('T')[0]); d.setDate(d.getDate()+1); }
  return days;
}

function formatDateFull(str) {
  return new Date(str+'T12:00:00').toLocaleDateString('fr-FR', { weekday:'long', day:'numeric', month:'long', year:'numeric' });
}

// ── Chart options ──────────────────────────────────────────
function chartOpts() {
  return {
    responsive:true, maintainAspectRatio:false,
    interaction:{ mode:'index', intersect:false },
    plugins: {
      legend:{ labels:{ color:'#94a3b8', font:{ family:'Space Grotesk', size:12 }, boxWidth:18, padding:16 } },
      tooltip:{ backgroundColor:'rgba(7,7,20,0.97)', titleColor:'#64dcff', bodyColor:'#e2e8f0',
        borderColor:'rgba(100,220,255,0.25)', borderWidth:1, padding:12, cornerRadius:8,
        titleFont:{ family:'Orbitron', size:11 }, bodyFont:{ family:'Space Grotesk', size:13 } },
    },
    scales: {
      x:{ grid:{ color:'rgba(255,255,255,0.04)' }, ticks:{ color:'#475569', font:{ family:'Space Grotesk', size:11 }, maxRotation:45, maxTicksLimit:12 } },
      y:{ grid:{ color:'rgba(255,255,255,0.04)' }, ticks:{ color:'#475569', font:{ family:'Space Grotesk', size:11 } } },
    },
  };
}

// ── Utils ──────────────────────────────────────────────────
function today()    { return new Date().toISOString().split('T')[0]; }
function daysAgo(n) { const d=new Date(); d.setDate(d.getDate()-n); return d.toISOString().split('T')[0]; }
function numF(v)    { return v!==undefined&&v!==''?parseFloat(v)||null:null; }
function numI(v)    { return v!==undefined&&v!==''?parseInt(v)||null:null; }
function avg(arr)   { return arr.length?arr.reduce((a,b)=>a+b,0)/arr.length:0; }
function formatDate(str) { return new Date(str+'T12:00:00').toLocaleDateString('fr-FR',{ day:'2-digit', month:'short', year:'2-digit' }); }
function formatDateShort(str) { return new Date(str+'T12:00:00').toLocaleDateString('fr-FR',{ day:'2-digit', month:'2-digit' }); }
function hexA(hex, a) { const r=parseInt(hex.slice(1,3),16),g=parseInt(hex.slice(3,5),16),b=parseInt(hex.slice(5,7),16); return `rgba(${r},${g},${b},${a})`; }
function setEl(id, val) { const el=document.getElementById(id); if(el) el.textContent=val; }
function showToast(msg, type='success') {
  const t=document.createElement('div'); t.className=`toast toast--${type}`; t.textContent=msg;
  document.body.appendChild(t); requestAnimationFrame(()=>t.classList.add('show'));
  setTimeout(()=>{ t.classList.remove('show'); setTimeout(()=>t.remove(),400); },3800);
}
