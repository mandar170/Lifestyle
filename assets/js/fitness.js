// ============================================================
// FITNESS TRACKER — logique principale
// ============================================================

// ---- GLOBAL STATE ----
let workoutChart      = null;
let measurementsChart = null;
let nutritionChart    = null;
let allExercises      = [];

// ---- MOIS FRANÇAIS HEVY ----
const FR_MONTHS = {
  'janv.': '01', 'févr.': '02', 'mars': '03', 'avr.': '04',
  'mai':   '05', 'juin':  '06', 'juil.': '07', 'août': '08',
  'sept.': '09', 'oct.':  '10', 'nov.':  '11', 'déc.': '12',
};

// ---- LABELS ----
const MEASURE_LABELS = {
  weight_kg:      'Poids (kg)',
  chest_cm:       'Poitrine (cm)',
  waist_cm:       'Tour de taille (cm)',
  hips_cm:        'Hanches (cm)',
  left_arm_cm:    'Bras gauche (cm)',
  right_arm_cm:   'Bras droit (cm)',
  left_thigh_cm:  'Cuisse gauche (cm)',
  right_thigh_cm: 'Cuisse droite (cm)',
  neck_cm:        'Cou (cm)',
  body_fat_pct:   'Masse grasse (%)',
};

const NUTRITION_LABELS = {
  calories:  'Calories (kcal)',
  protein_g: 'Protéines (g)',
  carbs_g:   'Glucides (g)',
  fat_g:     'Lipides (g)',
};

const CHART_COLORS = {
  primary:   '#64dcff',
  purple:    '#a855f7',
  orange:    '#f97316',
  yellow:    '#facc15',
  green:     '#22d3ee',
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
  await loadDashboard();
  await loadExerciseList();
  await loadWorkoutChart();
  await loadMeasurementsChart();
  await loadNutritionChart();
});

// ============================================================
// TABS
// ============================================================
function initTabs() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.tab;
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(`panel-${target}`).classList.add('active');
    });
  });
}

// ============================================================
// DASHBOARD — stats rapides
// ============================================================
async function loadDashboard() {
  // Dernier poids
  const { data: mData } = await db
    .from('measurements')
    .select('date, weight_kg')
    .not('weight_kg', 'is', null)
    .order('date', { ascending: false })
    .limit(1);

  if (mData && mData.length) {
    setEl('stat-weight', `${mData[0].weight_kg} kg`);
  }

  // Dernière séance
  const { data: wData } = await db
    .from('workout_sets')
    .select('workout_date, workout_title')
    .order('workout_date', { ascending: false })
    .limit(1);

  if (wData && wData.length) {
    setEl('stat-last-workout', `${wData[0].workout_title} — ${formatDate(wData[0].workout_date)}`);
  }

  // Calories moy. 7 derniers jours
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const { data: nData } = await db
    .from('nutrition')
    .select('calories')
    .gte('date', sevenDaysAgo.toISOString().split('T')[0]);

  if (nData && nData.length) {
    const avg = Math.round(nData.reduce((s, d) => s + (d.calories || 0), 0) / nData.length);
    setEl('stat-calories', `${avg} kcal/j`);
  }

  // Nb séances ce mois
  const firstOfMonth = new Date();
  firstOfMonth.setDate(1);
  const { data: sessData } = await db
    .from('workout_sets')
    .select('workout_date')
    .gte('workout_date', firstOfMonth.toISOString().split('T')[0]);

  if (sessData) {
    const uniqueDates = new Set(sessData.map(d => d.workout_date));
    setEl('stat-sessions', `${uniqueDates.size} séances`);
  }
}

