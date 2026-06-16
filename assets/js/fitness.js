// ============================================================
// FITNESS TRACKER — logique principale
// ============================================================

let stepsChart        = null;
let measurementsChart = null;
let nutritionChart    = null;

// Journal state
let journalDate = today();

const MEAL_TYPES = [
  { key: 'breakfast',       label: 'Petit déjeuner' },
  { key: 'morning_snack',   label: 'Collation matin' },
  { key: 'lunch',           label: 'Déjeuner' },
  { key: 'afternoon_snack', label: 'Collation après-midi' },
  { key: 'dinner',          label: 'Dîner' },
  { key: 'evening_snack',   label: 'Collation soir' },
];

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

const ACT_ICONS = { walk:'🚶', run:'🏃', gym:'🏋️' };
const ACT_LABELS = { walk:'Marche', run:'Course à pied', gym:'Musculation' };
const GYM_LABELS = { push:'Push', pull:'Pull', legs:'Legs', upper:'Upper', lower:'Lower', full_body:'Full Body' };

const C = {
  primary:'#64dcff', purple:'#a855f7', orange:'#f97316',
  yellow:'#facc15', green:'#22d3ee',
};

// ============================================================
// INIT
// ============================================================
document.addEventListener('DOMContentLoaded', async () => {
  Chart.defaults.color       = '#64748b';
  Chart.defaults.borderColor = 'rgba(255,255,255,0.05)';
  Chart.defaults.font.family = 'Space Grotesk';

  initTabs();
  initJournal();
  initMeasurementForm();
  initActivityForm();

  await loadDashboard();
  await Promise.all([
    loadStepsChart(),
    loadMeasurementsChart(),
    loadNutritionChart(),
  ]);
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
  bindSelect('measurement-select', v => loadMeasurementsChart(v));
  bindSelect('nutrition-select',   v => loadNutritionChart(v));
}

function bindSelect(id, fn) {
  const el = document.getElementById(id);
  if (el) el.addEventListener('change', () => fn(el.value));
}

// ============================================================
// DASHBOARD
// ============================================================
async function loadDashboard() {
  const [mRes, nRes, stepsRes] = await Promise.all([
    db.from('measurements').select('weight_kg').not('weight_kg','is',null).order('date',{ascending:false}).limit(1),
    db.from('nutrition').select('calories').gte('date', daysAgo(7)),
    db.from('daily_steps').select('steps').gte('date', daysAgo(7)),
  ]);
  if (mRes.data?.length)     setEl('stat-weight',  `${mRes.data[0].weight_kg} kg`);
  if (nRes.data?.length)     setEl('stat-calories', `${Math.round(avg(nRes.data.map(d => d.calories)))} kcal/j`);
  if (stepsRes.data?.length) setEl('stat-steps',    `${Math.round(avg(stepsRes.data.map(d => d.steps))).toLocaleString('fr-FR')} pas`);
}

// ============================================================
// JOURNAL
// ============================================================
function initJournal() {
  const dateInput = document.getElementById('j-date');
  dateInput.value = journalDate;

  document.getElementById('j-prev').addEventListener('click', () => changeJournalDate(-1));
  document.getElementById('j-next').addEventListener('click', () => changeJournalDate(1));
  document.getElementById('j-today').addEventListener('click', () => {
    journalDate = today();
    dateInput.value = journalDate;
    loadJournalData();
  });
  dateInput.addEventListener('change', () => {
    journalDate = dateInput.value;
    loadJournalData();
  });

  // Steps save
  document.getElementById('j-steps-save').addEventListener('click', async () => {
    const val = parseInt(document.getElementById('j-steps').value);
    if (!val || val < 0) return;
    const { error } = await db.from('daily_steps').upsert({ date: journalDate, steps: val }, { onConflict: 'date' });
    if (error) { showToast(`Erreur : ${error.message}`, 'error'); return; }
    showToast('Pas enregistrés', 'success');
    await Promise.all([loadStepsChart(), loadDashboard()]);
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
  const grid = document.getElementById('meals-grid');
  grid.innerHTML = MEAL_TYPES.map(({ key, label }) => `
    <div class="meal-card" id="mc-${key}">
      <div class="meal-card__header" onclick="toggleMealDone('${key}')">
        <div class="meal-check" id="chk-${key}">✓</div>
        <span class="meal-label">${label}</span>
        <span class="meal-kcal-tag" id="kcal-tag-${key}">— kcal</span>
      </div>
      <div class="meal-card__body">
        <input type="text" class="meal-desc" id="desc-${key}" placeholder="Contenu du repas…" />
        <div class="meal-macros-labels">
          <span>kcal</span><span>Prot</span><span>Gluc</span><span>Lip</span><span>Fib</span>
        </div>
        <div class="meal-macros">
          <input type="number" id="kcal-${key}" placeholder="—" min="0" />
          <input type="number" id="prot-${key}" placeholder="—" min="0" step="0.1" />
          <input type="number" id="gluc-${key}" placeholder="—" min="0" step="0.1" />
          <input type="number" id="lip-${key}"  placeholder="—" min="0" step="0.1" />
          <input type="number" id="fib-${key}"  placeholder="—" min="0" step="0.1" />
        </div>
        <button class="btn btn--primary btn--sm" style="margin-top:4px;" onclick="saveMeal('${key}')">Enregistrer</button>
      </div>
    </div>
  `).join('');
}

async function loadJournalData() {
  const [mealsRes, activitiesRes, stepsRes] = await Promise.all([
    db.from('meals').select('*').eq('date', journalDate),
    db.from('activities').select('*').eq('date', journalDate).order('created_at'),
    db.from('daily_steps').select('steps').eq('date', journalDate).maybeSingle(),
  ]);

  const meals = mealsRes.data || [];
  renderMealCards(meals);
  renderActivities(activitiesRes.data || []);

  const stepsVal = stepsRes.data?.steps;
  document.getElementById('j-steps').value = stepsVal ?? '';
}

function renderMealCards(meals) {
  const byType = {};
  meals.forEach(m => { byType[m.meal_type] = m; });

  MEAL_TYPES.forEach(({ key }) => {
    const m = byType[key];
    const card = document.getElementById(`mc-${key}`);
    const chk  = document.getElementById(`chk-${key}`);
    const tag  = document.getElementById(`kcal-tag-${key}`);

    if (m) {
      document.getElementById(`desc-${key}`).value = m.description || '';
      document.getElementById(`kcal-${key}`).value = m.calories ?? '';
      document.getElementById(`prot-${key}`).value = m.protein_g ?? '';
      document.getElementById(`gluc-${key}`).value = m.carbs_g ?? '';
      document.getElementById(`lip-${key}`).value  = m.fat_g ?? '';
      document.getElementById(`fib-${key}`).value  = m.fiber_g ?? '';

      if (m.done) {
        card.classList.add('meal-card--done');
        chk.classList.add('meal-check--done');
      } else {
        card.classList.remove('meal-card--done');
        chk.classList.remove('meal-check--done');
      }
      tag.textContent = m.calories ? `${m.calories} kcal` : '— kcal';
    } else {
      document.getElementById(`desc-${key}`).value = '';
      ['kcal','prot','gluc','lip','fib'].forEach(f => document.getElementById(`${f}-${key}`).value = '');
      card.classList.remove('meal-card--done');
      chk.classList.remove('meal-check--done');
      tag.textContent = '— kcal';
    }
  });

  updateDailyTotals(meals);
}

async function toggleMealDone(mealType) {
  const card = document.getElementById(`mc-${mealType}`);
  const isDone = card.classList.contains('meal-card--done');

  const { data: existing } = await db.from('meals').select('id').eq('date', journalDate).eq('meal_type', mealType).maybeSingle();

  if (existing) {
    await db.from('meals').update({ done: !isDone }).eq('id', existing.id);
  } else {
    await db.from('meals').upsert({ date: journalDate, meal_type: mealType, done: true }, { onConflict: 'date,meal_type' });
  }

  await loadJournalData();
  await syncNutritionTable(journalDate);
  await loadNutritionChart();
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
  await syncNutritionTable(journalDate);
  await Promise.all([loadNutritionChart(), loadDashboard()]);
}

function updateDailyTotals(meals) {
  const done = meals.filter(m => m.done);
  const sum = (field) => done.reduce((s, m) => s + (m[field] || 0), 0);

  const kcal = sum('calories');
  const prot = sum('protein_g');
  const gluc = sum('carbs_g');
  const lip  = sum('fat_g');
  const fib  = sum('fiber_g');

  setEl('j-total-kcal', done.length ? Math.round(kcal).toLocaleString('fr-FR') : '—');
  setEl('j-total-prot', done.length ? prot.toFixed(1) : '—');
  setEl('j-total-gluc', done.length ? gluc.toFixed(1) : '—');
  setEl('j-total-lip',  done.length ? lip.toFixed(1)  : '—');
  setEl('j-total-fib',  done.length ? fib.toFixed(1)  : '—');
}

async function syncNutritionTable(date) {
  const { data: meals } = await db.from('meals').select('*').eq('date', date);
  const done = (meals || []).filter(m => m.done);
  const entry = {
    date,
    calories:  Math.round(done.reduce((s, m) => s + (m.calories || 0), 0)) || null,
    protein_g: done.reduce((s, m) => s + (m.protein_g || 0), 0) || null,
    carbs_g:   done.reduce((s, m) => s + (m.carbs_g || 0), 0) || null,
    fat_g:     done.reduce((s, m) => s + (m.fat_g || 0), 0) || null,
    fiber_g:   done.reduce((s, m) => s + (m.fiber_g || 0), 0) || null,
  };
  await db.from('nutrition').upsert(entry, { onConflict: 'date' });
}

// ============================================================
// ACTIVITY
// ============================================================
function initActivityForm() {
  // Type buttons
  document.querySelectorAll('.act-type-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.act-type-btn').forEach(b => b.classList.remove('act-type-btn--active'));
      btn.classList.add('act-type-btn--active');
      const type = btn.dataset.type;
      document.getElementById('act-type-val').value = type;

      document.getElementById('act-steps-group').style.display = (type === 'walk' || type === 'run') ? '' : 'none';
      document.getElementById('act-desc-group').style.display  = type === 'run' ? '' : 'none';
      document.getElementById('act-gym-group').style.display   = type === 'gym' ? '' : 'none';
    });
  });

  document.getElementById('activity-form').addEventListener('submit', async e => {
    e.preventDefault();
    const type    = document.getElementById('act-type-val').value;
    const dur     = numI(document.getElementById('act-duration').value);
    const steps   = numI(document.getElementById('act-steps').value);
    const desc    = document.getElementById('act-desc').value.trim() || null;
    const session = document.getElementById('act-session-type').value;

    const entry = {
      date:         journalDate,
      type,
      duration_min: dur,
      steps:        (type === 'walk' || type === 'run') ? steps : null,
      description:  type === 'run' ? desc : (type === 'gym' ? null : null),
      session_type: type === 'gym' ? session : null,
    };

    const { error } = await db.from('activities').insert(entry);
    if (error) { showToast(`Erreur : ${error.message}`, 'error'); return; }

    showToast('Activité ajoutée', 'success');
    e.target.reset();
    document.getElementById('act-type-val').value = 'walk';
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
    if (a.session_type) parts.push(GYM_LABELS[a.session_type] || a.session_type);
    if (a.steps)        parts.push(`${a.steps.toLocaleString('fr-FR')} pas`);
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

// ============================================================
// STEPS CHART
// ============================================================
async function loadStepsChart() {
  const noData = document.getElementById('steps-chart-nodata');
  const { data } = await db.from('daily_steps').select('date, steps').order('date').limit(60);
  if (!data?.length) { noData && (noData.style.display = 'flex'); return; }
  noData && (noData.style.display = 'none');

  const labels = data.map(d => formatDate(d.date));
  const values = data.map(d => d.steps);
  const GOAL   = 10000;

  const ctx = document.getElementById('steps-chart').getContext('2d');
  if (stepsChart) stepsChart.destroy();
  stepsChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label:'Pas', data:values,
          backgroundColor: values.map(v => v >= GOAL ? hexA(C.green,0.45) : hexA(C.purple,0.35)),
          borderColor:     values.map(v => v >= GOAL ? C.green : C.purple),
          borderWidth:1, borderRadius:4,
        },
        {
          label:`Objectif ${GOAL.toLocaleString('fr-FR')} pas`,
          data: Array(values.length).fill(GOAL),
          type:'line', borderColor:hexA(C.orange,0.6), borderWidth:1.5,
          borderDash:[6,4], pointRadius:0, fill:false,
        },
      ],
    },
    options: {
      ...chartOpts(),
      plugins: { ...chartOpts().plugins, tooltip: { ...chartOpts().plugins.tooltip,
        callbacks: { label: ctx => ctx.dataset.label === 'Pas' ? `${ctx.parsed.y.toLocaleString('fr-FR')} pas` : undefined },
      }},
    },
  });
}

