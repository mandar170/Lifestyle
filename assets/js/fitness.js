// ============================================================
// FITNESS TRACKER — logique principale
// ============================================================

let workoutChart      = null;
let runningChart      = null;
let stepsChart        = null;
let measurementsChart = null;
let nutritionChart    = null;
let allExercises      = [];

const FR_MONTHS = {
  'janv.':'01','févr.':'02','mars':'03','avr.':'04',
  'mai':'05','juin':'06','juil.':'07','août':'08',
  'sept.':'09','oct.':'10','nov.':'11','déc.':'12',
};

const MEASURE_LABELS = {
  weight_kg:'Poids (kg)', chest_cm:'Poitrine (cm)', waist_cm:'Tour de taille (cm)',
  hips_cm:'Hanches (cm)', left_arm_cm:'Bras gauche (cm)', right_arm_cm:'Bras droit (cm)',
  left_thigh_cm:'Cuisse gauche (cm)', right_thigh_cm:'Cuisse droite (cm)',
  neck_cm:'Cou (cm)', body_fat_pct:'Masse grasse (%)',
};

const NUTRITION_LABELS = {
  calories:'Calories (kcal)', protein_g:'Protéines (g)',
  carbs_g:'Glucides (g)', fat_g:'Lipides (g)',
};

const SESSION_TYPE_LABELS = {
  footing:'Footing', tempo:'Tempo', fractionne:'Fractionné',
  long:'Sortie longue', course:'Course',
};

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
  initImport();
  initForms();
  initPacePreview();

  await Promise.all([
    loadDashboard(),
    loadExerciseList(),
    loadRunningStats(),
  ]);
  await Promise.all([
    loadWorkoutChart(),
    loadRunningChart(),
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

  // Listeners selects
  bindSelect('exercise-select',   v => loadWorkoutChart(v));
  bindSelect('running-select',    v => loadRunningChart(v));
  bindSelect('measurement-select',v => loadMeasurementsChart(v));
  bindSelect('nutrition-select',  v => loadNutritionChart(v));
}

function bindSelect(id, fn) {
  const el = document.getElementById(id);
  if (el) el.addEventListener('change', () => fn(el.value));
}

// ============================================================
// DASHBOARD
// ============================================================
async function loadDashboard() {
  const [mRes, nRes, stepsRes, runRes] = await Promise.all([
    db.from('measurements').select('weight_kg').not('weight_kg','is',null).order('date',{ascending:false}).limit(1),
    db.from('nutrition').select('calories').gte('date', daysAgo(7)),
    db.from('daily_steps').select('steps').gte('date', daysAgo(7)),
    db.from('running_sessions').select('distance_km').gte('date', firstOfMonth()),
  ]);

  if (mRes.data?.length)   setEl('stat-weight',  `${mRes.data[0].weight_kg} kg`);
  if (nRes.data?.length)   setEl('stat-calories', `${Math.round(avg(nRes.data.map(d => d.calories)))} kcal/j`);
  if (stepsRes.data?.length) setEl('stat-steps', `${Math.round(avg(stepsRes.data.map(d => d.steps))).toLocaleString('fr-FR')} pas`);
  if (runRes.data?.length) setEl('stat-run-km',  `${runRes.data.reduce((s,d) => s + d.distance_km, 0).toFixed(1)} km`);
}

// ============================================================
// RUNNING STATS (mini-stats dans le tab Course)
// ============================================================
async function loadRunningStats() {
  const { data } = await db
    .from('running_sessions')
    .select('date, distance_km, avg_pace_seconds')
    .gte('date', firstOfMonth())
    .order('date');

  if (!data || !data.length) return;

  const totalKm    = data.reduce((s,d) => s + d.distance_km, 0);
  const sessions   = data.length;
  const avgDist    = totalKm / sessions;
  const paces      = data.filter(d => d.avg_pace_seconds).map(d => d.avg_pace_seconds);
  const avgPace    = paces.length ? Math.round(avg(paces)) : null;

  setEl('run-total-km',  totalKm.toFixed(1) + ' km');
  setEl('run-sessions',  sessions + ' sortie' + (sessions > 1 ? 's' : ''));
  setEl('run-avg-dist',  avgDist.toFixed(1) + ' km');
  setEl('run-avg-pace',  avgPace ? formatPace(avgPace) : '—');
}

// ============================================================
// CSV IMPORT (Hevy)
// ============================================================
function initImport() {
  const fileInput = document.getElementById('csv-file');
  const dropZone  = document.getElementById('drop-zone');
  if (!dropZone) return;

  dropZone.addEventListener('dragover',  e => { e.preventDefault(); dropZone.classList.add('drag-over'); });
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
  dropZone.addEventListener('drop', e => {
    e.preventDefault(); dropZone.classList.remove('drag-over');
    const f = e.dataTransfer.files[0]; if (f) processCSV(f);
  });
  dropZone.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', e => { if (e.target.files[0]) processCSV(e.target.files[0]); });
}

function parseHevyDate(str) {
  if (!str?.trim()) return null;
  const m = str.trim().match(/^(\d{1,2})\s+(\S+)\s+(\d{4}),\s+(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const [,day,mon,year,h,min] = m;
  const mm = FR_MONTHS[mon]; if (!mm) return null;
  return new Date(`${year}-${mm}-${day.padStart(2,'0')}T${h.padStart(2,'0')}:${min}:00`);
}

async function processCSV(file) {
  const statusEl   = document.getElementById('import-status');
  const progressEl = document.getElementById('import-progress');
  const resultEl   = document.getElementById('import-result');

  statusEl.textContent = 'Analyse du fichier…';
  progressEl.style.width = '5%';
  resultEl.textContent = '';

  Papa.parse(file, {
    header: true, skipEmptyLines: true,
    complete: async res => {
      const rows = res.data;
      const sets = rows.map(row => {
        const st = parseHevyDate(row['start_time']);
        const et = parseHevyDate(row['end_time']);
        if (!st || !row['exercise_title']) return null;
        return {
          workout_title:    (row['title']||'').trim(),
          workout_date:     st.toISOString().split('T')[0],
          start_time:       st.toISOString(),
          end_time:         et?.toISOString() || null,
          exercise_title:   (row['exercise_title']||'').trim(),
          set_index:        parseInt(row['set_index'])||0,
          set_type:         (row['set_type']||'normal').trim(),
          weight_kg:        row['weight_kg']       ? parseFloat(row['weight_kg'])       : null,
          reps:             row['reps']             ? parseInt(row['reps'])              : null,
          distance_km:      row['distance_km']      ? parseFloat(row['distance_km'])     : null,
          duration_seconds: row['duration_seconds'] ? parseInt(row['duration_seconds'])  : null,
          rpe:              row['rpe']              ? parseFloat(row['rpe'])             : null,
        };
      }).filter(Boolean);

      if (!sets.length) { statusEl.textContent = 'Aucune ligne valide.'; progressEl.style.width = '0%'; return; }

      const CHUNK = 200; let done = 0, errors = 0;
      for (let i = 0; i < sets.length; i += CHUNK) {
        const { error } = await db.from('workout_sets').upsert(sets.slice(i, i+CHUNK), { onConflict: 'start_time,exercise_title,set_index', ignoreDuplicates: false });
        if (error) { console.error(error); errors++; }
        done += Math.min(CHUNK, sets.length - i);
        progressEl.style.width = `${Math.round(done/sets.length*100)}%`;
        statusEl.textContent   = `Import : ${done}/${sets.length}…`;
      }

      progressEl.style.width = '100%';
      resultEl.innerHTML = errors === 0
        ? `<span class="ok">✓ Import terminé — ${sets.length} séries.</span>`
        : `<span class="warn">Import terminé avec ${errors} erreur(s).</span>`;
      showToast(`${sets.length} séries importées`, 'success');
      await loadExerciseList(); await loadWorkoutChart(); await loadDashboard();
    },
    error: err => { showToast('Erreur CSV', 'error'); statusEl.textContent = err.message; },
  });
}

// ============================================================
// WORKOUT CHART
// ============================================================
async function loadExerciseList() {
  const { data } = await db.from('workout_sets').select('exercise_title').eq('set_type','normal').order('exercise_title');
  if (!data) return;
  allExercises = [...new Set(data.map(d => d.exercise_title))].sort();
  const sel = document.getElementById('exercise-select');
  const cur = sel?.value;
  sel.innerHTML = '<option value="">— Choisir un exercice —</option>' +
    allExercises.map(ex => `<option value="${ex}">${ex}</option>`).join('');
  if (cur && allExercises.includes(cur)) sel.value = cur;
}

async function loadWorkoutChart(exercise) {
  const sel = document.getElementById('exercise-select');
  const ex  = exercise || sel?.value || allExercises[0] || null;
  const noData = document.getElementById('workout-chart-nodata');
  if (!ex) { noData && (noData.style.display = 'flex'); return; }

  const { data } = await db.from('workout_sets')
    .select('workout_date, weight_kg, reps')
    .eq('exercise_title', ex).eq('set_type','normal')
    .not('weight_kg','is',null).not('reps','is',null).order('workout_date');

  if (!data?.length) { noData && (noData.style.display = 'flex'); return; }
  noData && (noData.style.display = 'none');

  const byDate = {};
  data.forEach(r => {
    const e1rm = r.weight_kg * (1 + r.reps / 30);
    if (!byDate[r.workout_date]) byDate[r.workout_date] = { maxWeight: 0, maxE1RM: 0 };
    byDate[r.workout_date].maxWeight = Math.max(byDate[r.workout_date].maxWeight, r.weight_kg);
    byDate[r.workout_date].maxE1RM   = Math.max(byDate[r.workout_date].maxE1RM, e1rm);
  });

  const labels = Object.keys(byDate).sort();
  const ctx = document.getElementById('workout-chart').getContext('2d');
  if (workoutChart) workoutChart.destroy();
  workoutChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels.map(formatDate),
      datasets: [
        { label:'Poids max (kg)', data: labels.map(d => byDate[d].maxWeight),
          borderColor: C.primary, backgroundColor: hexA(C.primary,0.08),
          borderWidth:2, pointBackgroundColor:C.primary, pointRadius:4, pointHoverRadius:7, tension:0.35, fill:true },
        { label:'1RM estimé · Epley (kg)', data: labels.map(d => +byDate[d].maxE1RM.toFixed(1)),
          borderColor: C.purple, backgroundColor:'transparent',
          borderWidth:2, borderDash:[6,4], pointBackgroundColor:C.purple, pointRadius:3, tension:0.35, fill:false },
      ],
    },
    options: chartOpts(),
  });
}