function setEl(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

// ============================================================
// CSV IMPORT (Hevy)
// ============================================================
function initImport() {
  const fileInput = document.getElementById('csv-file');
  const dropZone  = document.getElementById('drop-zone');

  dropZone.addEventListener('dragover',  e => { e.preventDefault(); dropZone.classList.add('drag-over'); });
  dropZone.addEventListener('dragleave', ()  => dropZone.classList.remove('drag-over'));
  dropZone.addEventListener('drop', e => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
    const f = e.dataTransfer.files[0];
    if (f) processCSV(f);
  });
  dropZone.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', e => { if (e.target.files[0]) processCSV(e.target.files[0]); });
}

function parseHevyDate(str) {
  if (!str || !str.trim()) return null;
  // Format : "1 févr. 2026, 07:50"  ou  "29 janv. 2026, 05:48"
  const m = str.trim().match(/^(\d{1,2})\s+(\S+)\s+(\d{4}),\s+(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const [, day, mon, year, h, min] = m;
  const monthNum = FR_MONTHS[mon];
  if (!monthNum) return null;
  return new Date(`${year}-${monthNum}-${day.padStart(2,'0')}T${h.padStart(2,'0')}:${min}:00`);
}

async function processCSV(file) {
  const statusEl   = document.getElementById('import-status');
  const progressEl = document.getElementById('import-progress');
  const resultEl   = document.getElementById('import-result');

  statusEl.textContent   = 'Analyse du fichier…';
  progressEl.style.width = '5%';
  resultEl.textContent   = '';

  Papa.parse(file, {
    header: true,
    skipEmptyLines: true,
    complete: async (res) => {
      const rows = res.data;
      statusEl.textContent = `${rows.length} lignes détectées — import en cours…`;

      const sets = rows
        .map(row => {
          const st = parseHevyDate(row['start_time']);
          const et = parseHevyDate(row['end_time']);
          if (!st || !row['exercise_title']) return null;
          return {
            workout_title:    (row['title'] || '').trim(),
            workout_date:     st.toISOString().split('T')[0],
            start_time:       st.toISOString(),
            end_time:         et ? et.toISOString() : null,
            exercise_title:   (row['exercise_title'] || '').trim(),
            set_index:        parseInt(row['set_index']) || 0,
            set_type:         (row['set_type'] || 'normal').trim(),
            weight_kg:        row['weight_kg']        ? parseFloat(row['weight_kg'])        : null,
            reps:             row['reps']              ? parseInt(row['reps'])               : null,
            distance_km:      row['distance_km']       ? parseFloat(row['distance_km'])      : null,
            duration_seconds: row['duration_seconds']  ? parseInt(row['duration_seconds'])   : null,
            rpe:              row['rpe']               ? parseFloat(row['rpe'])              : null,
          };
        })
        .filter(Boolean);

      if (!sets.length) {
        statusEl.textContent   = 'Aucune ligne valide trouvée.';
        progressEl.style.width = '0%';
        return;
      }

      // Insert par chunks de 200
      const CHUNK = 200;
      let done = 0;
      let errors = 0;
      for (let i = 0; i < sets.length; i += CHUNK) {
        const chunk = sets.slice(i, i + CHUNK);
        const { error } = await db
          .from('workout_sets')
          .upsert(chunk, { onConflict: 'start_time,exercise_title,set_index', ignoreDuplicates: false });

        if (error) { console.error(error); errors++; }
        done += chunk.length;
        progressEl.style.width = `${Math.round((done / sets.length) * 100)}%`;
        statusEl.textContent   = `Import : ${done}/${sets.length}…`;
      }

      progressEl.style.width = '100%';
      if (errors === 0) {
        showToast(`${sets.length} séries importées avec succès`, 'success');
        resultEl.innerHTML = `<span class="ok">✓ Import terminé — ${sets.length} séries.</span>`;
      } else {
        resultEl.innerHTML = `<span class="warn">Import terminé avec ${errors} erreur(s). Vérifier la console.</span>`;
      }

      await loadExerciseList();
      await loadWorkoutChart();
      await loadDashboard();
    },
    error: err => {
      showToast('Erreur de parsing CSV', 'error');
      statusEl.textContent = `Erreur : ${err.message}`;
    },
  });
}

// ============================================================
// WORKOUT CHART
// ============================================================
async function loadExerciseList() {
  const { data } = await db
    .from('workout_sets')
    .select('exercise_title')
    .eq('set_type', 'normal')
    .order('exercise_title');

  if (!data) return;
  allExercises = [...new Set(data.map(d => d.exercise_title))].sort();

  const sel = document.getElementById('exercise-select');
  const cur = sel.value;
  sel.innerHTML = '<option value="">— Choisir un exercice —</option>' +
    allExercises.map(ex => `<option value="${ex}">${ex}</option>`).join('');
  if (cur && allExercises.includes(cur)) sel.value = cur;
}

document.addEventListener('DOMContentLoaded', () => {
  const sel = document.getElementById('exercise-select');
  if (sel) sel.addEventListener('change', () => loadWorkoutChart(sel.value));

  const mSel = document.getElementById('measurement-select');
  if (mSel) mSel.addEventListener('change', () => loadMeasurementsChart(mSel.value));

  const nSel = document.getElementById('nutrition-select');
  if (nSel) nSel.addEventListener('change', () => loadNutritionChart(nSel.value));
});

async function loadWorkoutChart(exercise) {
  const sel = document.getElementById('exercise-select');
  const ex  = exercise || (sel && sel.value) || allExercises[0] || null;
  const noDataEl = document.getElementById('workout-chart-nodata');

  if (!ex) {
    noDataEl && (noDataEl.style.display = 'flex');
    return;
  }

  const { data, error } = await db
    .from('workout_sets')
    .select('workout_date, weight_kg, reps, set_type')
    .eq('exercise_title', ex)
    .eq('set_type', 'normal')
    .not('weight_kg', 'is', null)
    .not('reps', 'is', null)
    .order('workout_date');

  if (error || !data || !data.length) {
    noDataEl && (noDataEl.style.display = 'flex');
    return;
  }
  noDataEl && (noDataEl.style.display = 'none');

  // Regrouper par date
  const byDate = {};
  data.forEach(r => {
    const d = r.workout_date;
    const e1rm = r.weight_kg * (1 + r.reps / 30); // Formule d'Epley
    if (!byDate[d]) byDate[d] = { maxWeight: 0, maxE1RM: 0 };
    byDate[d].maxWeight = Math.max(byDate[d].maxWeight, r.weight_kg);
    byDate[d].maxE1RM   = Math.max(byDate[d].maxE1RM, e1rm);
  });

  const labels    = Object.keys(byDate).sort();
  const weights   = labels.map(d => byDate[d].maxWeight);
  const e1rms     = labels.map(d => +byDate[d].maxE1RM.toFixed(1));

  const ctx = document.getElementById('workout-chart').getContext('2d');
  if (workoutChart) workoutChart.destroy();

  workoutChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels.map(formatDate),
      datasets: [
        {
          label: 'Poids max (kg)',
          data: weights,
          borderColor: CHART_COLORS.primary,
          backgroundColor: hexAlpha(CHART_COLORS.primary, 0.08),
          borderWidth: 2,
          pointBackgroundColor: CHART_COLORS.primary,
          pointRadius: 4,
          pointHoverRadius: 7,
          tension: 0.35,
          fill: true,
        },
        {
          label: '1RM estimé · Epley (kg)',
          data: e1rms,
          borderColor: CHART_COLORS.purple,
          backgroundColor: 'transparent',
          borderWidth: 2,
          borderDash: [6, 4],
          pointBackgroundColor: CHART_COLORS.purple,
          pointRadius: 3,
          pointHoverRadius: 6,
          tension: 0.35,
          fill: false,
        },
      ],
    },
    options: buildChartOptions(),
  });
}