// ============================================================
// MEASUREMENTS CHART
// ============================================================
async function loadMeasurementsChart(metric) {
  const sel    = document.getElementById('measurement-select');
  const field  = metric || sel?.value || 'weight_kg';
  const noData = document.getElementById('measurements-chart-nodata');

  const { data } = await db.from('measurements').select(`date, ${field}`).not(field,'is',null).order('date');
  if (!data?.length) { noData && (noData.style.display = 'flex'); return; }
  noData && (noData.style.display = 'none');

  const ctx = document.getElementById('measurements-chart').getContext('2d');
  if (measurementsChart) measurementsChart.destroy();
  measurementsChart = new Chart(ctx, {
    type:'line',
    data: {
      labels: data.map(d => formatDate(d.date)),
      datasets: [{ label: MEASURE_LABELS[field]||field, data: data.map(d => d[field]),
        borderColor:C.primary, backgroundColor:hexA(C.primary,0.09), borderWidth:2,
        pointBackgroundColor:C.primary, pointRadius:5, pointHoverRadius:8, tension:0.35, fill:true }],
    },
    options: chartOpts(),
  });
}

// ============================================================
// NUTRITION CHART
// ============================================================
async function loadNutritionChart(macro) {
  const sel    = document.getElementById('nutrition-select');
  const field  = macro || sel?.value || 'calories';
  const noData = document.getElementById('nutrition-chart-nodata');

  const { data } = await db.from('nutrition').select('date, calories, protein_g, carbs_g, fat_g, fiber_g').order('date');
  if (!data?.length) { noData && (noData.style.display = 'flex'); return; }
  noData && (noData.style.display = 'none');

  const values = data.map(d => d[field] ?? 0);
  const movAvg = values.map((_,i) => {
    const win = values.slice(Math.max(0,i-6), i+1);
    return +(win.reduce((a,b)=>a+b,0)/win.length).toFixed(1);
  });
  const colorMap = { calories:C.orange, protein_g:C.primary, carbs_g:C.yellow, fat_g:C.purple, fiber_g:C.green };
  const color = colorMap[field] || C.primary;

  const ctx = document.getElementById('nutrition-chart').getContext('2d');
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

// ============================================================
// MEASUREMENT FORM
// ============================================================
function initMeasurementForm() {
  const mForm = document.getElementById('measurement-form');
  mForm.querySelector('[name="date"]').value = today();
  if (mForm) {
    mForm.addEventListener('submit', async e => {
      e.preventDefault();
      const fd    = Object.fromEntries(new FormData(e.target));
      const entry = { date: fd.date };
      const fields = ['weight_kg','body_fat_pct','neck_cm','shoulder_cm','chest_cm','waist_cm',
        'hips_cm','glutes_cm','left_arm_cm','right_arm_cm','forearm_cm',
        'left_thigh_cm','right_thigh_cm','calf_cm'];
      fields.forEach(f => { const v = numF(fd[f]); if (v !== null) entry[f] = v; });

      const { error } = await db.from('measurements').upsert(entry, { onConflict: 'date' });
      if (error) { showToast(`Erreur : ${error.message}`, 'error'); return; }
      showToast('Mensuration enregistrée', 'success');
      e.target.reset();
      mForm.querySelector('[name="date"]').value = today();
      await Promise.all([loadMeasurementsChart(), loadDashboard()]);
    });
  }
}

// ============================================================
// CHART OPTIONS
// ============================================================
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

// ============================================================
// UTILS
// ============================================================
function formatDate(str) {
  const d = new Date(str + (str.length === 10 ? 'T12:00:00' : ''));
  return d.toLocaleDateString('fr-FR', { day:'2-digit', month:'short', year:'2-digit' });
}

function today()    { return new Date().toISOString().split('T')[0]; }
function daysAgo(n) { const d = new Date(); d.setDate(d.getDate()-n); return d.toISOString().split('T')[0]; }
function numF(v)    { return v !== undefined && v !== '' ? parseFloat(v) || null : null; }
function numI(v)    { return v !== undefined && v !== '' ? parseInt(v)   || null : null; }
function avg(arr)   { return arr.length ? arr.reduce((a,b)=>a+b,0)/arr.length : 0; }
function hexA(hex, a) {
  const r=parseInt(hex.slice(1,3),16), g=parseInt(hex.slice(3,5),16), b=parseInt(hex.slice(5,7),16);
  return `rgba(${r},${g},${b},${a})`;
}
function setEl(id, val) { const el=document.getElementById(id); if(el) el.textContent=val; }

function showToast(msg, type='success') {
  const t = document.createElement('div');
  t.className = `toast toast--${type}`; t.textContent = msg;
  document.body.appendChild(t);
  requestAnimationFrame(() => t.classList.add('show'));
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 400); }, 3800);
}
