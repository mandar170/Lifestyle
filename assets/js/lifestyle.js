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

const ACT_COLORS  = { walk:'#22c55e', run:'#ef4444', bike:'#f97316', gym:'#a855f7' };
const ACT_ICONS   = { walk:'🚶', run:'🏃', bike:'🚴', gym:'🏋️' };
const ACT_LABELS  = { walk:'Marche', run:'Course à pied', bike:'Vélo', gym:'Musculation' };
const GYM_LABELS  = { push:'Push', pull:'Pull', legs:'Legs', upper:'Upper', lower:'Lower', full_body:'Full Body' };

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

const HABIT_COLORS = {
  red:'#ef4444', blue:'#3b82f6', green:'#22c55e', yellow:'#facc15',
  slate:'#64748b', purple:'#a855f7', orange:'#f97316', pink:'#ec4899',
  teal:'#14b8a6', cyan:'#64dcff',
};

const C = {
  primary:'#64dcff', purple:'#a855f7', orange:'#f97316', yellow:'#facc15', green:'#22d3ee',
};

// ── State ──────────────────────────────────────────────────
let stepsChart = null, measurementsChart = null, nutritionChart = null, habitTrendChart = null, waterChart = null;
const dashCharts = {};
let journalDate = today();
let journalNoteDate = today();
let actDate = today();
let habits = [], completions = {};
let mealPresets = [];
let substitutes = [];
let subBaseValues = {}; // { mealType: { kcal, prot, gluc, lip, fib } }
let calYear = new Date().getFullYear(), calMonth = new Date().getMonth();
let editingHabitId = null;
let editingPresetId = null;
let dragSrcId = null;