// ============================================================
// MEASUREMENTS CHART
// ============================================================
async function loadMeasurementsChart(metric) {
  const sel   = document.getElementById('measurement-select');
  const field = metric || (sel && sel.value) || 'weight_kg';
  const noDataEl = document.getElementById('measurements-chart-nodata');

  const { data, error } = await db
    .from('measurements')
    .select(`date, ${field}`)
    .not(field, 'is', null)
    .order('date');

  if (error || !data || !data.length) {
    noDataEl && (noDataEl.style.display = 'flex');
    return;
  }
  noDataEl && (noDataEl.style.display = 'none');

  const labels = data.map(d => formatDate(d.date));
  const values = data.map(d => d[field]);

  const ctx = document.getElementById('measurements-chart').getContext('2d');
  if (measurementsChart) measurementsChart.destroy();

  measurementsChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: MEASURE_LABELS[field] || field,
        data: values,
        borderColor: CHART_COLORS.primary,
        backgroundColor: hexAlpha(CHART_COLORS.primary, 0.09),
        borderWidth: 2,
        pointBackgroundColor: CHART_COLORS.primary,
        pointRadius: 5,
        pointHoverRadius: 8,
        tension: 0.35,
        fill: true,
      }],
    },
    options: buildChartOptions(),
  });
}

