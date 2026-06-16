// ============================================================
// FITNESS TRACKER — logique principale
// ============================================================

let stepsChart        = null;
let measurementsChart = null;
let nutritionChart    = null;

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
  initForms();

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
function initForms() {
  const sDateEl = document.getElementById('s-date');
  if (sDateEl) sDateEl.value = today();
  document.querySelectorAll('#measurement-form [name="date"], #nutrition-form [name="date"]')
    .forEach(el => { el.value = today(); });

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
        date:      fd.date,
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

function today()    { return new Date().toISOString().split('T')[0]; }
function daysAgo(n) { const d = new Date(); d.setDate(d.getDate()-n); return d.toISOString().split('T')[0]; }
function num(v)     { return v && v.trim() !== '' ? parseFloat(v) : null; }
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