// ── Init ───────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  Chart.defaults.color       = '#64748b';
  Chart.defaults.borderColor = 'rgba(255,255,255,0.05)';
  Chart.defaults.font.family = 'Space Grotesk';

  initTabs();
  initJournal();
  initMeasurementForm();
  initActivityForm();
  initMovementTab();
  initExportTab();
  initCalendar();
  initHabitManager();
  initJournalNotes();
  initWater();

  await Promise.all([loadDashboard(), loadHabits()]);
  loadStepsChart();
  loadMeasurementsChart();
  loadNutritionChart();
  loadWaterChart();
  renderDashCharts();
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
      if (btn.dataset.tab === 'dashboard')  renderDashCharts();
      if (btn.dataset.tab === 'calendrier') loadCalendar();
      if (btn.dataset.tab === 'habitudes')  renderTrendChart();
      if (btn.dataset.tab === 'suivi') {
        const activeSuivi = document.querySelector('.suivi-btn.active')?.dataset.suivi;
        if (activeSuivi === 'mouvement') loadMovementData();
      }
    });
  });

  document.querySelectorAll('.suivi-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.suivi-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('#panel-suivi [id^="suivi-"]').forEach(p => p.style.display = 'none');
      btn.classList.add('active');
      document.getElementById(`suivi-${btn.dataset.suivi}`).style.display = '';
      setTimeout(() => window.dispatchEvent(new Event('resize')), 60);
      if (btn.dataset.suivi === 'mouvement')  loadMovementData();
      if (btn.dataset.suivi === 'nutrition')  loadNutritionWater();
      if (btn.dataset.suivi === 'journal')    loadJournalNote();
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

// ── Journal (nutrition only) ───────────────────────────────
function initJournal() {
  const dateInput = document.getElementById('j-date');
  dateInput.value = journalDate;
  document.getElementById('j-prev').addEventListener('click', () => changeJournalDate(-1));
  document.getElementById('j-next').addEventListener('click', () => changeJournalDate(1));
  document.getElementById('j-today').addEventListener('click', () => {
    journalDate = today(); dateInput.value = journalDate; loadJournalData();
  });
  dateInput.addEventListener('change', () => { journalDate = dateInput.value; loadJournalData(); });
  buildMealCards();
  loadJournalData();
  loadMealPresets();
  loadSubstitutes();
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
        <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;">
          <button class="btn btn--ghost btn--sm preset-pick-btn" onclick="togglePresetPicker('${key}')">📋 Modèle</button>
          <button class="btn btn--ghost btn--sm preset-pick-btn" onclick="toggleSubstitutePicker('${key}')">💊 Substitut</button>
        </div>
        <div class="preset-picker" id="pp-${key}"></div>
        <div class="preset-picker" id="sp-${key}"></div>
        <div class="sub-badge" id="sub-badge-${key}" style="display:none;">
          💊 <span id="sub-name-${key}"></span>
          <div class="sub-toggle" id="sub-toggle-${key}" onclick="toggleSubIncluded('${key}')" title="Macros déjà comprises dans le repas">✓</div>
          <span style="font-size:10px;color:var(--text-dim);">comprises</span>
          <button onclick="clearSubstitute('${key}')" style="background:none;border:none;color:rgba(248,113,113,0.5);cursor:pointer;font-size:13px;padding:0 2px;margin-left:auto;" title="Retirer">✕</button>
        </div>
        <input type="hidden" id="sub-id-${key}" value="" />
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
  const { data: meals } = await db.from('meals').select('*').eq('date', journalDate);
  renderMealCards(meals || []);
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
      // Substitut
      const subId = m.substitute_id || '';
      document.getElementById(`sub-id-${key}`).value = subId;
      if (subId) {
        const sub = substitutes.find(s => s.id === subId);
        showSubBadge(key, sub?.name || '—', !!m.substitute_included);
        // Reconstruire subBaseValues pour que le toggle checkbox fonctionne
        if (sub) {
          if (!m.substitute_included) {
            // Champs = base + sub → base = champs - sub
            subBaseValues[key] = {
              kcal: (m.calories  || 0) - (sub.calories  || 0),
              prot: (m.protein_g || 0) - (sub.protein_g || 0),
              gluc: (m.carbs_g   || 0) - (sub.carbs_g   || 0),
              lip:  (m.fat_g     || 0) - (sub.fat_g     || 0),
              fib:  (m.fiber_g   || 0) - (sub.fiber_g   || 0),
            };
          } else {
            // Champs = base uniquement
            subBaseValues[key] = { kcal: m.calories||0, prot: m.protein_g||0, gluc: m.carbs_g||0, lip: m.fat_g||0, fib: m.fiber_g||0 };
          }
        }
      } else { hideSubBadge(key); delete subBaseValues[key]; }
    } else {
      document.getElementById(`desc-${key}`).value = '';
      ['kcal','prot','gluc','lip','fib'].forEach(f => { document.getElementById(`${f}-${key}`).value = ''; });
      document.getElementById(`sub-id-${key}`).value = '';
      card.classList.remove('meal-card--done');
      chk.classList.remove('meal-check--done');
      tag.textContent = '— kcal';
      hideSubBadge(key);
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
  const subId    = document.getElementById(`sub-id-${mealType}`)?.value || null;
  const included = !!(subId && document.getElementById(`sub-toggle-${mealType}`)?.classList.contains('sub-toggle--on'));

  // Les champs affichent déjà le bon total (base + substitut si non comprises)
  const entry = {
    date:                journalDate,
    meal_type:           mealType,
    done:                document.getElementById(`mc-${mealType}`).classList.contains('meal-card--done'),
    description:         document.getElementById(`desc-${mealType}`).value.trim() || null,
    calories:            numI(document.getElementById(`kcal-${mealType}`).value),
    protein_g:           numF(document.getElementById(`prot-${mealType}`).value),
    carbs_g:             numF(document.getElementById(`gluc-${mealType}`).value),
    fat_g:               numF(document.getElementById(`lip-${mealType}`).value),
    fiber_g:             numF(document.getElementById(`fib-${mealType}`).value),
    substitute_id:       subId || null,
    substitute_included: included,
  };
  const { error } = await db.from('meals').upsert(entry, { onConflict: 'date,meal_type' });
  if (error) { showToast(`Erreur : ${error.message}`, 'error'); return; }
  showToast('Repas enregistré', 'success');
  await loadJournalData();
  syncNutritionTable(journalDate);
  loadNutritionChart(); loadDashboard();
}

// ── Substituts RNPC ────────────────────────────────────────
async function loadSubstitutes() {
  const { data } = await db.from('meal_substitutes').select('*').order('name');
  substitutes = data || [];
  renderSubstituteList();
}

function toggleSubstitutePicker(mealType) {
  const picker = document.getElementById(`sp-${mealType}`);
  if (!picker) return;
  const isOpen = picker.classList.contains('preset-picker--open');
  document.querySelectorAll('.preset-picker').forEach(p => p.classList.remove('preset-picker--open'));
  if (isOpen) return;
  picker.innerHTML = substitutes.length
    ? substitutes.map(s => `
        <div class="preset-item" onclick="applySubstitute('${s.id}','${mealType}')">
          <span class="preset-item__name">${s.name}</span>
          <span class="preset-item__meta">${[s.calories?s.calories+'kcal':null, s.protein_g?s.protein_g+'g prot':null].filter(Boolean).join(' · ')}</span>
        </div>`).join('')
    : '<p class="preset-list-empty">Aucun substitut enregistré.</p>';
  picker.classList.add('preset-picker--open');
}

function applySubstitute(subId, mealType) {
  const s = substitutes.find(x => x.id === subId);
  if (!s) return;
  // Sauvegarder les valeurs de base actuelles des champs
  subBaseValues[mealType] = {
    kcal: parseFloat(document.getElementById(`kcal-${mealType}`)?.value) || 0,
    prot: parseFloat(document.getElementById(`prot-${mealType}`)?.value) || 0,
    gluc: parseFloat(document.getElementById(`gluc-${mealType}`)?.value) || 0,
    lip:  parseFloat(document.getElementById(`lip-${mealType}`)?.value)  || 0,
    fib:  parseFloat(document.getElementById(`fib-${mealType}`)?.value)  || 0,
  };
  document.getElementById(`sub-id-${mealType}`).value = subId;
  showSubBadge(mealType, s.name);
  document.getElementById(`sp-${mealType}`).classList.remove('preset-picker--open');
  updateFieldsFromSubstitute(mealType);
}

function updateFieldsFromSubstitute(mealType) {
  const subId    = document.getElementById(`sub-id-${mealType}`)?.value;
  const included = document.getElementById(`sub-toggle-${mealType}`)?.classList.contains('sub-toggle--on');
  const sub      = subId ? substitutes.find(s => s.id === subId) : null;
  const base     = subBaseValues[mealType];
  if (!sub || !base) return;
  const fmt = v => v ? (Number.isInteger(v) ? String(v) : v.toFixed(1)) : '';
  const set = (field, baseVal, subVal) => {
    const el = document.getElementById(`${field}-${mealType}`);
    if (!el) return;
    el.value = included ? fmt(baseVal) : fmt((baseVal || 0) + (subVal || 0));
  };
  set('kcal', base.kcal, sub.calories);
  set('prot', base.prot, sub.protein_g);
  set('gluc', base.gluc, sub.carbs_g);
  set('lip',  base.lip,  sub.fat_g);
  set('fib',  base.fib,  sub.fiber_g);
}

function showSubBadge(mealType, name, included) {
  const badge  = document.getElementById(`sub-badge-${mealType}`);
  const nameEl = document.getElementById(`sub-name-${mealType}`);
  const toggle = document.getElementById(`sub-toggle-${mealType}`);
  if (badge)  badge.style.display = 'flex';
  if (nameEl) nameEl.textContent  = name;
  if (toggle && included !== undefined) toggle.classList.toggle('sub-toggle--on', !!included);
}

function toggleSubIncluded(mealType) {
  const toggle = document.getElementById(`sub-toggle-${mealType}`);
  if (!toggle) return;
  toggle.classList.toggle('sub-toggle--on');
  updateFieldsFromSubstitute(mealType);
}

function hideSubBadge(mealType) {
  const badge = document.getElementById(`sub-badge-${mealType}`);
  if (badge) badge.style.display = 'none';
}

function clearSubstitute(mealType) {
  // Restaurer les valeurs de base dans les champs
  const base = subBaseValues[mealType];
  if (base) {
    const fmt = v => v ? (Number.isInteger(v) ? String(v) : v.toFixed(1)) : '';
    ['kcal','prot','gluc','lip','fib'].forEach(f => {
      const el = document.getElementById(`${f}-${mealType}`);
      if (el) el.value = fmt(base[f]);
    });
    delete subBaseValues[mealType];
  }
  document.getElementById(`sub-id-${mealType}`).value = '';
  hideSubBadge(mealType);
}

async function saveMealSubstitute() {
  const name = document.getElementById('ns-name').value.trim();
  if (!name) { showToast('Nom requis', 'error'); return; }
  const entry = {
    name,
    calories:  numI(document.getElementById('ns-kcal').value),
    protein_g: numF(document.getElementById('ns-prot').value),
    carbs_g:   numF(document.getElementById('ns-gluc').value),
    fat_g:     numF(document.getElementById('ns-lip').value),
    fiber_g:   numF(document.getElementById('ns-fib').value),
  };
  const { error } = await db.from('meal_substitutes').insert(entry);
  if (error) { showToast('Erreur : ' + error.message, 'error'); return; }
  showToast('Substitut enregistré', 'success');
  ['ns-name','ns-kcal','ns-prot','ns-gluc','ns-lip','ns-fib'].forEach(id => { document.getElementById(id).value = ''; });
  await loadSubstitutes();
}

async function deleteMealSubstitute(id) {
  if (!confirm('Supprimer ce substitut ?')) return;
  const { error } = await db.from('meal_substitutes').delete().eq('id', id);
  if (error) { showToast('Erreur', 'error'); return; }
  showToast('Substitut supprimé', 'success');
  await loadSubstitutes();
}

function renderSubstituteList() {
  const container = document.getElementById('substitute-list');
  if (!container) return;
  if (!substitutes.length) {
    container.innerHTML = '<p class="preset-list-empty">Aucun substitut enregistré — tu pourras les ajouter une fois le tableau reçu.</p>';
    return;
  }
  container.innerHTML = substitutes.map(s => {
    const macros = [
      s.calories  ? s.calories+'kcal'    : null,
      s.protein_g ? s.protein_g+'g prot' : null,
      s.carbs_g   ? s.carbs_g+'g gluc'   : null,
      s.fat_g     ? s.fat_g+'g lip'      : null,
      s.fiber_g   ? s.fiber_g+'g fib'    : null,
    ].filter(Boolean).join(' · ');
    return `<div class="preset-item">
      <div style="flex:1;min-width:0;">
        <div class="preset-item__name">${s.name}</div>
        ${macros ? `<div class="preset-item__meta" style="margin-top:2px;">${macros}</div>` : ''}
      </div>
      <button class="preset-item__del" onclick="deleteMealSubstitute('${s.id}')" title="Supprimer">✕</button>
    </div>`;
  }).join('');
}

// ── Meal presets ───────────────────────────────────────────
const PRESET_TYPE_LABELS = {
  breakfast:'Petit déj.', morning_snack:'Collation mat.', lunch:'Déjeuner',
  afternoon_snack:'Collation a-m', dinner:'Dîner', evening_snack:'Collation soir',
};

async function loadMealPresets() {
  const { data } = await db.from('meal_presets').select('*').order('name');
  mealPresets = data || [];
  renderPresetList();
}

function togglePresetPicker(mealType) {
  const picker = document.getElementById(`pp-${mealType}`);
  if (!picker) return;
  const isOpen = picker.classList.contains('preset-picker--open');
  document.querySelectorAll('.preset-picker').forEach(p => p.classList.remove('preset-picker--open'));
  if (isOpen) return;
  const matches = mealPresets.filter(p => !p.meal_type || p.meal_type === mealType);
  picker.innerHTML = matches.length
    ? matches.map(p => `
        <div class="preset-item" onclick="applyPreset('${p.id}','${mealType}')">
          <span class="preset-item__name">${p.name}</span>
          <span class="preset-item__meta">${[p.calories ? p.calories+'kcal' : null, p.protein_g ? p.protein_g+'g prot' : null].filter(Boolean).join(' · ')}</span>
        </div>`).join('')
    : '<p class="preset-list-empty">Aucun modèle pour ce repas.</p>';
  picker.classList.add('preset-picker--open');
}

function applyPreset(presetId, mealType) {
  const p = mealPresets.find(x => x.id === presetId);
  if (!p) return;
  if (p.description != null) document.getElementById(`desc-${mealType}`).value = p.description;
  if (p.calories   != null) document.getElementById(`kcal-${mealType}`).value = p.calories;
  if (p.protein_g  != null) document.getElementById(`prot-${mealType}`).value = p.protein_g;
  if (p.carbs_g    != null) document.getElementById(`gluc-${mealType}`).value = p.carbs_g;
  if (p.fat_g      != null) document.getElementById(`lip-${mealType}`).value  = p.fat_g;
  if (p.fiber_g    != null) document.getElementById(`fib-${mealType}`).value  = p.fiber_g;
  document.getElementById(`pp-${mealType}`).classList.remove('preset-picker--open');
}

async function saveMealPreset() {
  const name = document.getElementById('np-name').value.trim();
  if (!name) { showToast('Nom requis', 'error'); return; }
  const entry = {
    name,
    meal_type:   document.getElementById('np-type').value || null,
    description: document.getElementById('np-desc').value.trim() || null,
    calories:    numI(document.getElementById('np-kcal').value),
    protein_g:   numF(document.getElementById('np-prot').value),
    carbs_g:     numF(document.getElementById('np-gluc').value),
    fat_g:       numF(document.getElementById('np-lip').value),
    fiber_g:     numF(document.getElementById('np-fib').value),
  };
  const { error } = await db.from('meal_presets').insert(entry);
  if (error) { showToast('Erreur : ' + error.message, 'error'); return; }
  showToast('Modèle enregistré', 'success');
  ['np-name','np-desc','np-kcal','np-prot','np-gluc','np-lip','np-fib'].forEach(id => { document.getElementById(id).value = ''; });
  document.getElementById('np-type').value = '';
  await loadMealPresets();
}

async function deleteMealPreset(id) {
  if (!confirm('Supprimer ce modèle ?')) return;
  const { error } = await db.from('meal_presets').delete().eq('id', id);
  if (error) { showToast('Erreur', 'error'); return; }
  showToast('Modèle supprimé', 'success');
  await loadMealPresets();
}

function renderPresetList() {
  const container = document.getElementById('preset-list');
  if (!container) return;
  if (!mealPresets.length) {
    container.innerHTML = '<p class="preset-list-empty">Aucun modèle enregistré.</p>';
    return;
  }
  container.innerHTML = mealPresets.map(p => {
    const macros = [
      p.calories  ? p.calories+'kcal'    : null,
      p.protein_g ? p.protein_g+'g prot' : null,
      p.carbs_g   ? p.carbs_g+'g gluc'   : null,
      p.fat_g     ? p.fat_g+'g lip'      : null,
      p.fiber_g   ? p.fiber_g+'g fib'    : null,
    ].filter(Boolean).join(' · ');
    const isEditing = editingPresetId === p.id;
    const esc = s => String(s ?? '').replace(/"/g, '&quot;');
    const editForm = isEditing ? `
      <div style="width:100%;display:flex;flex-direction:column;gap:8px;padding:8px 0 4px;">
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <input type="text" id="pe-name-${p.id}" class="np-input" value="${esc(p.name)}" placeholder="Nom" style="flex:1;min-width:120px;" />
          <select id="pe-type-${p.id}" class="np-input" style="width:auto;flex:0 0 auto;">
            <option value="">Tous les repas</option>
            <option value="breakfast"${p.meal_type==='breakfast'?' selected':''}>Petit déjeuner</option>
            <option value="morning_snack"${p.meal_type==='morning_snack'?' selected':''}>Collation matin</option>
            <option value="lunch"${p.meal_type==='lunch'?' selected':''}>Déjeuner</option>
            <option value="afternoon_snack"${p.meal_type==='afternoon_snack'?' selected':''}>Collation après-midi</option>
            <option value="dinner"${p.meal_type==='dinner'?' selected':''}>Dîner</option>
            <option value="evening_snack"${p.meal_type==='evening_snack'?' selected':''}>Collation soir</option>
          </select>
        </div>
        <input type="text" id="pe-desc-${p.id}" class="np-input" value="${esc(p.description)}" placeholder="Contenu / description…" />
        <div class="meal-macros-labels"><span>kcal</span><span>Prot (g)</span><span>Gluc (g)</span><span>Lip (g)</span><span>Fib (g)</span></div>
        <div class="meal-macros">
          <input type="number" id="pe-kcal-${p.id}" class="np-input" style="padding:6px 4px;text-align:center;" value="${p.calories??''}" min="0" />
          <input type="number" id="pe-prot-${p.id}" class="np-input" style="padding:6px 4px;text-align:center;" value="${p.protein_g??''}" min="0" step="0.1" />
          <input type="number" id="pe-gluc-${p.id}" class="np-input" style="padding:6px 4px;text-align:center;" value="${p.carbs_g??''}" min="0" step="0.1" />
          <input type="number" id="pe-lip-${p.id}"  class="np-input" style="padding:6px 4px;text-align:center;" value="${p.fat_g??''}" min="0" step="0.1" />
          <input type="number" id="pe-fib-${p.id}"  class="np-input" style="padding:6px 4px;text-align:center;" value="${p.fiber_g??''}" min="0" step="0.1" />
        </div>
        <div style="display:flex;gap:6px;">
          <button class="btn btn--primary btn--sm" onclick="savePresetEdit('${p.id}')">Sauvegarder</button>
          <button class="btn btn--ghost btn--sm" onclick="cancelPresetEdit()">Annuler</button>
        </div>
      </div>` : '';
    return `<div class="preset-item" style="flex-wrap:wrap;">
      <div style="flex:1;min-width:0;">
        <div class="preset-item__name">${p.name}${p.meal_type ? ` <span style="font-size:10px;color:var(--text-dim);">(${PRESET_TYPE_LABELS[p.meal_type]||p.meal_type})</span>` : ''}</div>
        ${p.description ? `<div style="font-size:11px;color:var(--text-dim);margin-top:2px;">${p.description}</div>` : ''}
        ${macros ? `<div class="preset-item__meta" style="margin-top:3px;">${macros}</div>` : ''}
      </div>
      <button class="habit-manage-btn habit-manage-btn--edit" onclick="startPresetEdit('${p.id}')" title="Modifier">✏</button>
      <button class="preset-item__del" onclick="deleteMealPreset('${p.id}')" title="Supprimer">✕</button>
      ${editForm}
    </div>`;
  }).join('');
}

function startPresetEdit(id) { editingPresetId = id; renderPresetList(); }
function cancelPresetEdit()  { editingPresetId = null; renderPresetList(); }

async function savePresetEdit(id) {
  const name = document.getElementById(`pe-name-${id}`)?.value.trim();
  if (!name) { showToast('Nom requis', 'error'); return; }
  const entry = {
    name,
    meal_type:   document.getElementById(`pe-type-${id}`).value || null,
    description: document.getElementById(`pe-desc-${id}`).value.trim() || null,
    calories:    numI(document.getElementById(`pe-kcal-${id}`).value),
    protein_g:   numF(document.getElementById(`pe-prot-${id}`).value),
    carbs_g:     numF(document.getElementById(`pe-gluc-${id}`).value),
    fat_g:       numF(document.getElementById(`pe-lip-${id}`).value),
    fiber_g:     numF(document.getElementById(`pe-fib-${id}`).value),
  };
  const { error } = await db.from('meal_presets').update(entry).eq('id', id);
  if (error) { showToast('Erreur : ' + error.message, 'error'); return; }
  showToast('Modèle mis à jour', 'success');
  editingPresetId = null;
  await loadMealPresets();
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
  const [mealsRes, actsRes] = await Promise.all([
    db.from('meals').select('date, done, calories, meal_type').gte('date', first).lte('date', last),
    db.from('activities').select('date, type').gte('date', first).lte('date', last),
  ]);
  renderCalendar(mealsRes.data || [], actsRes.data || []);
}

function renderCalendar(meals, acts) {
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
    const dayActs   = acts.filter(a => a.date === dateStr);
    const totalKcal = dayMeals.reduce((s, m) => s + (m.calories || 0), 0);
    const mealDots  = dayMeals.map(m => `<div class="cal-dot" style="background:${MEAL_COLORS[m.meal_type]||C.primary};"></div>`).join('');
    const actDots   = dayActs.map(a => `<div class="cal-dot cal-dot--act" style="background:${ACT_COLORS[a.type]||'#888'};"></div>`).join('');
    html += `<div class="cal-cell${isToday ? ' cal-cell--today' : ''}" onclick="goToJournalDate('${dateStr}')">
      <div class="cal-cell__day">${day}</div>
      ${mealDots ? `<div class="cal-cell__dots">${mealDots}</div>` : ''}
      ${actDots  ? `<div class="cal-cell__dots" style="margin-top:1px;">${actDots}</div>` : ''}
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
  renderHabitStats();
  renderHabitGrid();
  renderHabitManageList();
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

// ── Habit icon helper ──────────────────────────────────────
function habitIconHtml(h, size = 18) {
  const icon = h.icon?.trim();
  if (!icon) return h.name.slice(0, 1).toUpperCase();
  // Iconify format: "prefix:name" e.g. "mdi:run"
  if (icon.includes(':')) return `<iconify-icon icon="${icon}" width="${size}" height="${size}" style="display:flex;align-items:center;justify-content:center;"></iconify-icon>`;
  return icon.slice(0, 2); // emoji
}

// ── Color picker HTML helper ───────────────────────────────
function colorPickerHtml(pickerId, activeColor) {
  const colors = [
    ['cyan','#64dcff'],['blue','#3b82f6'],['green','#22c55e'],['yellow','#facc15'],
    ['orange','#f97316'],['red','#ef4444'],['purple','#a855f7'],['pink','#ec4899'],
    ['teal','#14b8a6'],['slate','#64748b'],
  ];
  return `<div class="color-picker" id="${pickerId}">${colors.map(([n, h]) =>
    `<div class="cp-color${activeColor === n ? ' cp-color--active' : ''}" data-color="${n}" style="background:${h};" title="${n}" onclick="pickColor('${pickerId}',this)"></div>`
  ).join('')}</div>`;
}

function pickColor(pickerId, el) {
  document.querySelectorAll(`#${pickerId} .cp-color`).forEach(e => e.classList.remove('cp-color--active'));
  el.classList.add('cp-color--active');
}

// ── HabitKit-style grid ────────────────────────────────────
function renderHabitGrid() {
  const container = document.getElementById('habit-grid');
  if (!container) return;
  const active   = habits.filter(h => !h.archived);
  const todayStr = today();

  if (!active.length) {
    container.innerHTML = '<p style="color:var(--text-dim);font-size:13px;text-align:center;padding:32px 0;">Aucun habit actif — importez un fichier HabitKit.</p>';
    setEl('h-today-detail', '');
    return;
  }

  const N = 7;
  const days = [];
  for (let i = N - 1; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    days.push(d.toISOString().split('T')[0]);
  }
  const DAY_FR = ['Di','Lu','Ma','Me','Je','Ve','Sa'];

  // Header row
  let html = '<div class="hk-inner"><div class="hk-hdr"><div class="hk-hdr__spacer"></div><div class="hk-hdr__days">';
  days.forEach((d, i) => {
    const dt = new Date(d + 'T12:00:00');
    const isToday  = d === todayStr;
    const isOlder  = i < N - 4;
    const allDoneDay = active.length > 0 && active.every(h => completions[h.id]?.has(d));
    const someDay    = !allDoneDay && active.some(h => completions[h.id]?.has(d));
    const cellStyle  = allDoneDay
      ? `background:${hexA(C.primary,0.3)};border-color:${C.primary};color:${C.primary};`
      : someDay
        ? `background:rgba(255,255,255,0.03);border-color:rgba(255,255,255,0.25);color:rgba(255,255,255,0.35);`
        : `background:rgba(255,255,255,0.02);border-color:rgba(255,255,255,0.1);`;
    html += `<div class="hk-hdr__day${isToday ? ' hk-hdr__day--today' : ''}${isOlder ? ' hk-day--older' : ''}">
      <div>${DAY_FR[dt.getDay()]}</div>
      <div class="hk-hdr__num">${dt.getDate()}</div>
      <div class="hk-day-toggle" style="${cellStyle}" onclick="toggleAllDay('${d}',event)" title="Tout cocher / décocher">${allDoneDay ? '✓' : someDay ? '–' : ''}</div>
    </div>`;
  });
  html += '</div></div>';

  // Habit rows
  active.forEach(h => {
    const color = HABIT_COLORS[h.color] || C.primary;
    html += `<div class="hk-row">
      <div class="hk-icon" style="background:${hexA(color,0.15)};border-color:${hexA(color,0.35)};color:${color};font-size:17px;">${habitIconHtml(h, 17)}</div>
      <div class="hk-name" title="${h.name}">${h.name}</div>
      <div class="hk-days">`;
    days.forEach((d, i) => {
      const done    = completions[h.id]?.has(d);
      const isToday = d === todayStr;
      const isOlder = i < N - 4;
      html += `<div class="hk-cell${done ? ' hk-cell--done' : ' hk-cell--empty'}${isToday ? ' hk-cell--today' : ''}${isOlder ? ' hk-day--older' : ''}"
        style="${done
          ? `background:${hexA(color,0.4)};border-color:${color};color:${color};`
          : `background:rgba(255,255,255,0.02);border-color:${hexA(color,0.2)};`}"
        onclick="toggleCompletion('${h.id}','${d}')"
        title="${h.name} · ${formatDateShort(d)}">${done ? '✓' : ''}</div>`;
    });
    html += '</div></div>';
  });
  html += '</div>';

  container.innerHTML = html;

  const done = active.filter(h => completions[h.id]?.has(todayStr)).length;
  setEl('h-today-detail', `${done}/${active.length} aujourd'hui`);
  setEl('h-today', `${done}/${active.length}`);
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

function renderTrendChart() {
  const noData = document.getElementById('habit-chart-nodata');
  const active = habits.filter(h => !h.archived);
  if (!active.length) { if (noData) noData.style.display = 'flex'; return; }
  if (noData) noData.style.display = 'none';

  const days   = getLast30Days();
  const data   = days.map(d => active.filter(h => completions[h.id]?.has(d)).length);
  const total  = active.length;
  const labels = days.map(d => formatDateShort(d));
  const movAvg = data.map((_, i) => {
    const w = data.slice(Math.max(0, i - 6), i + 1);
    return Math.round(w.reduce((a, b) => a + b, 0) / w.length * 10) / 10;
  });
  const bgColors = data.map(v => hexA(C.primary, v >= total ? 0.55 : 0.25));
  const bdColors = data.map(v => v >= total ? C.primary : hexA(C.primary, 0.45));

  if (habitTrendChart) {
    habitTrendChart.data.labels = labels;
    habitTrendChart.data.datasets[0].data = data;
    habitTrendChart.data.datasets[0].backgroundColor = bgColors;
    habitTrendChart.data.datasets[0].borderColor = bdColors;
    habitTrendChart.data.datasets[1].data = Array(days.length).fill(total);
    habitTrendChart.data.datasets[1].label = `Objectif (${total})`;
    habitTrendChart.data.datasets[2].data = movAvg;
    habitTrendChart.update('none');
    return;
  }

  const ctx = document.getElementById('habit-trend-chart').getContext('2d');
  habitTrendChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label: 'Habits complétés', data, backgroundColor: bgColors, borderColor: bdColors, borderWidth: 1, borderRadius: 4, order: 3 },
        { label: `Objectif (${total})`, data: Array(days.length).fill(total), type: 'line', borderColor: hexA(C.purple, 0.65), borderWidth: 1.5, borderDash: [6, 4], pointRadius: 0, fill: false, order: 1 },
        { label: 'Moy. 7 jours', data: movAvg, type: 'line', borderColor: C.orange, borderWidth: 2, pointRadius: 0, fill: false, tension: 0.4, order: 2 },
      ],
    },
    options: chartOpts(),
  });
}