// ============================================================
// NUTRITION CHART
// ============================================================
async function loadNutritionChart(macro) {
  const sel   = document.getElementById('nutrition-select');
  const field = macro || (sel && sel.value) || 'calories';
  const noDataEl = document.getElementById('nutrition-chart-nodata');

  const { data, error } = await db
    .from('nutrition')
    .select('date, calories, protein_g, carbs_g, fat_g')
    .order('date');

  if (error || !data || !data.length) {
    noDataEl && (noDataEl.style.display = 'flex');
    return;
  }
  noDataEl && (noDataEl.style.display = 'none');

  const labels = data.map(d => formatDate(d.date));
  const values = data.map(d => d[field] ?? 0);

  // Moyenne mobile 7 jours
  const movAvg = values.map((_, i) => {
    const win = values.slice(Math.max(0, i - 6), i + 1);
    return +(win.reduce((a, b) => a + b, 0) / win.length).toFixed(1);
  });

  const colorMap = { calories: CHART_COLORS.orange, protein_g: CHART_COLORS.primary, carbs_g: CHART_COLORS.yellow, fat_g: CHART_COLORS.purple };
  const color = colorMap[field] || CHART_COLORS.primary;

  const ctx = document.getElementById('nutrition-chart').getContext('2d');
  if (nutritionChart) nutritionChart.destroy();

  nutritionChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: NUTRITION_LABELS[field],
          data: values,
          backgroundColor: hexAlpha(color, 0.25),
          borderColor: color,
          borderWidth: 1,
          borderRadius: 4,
          order: 2,
        },
        {
          label: 'Moy. 7 jours',
          data: movAvg,
          type: 'line',
          borderColor: hexAlpha(color, 0.85),
          backgroundColor: 'transparent',
          borderWidth: 2.5,
          pointRadius: 0,
          tension: 0.4,
          fill: false,
          order: 1,
        },
      ],
    },
    options: buildChartOptions(),
  });
}