// ============================================================
// RUNNING CHART
// ============================================================
async function loadRunningChart(metric) {
  const sel   = document.getElementById('running-select');
  const field = metric || sel?.value || 'distance_km';
  const noData = document.getElementById('running-chart-nodata');

  const { data } = await db.from('running_sessions')
    .select('date, distance_km, avg_pace_seconds, session_type')
    .order('date');

  if (!data?.length) { noData && (noData.style.display = 'flex'); return; }
  noData && (noData.style.display = 'none');

  const isPace   = field === 'avg_pace_seconds';
  const labels   = data.map(d => formatDate(d.date));
  const values   = data.map(d => isPace ? (d.avg_pace_seconds || null) : d.distance_km);
  const color    = isPace ? C.orange : C.green;

  const ctx = document.getElementById('running-chart').getContext('2d');
  if (runningChart) runningChart.destroy();

  runningChart = new Chart(ctx, {
    type: isPace ? 'line' : 'bar',
    data: {
      labels,
      datasets: [{
        label: isPace ? 'Allure (min/km)' : 'Distance (km)',
        data: values,
        borderColor: color,
        backgroundColor: isPace ? 'transparent' : hexA(color, 0.3),
        borderWidth: 2,
        borderRadius: isPace ? 0 : 5,
        pointBackgroundColor: color,
        pointRadius: isPace ? 5 : 0,
        pointHoverRadius: 8,
        tension: 0.35,
        fill: !isPace,
        // Pour l'allure : inverser l'axe Y (plus petit = plus rapide)
      }],
    },
    options: {
      ...chartOpts(),
      scales: {
        ...chartOpts().scales,
        y: {
          ...chartOpts().scales.y,
          reverse: isPace,  // allure plus rapide = valeur plus basse = haut du graphe
          ticks: {
            color: '#475569',
            font: { family: 'Space Grotesk', size: 11 },
            callback: isPace ? v => formatPace(v) : undefined,
          },
        },
      },
      plugins: {
        ...chartOpts().plugins,
        tooltip: {
          ...chartOpts().plugins.tooltip,
          callbacks: {
            label: ctx => isPace
              ? `Allure : ${formatPace(ctx.parsed.y)}/km`
              : `Distance : ${ctx.parsed.y} km`,
          },
        },
      },
    },
  });
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
          label: 'Pas', data: values,
          backgroundColor: values.map(v => v >= GOAL ? hexA(C.green, 0.45) : hexA(C.purple, 0.35)),
          borderColor:     values.map(v => v >= GOAL ? C.green : C.purple),
          borderWidth: 1, borderRadius: 4,
        },
        {
          label: `Objectif ${GOAL.toLocaleString('fr-FR')} pas`,
          data: Array(values.length).fill(GOAL),
          type: 'line', borderColor: hexA(C.orange, 0.6),
          borderWidth: 1.5, borderDash: [6, 4],
          pointRadius: 0, fill: false,
        },
      ],
    },
    options: {
      ...chartOpts(),
      plugins: {
        ...chartOpts().plugins,
        tooltip: {
          ...chartOpts().plugins.tooltip,
          callbacks: { label: ctx => ctx.dataset.label === 'Pas' ? `${ctx.parsed.y.toLocaleString('fr-FR')} pas` : undefined },
        },
      },
    },
  });
}