async function toggleCompletion(habitId, date) {
  date = date || today();
  const isDone  = completions[habitId]?.has(date);
  const compId  = `${habitId.slice(0,32)}_${date}`;
  const { error } = await db.from('habit_completions').upsert(
    { id:compId, habit_id:habitId, date, amount_of_completions: isDone ? 0 : 1 },
    { onConflict:'habit_id,date' }
  );
  if (error) { showToast('Erreur mise à jour', 'error'); return; }
  if (isDone) completions[habitId]?.delete(date);
  else { if (!completions[habitId]) completions[habitId] = new Set(); completions[habitId].add(date); }
  renderHabitGrid();
  renderHabitStats();
  renderTrendChart();
}

async function toggleAllDay(date, event) {
  if (event) event.preventDefault();
  const active = habits.filter(h => !h.archived);
  const allDone = active.every(h => completions[h.id]?.has(date));
  const toToggle = active.filter(h => allDone ? completions[h.id]?.has(date) : !completions[h.id]?.has(date));
  if (!toToggle.length) { renderHabitGrid(); return; }

  const upserts = toToggle.map(h => ({
    id: `${h.id.slice(0, 32)}_${date}`,
    habit_id: h.id,
    date,
    amount_of_completions: allDone ? 0 : 1,
  }));
  const { error } = await db.from('habit_completions').upsert(upserts, { onConflict: 'habit_id,date' });
  if (error) { showToast('Erreur', 'error'); return; }
  for (const h of toToggle) {
    if (allDone) completions[h.id]?.delete(date);
    else { if (!completions[h.id]) completions[h.id] = new Set(); completions[h.id].add(date); }
  }
  renderHabitGrid();
  renderHabitStats();
  renderTrendChart();
}