// ============================================================
// FORMS
// ============================================================
function initForms() {
  // --- Mensurations ---
  const mForm = document.getElementById('measurement-form');
  if (mForm) {
    // Pré-remplir la date d'aujourd'hui
    const dateInput = mForm.querySelector('[name="date"]');
    if (dateInput) dateInput.value = today();

    mForm.addEventListener('submit', async e => {
      e.preventDefault();
      const fd = Object.fromEntries(new FormData(e.target));
      const entry = {
        date:           fd.date,
        weight_kg:      num(fd.weight_kg),
        chest_cm:       num(fd.chest_cm),
        waist_cm:       num(fd.waist_cm),
        hips_cm:        num(fd.hips_cm),
        left_arm_cm:    num(fd.left_arm_cm),
        right_arm_cm:   num(fd.right_arm_cm),
        left_thigh_cm:  num(fd.left_thigh_cm),
        right_thigh_cm: num(fd.right_thigh_cm),
        neck_cm:        num(fd.neck_cm),
        body_fat_pct:   num(fd.body_fat_pct),
        notes:          fd.notes || null,
      };
      // Supprimer les champs null pour ne pas écraser des valeurs existantes
      Object.keys(entry).forEach(k => { if (entry[k] === null && k !== 'notes') delete entry[k]; });
      entry.date = fd.date; // toujours garder la date

      const { error } = await db.from('measurements').upsert(entry, { onConflict: 'date' });
      if (error) { showToast(`Erreur : ${error.message}`, 'error'); return; }
      showToast('Mensuration enregistrée', 'success');
      e.target.reset();
      dateInput.value = today();
      await loadMeasurementsChart();
      await loadDashboard();
    });
  }

  // --- Nutrition ---
  const nForm = document.getElementById('nutrition-form');
  if (nForm) {
    const dateInput = nForm.querySelector('[name="date"]');
    if (dateInput) dateInput.value = today();

    nForm.addEventListener('submit', async e => {
      e.preventDefault();
      const fd = Object.fromEntries(new FormData(e.target));
      const entry = {
        date:      fd.date,
        calories:  fd.calories  ? parseInt(fd.calories)        : null,
        protein_g: fd.protein_g ? parseFloat(fd.protein_g)     : null,
        carbs_g:   fd.carbs_g   ? parseFloat(fd.carbs_g)       : null,
        fat_g:     fd.fat_g     ? parseFloat(fd.fat_g)         : null,
        notes:     fd.notes     || null,
      };
      const { error } = await db.from('nutrition').upsert(entry, { onConflict: 'date' });
      if (error) { showToast(`Erreur : ${error.message}`, 'error'); return; }
      showToast('Nutrition enregistrée', 'success');
      e.target.reset();
      dateInput.value = today();
      await loadNutritionChart();
      await loadDashboard();
    });
  }
}

// ============================================================
// UTILS
// ============================================================
function buildChartOptions() {
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: {
        labels: {
          color: '#94a3b8',
          font: { family: 'Space Grotesk', size: 12 },
          boxWidth: 18,
          padding: 16,
        },
      },
      tooltip: {
        backgroundColor: 'rgba(7,7,20,0.97)',
        titleColor: '#64dcff',
        bodyColor: '#e2e8f0',
        borderColor: 'rgba(100,220,255,0.25)',
        borderWidth: 1,
        padding: 12,
        titleFont: { family: 'Orbitron', size: 11 },
        bodyFont:  { family: 'Space Grotesk', size: 13 },
        cornerRadius: 8,
      },
    },
    scales: {
      x: {
        grid: { color: 'rgba(255,255,255,0.04)' },
        ticks: { color: '#475569', font: { family: 'Space Grotesk', size: 11 }, maxRotation: 45, maxTicksLimit: 12 },
      },
      y: {
        grid: { color: 'rgba(255,255,255,0.04)' },
        ticks: { color: '#475569', font: { family: 'Space Grotesk', size: 11 } },
      },
    },
  };
}

function formatDate(str) {
  const d = new Date(str + (str.length === 10 ? 'T12:00:00' : ''));
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: '2-digit' });
}

function today() {
  return new Date().toISOString().split('T')[0];
}

function num(v) {
  return v && v.trim() !== '' ? parseFloat(v) : null;
}

function hexAlpha(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function showToast(msg, type = 'success') {
  const t = document.createElement('div');
  t.className = `toast toast--${type}`;
  t.textContent = msg;
  document.body.appendChild(t);
  requestAnimationFrame(() => t.classList.add('show'));
  setTimeout(() => {
    t.classList.remove('show');
    setTimeout(() => t.remove(), 400);
  }, 3800);
}