// ============================================================
// MEASUREMENTS CHART
// ============================================================
async function loadMeasurementsChart(metric) {
  const sel   = document.getElementById('measurement-select');
  const field = metric || sel?.value || 'weight_kg';
  const noData = document.getElementById('measurements-chart-nodata');

  const { data } = await db.from('measurements').select(`date, ${field}`).not(field,'is',null).order('date');
  if (!data?.length) { noData && (noData.style.display = 'flex'); return; }
  noData && (noData.style.display = 'none');

  const ctx = document.getElementById('measurements-chart').getContext('2d');
  if (measurementsChart) measurementsChart.destroy();
  measurementsChart = new Chart(ctx, {
    type: 'line',
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
  const sel   = document.getElementById('nutrition-select');
  const field = macro || sel?.value || 'calories';
  const noData = document.getElementById('nutrition-chart-nodata');

  const { data } = await db.from('nutrition').select('date, calories, protein_g, carbs_g, fat_g').order('date');
  if (!data?.length) { noData && (noData.style.display = 'flex'); return; }
  noData && (noData.style.display = 'none');

  const values = data.map(d => d[field] ?? 0);
  const movAvg = values.map((_,i) => {
    const win = values.slice(Math.max(0,i-6), i+1);
    return +(win.reduce((a,b)=>a+b,0)/win.length).toFixed(1);
  });
  const colorMap = { calories:C.orange, protein_g:C.primary, carbs_g:C.yellow, fat_g:C.purple };
  const color = colorMap[field] || C.primary;

  const ctx = document.getElementById('nutrition-chart').getContext('2d');
  if (nutritionChart) nutritionChart.destroy();
  nutritionChart = new Chart(ctx, {
    type: 'bar',
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
// FORMS
// ============================================================
function initPacePreview() {
  const distInput = document.getElementById('r-dist');
  const minInput  = document.getElementById('r-min');
  const secInput  = document.getElementById('r-sec');
  const preview   = document.getElementById('r-pace-preview');
  if (!distInput || !minInput || !preview) return;

  function update() {
    const dist = parseFloat(distInput.value);
    const mins = parseInt(minInput.value) || 0;
    const secs = parseInt(secInput?.value) || 0;
    const totalSec = mins * 60 + secs;
    if (dist > 0 && totalSec > 0) {
      preview.textContent = formatPace(Math.round(totalSec / dist)) + ' /km';
      preview.classList.add('pace-preview--active');
    } else {
      preview.textContent = '—';
      preview.classList.remove('pace-preview--active');
    }
  }
  [distInput, minInput, secInput].forEach(el => el?.addEventListener('input', update));
}

function initForms() {
  // --- Dates d'aujourd'hui ---
  ['r-date','s-date'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = today();
  });
  document.querySelectorAll('#measurement-form [name="date"], #nutrition-form [name="date"]')
    .forEach(el => { el.value = today(); });

  // --- Course à pied ---
  const rForm = document.getElementById('running-form');
  if (rForm) {
    rForm.addEventListener('submit', async e => {
      e.preventDefault();
      const fd   = Object.fromEntries(new FormData(e.target));
      const dist = parseFloat(fd.distance_km);
      const secs = (parseInt(fd.duration_min)||0)*60 + (parseInt(fd.duration_sec)||0);
      if (!dist || !secs) { showToast('Distance et durée requises', 'error'); return; }

      const entry = {
        date:            fd.date,
        distance_km:     dist,
        duration_seconds:secs,
        avg_pace_seconds:Math.round(secs / dist),
        session_type:    fd.session_type || 'footing',
        avg_heart_rate:  fd.avg_heart_rate ? parseInt(fd.avg_heart_rate) : null,
        notes:           fd.notes || null,
      };
      const { error } = await db.from('running_sessions').insert(entry);
      if (error) { showToast(`Erreur : ${error.message}`, 'error'); return; }
      showToast('Séance enregistrée', 'success');
      e.target.reset();
      document.getElementById('r-date').value = today();
      document.getElementById('r-pace-preview').textContent = '—';
      await Promise.all([loadRunningChart(), loadRunningStats(), loadDashboard()]);
    });
  }

  // --- Pas ---
  const sForm = document.getElementById('steps-form');
  if (sForm) {
    sForm.addEventListener('submit', async e => {
      e.preventDefault();
      const fd = Object.fromEntries(new FormData(e.target));
      const { error } = await db.from('daily_steps')
        .upsert({ date: fd.date, steps: parseInt(fd.steps) }, { onConflict: 'date' });
      if (error) { showToast(`Erreur : ${error.message}`, 'error'); return; }
      showToast('Pas enregistrés', 'success');
      e.target.reset();
      document.getElementById('s-date').value = today();
      await Promise.all([loadStepsChart(), loadDashboard()]);
    });
  }

  // --- Mensurations ---
  const mForm = document.getElementById('measurement-form');
  if (mForm) {
    mForm.addEventListener('submit', async e => {
      e.preventDefault();
      const fd    = Object.fromEntries(new FormData(e.target));
      const entry = { date: fd.date };
      const fields = ['weight_kg','body_fat_pct','chest_cm','waist_cm','hips_cm',
        'left_arm_cm','right_arm_cm','left_thigh_cm','right_thigh_cm','neck_cm'];
      fields.forEach(f => { const v = num(fd[f]); if (v !== null) entry[f] = v; });
      if (fd.notes) entry.notes = fd.notes;

      const { error } = await db.from('measurements').upsert(entry, { onConflict: 'date' });
      if (error) { showToast(`Erreur : ${error.message}`, 'error'); return; }
      showToast('Mensuration enregistrée', 'success');
      e.target.reset();
      mForm.querySelector('[name="date"]').value = today();
      await Promise.all([loadMeasurementsChart(), loadDashboard()]);
    });
  }

  // --- Nutrition ---
  const nForm = document.getElementById('nutrition-form');
  if (nForm) {
    nForm.addEventListener('submit', async e => {
      e.preventDefault();
      const fd = Object.fromEntries(new FormData(e.target));
      const entry = {
        date: fd.date,
        calories:  fd.calories  ? parseInt(fd.calories)    : null,
        protein_g: fd.protein_g ? parseFloat(fd.protein_g) : null,
        carbs_g:   fd.carbs_g   ? parseFloat(fd.carbs_g)   : null,
        fat_g:     fd.fat_g     ? parseFloat(fd.fat_g)     : null,
        notes:     fd.notes || null,
      };
      const { error } = await db.from('nutrition').upsert(entry, { onConflict: 'date' });
      if (error) { showToast(`Erreur : ${error.message}`, 'error'); return; }
      showToast('Nutrition enregistrée', 'success');
      e.target.reset();
      nForm.querySelector('[name="date"]').value = today();
      await Promise.all([loadNutritionChart(), loadDashboard()]);
    });
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
      legend: { labels: { color:'#94a3b8', font:{ family:'Space Grotesk', size:12 }, boxWidth:18, padding:16 } },
      tooltip: {
        backgroundColor:'rgba(7,7,20,0.97)', titleColor:'#64dcff', bodyColor:'#e2e8f0',
        borderColor:'rgba(100,220,255,0.25)', borderWidth:1, padding:12, cornerRadius:8,
        titleFont:{ family:'Orbitron', size:11 }, bodyFont:{ family:'Space Grotesk', size:13 },
      },
    },
    scales: {
      x: { grid:{ color:'rgba(255,255,255,0.04)' }, ticks:{ color:'#475569', font:{ family:'Space Grotesk', size:11 }, maxRotation:45, maxTicksLimit:12 } },
      y: { grid:{ color:'rgba(255,255,255,0.04)' }, ticks:{ color:'#475569', font:{ family:'Space Grotesk', size:11 } } },
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

function formatPace(totalSeconds) {
  if (!totalSeconds) return '—';
  const m = Math.floor(totalSeconds / 60);
  const s = Math.round(totalSeconds % 60);
  return `${m}'${s.toString().padStart(2,'0')}"`;
}

function today() { return new Date().toISOString().split('T')[0]; }
function daysAgo(n) { const d = new Date(); d.setDate(d.getDate()-n); return d.toISOString().split('T')[0]; }
function firstOfMonth() { const d = new Date(); d.setDate(1); return d.toISOString().split('T')[0]; }
function num(v) { return v && v.trim() !== '' ? parseFloat(v) : null; }
function avg(arr) { return arr.length ? arr.reduce((a,b)=>a+b,0)/arr.length : 0; }
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