// ── Habit manager (add / edit / delete / reorder) ─────────
let selectedHabitColor = 'cyan';

function initHabitManager() {
  // Add-form color picker (static in HTML)
  document.querySelectorAll('#habit-color-picker .cp-color').forEach(el => {
    el.addEventListener('click', () => {
      document.querySelectorAll('#habit-color-picker .cp-color').forEach(e => e.classList.remove('cp-color--active'));
      el.classList.add('cp-color--active');
      selectedHabitColor = el.dataset.color;
    });
  });

  const addBtn = document.getElementById('add-habit-btn');
  const nameEl = document.getElementById('new-habit-name');
  if (!addBtn) return;
  addBtn.addEventListener('click', () => addHabit());
  nameEl.addEventListener('keydown', e => { if (e.key === 'Enter') addHabit(); });
}

async function addHabit() {
  const nameEl = document.getElementById('new-habit-name');
  const iconEl = document.getElementById('new-habit-icon');
  const name   = nameEl.value.trim();
  if (!name) { nameEl.focus(); return; }
  const icon     = iconEl?.value.trim() || null;
  const color    = document.querySelector('#habit-color-picker .cp-color--active')?.dataset.color || 'cyan';
  const maxOrder = habits.length ? Math.max(...habits.map(h => h.order_index || 0)) + 1 : 0;
  const { error } = await db.from('habits').insert({
    id: crypto.randomUUID(), name, icon, color, archived: false, order_index: maxOrder,
  });
  if (error) { showToast('Erreur : ' + error.message, 'error'); return; }
  showToast('Habitude ajoutée', 'success');
  nameEl.value = ''; if (iconEl) iconEl.value = '';
  await loadHabits();
}

async function deleteHabit(id) {
  await db.from('habit_completions').delete().eq('habit_id', id);
  const { error } = await db.from('habits').delete().eq('id', id);
  if (error) { showToast('Erreur', 'error'); return; }
  showToast('Habitude supprimée', 'success');
  await loadHabits();
}

function startEditHabit(id) {
  editingHabitId = id;
  renderHabitManageList();
}

function cancelHabitEdit() {
  editingHabitId = null;
  renderHabitManageList();
}

async function saveHabitEdit(id) {
  const safeId = CSS.escape(id);
  const name  = document.getElementById(`hedit-name-${id}`)?.value.trim();
  const icon  = document.getElementById(`hedit-icon-${id}`)?.value.trim() || null;
  const color = document.querySelector(`#hedit-cp-${safeId} .cp-color--active`)?.dataset.color || 'cyan';
  if (!name) return;
  const { error } = await db.from('habits').update({ name, icon, color }).eq('id', id);
  if (error) { showToast('Erreur : ' + error.message, 'error'); return; }
  showToast('Habitude mise à jour', 'success');
  editingHabitId = null;
  await loadHabits();
}

async function reorderHabits(srcId, tgtId) {
  const active = habits.filter(h => !h.archived);
  const srcIdx = active.findIndex(h => h.id === srcId);
  const tgtIdx = active.findIndex(h => h.id === tgtId);
  if (srcIdx === -1 || tgtIdx === -1 || srcIdx === tgtIdx) return;
  const reordered = [...active];
  const [moved] = reordered.splice(srcIdx, 1);
  reordered.splice(tgtIdx, 0, moved);
  await Promise.all(reordered.map((h, i) => db.from('habits').update({ order_index: i }).eq('id', h.id)));
  await loadHabits();
}

function renderHabitManageList() {
  const container = document.getElementById('habit-manage-list');
  if (!container) return;
  const active = habits.filter(h => !h.archived);
  if (!active.length) {
    container.innerHTML = '<p style="color:var(--text-dim);font-size:13px;text-align:center;padding:16px 0;">Aucune habitude — ajoutes-en une ci-dessus.</p>';
    return;
  }
  container.innerHTML = active.map(h => {
    const color   = HABIT_COLORS[h.color] || C.primary;
    const isEditing = editingHabitId === h.id;
    const editForm = isEditing ? `
      <div class="habit-edit-form">
        <div class="habit-edit-row">
          <input type="text" class="habit-edit-input" id="hedit-name-${h.id}" value="${h.name.replace(/"/g,'&quot;')}" placeholder="Nom" style="flex:1;" />
          <input type="text" class="habit-edit-input" id="hedit-icon-${h.id}" value="${(h.icon||'').replace(/"/g,'&quot;')}" placeholder="🏃 ou mdi:run" style="width:130px;" />
        </div>
        ${colorPickerHtml(`hedit-cp-${h.id}`, h.color)}
        <div style="display:flex;gap:6px;margin-top:2px;">
          <button class="btn btn--primary btn--sm" onclick="saveHabitEdit('${h.id}')">Sauvegarder</button>
          <button class="btn btn--ghost btn--sm" onclick="cancelHabitEdit()">Annuler</button>
        </div>
      </div>` : '';
    return `<div class="habit-manage-row" draggable="true" data-id="${h.id}">
      <span class="habit-drag" title="Glisser pour réordonner">⠿</span>
      <div class="habit-manage-icon" style="background:${hexA(color,0.15)};border-color:${hexA(color,0.35)};color:${color};font-size:16px;">${habitIconHtml(h, 16)}</div>
      <div class="habit-manage-name">${h.name}</div>
      <button class="habit-manage-btn habit-manage-btn--edit" onclick="startEditHabit('${h.id}')" title="Modifier">✏</button>
      <button class="habit-manage-btn habit-manage-btn--del"  onclick="deleteHabit('${h.id}')"    title="Supprimer">✕</button>
      ${editForm}
    </div>`;
  }).join('');

  initDragDrop();
}

function initDragDrop() {
  const rows = document.querySelectorAll('#habit-manage-list .habit-manage-row[draggable]');
  rows.forEach(row => {
    row.addEventListener('dragstart', e => {
      dragSrcId = row.dataset.id;
      e.dataTransfer.effectAllowed = 'move';
      setTimeout(() => row.style.opacity = '0.4', 0);
    });
    row.addEventListener('dragend', () => {
      row.style.opacity = '';
      document.querySelectorAll('#habit-manage-list .habit-manage-row').forEach(r => r.classList.remove('drag-over'));
    });
    row.addEventListener('dragover', e => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      document.querySelectorAll('#habit-manage-list .habit-manage-row').forEach(r => r.classList.remove('drag-over'));
      row.classList.add('drag-over');
    });
    row.addEventListener('drop', async e => {
      e.preventDefault();
      row.classList.remove('drag-over');
      if (dragSrcId && dragSrcId !== row.dataset.id) {
        await reorderHabits(dragSrcId, row.dataset.id);
      }
      dragSrcId = null;
    });
  });
}

// ── Mouvement tab (activities + steps) ────────────────────
function initMovementTab() {
  actDate = today();
  const dateInput = document.getElementById('act-date');
  if (!dateInput) return;
  dateInput.value = actDate;

  document.getElementById('act-prev').addEventListener('click', () => changeActDate(-1));
  document.getElementById('act-next').addEventListener('click', () => changeActDate(1));
  document.getElementById('act-today-btn').addEventListener('click', () => {
    actDate = today(); dateInput.value = actDate; loadMovementData();
  });
  dateInput.addEventListener('change', () => { actDate = dateInput.value; loadMovementData(); });

  document.getElementById('j-steps-save').addEventListener('click', async () => {
    const val = parseInt(document.getElementById('j-steps').value);
    if (!val || val < 0) return;
    const { error } = await db.from('daily_steps').upsert({ date: actDate, steps: val }, { onConflict: 'date' });
    if (error) { showToast(`Erreur : ${error.message}`, 'error'); return; }
    showToast('Pas enregistrés', 'success');
    loadStepsChart(); loadDashboard();
  });

  initPlannedWorkouts();
  loadMovementData();
}

function changeActDate(delta) {
  const d = new Date(actDate + 'T12:00:00');
  d.setDate(d.getDate() + delta);
  actDate = d.toISOString().split('T')[0];
  document.getElementById('act-date').value = actDate;
  loadMovementData();
}

async function loadMovementData() {
  const [actsRes, stepsRes] = await Promise.all([
    db.from('activities').select('*').eq('date', actDate).order('created_at'),
    db.from('daily_steps').select('steps').eq('date', actDate).maybeSingle(),
  ]);
  renderActivities(actsRes.data || []);
  document.getElementById('j-steps').value = stepsRes.data?.steps ?? '';
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
      date:          actDate,
      type,
      start_time:    document.getElementById('act-start-time').value || null,
      duration_min:  numI(document.getElementById('act-duration').value),
      distance_km:   type !== 'gym' ? numF(document.getElementById('act-distance')?.value) : null,
      steps:         (type === 'walk' || type === 'run') ? numI(document.getElementById('act-steps').value) : null,
      avg_hr_bpm:    type !== 'gym' ? numI(document.getElementById('act-hr')?.value)    : null,
      elevation_m:   (type === 'run' || type === 'bike') ? numI(document.getElementById('act-elev')?.value)  : null,
      avg_speed_kmh: type === 'bike' ? numF(document.getElementById('act-speed')?.value) : null,
      avg_power_w:   type === 'bike' ? numI(document.getElementById('act-power')?.value) : null,
      description:   (type === 'run' || type === 'bike') ? (document.getElementById('act-desc').value.trim() || null) : null,
      session_type:  type === 'gym' ? document.getElementById('act-session-type').value : null,
    };
    const { error } = await db.from('activities').insert(entry);
    if (error) { showToast(`Erreur : ${error.message}`, 'error'); return; }
    showToast('Activité ajoutée', 'success');
    e.target.reset();
    document.getElementById('act-type-val').value = 'walk';
    document.getElementById('act-start-time').value = '';
    const spEl = document.getElementById('act-speed'); if (spEl) spEl.value = '';
    setActivityFields('walk');
    document.querySelectorAll('.act-type-btn').forEach(b => b.classList.toggle('act-type-btn--active', b.dataset.type === 'walk'));
    setEl('act-pace-display', '—');
    await loadMovementData();
  });
}

function renderActivities(activities) {
  const list = document.getElementById('activity-list');
  if (!list) return;
  if (!activities.length) { list.innerHTML = ''; return; }
  list.innerHTML = activities.map(a => {
    const icon  = ACT_ICONS[a.type] || '•';
    const label = ACT_LABELS[a.type] || a.type;
    const parts = [];
    if (a.start_time)   parts.push(a.start_time.slice(0, 5));
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
  await loadMovementData();
}

// ── Water ──────────────────────────────────────────────────
let waterDate = today();

function initWater() {
  const dateInput = document.getElementById('water-date');
  if (!dateInput) return;
  dateInput.value = waterDate;

  document.getElementById('water-prev').addEventListener('click', () => changeWaterDate(-1));
  document.getElementById('water-next').addEventListener('click', () => changeWaterDate(1));
  document.getElementById('water-today-btn').addEventListener('click', () => {
    waterDate = today(); dateInput.value = waterDate; loadNutritionWater();
  });
  dateInput.addEventListener('change', () => { waterDate = dateInput.value; loadNutritionWater(); });

  document.getElementById('j-water-save').addEventListener('click', async () => {
    const val = parseInt(document.getElementById('j-water').value);
    if (!val || val < 0) return;
    const { error } = await db.from('daily_water').upsert({ date: waterDate, amount_ml: val }, { onConflict: 'date' });
    if (error) { showToast(`Erreur : ${error.message}`, 'error'); return; }
    showToast('Hydratation enregistrée', 'success');
    loadWaterChart();
  });
}

function changeWaterDate(delta) {
  const d = new Date(waterDate + 'T12:00:00');
  d.setDate(d.getDate() + delta);
  waterDate = d.toISOString().split('T')[0];
  document.getElementById('water-date').value = waterDate;
  loadNutritionWater();
}

async function loadNutritionWater() {
  const { data } = await db.from('daily_water').select('amount_ml').eq('date', waterDate).maybeSingle();
  const el = document.getElementById('j-water');
  if (el) el.value = data?.amount_ml ?? '';
}

function addWater(ml) {
  const el = document.getElementById('j-water');
  if (el) el.value = (parseInt(el.value) || 0) + ml;
}

async function loadWaterChart() {
  const noData = document.getElementById('water-chart-nodata');
  const { data } = await db.from('daily_water').select('date, amount_ml').order('date').limit(60);
  if (!data?.length) { if (noData) noData.style.display = 'flex'; return; }
  if (noData) noData.style.display = 'none';
  const GOAL   = 2000;
  const values = data.map(d => d.amount_ml);
  const movAvg = values.map((_, i) => {
    const w = values.slice(Math.max(0, i - 6), i + 1);
    return Math.round(w.reduce((a, b) => a + b, 0) / w.length);
  });
  const ctx = document.getElementById('water-chart').getContext('2d');
  if (waterChart) waterChart.destroy();
  waterChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: data.map(d => formatDate(d.date)),
      datasets: [
        { label: 'Eau (ml)', data: values, backgroundColor: values.map(v => v >= GOAL ? hexA('#22d3ee', 0.45) : hexA('#3b82f6', 0.35)), borderColor: values.map(v => v >= GOAL ? '#22d3ee' : '#3b82f6'), borderWidth: 1, borderRadius: 4, order: 2 },
        { label: 'Moy. 7 jours', data: movAvg, type: 'line', borderColor: hexA('#22d3ee', 0.85), backgroundColor: 'transparent', borderWidth: 2.5, pointRadius: 0, tension: 0.4, fill: false, order: 1 },
        { label: 'Objectif 2 L', data: Array(data.length).fill(GOAL), type: 'line', borderColor: hexA(C.orange, 0.6), borderWidth: 1.5, borderDash: [6, 4], pointRadius: 0, fill: false, order: 0 },
      ],
    },
    options: chartOpts(),
  });
}

// ── Planned workouts ───────────────────────────────────────
function initPlannedWorkouts() {
  const form = document.getElementById('plan-form');
  if (!form) return;
  document.getElementById('plan-date').value = today();
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const entry = {
      date:        document.getElementById('plan-date').value,
      type:        document.getElementById('plan-type').value,
      start_time:  document.getElementById('plan-start-time').value || null,
      description: document.getElementById('plan-desc').value.trim() || null,
      done:        false,
    };
    if (!entry.date) { showToast('Date requise', 'error'); return; }
    const { error } = await db.from('planned_workouts').insert(entry);
    if (error) { showToast(`Erreur : ${error.message}`, 'error'); return; }
    showToast('Séance planifiée', 'success');
    e.target.reset();
    document.getElementById('plan-date').value = today();
    await loadPlannedWorkouts();
  });
  loadPlannedWorkouts();
}

async function loadPlannedWorkouts() {
  const { data } = await db.from('planned_workouts').select('*').order('date').order('start_time', { nullsFirst: false });
  renderPlannedWorkouts(data || []);
}

function renderPlannedWorkouts(workouts) {
  const container = document.getElementById('planned-list');
  if (!container) return;
  if (!workouts.length) {
    container.innerHTML = '<p style="color:var(--text-dim);font-size:13px;text-align:center;padding:16px 0;">Aucune séance planifiée.</p>';
    return;
  }
  const todayStr = today();
  container.innerHTML = workouts.map(w => {
    const icon  = ACT_ICONS[w.type] || '•';
    const label = ACT_LABELS[w.type] || w.type;
    const gymSub = w.type === 'gym' && w.session_type ? ` · ${GYM_LABELS[w.session_type] || w.session_type}` : '';
    const parts = [];
    if (w.start_time) parts.push(w.start_time.slice(0, 5));
    if (w.description) parts.push(w.description);
    const isPast = w.date < todayStr && !w.done;
    return `<div class="planned-item${w.done ? ' planned-item--done' : ''}">
      <div class="planned-done-toggle${w.done ? ' planned-done-toggle--on' : ''}" onclick="togglePlannedDone('${w.id}',${!w.done})" title="${w.done ? 'Marquer non fait' : 'Marquer fait'}">✓</div>
      <div style="flex:1;min-width:0;">
        <div style="display:flex;align-items:center;gap:6px;">
          <span style="font-size:16px;">${icon}</span>
          <span style="font-size:13px;font-weight:600;${w.done ? 'text-decoration:line-through;' : ''}">${label}${gymSub}</span>
          <span style="font-size:11px;color:${isPast ? 'rgba(248,113,113,0.7)' : 'var(--text-dim)'};margin-left:auto;">${formatDateShort(w.date)}</span>
        </div>
        ${parts.length ? `<div style="font-size:11px;color:var(--text-dim);margin-top:2px;">${parts.join(' · ')}</div>` : ''}
      </div>
      <button class="activity-item__del" onclick="deletePlannedWorkout('${w.id}')" title="Supprimer">✕</button>
    </div>`;
  }).join('');
}

async function togglePlannedDone(id, done) {
  const { error } = await db.from('planned_workouts').update({ done }).eq('id', id);
  if (error) { showToast('Erreur', 'error'); return; }
  await loadPlannedWorkouts();
}

async function deletePlannedWorkout(id) {
  if (!confirm('Supprimer cette séance planifiée ?')) return;
  const { error } = await db.from('planned_workouts').delete().eq('id', id);
  if (error) { showToast('Erreur', 'error'); return; }
  showToast('Séance supprimée', 'success');
  await loadPlannedWorkouts();
}

// ── Journal notes ──────────────────────────────────────────
function initJournalNotes() {
  const dateInput = document.getElementById('jn-date');
  if (!dateInput) return;
  dateInput.value = journalNoteDate;
  document.getElementById('jn-prev').addEventListener('click', () => changeJournalNoteDate(-1));
  document.getElementById('jn-next').addEventListener('click', () => changeJournalNoteDate(1));
  document.getElementById('jn-today').addEventListener('click', () => {
    journalNoteDate = today(); dateInput.value = journalNoteDate; loadJournalNote();
  });
  dateInput.addEventListener('change', () => { journalNoteDate = dateInput.value; loadJournalNote(); });
}

function changeJournalNoteDate(delta) {
  const d = new Date(journalNoteDate + 'T12:00:00');
  d.setDate(d.getDate() + delta);
  journalNoteDate = d.toISOString().split('T')[0];
  document.getElementById('jn-date').value = journalNoteDate;
  loadJournalNote();
}

async function loadJournalNote() {
  const { data } = await db.from('journal_entries').select('content').eq('date', journalNoteDate).maybeSingle();
  const el = document.getElementById('jn-content');
  if (el) el.value = data?.content || '';
  loadJournalHistory();
}

async function saveJournalNote() {
  const content = document.getElementById('jn-content')?.value.trim();
  if (!content) { showToast('Note vide', 'error'); return; }
  const { error } = await db.from('journal_entries').upsert({ date: journalNoteDate, content }, { onConflict: 'date' });
  if (error) { showToast('Erreur : ' + error.message, 'error'); return; }
  showToast('Note enregistrée', 'success');
  loadJournalHistory();
}

async function loadJournalHistory() {
  const container = document.getElementById('jn-history');
  if (!container) return;
  const { data } = await db.from('journal_entries').select('date, content').order('date', { ascending: false }).limit(10);
  const entries = (data || []).filter(e => e.date !== journalNoteDate);
  if (!entries.length) {
    container.innerHTML = '<p style="color:var(--text-dim);font-size:13px;text-align:center;padding:16px 0;">Aucune note enregistrée.</p>';
    return;
  }
  container.innerHTML = entries.map(e => `<div class="journal-entry-item">
    <div class="journal-entry-date">${formatDateFull(e.date)}</div>
    <div class="journal-entry-text">${e.content.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</div>
  </div>`).join('');
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
  const GOAL   = 10000;
  const values = data.map(d => d.steps);
  const movAvg = values.map((_, i) => {
    const w = values.slice(Math.max(0, i - 6), i + 1);
    return Math.round(w.reduce((a, b) => a + b, 0) / w.length);
  });
  const ctx = document.getElementById('steps-chart').getContext('2d');
  if (stepsChart) stepsChart.destroy();
  stepsChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: data.map(d => formatDate(d.date)),
      datasets: [
        { label:'Pas', data:values, backgroundColor:values.map(v => v>=GOAL?hexA(C.green,0.45):hexA(C.purple,0.35)), borderColor:values.map(v => v>=GOAL?C.green:C.purple), borderWidth:1, borderRadius:4, order:2 },
        { label:'Moy. 7 jours', data:movAvg, type:'line', borderColor:hexA(C.primary,0.85), backgroundColor:'transparent', borderWidth:2.5, pointRadius:0, tension:0.4, fill:false, order:1 },
        { label:`Objectif ${GOAL.toLocaleString('fr-FR')}`, data:Array(data.length).fill(GOAL), type:'line', borderColor:hexA(C.orange,0.6), borderWidth:1.5, borderDash:[6,4], pointRadius:0, fill:false, order:0 },
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
  // ICS calendar URL
  const icsInput = document.getElementById('ics-url');
  if (icsInput) {
    icsInput.value = `${window.location.origin}/.netlify/functions/calendar`;
  }
  const icsCopy = document.getElementById('ics-copy');
  if (icsCopy) {
    icsCopy.addEventListener('click', () => {
      navigator.clipboard.writeText(icsInput.value).then(() => showToast('Lien copié !', 'success'));
    });
  }

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

// ── Dashboard ──────────────────────────────────────────────
function switchTab(tabName, suiviName) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  const btn   = document.querySelector(`.tab-btn[data-tab="${tabName}"]`);
  const panel = document.getElementById(`panel-${tabName}`);
  if (btn)   btn.classList.add('active');
  if (panel) panel.classList.add('active');
  setTimeout(() => window.dispatchEvent(new Event('resize')), 60);
  if (tabName === 'dashboard')  renderDashCharts();
  if (tabName === 'calendrier') loadCalendar();
  if (tabName === 'habitudes')  renderTrendChart();
  if (tabName === 'suivi') {
    if (suiviName) {
      document.querySelectorAll('.suivi-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('#panel-suivi [id^="suivi-"]').forEach(p => p.style.display = 'none');
      const sb = document.querySelector(`.suivi-btn[data-suivi="${suiviName}"]`);
      const sp = document.getElementById(`suivi-${suiviName}`);
      if (sb) sb.classList.add('active');
      if (sp) sp.style.display = '';
    }
    const active = document.querySelector('.suivi-btn.active')?.dataset.suivi;
    if (active === 'mouvement') loadMovementData();
  }
}

function getLast7Days() {
  const days = []; const d = new Date();
  for (let i = 6; i >= 0; i--) {
    const dd = new Date(d); dd.setDate(d.getDate() - i);
    days.push(dd.toISOString().split('T')[0]);
  }
  return days;
}

function renderDashMiniChart(canvasId, key, data, labels, color, type, goalVal) {
  const ctx = document.getElementById(canvasId)?.getContext('2d');
  if (!ctx) return;
  if (dashCharts[key]) { dashCharts[key].destroy(); delete dashCharts[key]; }
  const isBar = type === 'bar';
  const datasets = [{
    data,
    backgroundColor: isBar ? data.map(() => hexA(color, 0.3)) : undefined,
    borderColor: color,
    borderWidth: isBar ? 1 : 2,
    borderRadius: isBar ? 3 : undefined,
    fill: !isBar ? { target: 'origin', above: hexA(color, 0.08) } : false,
    pointRadius: 0,
    tension: 0.4,
    order: 2,
  }];
  if (goalVal != null) datasets.push({
    data: Array(data.length).fill(goalVal),
    type: 'line', borderColor: hexA(color, 0.3), borderWidth: 1,
    borderDash: [4, 3], pointRadius: 0, fill: false, order: 1,
  });
  dashCharts[key] = new Chart(ctx, {
    type,
    data: { labels, datasets },
    options: {
      responsive: true, maintainAspectRatio: false, animation: false,
      plugins: { legend: { display: false }, tooltip: { enabled: false } },
      scales: {
        x: { grid: { display: false }, ticks: { color: '#334155', font: { size: 9 }, maxRotation: 0, maxTicksLimit: 7 } },
        y: { grid: { color: 'rgba(255,255,255,0.03)' }, ticks: { color: '#334155', font: { size: 9 }, maxTicksLimit: 4 } },
      },
    },
  });
}

async function renderDashCharts() {
  const days7 = getLast7Days();
  const labels7 = days7.map(d => formatDateShort(d));

  const [nutRes, stepsRes, weightRes, actRes] = await Promise.all([
    db.from('meals').select('date,calories,protein_g,fat_g,done').gte('date', days7[0]).eq('done', true),
    db.from('daily_steps').select('date,steps').gte('date', days7[0]).order('date'),
    db.from('measurements').select('date,weight_kg').not('weight_kg', 'is', null).gte('date', daysAgo(30)).order('date'),
    db.from('activities').select('type,date').order('date', { ascending: false }).limit(1),
  ]);

  // ── Nutrition ───────────────────────────────────────────
  const nutByDay = {};
  (nutRes.data || []).forEach(m => { nutByDay[m.date] = (nutByDay[m.date] || 0) + (m.calories || 0); });
  const todayMeals = (nutRes.data || []).filter(m => m.date === today());
  const todayKcal  = todayMeals.reduce((s, m) => s + (m.calories  || 0), 0);
  const todayProt  = todayMeals.reduce((s, m) => s + (m.protein_g || 0), 0);
  const todayLip   = todayMeals.reduce((s, m) => s + (m.fat_g     || 0), 0);
  setEl('d-kcal', todayKcal ? todayKcal.toLocaleString('fr-FR') : '—');
  setEl('d-prot', todayProt ? todayProt.toFixed(0) + 'g' : '—');
  setEl('d-lip',  todayLip  ? todayLip.toFixed(0)  + 'g' : '—');
  renderDashMiniChart('dash-nutri-chart', 'nutri', days7.map(d => nutByDay[d] || 0), labels7, C.orange, 'bar');

  // ── Habitudes ───────────────────────────────────────────
  const active = habits.filter(h => !h.archived);
  if (active.length) {
    const todayDone = active.filter(h => completions[h.id]?.has(today())).length;
    const habData   = days7.map(d => active.filter(h => completions[h.id]?.has(d)).length);
    const sum7      = habData.reduce((a, b) => a + b, 0);
    const rate7     = Math.round(sum7 / (days7.length * active.length) * 100);
    setEl('d-hab-today',  `${todayDone}/${active.length}`);
    setEl('d-hab-streak', calcStreak(active) + 'j');
    setEl('d-hab-rate',   rate7 + '%');
    renderDashMiniChart('dash-habits-chart', 'habits', habData, labels7, C.primary, 'bar', active.length);
  }

  // ── Mouvement / Pas ─────────────────────────────────────
  const stepsByDay = {};
  (stepsRes.data || []).forEach(s => { stepsByDay[s.date] = s.steps; });
  const stepsData  = days7.map(d => stepsByDay[d] || 0);
  const todaySteps = stepsByDay[today()];
  const nonZero    = stepsData.filter(Boolean);
  const avgSteps   = nonZero.length ? Math.round(nonZero.reduce((a, b) => a + b, 0) / nonZero.length) : 0;
  const lastAct    = actRes.data?.[0];
  setEl('d-steps',     todaySteps ? todaySteps.toLocaleString('fr-FR') : '—');
  setEl('d-steps-avg', avgSteps   ? avgSteps.toLocaleString('fr-FR')   : '—');
  setEl('d-last-act',  lastAct    ? (ACT_ICONS[lastAct.type] || '•') + ' ' + (ACT_LABELS[lastAct.type] || lastAct.type) : '—');
  renderDashMiniChart('dash-steps-chart', 'steps', stepsData, labels7, '#22c55e', 'bar', 10000);

  // ── Mensurations ────────────────────────────────────────
  const weights = (weightRes.data || []).filter(w => w.weight_kg != null);
  if (weights.length) {
    const last  = weights[weights.length - 1];
    const first = weights[0];
    const delta = (last.weight_kg - first.weight_kg).toFixed(1);
    const sign  = delta > 0 ? '+' : '';
    const deltaColor = delta < 0 ? '#22c55e' : delta > 0 ? '#f87171' : '#94a3b8';
    setEl('d-weight', last.weight_kg + ' kg');
    const deltaEl = document.getElementById('d-weight-delta');
    if (deltaEl) { deltaEl.textContent = sign + delta + ' kg'; deltaEl.style.color = deltaColor; }
    renderDashMiniChart('dash-weight-chart', 'weight',
      weights.map(w => w.weight_kg),
      weights.map(w => formatDateShort(w.date)),
      '#a855f7', 'line');
  }
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
