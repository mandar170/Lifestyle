// ============================================================
// NUTRITION — Journal, Pantry, Courses, Gestion
// ============================================================

const MEAL_TYPES = [
  { key: 'breakfast',       label: 'Petit déjeuner' },
  { key: 'morning_snack',   label: 'Collation matin' },
  { key: 'lunch',           label: 'Déjeuner' },
  { key: 'afternoon_snack', label: 'Collation après-midi' },
  { key: 'dinner',          label: 'Dîner' },
  { key: 'evening_snack',   label: 'Collation soir' },
];

const WEEKDAY_LABELS = ['Lun','Mar','Mer','Jeu','Ven','Sam','Dim'];

const MEAL_COLORS = {
  breakfast:'#64dcff', morning_snack:'#a855f7', lunch:'#22c55e',
  afternoon_snack:'#facc15', dinner:'#f97316', evening_snack:'#22d3ee',
};

const PRESET_TYPE_LABELS = {
  breakfast:'Petit déj.', morning_snack:'Collation mat.', lunch:'Déjeuner',
  afternoon_snack:'Collation a-m', dinner:'Dîner', evening_snack:'Collation soir',
};

const C = {
  primary:'#64dcff', purple:'#a855f7', orange:'#f97316', yellow:'#facc15', green:'#22d3ee',
};

// ── State ──────────────────────────────────────────────────
let journalDate      = today();   // currently selected day (for totals/water)
let journalWeekStart = null;      // Monday of the displayed week
let journalViewMode  = (typeof window !== 'undefined' && window.innerWidth <= 700) ? 'day' : 'week'; // mobile default: day
let mealPresets = [];
let foods       = [];
let tags        = [];
let foodTagLinks = {};   // food_id → tag_id[]
let barcodeToFood = {};  // barcode → food_id   (from food_barcodes)
let foodBarcodes  = {};  // food_id → barcode[]  (from food_barcodes)
const MAX_BARCODES_PER_FOOD = 5;
let pantryItems = [];
let shoppingRenderItems = [];
let equivalences = [];
let weekMeals      = {}; // weekMeals[date][mealType]      = row
let weekPlans      = {}; // weekPlans[date][mealType]       = row
let weekFoodItems  = {}; // weekFoodItems[date][mealType]   = row[]
let modalCtx      = null; // { date, mealType } — meal currently open in the modal
let modalSnapshot = null; // last-committed field values, for dirty-check on close
const foodPickerState = {};
let editingPresetId = null;
let editingFoodId   = null;
let nutritionGoals  = null;
let selectedTagsForNewFood = [];
let editingFoodTags = {};  // foodId → tag_id[] (for edit mode)
let pantrySelectedItem = null;
let checkedShoppingItems = new Set();
let editingEquivalenceId = null;

// ── Init ───────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  initTabs();

  // Handle ?date= URL param
  const dateParam = new URLSearchParams(window.location.search).get('date');
  if (dateParam) journalDate = dateParam;

  await loadFoods();
  await Promise.all([loadTags(), loadGoals(), loadEquivalences(), loadPantry()]);
  renderFoodList(); // re-render after tags are loaded

  initJournal();
});

// ── Tabs ───────────────────────────────────────────────────
function initTabs() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(`panel-${btn.dataset.tab}`).classList.add('active');
      const t = btn.dataset.tab;
      if (t === 'pantry') loadPantry();
      if (t === 'courses') { generateShoppingList(); }
    });
  });
}

function switchNutritionTab(tabName) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  const btn   = document.querySelector(`.tab-btn[data-tab="${tabName}"]`);
  const panel = document.getElementById(`panel-${tabName}`);
  if (btn)   btn.classList.add('active');
  if (panel) panel.classList.add('active');
}

// ── Journal — week helpers ──────────────────────────────────
function weekDates(startStr) {
  const start = new Date(startStr + 'T12:00:00');
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start); d.setDate(start.getDate() + i);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  });
}
function mondayOf(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  const dow = (d.getDay() + 6) % 7; // Mon=0
  d.setDate(d.getDate() - dow);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function round1(n) { return Math.round(n * 10) / 10; }

// ── Journal — init & week navigation ────────────────────────
function initJournal() {
  journalWeekStart = mondayOf(journalDate);
  applyJournalViewMode();
  loadWeekData();
}

function applyJournalViewMode() {
  const panel = document.getElementById('panel-journal');
  if (panel) panel.classList.toggle('view-day', journalViewMode === 'day');
}

function toggleJournalView() {
  journalViewMode = journalViewMode === 'day' ? 'week' : 'day';
  applyJournalViewMode();
}

// Steps the selected day by one, crossing into a new week's data if needed.
function stepDay(delta) {
  const d = new Date(journalDate + 'T12:00:00');
  d.setDate(d.getDate() + delta);
  journalDate = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  const newWeekStart = mondayOf(journalDate);
  if (newWeekStart !== journalWeekStart) {
    journalWeekStart = newWeekStart;
    loadWeekData();
  } else {
    renderMealTable();
    renderDayPanel();
  }
}

function weekNav(delta) {
  const d = new Date(journalWeekStart + 'T12:00:00');
  d.setDate(d.getDate() + delta * 7);
  journalWeekStart = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  const dates = weekDates(journalWeekStart);
  if (!dates.includes(journalDate)) journalDate = journalWeekStart;
  loadWeekData();
}

function weekToday() {
  journalDate      = today();
  journalWeekStart = mondayOf(journalDate);
  loadWeekData();
}

function selectDay(dateStr) {
  journalDate = dateStr;
  renderMealTable();
  renderDayPanel();
}

async function loadWeekData() {
  const dates = weekDates(journalWeekStart);
  const start = dates[0], end = dates[6];
  const [{ data: mealRows }, { data: items }] = await Promise.all([
    db.from('meals').select('*').gte('date', start).lte('date', end),
    db.from('meal_food_items').select('*').gte('date', start).lte('date', end),
  ]);
  // meals now holds both the journal (status 'logged') and the plan
  // (status 'planned') in one table — split them back into the two caches
  // the rest of the module works with.
  weekMeals = {};
  weekPlans = {};
  (mealRows || []).forEach(m => {
    const bucket = m.status === 'planned' ? weekPlans : weekMeals;
    if (!bucket[m.date]) bucket[m.date] = {};
    bucket[m.date][m.meal_type] = m;
  });
  weekFoodItems = {};
  (items || []).forEach(i => {
    if (!weekFoodItems[i.date]) weekFoodItems[i.date] = {};
    if (!weekFoodItems[i.date][i.meal_type]) weekFoodItems[i.date][i.meal_type] = [];
    weekFoodItems[i.date][i.meal_type].push(i);
  });

  setEl('jw-label', `Semaine du ${formatDateShort(start)} au ${formatDateShort(end)}`);
  renderMealTable();
  renderDayPanel();
}

function renderDayPanel() {
  const meals = Object.values(weekMeals[journalDate] || {});
  updateDailyTotals(meals);
  setEl('j-selected-day-label', formatDateLong(journalDate));
  renderSubstituteIndicator();
  renderDayView();
  loadWater();
}

// ── Journal — mobile day view ────────────────────────────────
function renderDayView() {
  const list = document.getElementById('day-meal-list');
  if (!list) return;
  setEl('jd-label', formatDateLong(journalDate));
  list.innerHTML = MEAL_TYPES.map(({ key, label }) => dayMealRowHTML(journalDate, key, label)).join('');
}

function dayMealRowHTML(dateStr, mealType, label) {
  const disp = mealDisplayData(dateStr, mealType);
  const foodsPreview = disp.description || '—';
  const macroPreview = disp.calories != null ? `${disp.calories} kcal` : '';
  let btn = '';
  if (disp.state === 'empty') {
    btn = `<button class="meal-cell__quick-btn" onclick="event.stopPropagation();openMealModal('${dateStr}','${mealType}')">+ Renseigner</button>`;
  } else if (disp.state === 'dirty' || disp.state === 'planned') {
    btn = `<button class="meal-cell__quick-btn meal-cell__quick-btn--primary" onclick="quickAddMeal('${dateStr}','${mealType}',event)">Ajouter</button>`;
  }
  return `<div class="day-meal-row day-meal-row--${disp.state}" onclick="openMealModal('${dateStr}','${mealType}')">
    <div class="day-meal-row__header">
      <span class="day-meal-row__label" style="color:${MEAL_COLORS[mealType]};">${label}</span>
      ${macroPreview ? `<span class="day-meal-row__macro">${macroPreview}</span>` : ''}
    </div>
    <div class="day-meal-row__foods">${foodsPreview}</div>
    ${btn}
  </div>`;
}

// ── Substitute tracker (foods tagged "Substitut") ───────────
function countSubstitutesForDay(dateStr) {
  const substitutTag = tags.find(t => t.name.trim().toLowerCase() === 'substitut');
  if (!substitutTag) return 0;
  const substituteFoodIds = new Set(
    Object.keys(foodTagLinks).filter(fid => foodTagLinks[fid].includes(substitutTag.id))
  );
  const dayItems = weekFoodItems[dateStr] || {};
  let count = 0;
  Object.values(dayItems).forEach(items => {
    items.forEach(item => { if (substituteFoodIds.has(item.food_id)) count++; });
  });
  return count;
}

function renderSubstituteIndicator() {
  const el = document.getElementById('substitute-indicator');
  if (!el) return;
  const target = nutritionGoals?.substitute_target;
  if (!target) { el.innerHTML = ''; return; }
  const count = countSubstitutesForDay(journalDate);
  const pct   = Math.min(100, Math.round(count / target * 100));
  const color = count >= target ? '#22c55e' : count > 0 ? '#f97316' : '#94a3b8';
  el.innerHTML = `<div class="goals-progress-bar">
    <div class="goals-progress-bar__label"><span>💊 Substituts</span><span style="color:${color};">${count} / ${target}</span></div>
    <div class="goals-progress-bar__track"><div class="goals-progress-bar__fill" style="width:${pct}%;background:${color};"></div></div>
  </div>`;
}

// ── Water ──────────────────────────────────────────────────
async function loadWater() {
  const { data } = await db.from('daily_water').select('amount_ml').eq('date', journalDate).maybeSingle();
  const ml = data?.amount_ml ?? 0;
  const input   = document.getElementById('j-water');
  const display = document.getElementById('j-water-display');
  if (input)   input.value    = ml || '';
  if (display) display.textContent = ml ? `${ml} ml` : '— ml';
}

async function saveWater() {
  const val = parseInt(document.getElementById('j-water')?.value) || 0;
  const { error } = await db.from('daily_water').upsert({ date: journalDate, amount_ml: val }, { onConflict: 'date' });
  if (error) { showToast('Erreur : ' + error.message, 'error'); return; }
  showToast('Hydratation enregistrée', 'success');
  await loadWater();
}

function addWater(ml) {
  const input = document.getElementById('j-water');
  if (!input) return;
  input.value = (parseInt(input.value) || 0) + ml;
}

// ── Journal — meal aggregate / display helpers ──────────────
function sumMealAggregate(dateStr, mealType) {
  const items = (weekFoodItems[dateStr] && weekFoodItems[dateStr][mealType]) || [];
  const has   = items.length > 0;
  const sum   = f => items.reduce((s, i) => s + (i[f] || 0), 0);
  return {
    description: items.length ? items.map(i => i.food_name).join(', ') : null,
    calories:  has ? Math.round(sum('calories'))  : null,
    protein_g: has ? round1(sum('protein_g')) : null,
    carbs_g:   has ? round1(sum('carbs_g'))   : null,
    fat_g:     has ? round1(sum('fat_g'))     : null,
    fiber_g:   has ? round1(sum('fiber_g'))   : null,
  };
}

function mealDisplayData(dateStr, mealType) {
  const m = weekMeals[dateStr] && weekMeals[dateStr][mealType];
  const p = weekPlans[dateStr] && weekPlans[dateStr][mealType];
  const items = (weekFoodItems[dateStr] && weekFoodItems[dateStr][mealType]) || [];
  let state = 'empty';
  if (m) state = 'saved';
  else if (p) state = 'planned';
  else if (items.length) state = 'dirty';

  const src = m || p;
  if (src) {
    return {
      state,
      description: items.length ? items.map(i => i.food_name).join(', ') : src.description,
      calories: src.calories, protein_g: src.protein_g, carbs_g: src.carbs_g, fat_g: src.fat_g, fiber_g: src.fiber_g,
    };
  }
  return { state, ...sumMealAggregate(dateStr, mealType) };
}

// ── Journal — week table rendering ──────────────────────────
function renderMealTable() {
  const dates    = weekDates(journalWeekStart);
  const todayStr = today();

  const headerCells = dates.map((d, i) => {
    const isToday = d === todayStr;
    const isSel   = d === journalDate;
    const [, mo, da] = d.split('-');
    return `<th class="meal-table__day${isSel ? ' meal-table__day--sel' : ''}${isToday ? ' meal-table__day--today' : ''}" onclick="selectDay('${d}')">
      <span class="meal-table__dow">${WEEKDAY_LABELS[i]}</span>
      <span class="meal-table__date">${da}/${mo}</span>
    </th>`;
  }).join('');

  const rows = MEAL_TYPES.map(({ key, label }) => {
    const cells = dates.map(d => mealCellHTML(d, key)).join('');
    return `<tr><th class="meal-table__row-label" style="color:${MEAL_COLORS[key]};">${label}</th>${cells}</tr>`;
  }).join('');

  const colgroup = `<colgroup><col class="meal-table__corner" />${dates.map(() => '<col />').join('')}</colgroup>`;

  const table = document.getElementById('meal-table');
  if (table) table.innerHTML = `${colgroup}<thead><tr><th class="meal-table__corner"></th>${headerCells}</tr></thead><tbody>${rows}</tbody>`;
}

function mealCellHTML(dateStr, mealType) {
  const disp = mealDisplayData(dateStr, mealType);
  const foodsPreview  = disp.description || '—';
  const macroPreview  = disp.calories != null ? `${disp.calories} kcal` : '';
  let btn = '';
  if (disp.state === 'empty') {
    btn = `<button class="meal-cell__quick-btn" onclick="event.stopPropagation();openMealModal('${dateStr}','${mealType}')">+ Renseigner</button>`;
  } else if (disp.state === 'dirty' || disp.state === 'planned') {
    btn = `<button class="meal-cell__quick-btn meal-cell__quick-btn--primary" onclick="quickAddMeal('${dateStr}','${mealType}',event)">Ajouter</button>`;
  }
  return `<td class="meal-cell meal-cell--${disp.state}" onclick="openMealModal('${dateStr}','${mealType}')">
    <div class="meal-cell__inner">
      <div class="meal-cell__foods">${foodsPreview}</div>
      ${macroPreview ? `<div class="meal-cell__macro">${macroPreview}</div>` : ''}
      ${btn}
    </div>
  </td>`;
}

// ── Journal — quick "Ajouter" from table cell ───────────────
async function quickAddMeal(dateStr, mealType, evt) {
  evt?.stopPropagation();
  const p = weekPlans[dateStr] && weekPlans[dateStr][mealType];
  const fields = p
    ? { description: p.description, calories: p.calories, protein_g: p.protein_g, carbs_g: p.carbs_g, fat_g: p.fat_g, fiber_g: p.fiber_g }
    : sumMealAggregate(dateStr, mealType);
  const entry = { date: dateStr, meal_type: mealType, status: 'logged', ...fields };
  const { error } = await db.from('meals').upsert(entry, { onConflict: 'date,meal_type,status' });
  if (error) { showToast(`Erreur : ${error.message}`, 'error'); return; }
  await commitStockDeductionForMeal(dateStr, mealType);
  showToast('Repas ajouté au journal ✓', 'success');
  await loadWeekData();
  syncNutritionTable(dateStr);
}

function adjustMealMacroInputs(suffix, d) {
  const set = (field, val) => {
    if (val == null) return;
    const el = document.getElementById(`${field}-${suffix}`);
    if (!el) return;
    const cur  = parseFloat(el.value) || 0;
    const next = Math.max(0, cur + val);
    el.value = field === 'kcal' ? Math.round(next) : parseFloat(next.toFixed(1));
  };
  set('kcal', d.kcal); set('prot', d.prot); set('gluc', d.gluc); set('lip', d.lip); set('fib', d.fib);
}

function updateDailyTotals(meals) {
  const sum  = f => meals.reduce((s, m) => s + (m[f] || 0), 0);
  const n    = meals.length;
  setEl('j-total-kcal', n ? Math.round(sum('calories')).toLocaleString('fr-FR') : '—');
  const kcalEl = document.getElementById('j-total-kcal');
  if (kcalEl && nutritionGoals?.calories && n) {
    const ratio = sum('calories') / nutritionGoals.calories;
    kcalEl.style.color = ratio > 1.1 ? '#ef4444' : ratio > 1 ? '#f97316' : '#22c55e';
  } else if (kcalEl) {
    kcalEl.style.color = '';
  }
  setEl('j-total-prot', n ? sum('protein_g').toFixed(1) : '—');
  setEl('j-total-gluc', n ? sum('carbs_g').toFixed(1)   : '—');
  setEl('j-total-lip',  n ? sum('fat_g').toFixed(1)     : '—');
  setEl('j-total-fib',  n ? sum('fiber_g').toFixed(1)   : '—');

  if (nutritionGoals && n) {
    const totKcal = sum('calories');
    const totProt = sum('protein_g');
    renderGoalsProgress(totKcal, totProt);
  } else {
    const el = document.getElementById('goals-progress');
    if (el) el.innerHTML = '';
  }
}

function renderGoalsProgress(totKcal, totProt) {
  const el = document.getElementById('goals-progress');
  if (!el || !nutritionGoals) return;
  const bars = [];
  if (nutritionGoals.calories) {
    const rawPct = Math.round(totKcal / nutritionGoals.calories * 100);
    const pct = Math.min(100, rawPct);
    const color = rawPct > 110 ? '#ef4444' : rawPct > 100 ? '#f97316' : '#22c55e';
    bars.push(`<div class="goals-progress-bar">
      <div class="goals-progress-bar__label"><span>Calories</span><span style="color:${color};">${Math.round(totKcal)} / ${nutritionGoals.calories} kcal</span></div>
      <div class="goals-progress-bar__track"><div class="goals-progress-bar__fill" style="width:${pct}%;background:${color};"></div></div>
    </div>`);
  }
  if (nutritionGoals.protein_g) {
    const pct = Math.min(100, Math.round(totProt / nutritionGoals.protein_g * 100));
    const color = pct >= 90 ? '#22c55e' : '#64dcff';
    bars.push(`<div class="goals-progress-bar">
      <div class="goals-progress-bar__label"><span>Protéines</span><span style="color:${color};">${totProt.toFixed(1)} / ${nutritionGoals.protein_g} g</span></div>
      <div class="goals-progress-bar__track"><div class="goals-progress-bar__fill" style="width:${pct}%;background:${color};"></div></div>
    </div>`);
  }
  el.innerHTML = bars.length ? `<div style="margin-bottom:20px;">${bars.join('')}</div>` : '';
}

async function syncNutritionTable(date) {
  const { data } = await db.from('meals').select('*').eq('date', date).eq('status', 'logged');
  const meals = data || [];
  await db.from('nutrition').upsert({
    date,
    calories:  Math.round(meals.reduce((s,m) => s + (m.calories   || 0), 0)) || null,
    protein_g: meals.reduce((s,m) => s + (m.protein_g || 0), 0) || null,
    carbs_g:   meals.reduce((s,m) => s + (m.carbs_g   || 0), 0) || null,
    fat_g:     meals.reduce((s,m) => s + (m.fat_g     || 0), 0) || null,
    fiber_g:   meals.reduce((s,m) => s + (m.fiber_g   || 0), 0) || null,
  }, { onConflict: 'date' });
}

// ── Food picker (journal) ───────────────────────────────────
function renderFoodPickerContent(ctx) {
  const search = (document.getElementById(`fp-search-${ctx}`)?.value || '').toLowerCase();
  const listEl = document.getElementById(`fp-list-${ctx}`);
  if (!listEl) return;
  const filtered = foods.filter(f => f.name.toLowerCase().includes(search));
  if (!filtered.length) { listEl.innerHTML = '<p class="preset-list-empty">Aucun aliment trouvé.</p>'; return; }
  listEl.innerHTML = filtered.map(f => {
    const meta = [
      f.calories_per_100g != null ? f.calories_per_100g + 'kcal' : null,
      f.protein_per_100g  != null ? f.protein_per_100g  + 'g p'  : null,
    ].filter(Boolean).join(' · ');
    const unit = f.unit || 'g';
    const perLabel = unit === 'unité' ? '/ unité' : `/100${unit}`;
    const tagIds   = foodTagLinks[f.id] || [];
    const tagColor = tagIds.length ? (tags.find(t => t.id === tagIds[0])?.color || '#64748b') : '#64748b';
    return `<div class="preset-item" onclick="selectFoodForPicker('${ctx}','${f.id}')">
      <span class="preset-item__name"><span class="preset-item__dot" style="background:${tagColor};"></span>${f.name}</span>
      <span class="preset-item__meta">${meta} ${perLabel}</span>
    </div>`;
  }).join('');
}

function selectFoodForPicker(ctx, foodId) {
  const food = foods.find(f => f.id === foodId);
  if (!food) return;
  foodPickerState[ctx] = { selectedId: foodId };
  const weightRow = document.getElementById(`fp-weight-${ctx}`);
  const nameEl    = document.getElementById(`fp-fname-${ctx}`);
  const gramsEl   = document.getElementById(`fp-grams-${ctx}`);
  if (weightRow) weightRow.style.display = 'flex';
  if (nameEl)    nameEl.textContent = `${food.name} (${food.unit || 'g'})`;
  if (gramsEl)   gramsEl.placeholder = food.unit || 'g';
  gramsEl?.focus();
}

async function applyFoodToJournal(ctx) {
  const state = foodPickerState[ctx];
  if (!state?.selectedId || !modalCtx) return;
  const food  = foods.find(f => f.id === state.selectedId);
  const qty   = parseFloat(document.getElementById(`fp-grams-${ctx}`)?.value);
  if (!food)               { showToast('Sélectionne un aliment', 'error'); return; }
  if (!qty || qty <= 0)    { showToast('Indique la quantité', 'error'); return; }

  const { date, mealType } = modalCtx;
  const isUnit = (food.unit || 'g') === 'unité';
  const factor = isUnit ? qty : qty / 100;

  const calcKcal = food.calories_per_100g != null ? food.calories_per_100g * factor : null;
  const calcProt = food.protein_per_100g  != null ? food.protein_per_100g  * factor : null;
  const calcGluc = food.carbs_per_100g    != null ? food.carbs_per_100g    * factor : null;
  const calcLip  = food.fat_per_100g      != null ? food.fat_per_100g      * factor : null;
  const calcFib  = food.fiber_per_100g    != null ? food.fiber_per_100g    * factor : null;

  const item = {
    date, meal_type: mealType, food_id: food.id, food_name: food.name, grams: qty,
    calories:  calcKcal != null ? Math.round(calcKcal) : null,
    protein_g: calcProt != null ? parseFloat(calcProt.toFixed(1)) : null,
    carbs_g:   calcGluc != null ? parseFloat(calcGluc.toFixed(1)) : null,
    fat_g:     calcLip  != null ? parseFloat(calcLip.toFixed(1))  : null,
    fiber_g:   calcFib  != null ? parseFloat(calcFib.toFixed(1))  : null,
    // Stock is only ever deducted once this meal is committed to the journal
    // (see commitStockDeductionForMeal), never at add-time or when just planned.
    deduct_from_stock: !!document.getElementById('deduct-modal')?.checked,
    stock_deducted: false,
  };
  const { data, error } = await db.from('meal_food_items').insert(item).select().single();
  if (error) { showToast(`Erreur : ${error.message}`, 'error'); return; }
  if (!weekFoodItems[date]) weekFoodItems[date] = {};
  if (!weekFoodItems[date][mealType]) weekFoodItems[date][mealType] = [];
  weekFoodItems[date][mealType].push(data);
  adjustMealMacroInputs('modal', { kcal: calcKcal, prot: calcProt, gluc: calcGluc, lip: calcLip, fib: calcFib });
  renderMealFoodItemsModal();
  updateModalDirtyIndicator();

  document.getElementById(`fp-grams-${ctx}`).value = '';
  document.getElementById(`fp-weight-${ctx}`).style.display = 'none';
  document.getElementById(`fp-search-${ctx}`).value = '';
  delete foodPickerState[ctx];
  renderFoodPickerContent(ctx);
  showToast(`${food.name} (${qty}${food.unit || 'g'}) ajouté`, 'success');
}

// ── Pantry stock deduction — deferred to journal commit time ───
// Atomic server-side pantry mutation: the +/- and the clamp at 0 happen in a
// single SQL UPDATE (see the adjust_pantry_quantity Postgres function), so
// concurrent meal commits can't lose each other's writes and we never persist
// a stale in-memory quantity. The local cache is synced to the value the
// server actually wrote.
async function applyPantryDelta(pantryItem, delta) {
  const { data, error } = await db.rpc('adjust_pantry_quantity', { p_item_id: pantryItem.id, p_delta: delta });
  if (error) { showToast(`Erreur stock : ${error.message}`, 'error'); return; }
  if (data != null) pantryItem.quantity = parseFloat(data);
}

async function deductFoodFromStock(foodId, qty) {
  const pantryItem = pantryItems.find(p => p.food_id === foodId);
  if (pantryItem) await applyPantryDelta(pantryItem, -qty);
  for (const eq of equivalences) {
    const isA = eq.food_id_a === foodId;
    const isB = eq.both_ways && eq.food_id_b === foodId;
    if (!isA && !isB) continue;
    const qtyB = eq.qty_b || 1;
    const gramsPerUnit = eq.ratio / qtyB;
    if (isA) {
      const units = Math.round(qty / gramsPerUnit);
      if (units <= 0) continue;
      if (Math.abs((qty / units) - gramsPerUnit) > eq.tolerance) continue;
      const target = pantryItems.find(p => p.food_id === eq.food_id_b);
      if (!target) continue;
      await applyPantryDelta(target, -units);
    } else {
      const gramsA = qty * gramsPerUnit;
      const target = pantryItems.find(p => p.food_id === eq.food_id_a);
      if (!target) continue;
      await applyPantryDelta(target, -gramsA);
    }
  }
}

async function refundFoodToStock(foodId, qty) {
  const pantryItem = pantryItems.find(p => p.food_id === foodId);
  if (pantryItem) await applyPantryDelta(pantryItem, qty);
}

// Deducts stock for whichever of this meal's items haven't been deducted yet
// (idempotent — safe to call again if the meal is re-committed after edits).
async function commitStockDeductionForMeal(date, mealType) {
  const items = (weekFoodItems[date] && weekFoodItems[date][mealType]) || [];
  const pending = items.filter(i => i.deduct_from_stock && !i.stock_deducted);
  for (const item of pending) {
    await deductFoodFromStock(item.food_id, item.grams);
    await db.from('meal_food_items').update({ stock_deducted: true }).eq('id', item.id);
    item.stock_deducted = true;
  }
}

function renderMealFoodItemsModal() {
  if (!modalCtx) return;
  const { date, mealType } = modalCtx;
  if (date === journalDate) renderSubstituteIndicator();
  const container = document.getElementById('mfi-modal');
  const items = (weekFoodItems[date] && weekFoodItems[date][mealType]) || [];
  const descEl = document.getElementById('desc-modal');
  if (descEl) {
    if (items.length) { descEl.value = items.map(i => i.food_name).join(', '); descEl.dataset.auto = '1'; }
    else if (descEl.dataset.auto === '1') { descEl.value = ''; descEl.dataset.auto = '0'; }
  }
  if (!container) return;
  if (!items.length) { container.innerHTML = ''; return; }
  container.innerHTML = items.map(item => {
    const fd = foods.find(f => f.id === item.food_id);
    const unit = fd?.unit || 'g';
    const qtyLabel = unit === 'unité' ? `${item.grams} unité` : `${item.grams}${unit}`;
    return `<div class="meal-food-item" id="mfi-item-${item.id}">
      <div class="meal-food-item__label">${item.food_name}</div>
      <div class="meal-food-item__meta">${qtyLabel} · ${item.calories ?? '—'} kcal${item.protein_g != null ? ` · ${item.protein_g}g P` : ''}</div>
      <div class="meal-food-item__edit-input" id="mfi-edit-${item.id}" style="display:none;">
        <input type="number" id="mfi-qty-${item.id}" class="np-input" placeholder="${unit}" min="1" style="width:70px;padding:4px 6px;" value="${item.grams}" onkeydown="if(event.key==='Enter')confirmFoodQtyEdit('${item.id}')" />
        <button class="btn btn--primary btn--sm" onclick="confirmFoodQtyEdit('${item.id}')">OK</button>
        <button class="btn btn--ghost btn--sm" onclick="cancelFoodQtyEdit('${item.id}')">✕</button>
      </div>
      <div style="display:flex;gap:3px;margin-left:auto;">
        <button class="btn btn--ghost btn--xs" onclick="editMealFoodItemQty('${item.id}')">✏️</button>
        <button class="btn btn--ghost btn--xs" style="color:rgba(248,113,113,0.8);" onclick="removeMealFoodItem('${item.id}')">✕</button>
      </div>
    </div>`;
  }).join('');
}

function editMealFoodItemQty(itemId) {
  const el = document.getElementById(`mfi-edit-${itemId}`);
  if (el) { el.style.display = 'flex'; document.getElementById(`mfi-qty-${itemId}`)?.focus(); }
}
function cancelFoodQtyEdit(itemId) {
  const el = document.getElementById(`mfi-edit-${itemId}`);
  if (el) el.style.display = 'none';
}

async function confirmFoodQtyEdit(itemId) {
  if (!modalCtx) return;
  const { date, mealType } = modalCtx;
  const items = (weekFoodItems[date] && weekFoodItems[date][mealType]) || [];
  const item  = items.find(i => String(i.id) === String(itemId));
  if (!item) return;
  // Snapshot the pre-edit values up front so nothing downstream can read stale/mutated state.
  const before = { ...item };
  const newQty = parseFloat(document.getElementById(`mfi-qty-${itemId}`)?.value);
  if (!newQty || newQty <= 0) { showToast('Indique la quantité', 'error'); return; }
  const food   = foods.find(f => f.id === item.food_id);
  const isUnit = (food?.unit || 'g') === 'unité';
  const factor = isUnit ? newQty : newQty / 100;
  const updated = {
    grams:     newQty,
    calories:  food ? Math.round(food.calories_per_100g * factor) : before.calories,
    protein_g: food ? parseFloat((food.protein_per_100g * factor).toFixed(1)) : before.protein_g,
    carbs_g:   food ? parseFloat((food.carbs_per_100g   * factor).toFixed(1)) : before.carbs_g,
    fat_g:     food ? parseFloat((food.fat_per_100g     * factor).toFixed(1)) : before.fat_g,
    fiber_g:   food ? parseFloat((food.fiber_per_100g   * factor).toFixed(1)) : before.fiber_g,
  };
  const { error } = await db.from('meal_food_items').update(updated).eq('id', itemId);
  if (error) { showToast(`Erreur : ${error.message}`, 'error'); return; }
  // If stock was already deducted for this item (meal already in the journal), keep
  // the pantry in sync with the quantity change instead of leaving it stale.
  if (before.stock_deducted) {
    const delta = newQty - before.grams;
    if (delta > 0) await deductFoodFromStock(before.food_id, delta);
    else if (delta < 0) await refundFoodToStock(before.food_id, -delta);
  }
  adjustMealMacroInputs('modal', {
    kcal: updated.calories  != null && before.calories  != null ? updated.calories  - before.calories  : null,
    prot: updated.protein_g != null && before.protein_g != null ? updated.protein_g - before.protein_g : null,
    gluc: updated.carbs_g   != null && before.carbs_g   != null ? updated.carbs_g   - before.carbs_g   : null,
    lip:  updated.fat_g     != null && before.fat_g     != null ? updated.fat_g     - before.fat_g     : null,
    fib:  updated.fiber_g   != null && before.fiber_g   != null ? updated.fiber_g   - before.fiber_g   : null,
  });
  Object.assign(item, updated);
  renderMealFoodItemsModal();
  updateModalDirtyIndicator();
  showToast('Quantité mise à jour', 'success');
}

async function removeMealFoodItem(itemId) {
  if (!modalCtx) return;
  const { date, mealType } = modalCtx;
  const items = (weekFoodItems[date] && weekFoodItems[date][mealType]) || [];
  const item = items.find(i => String(i.id) === String(itemId));
  const { error } = await db.from('meal_food_items').delete().eq('id', itemId);
  if (error) { showToast(`Erreur : ${error.message}`, 'error'); return; }
  if (item) {
    // Give back whatever stock was already deducted for this item, if any.
    if (item.stock_deducted) await refundFoodToStock(item.food_id, item.grams);
    adjustMealMacroInputs('modal', {
      kcal: item.calories  != null ? -item.calories  : null,
      prot: item.protein_g != null ? -item.protein_g : null,
      gluc: item.carbs_g   != null ? -item.carbs_g   : null,
      lip:  item.fat_g     != null ? -item.fat_g     : null,
      fib:  item.fiber_g   != null ? -item.fiber_g   : null,
    });
  }
  weekFoodItems[date][mealType] = items.filter(i => String(i.id) !== String(itemId));
  renderMealFoodItemsModal();
  updateModalDirtyIndicator();
  showToast('Aliment supprimé', 'success');
}

// ── Meal modal — open / close / save ────────────────────────
function readModalFields() {
  return {
    description: document.getElementById('desc-modal').value.trim() || null,
    calories:  numI(document.getElementById('kcal-modal').value),
    protein_g: numF(document.getElementById('prot-modal').value),
    carbs_g:   numF(document.getElementById('gluc-modal').value),
    fat_g:     numF(document.getElementById('lip-modal').value),
    fiber_g:   numF(document.getElementById('fib-modal').value),
  };
}

function isModalDirty() {
  if (!modalCtx || !modalSnapshot) return false;
  const cur = readModalFields();
  return Object.keys(cur).some(k => cur[k] !== modalSnapshot[k]);
}

function updateModalDirtyIndicator() {
  const el = document.getElementById('mm-dirty-indicator');
  if (el) el.style.display = isModalDirty() ? 'inline' : 'none';
}

function openMealModal(dateStr, mealType) {
  modalCtx = { date: dateStr, mealType };

  const m = weekMeals[dateStr] && weekMeals[dateStr][mealType];
  const p = weekPlans[dateStr] && weekPlans[dateStr][mealType];
  const src = m || p;

  const descEl = document.getElementById('desc-modal');
  descEl.value = src?.description || '';
  descEl.dataset.auto = '0';
  document.getElementById('kcal-modal').value = src?.calories    ?? '';
  document.getElementById('prot-modal').value = src?.protein_g   ?? '';
  document.getElementById('gluc-modal').value = src?.carbs_g     ?? '';
  document.getElementById('lip-modal').value  = src?.fat_g       ?? '';
  document.getElementById('fib-modal').value  = src?.fiber_g     ?? '';

  modalSnapshot = src ? {
    description: src.description ?? null, calories: src.calories ?? null, protein_g: src.protein_g ?? null,
    carbs_g: src.carbs_g ?? null, fat_g: src.fat_g ?? null, fiber_g: src.fiber_g ?? null,
  } : { description: null, calories: null, protein_g: null, carbs_g: null, fat_g: null, fiber_g: null };

  if (!src) {
    const agg = sumMealAggregate(dateStr, mealType);
    if (agg.calories  != null) document.getElementById('kcal-modal').value = agg.calories;
    if (agg.protein_g != null) document.getElementById('prot-modal').value = agg.protein_g;
    if (agg.carbs_g   != null) document.getElementById('gluc-modal').value = agg.carbs_g;
    if (agg.fat_g     != null) document.getElementById('lip-modal').value  = agg.fat_g;
    if (agg.fiber_g   != null) document.getElementById('fib-modal').value  = agg.fiber_g;
  }

  document.getElementById('deduct-modal').checked = true;
  document.getElementById('fp-search-modal').value = '';
  document.getElementById('fp-weight-modal').style.display = 'none';
  delete foodPickerState['modal'];

  renderFoodPickerContent('modal');
  renderMealFoodItemsModal();
  updateModalDirtyIndicator();

  setEl('mm-title', MEAL_TYPES.find(x => x.key === mealType)?.label || mealType);
  setEl('mm-date-label', formatDateLong(dateStr));

  document.getElementById('meal-modal').classList.add('open');
  document.getElementById('meal-modal').setAttribute('aria-hidden', 'false');
}

function requestCloseMealModal() {
  if (isModalDirty()) {
    document.getElementById('meal-modal-confirm').classList.add('open');
    document.getElementById('meal-modal-confirm').setAttribute('aria-hidden', 'false');
  } else {
    closeMealModal();
  }
}

function closeMealModal() {
  document.getElementById('meal-modal').classList.remove('open');
  document.getElementById('meal-modal').setAttribute('aria-hidden', 'true');
  document.getElementById('meal-modal-confirm').classList.remove('open');
  document.getElementById('meal-modal-confirm').setAttribute('aria-hidden', 'true');
  modalCtx = null;
  modalSnapshot = null;
  renderMealTable(); // food items may have changed during the session even if not saved as plan/journal
}

function discardMealModalChanges() {
  closeMealModal();
}

async function saveAndCloseMealModal() {
  if (!modalCtx) return;
  const { date, mealType } = modalCtx;
  // If this meal already lives in the journal (a 'logged' row), "save my changes
  // before closing" must update that same row — writing a 'planned' row instead
  // would leave the journal (which is what's actually displayed) stale, e.g. still
  // showing food items that were just removed.
  const alreadyInJournal = !!(weekMeals[date] && weekMeals[date][mealType]);
  if (alreadyInJournal) await modalSaveMeal();
  else await modalPlanMeal(true);
}

// A meal with no description and no macros has nothing left to show — leaving a
// hollow row around would make the cell/modal look "saved"/"planned" for a meal
// that's actually empty (e.g. after removing every food item). Delete instead.
function isMealFieldsEmpty(fields) {
  return !fields.description && fields.calories == null && fields.protein_g == null
    && fields.carbs_g == null && fields.fat_g == null && fields.fiber_g == null;
}

async function modalPlanMeal(closeAfter = false) {
  if (!modalCtx) return;
  const { date, mealType } = modalCtx;
  const fields = readModalFields();
  if (isMealFieldsEmpty(fields)) {
    const { error } = await db.from('meals').delete().eq('date', date).eq('meal_type', mealType).eq('status', 'planned');
    if (error) { showToast(`Erreur : ${error.message}`, 'error'); return; }
    showToast('Repas retiré du plan', 'success');
  } else {
    const entry = { date, meal_type: mealType, status: 'planned', ...fields };
    const { error } = await db.from('meals').upsert(entry, { onConflict: 'date,meal_type,status' });
    if (error) { showToast(`Erreur : ${error.message}`, 'error'); return; }
    showToast('Repas enregistré (plan)', 'success');
  }
  await loadWeekData();
  if (closeAfter) {
    closeMealModal();
  } else {
    modalSnapshot = fields;
    updateModalDirtyIndicator();
  }
}

async function modalSaveMeal() {
  if (!modalCtx) return;
  const { date, mealType } = modalCtx;
  const fields = readModalFields();
  if (isMealFieldsEmpty(fields)) {
    const { error } = await db.from('meals').delete().eq('date', date).eq('meal_type', mealType).eq('status', 'logged');
    if (error) { showToast(`Erreur : ${error.message}`, 'error'); return; }
    showToast('Repas vidé du journal', 'success');
  } else {
    const entry = { date, meal_type: mealType, status: 'logged', ...fields };
    const { error } = await db.from('meals').upsert(entry, { onConflict: 'date,meal_type,status' });
    if (error) { showToast(`Erreur : ${error.message}`, 'error'); return; }
    await commitStockDeductionForMeal(date, mealType);
    showToast('Repas ajouté au journal ✓', 'success');
  }
  await loadWeekData();
  syncNutritionTable(date);
  closeMealModal();
}

// ── Pantry ─────────────────────────────────────────────────
async function loadPantry() {
  const { data } = await db.from('pantry_items').select('*').not('item_type', 'is', null).order('name');
  pantryItems = data || [];
  renderPantryList();
}

function renderPantryList() {
  const container = document.getElementById('pantry-list');
  if (!pantryItems.length) {
    container.innerHTML = '<p style="color:var(--text-dim);font-size:13px;text-align:center;padding:32px 0;">Stock vide. Ajoutez vos aliments et substituts.</p>';
    return;
  }

  const tagGroups = {};
  pantryItems.forEach(p => {
    const tagIds   = foodTagLinks[p.food_id] || [];
    const tag      = tagIds.length ? tags.find(t => t.id === tagIds[0]) : null;
    const tagName  = tag?.name  || 'Autres';
    const tagColor = tag?.color || '#64748b';
    if (!tagGroups[tagName]) tagGroups[tagName] = { color: tagColor, items: [] };
    tagGroups[tagName].items.push(p);
  });
  const tagKeys = Object.keys(tagGroups).sort((a, b) => {
    if (a === 'Autres') return 1;
    if (b === 'Autres') return -1;
    return a.localeCompare(b);
  });

  const html = tagKeys.map(tagName => {
    const g = tagGroups[tagName];
    return `<div class="tag-col-group">
      <div style="margin-bottom:4px;font-size:11px;color:${g.color};text-transform:uppercase;letter-spacing:0.06em;padding:4px 0;display:flex;align-items:center;gap:6px;">
        <span style="width:8px;height:8px;border-radius:50%;background:${g.color};display:inline-block;flex-shrink:0;"></span>${tagName}
      </div>
      ${g.items.map(p => renderPantryRow(p)).join('')}
    </div>`;
  }).join('');

  container.innerHTML = `<div class="tag-col-layout">${html}</div>`;
}

function renderPantryRow(p) {
  return `<div class="pantry-stock-row" id="pantry-row-${p.id}">
    <div class="pantry-stock-row__name">${p.name}</div>
    <div style="display:flex;align-items:center;gap:8px;">
      <input type="number" class="pantry-qty-input" value="${p.quantity}" min="0" step="0.1"
        onchange="updatePantryQty('${p.id}',this.value)"
        style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.1);border-radius:6px;padding:5px 8px;color:var(--text);font-size:13px;text-align:center;width:80px;" />
      <span class="pantry-stock-row__unit">${p.unit}</span>
      <button class="btn btn--ghost btn--sm" style="color:rgba(248,113,113,0.7);flex-shrink:0;" onclick="removePantryItem('${p.id}')">✕</button>
    </div>
  </div>`;
}

function showPantryForm() {
  document.getElementById('pantry-add-form').style.display = 'block';
  document.getElementById('pantry-search').value = '';
  document.getElementById('pantry-search-results').style.display = 'none';
  document.getElementById('pantry-qty').value = '';
  document.getElementById('pantry-selected').textContent = '';
  document.getElementById('pantry-unit-label').textContent = '';
  pantrySelectedItem = null;
  setTimeout(() => document.getElementById('pantry-search').focus(), 50);
}

function hidePantryForm() {
  document.getElementById('pantry-add-form').style.display = 'none';
  pantrySelectedItem = null;
}

function renderPantrySearch() {
  const search  = document.getElementById('pantry-search').value.toLowerCase().trim();
  const results = document.getElementById('pantry-search-results');
  if (!search) { results.style.display = 'none'; results.innerHTML = ''; return; }

  const foodMatches = foods.filter(f => f.name.toLowerCase().includes(search)).slice(0, 8);
  const all = foodMatches.map(f => ({ type:'food', id:f.id, name:f.name, unit:f.unit||'g' }));

  if (!all.length) { results.style.display = 'none'; return; }
  results.innerHTML = all.map(m => `
    <div class="preset-item" onclick="selectPantryItem('${m.type}','${m.id}','${m.name.replace(/'/g,"\\'")}','${m.unit}')">
      <span class="preset-item__name">${m.name}</span>
      <span class="preset-item__meta">🥗 ${m.unit}</span>
    </div>`).join('');
  results.style.display = 'block';
}

function selectPantryItem(type, id, name, unit) {
  pantrySelectedItem = { type, id, name, unit };
  document.getElementById('pantry-search').value       = name;
  document.getElementById('pantry-search-results').style.display = 'none';
  document.getElementById('pantry-unit-label').textContent = unit;
  document.getElementById('pantry-selected').textContent  = `Sélectionné : ${name} (${unit})`;
  document.getElementById('pantry-qty').focus();
}

async function addPantryItem() {
  if (!pantrySelectedItem) { showToast('Sélectionnez un aliment', 'error'); return; }
  const qty = parseFloat(document.getElementById('pantry-qty').value);
  if (!qty || qty < 0) { showToast('Entrez une quantité', 'error'); return; }

  const isFood = pantrySelectedItem.type === 'food';
  const existing = pantryItems.find(p =>
    (isFood  && p.food_id      === pantrySelectedItem.id) ||
    (!isFood && p.substitute_id === pantrySelectedItem.id)
  );

  if (existing) {
    const newQty = existing.quantity + qty;
    const { error } = await db.from('pantry_items').update({ quantity: newQty, updated_at: new Date().toISOString() }).eq('id', existing.id);
    if (error) { showToast(`Erreur : ${error.message}`, 'error'); return; }
  } else {
    const item = {
      item_type:    isFood ? 'food' : 'substitute',
      food_id:      isFood ? pantrySelectedItem.id : null,
      substitute_id: !isFood ? pantrySelectedItem.id : null,
      name:         pantrySelectedItem.name,
      quantity:     qty,
      unit:         pantrySelectedItem.unit,
    };
    const { error } = await db.from('pantry_items').insert(item);
    if (error) { showToast(`Erreur : ${error.message}`, 'error'); return; }
  }

  showToast(`${pantrySelectedItem.name} mis à jour dans le stock`, 'success');

  // Auto-add food_a equivalents when food_b is added
  if (isFood) {
    const autoEqs = equivalences.filter(eq => eq.food_id_b === pantrySelectedItem.id && eq.auto_add_food_a);
    for (const eq of autoEqs) {
      const gramsA = qty * (eq.ratio / (eq.qty_b || 1));
      const foodAFood = foods.find(f => f.id === eq.food_id_a);
      if (!foodAFood) continue;
      // Reload pantry to get current state before checking
      const { data: currentPantry } = await db.from('pantry_items').select('*').eq('food_id', eq.food_id_a).single();
      if (currentPantry) {
        await db.from('pantry_items').update({ quantity: currentPantry.quantity + gramsA, updated_at: new Date().toISOString() }).eq('id', currentPantry.id);
      } else {
        await db.from('pantry_items').insert({
          item_type: 'food', food_id: eq.food_id_a,
          name: foodAFood.name, quantity: gramsA, unit: foodAFood.unit || 'g',
        });
      }
      showToast(`${foodAFood.name} ajouté automatiquement (${gramsA.toFixed(0)}${foodAFood.unit || 'g'})`, 'success');
    }
  }

  hidePantryForm();
  await loadPantry();
}

async function updatePantryQty(id, val) {
  const qty = parseFloat(val);
  if (isNaN(qty) || qty < 0) return;
  const { error } = await db.from('pantry_items').update({ quantity: qty, updated_at: new Date().toISOString() }).eq('id', id);
  if (!error) {
    const item = pantryItems.find(p => p.id === id);
    if (item) item.quantity = qty;
  }
}

async function removePantryItem(id) {
  const { error } = await db.from('pantry_items').delete().eq('id', id);
  if (error) { showToast('Erreur', 'error'); return; }
  pantryItems = pantryItems.filter(p => p.id !== id);
  renderPantryList();
  showToast('Article retiré du stock', 'success');
}

// ── Barcode scanner (Open Food Facts) ───────────────────────
let barcodeControls   = null; // IScannerControls returned by decodeFromVideoDevice (ZXing path)
let barcodeStream     = null; // MediaStream for the native BarcodeDetector path
let barcodeScanTimer  = null; // setTimeout handle for the native detect loop
let barcodeOffProduct = null; // pending OFF product candidate awaiting confirmation
let pendingBarcode    = null; // the scanned code awaiting create-or-attach

function openBarcodeScanner() {
  document.getElementById('bc-scan-view').style.display = 'block';
  document.getElementById('bc-manual-view').style.display = 'none';
  document.getElementById('bc-result-view').style.display = 'none';
  document.getElementById('bc-result-view').innerHTML = '';
  barcodeOffProduct = null;
  document.getElementById('barcode-modal').classList.add('open');
  document.getElementById('barcode-modal').setAttribute('aria-hidden', 'false');
  startBarcodeScan();
}

function closeBarcodeScanner() {
  stopBarcodeScan();
  document.getElementById('barcode-modal').classList.remove('open');
  document.getElementById('barcode-modal').setAttribute('aria-hidden', 'true');
}

async function startBarcodeScan() {
  // 1) Prefer the browser-native BarcodeDetector: no library, lighter, and
  //    better maintained than ZXing. Not available everywhere (notably absent
  //    on iOS Safari), so fall back gracefully.
  if (await startNativeBarcodeScan()) return;
  // 2) ZXing fallback (loaded from CDN in nutrition.html).
  if (!window.ZXingBrowser) { switchToManualBarcodeEntry(); return; }
  try {
    const reader  = new ZXingBrowser.BrowserMultiFormatReader();
    const videoEl = document.getElementById('bc-video');
    // No deviceId -> ZXing requests { facingMode: 'environment' } itself, which is the
    // reliable cross-browser way to get the rear camera. Picking a device by label was
    // unreliable: labels are often empty until permission has already been granted, so
    // it silently fell back to whichever camera happened to be first (often the front one).
    barcodeControls = await reader.decodeFromVideoDevice(undefined, videoEl, (result) => {
      if (result) { stopBarcodeScan(); lookupBarcode(result.getText()); }
    });
  } catch (e) {
    showToast('Caméra indisponible : ' + e.message, 'error');
    switchToManualBarcodeEntry();
  }
}

// Returns true if the native scanner started successfully, false if the API is
// missing or camera access failed (so the caller can fall back to ZXing).
async function startNativeBarcodeScan() {
  if (typeof window.BarcodeDetector === 'undefined') return false;
  try {
    const supported = await window.BarcodeDetector.getSupportedFormats();
    const formats = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128'].filter(f => supported.includes(f));
    if (!formats.length) return false;
    const detector = new window.BarcodeDetector({ formats });

    const videoEl = document.getElementById('bc-video');
    // facingMode 'environment' -> rear camera, same reliable constraint ZXing uses.
    barcodeStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
    videoEl.srcObject = barcodeStream;
    videoEl.setAttribute('playsinline', 'true');
    await videoEl.play();

    const scan = async () => {
      if (!barcodeStream) return; // stopped between ticks
      try {
        const codes = await detector.detect(videoEl);
        if (codes && codes.length) {
          const raw = codes[0].rawValue;
          stopBarcodeScan();
          lookupBarcode(raw);
          return;
        }
      } catch (_) { /* transient detect frame error — keep looping */ }
      barcodeScanTimer = setTimeout(scan, 200);
    };
    barcodeScanTimer = setTimeout(scan, 200);
    return true;
  } catch (e) {
    stopBarcodeScan(); // clean up any partially-opened stream before falling back
    return false;
  }
}

function stopBarcodeScan() {
  if (barcodeControls) { barcodeControls.stop(); barcodeControls = null; }
  if (barcodeScanTimer) { clearTimeout(barcodeScanTimer); barcodeScanTimer = null; }
  if (barcodeStream) { barcodeStream.getTracks().forEach(t => t.stop()); barcodeStream = null; }
  const videoEl = document.getElementById('bc-video');
  if (videoEl) videoEl.srcObject = null;
}

function switchToManualBarcodeEntry() {
  stopBarcodeScan();
  document.getElementById('bc-scan-view').style.display = 'none';
  document.getElementById('bc-manual-view').style.display = 'block';
  document.getElementById('bc-manual-code')?.focus();
}

function inferUnitFromOff(offProduct) {
  const q = (offProduct.quantity || '').toLowerCase();
  if (/\d\s*(l|cl|ml)\b/.test(q)) return 'L';
  return 'g';
}

function parseOffQuantity(qtyStr, unit) {
  if (!qtyStr) return null;
  const m = qtyStr.toLowerCase().match(/([\d.,]+)\s*(kg|g|l|cl|ml)\b/);
  if (!m) return null;
  const val = parseFloat(m[1].replace(',', '.'));
  const u = m[2];
  if (unit === 'g') {
    if (u === 'kg') return val * 1000;
    if (u === 'g')  return val;
    return null;
  }
  if (unit === 'L') {
    if (u === 'l')  return val;
    if (u === 'cl') return val / 100;
    if (u === 'ml') return val / 1000;
    return null;
  }
  return null;
}

async function lookupBarcode(code) {
  code = (code || '').trim();
  if (!/^\d{6,14}$/.test(code)) { showToast('Code-barre invalide', 'error'); return; }
  pendingBarcode = code;

  const localFood = foods.find(f => f.id === barcodeToFood[code]);
  if (localFood) { showBarcodeResult(localFood, null); return; }

  document.getElementById('bc-scan-view').style.display = 'none';
  document.getElementById('bc-manual-view').style.display = 'none';
  document.getElementById('bc-result-view').style.display = 'block';
  document.getElementById('bc-result-view').innerHTML = '<p style="text-align:center;color:var(--text-dim);padding:20px 0;">Recherche…</p>';

  try {
    const res  = await fetch(`https://world.openfoodfacts.org/api/v2/product/${code}.json?fields=product_name,brands,quantity,nutriments,image_front_small_url`);
    const json = await res.json();
    if (json.status !== 1 || !json.product) { showBarcodeNotFound(code); return; }
    showBarcodeResult(null, { code, ...json.product });
  } catch (e) {
    document.getElementById('bc-result-view').innerHTML = `<p style="color:#f87171;text-align:center;padding:20px 0;">Erreur réseau : ${e.message}</p>`;
  }
}

function showBarcodeNotFound(code) {
  barcodeOffProduct = null;
  const view = document.getElementById('bc-result-view');
  view.innerHTML = `
    <p style="text-align:center;color:var(--text-dim);padding:8px 0;">Produit introuvable sur Open Food Facts (code ${code}).</p>
    ${barcodeAttachSectionHTML()}
    <div class="bc-or">— ou —</div>
    <button class="btn btn--primary btn--sm" style="width:100%;" onclick="createFoodFromBarcode()">Créer un nouvel aliment</button>
    <button class="btn btn--ghost btn--sm" style="width:100%;margin-top:8px;" onclick="openBarcodeScanner()">↺ Réessayer</button>
  `;
  renderBarcodeAttachList('');
}

// Shared "attach this scanned code to an existing food" block — the anti-duplicate path.
function barcodeAttachSectionHTML() {
  return `
    <div style="margin-top:6px;">
      <p style="font-size:12px;color:var(--text-dim);margin-bottom:6px;">Rattacher ce code à un aliment existant :</p>
      <input type="text" id="bc-attach-search" class="np-input" placeholder="Rechercher un aliment…" style="width:100%;margin-bottom:6px;" oninput="renderBarcodeAttachList(this.value)" />
      <div id="bc-attach-list" class="bc-attach-list"></div>
    </div>`;
}

function renderBarcodeAttachList(search) {
  const listEl = document.getElementById('bc-attach-list');
  if (!listEl) return;
  const q = (search || '').toLowerCase();
  const matches = foods.filter(f => f.name.toLowerCase().includes(q)).slice(0, 8);
  if (!matches.length) { listEl.innerHTML = '<p class="preset-list-empty">Aucun aliment.</p>'; return; }
  listEl.innerHTML = matches.map(f => {
    const count = (foodBarcodes[f.id] || []).length;
    return `<div class="bc-attach-item" onclick="attachScannedBarcodeToFood('${f.id}')">
      <span>${f.name}</span>
      <span style="font-size:11px;color:var(--text-dim);">${count}/${MAX_BARCODES_PER_FOOD} 📷</span>
    </div>`;
  }).join('');
}

// Insert a (food_id, barcode) row, enforcing the per-food cap. Returns true on success.
async function attachBarcodeToFoodRow(foodId, code) {
  if ((foodBarcodes[foodId] || []).length >= MAX_BARCODES_PER_FOOD) {
    showToast(`Maximum ${MAX_BARCODES_PER_FOOD} codes-barres par aliment`, 'error');
    return false;
  }
  const { error } = await db.from('food_barcodes').insert({ food_id: foodId, barcode: code });
  if (error) {
    // Unique violation -> the code is already linked to some food.
    showToast(/duplicate|unique/i.test(error.message) ? 'Ce code est déjà associé à un aliment' : `Erreur : ${error.message}`, 'error');
    return false;
  }
  barcodeToFood[code] = foodId;
  (foodBarcodes[foodId] = foodBarcodes[foodId] || []).push(code);
  return true;
}

// From the scanner: attach the pending code to the chosen food, then add it to stock.
async function attachScannedBarcodeToFood(foodId) {
  if (!pendingBarcode) return;
  const ok = await attachBarcodeToFoodRow(foodId, pendingBarcode);
  if (!ok) return;
  const food = foods.find(f => f.id === foodId);
  showToast(`Code rattaché à ${food?.name || 'l\'aliment'}`, 'success');
  showBarcodeResult(food, null); // now a known food -> quantity prompt
}

// Create-from-barcode when OFF has no product: a blank editable form.
function createFoodFromBarcode() {
  barcodeOffProduct = { code: pendingBarcode, product_name: '', nutriments: {}, quantity: '' };
  showBarcodeResult(null, barcodeOffProduct);
}

function showBarcodeResult(existingFood, offProduct) {
  const view = document.getElementById('bc-result-view');
  view.style.display = 'block';

  if (existingFood) {
    barcodeOffProduct = null;
    view.innerHTML = `
      <div style="text-align:center;margin-bottom:12px;">
        <div style="font-weight:600;">${existingFood.name}</div>
        <div style="font-size:12px;color:var(--text-dim);">Déjà dans tes aliments</div>
      </div>
      <div style="display:flex;gap:8px;align-items:center;">
        <input type="number" id="bc-qty" class="np-input" placeholder="Quantité (${existingFood.unit || 'g'})" min="0" step="0.1" style="flex:1;" />
        <button class="btn btn--primary btn--sm" onclick="confirmBarcodeAdd('${existingFood.id}', document.getElementById('bc-qty').value)">Ajouter</button>
      </div>
      <button class="btn btn--ghost btn--sm" style="width:100%;margin-top:10px;" onclick="openBarcodeScanner()">↺ Scanner un autre produit</button>
    `;
    setTimeout(() => document.getElementById('bc-qty')?.focus(), 50);
    return;
  }

  barcodeOffProduct = offProduct;
  const n = offProduct.nutriments || {};
  const unit = inferUnitFromOff(offProduct);
  const parsedQty = parseOffQuantity(offProduct.quantity, unit);
  const macrosPreview = [
    n['energy-kcal_100g'] != null ? Math.round(n['energy-kcal_100g']) + ' kcal' : null,
    n['proteins_100g']    != null ? n['proteins_100g'] + 'g P' : null,
  ].filter(Boolean).join(' · ');

  const esc = s => String(s ?? '').replace(/"/g, '&quot;');
  view.innerHTML = `
    <div style="text-align:center;margin-bottom:10px;">
      ${offProduct.image_front_small_url ? `<img src="${offProduct.image_front_small_url}" style="height:64px;border-radius:8px;margin-bottom:6px;" />` : ''}
      <div style="font-size:12px;color:var(--text-dim);">${offProduct.brands || 'Nouvel aliment'}</div>
      <div style="font-size:12px;color:var(--primary);margin-top:4px;">${macrosPreview || 'Macros inconnues /100g'}</div>
    </div>
    <input type="text" id="bc-new-name" class="np-input" placeholder="Nom de l'aliment" value="${esc(offProduct.product_name || '')}" style="width:100%;margin-bottom:8px;" />
    <div class="meal-macros-labels"><span>kcal</span><span>Prot</span><span>Gluc</span><span>Lip</span><span>Fib</span></div>
    <div class="meal-macros" style="margin-bottom:10px;">
      <input type="number" id="bc-new-kcal" value="${n['energy-kcal_100g'] ?? ''}" placeholder="—" />
      <input type="number" id="bc-new-prot" value="${n['proteins_100g'] ?? ''}" placeholder="—" step="0.1" />
      <input type="number" id="bc-new-gluc" value="${n['carbohydrates_100g'] ?? ''}" placeholder="—" step="0.1" />
      <input type="number" id="bc-new-lip"  value="${n['fat_100g'] ?? ''}" placeholder="—" step="0.1" />
      <input type="number" id="bc-new-fib"  value="${n['fiber_100g'] ?? ''}" placeholder="—" step="0.1" />
    </div>
    <div style="display:flex;gap:8px;margin-bottom:10px;">
      <select id="bc-new-unit" class="np-input" style="width:auto;">
        <option value="g"${unit === 'g' ? ' selected' : ''}>g</option>
        <option value="L"${unit === 'L' ? ' selected' : ''}>L</option>
        <option value="unité"${unit === 'unité' ? ' selected' : ''}>unité</option>
      </select>
      <input type="number" id="bc-qty" class="np-input" placeholder="Quantité en stock" min="0" step="0.1" value="${parsedQty ?? ''}" style="flex:1;" />
    </div>
    <button class="btn btn--primary btn--sm" style="width:100%;" onclick="confirmBarcodeCreateAndAdd()">Créer et ajouter au stock</button>
    ${barcodeAttachSectionHTML()}
    <button class="btn btn--ghost btn--sm" style="width:100%;margin-top:10px;" onclick="openBarcodeScanner()">↺ Scanner un autre produit</button>
  `;
  renderBarcodeAttachList('');
}

async function confirmBarcodeAdd(foodId, qtyVal) {
  const qty = parseFloat(qtyVal);
  if (!qty || qty <= 0) { showToast('Quantité invalide', 'error'); return; }
  const food = foods.find(f => f.id === foodId);
  if (!food) return;
  const existing = pantryItems.find(p => p.food_id === foodId);
  if (existing) {
    const newQty = existing.quantity + qty;
    const { error } = await db.from('pantry_items').update({ quantity: newQty, updated_at: new Date().toISOString() }).eq('id', existing.id);
    if (error) { showToast(`Erreur : ${error.message}`, 'error'); return; }
  } else {
    const { error } = await db.from('pantry_items').insert({ item_type: 'food', food_id: foodId, name: food.name, quantity: qty, unit: food.unit || 'g' });
    if (error) { showToast(`Erreur : ${error.message}`, 'error'); return; }
  }
  showToast(`${food.name} ajouté au stock`, 'success');
  closeBarcodeScanner();
  await loadPantry();
}

async function confirmBarcodeCreateAndAdd() {
  if (!barcodeOffProduct) return;
  const name = document.getElementById('bc-new-name')?.value.trim();
  if (!name) { showToast('Nom requis', 'error'); return; }
  const qty  = parseFloat(document.getElementById('bc-qty')?.value);
  const unit = document.getElementById('bc-new-unit')?.value || 'g';
  if (!qty || qty <= 0) { showToast('Quantité invalide', 'error'); return; }
  const entry = {
    name, unit,
    calories_per_100g: numF(document.getElementById('bc-new-kcal').value),
    protein_per_100g:  numF(document.getElementById('bc-new-prot').value),
    carbs_per_100g:    numF(document.getElementById('bc-new-gluc').value),
    fat_per_100g:      numF(document.getElementById('bc-new-lip').value),
    fiber_per_100g:    numF(document.getElementById('bc-new-fib').value),
  };
  const { data: newFood, error } = await db.from('foods').insert(entry).select().single();
  if (error) { showToast(`Erreur : ${error.message}`, 'error'); return; }
  foods.push(newFood);
  // Link the scanned barcode to the new food.
  if (barcodeOffProduct.code) await attachBarcodeToFoodRow(newFood.id, barcodeOffProduct.code);
  renderFoodList();
  await confirmBarcodeAdd(newFood.id, qty);
}

// ── Shopping list ──────────────────────────────────────────
// Rolling 7-day window: today through today+6 (inclusive).
function getShoppingPeriod() {
  const start = today();
  const startDate = new Date(start + 'T12:00:00');
  const endDate = new Date(startDate);
  endDate.setDate(startDate.getDate() + 6);
  const end = `${endDate.getFullYear()}-${String(endDate.getMonth()+1).padStart(2,'0')}-${String(endDate.getDate()).padStart(2,'0')}`;
  return { start, end };
}

// Hour at which each meal type is considered "past" for today (24 = never excluded before midnight).
const MEAL_TIME_END_HOUR = {
  breakfast: 8, morning_snack: 12, lunch: 14,
  afternoon_snack: 18, dinner: 21, evening_snack: 24,
};

// Today's meals whose usual time window has already passed are excluded — no point
// shopping for a meal that's already happened or is happening right now.
function isMealAlreadyPassedToday(dateStr, mealType) {
  if (dateStr !== today()) return false;
  const endHour = MEAL_TIME_END_HOUR[mealType];
  if (endHour == null) return false;
  return new Date().getHours() >= endHour;
}

async function generateShoppingList() {
  const { start, end } = getShoppingPeriod();
  setEl('courses-period', `Du ${formatDateShort(start)} au ${formatDateShort(end)} (7 jours)`);
  const slc = document.getElementById('shopping-list-content');
  if (slc) slc.innerHTML = '<p style="color:var(--text-dim);font-size:13px;text-align:center;padding:24px;">Calcul en cours…</p>';

  const [planItemsRes, pantryRes, tagsRes, tagLinksRes] = await Promise.all([
    db.from('meal_food_items').select('date, meal_type, food_id, food_name, grams').gte('date', start).lte('date', end),
    db.from('pantry_items').select('*'),
    db.from('food_tags').select('*'),
    db.from('food_tag_links').select('food_id, tag_id'),
  ]);

  const planItems  = (planItemsRes.data || []).filter(item => !isMealAlreadyPassedToday(item.date, item.meal_type));
  const pantrySnap = pantryRes.data     || [];
  const allTags    = tagsRes.data       || [];
  const tagLinks   = tagLinksRes.data   || [];

  const foodTagMap = {};
  tagLinks.forEach(link => {
    if (!foodTagMap[link.food_id]) {
      const t = allTags.find(x => x.id === link.tag_id);
      if (t) foodTagMap[link.food_id] = t;
    }
  });

  // Aggregate food needs
  const foodNeeds = {};
  planItems.forEach(item => {
    if (!foodNeeds[item.food_id]) {
      const food = foods.find(f => f.id === item.food_id);
      foodNeeds[item.food_id] = {
        name: item.food_name, totalQty: 0,
        unit: food?.unit || 'g', tag: foodTagMap[item.food_id] || null,
      };
    }
    foodNeeds[item.food_id].totalQty += (item.grams || 0);
  });

  // Compute what's needed
  const shoppingItems = [];
  Object.entries(foodNeeds).forEach(([foodId, need]) => {
    const pantryItem = pantrySnap.find(p => p.food_id === foodId);
    const inStock    = pantryItem?.quantity || 0;
    const toBuy      = Math.max(0, need.totalQty - inStock);
    if (toBuy > 0) shoppingItems.push({ ...need, food_id: foodId, sub_id: null, inStock, toBuy: Math.round(toBuy * 10) / 10 });
  });

  checkedShoppingItems = new Set();
  renderShoppingList(shoppingItems);
}

function renderShoppingList(items) {
  const container = document.getElementById('shopping-list-content');
  if (!items.length) {
    container.innerHTML = '<p style="color:#22c55e;font-size:13px;text-align:center;padding:32px 0;">✅ Tout est en stock ! Rien à acheter cette semaine.</p>';
    return;
  }

  // Group by tag name
  const groups = {};
  items.forEach(item => {
    const tagName  = item.tag?.name || 'Autres';
    const tagColor = item.tag?.color || '#64748b';
    if (!groups[tagName]) groups[tagName] = { color: tagColor, items: [] };
    groups[tagName].items.push(item);
  });

  const keys = Object.keys(groups).sort((a, b) => {
    if (a === 'Substituts') return 1;
    if (b === 'Substituts') return -1;
    if (a === 'Autres') return 1;
    if (b === 'Autres') return -1;
    return a.localeCompare(b);
  });

  shoppingRenderItems = [];
  container.innerHTML = keys.map(tagName => {
    const g = groups[tagName];
    return `<div class="shopping-group">
      <div class="shopping-group__title" style="color:${g.color};">
        <span class="shopping-group__dot" style="background:${g.color};"></span>${tagName}
      </div>
      ${g.items.map(item => {
        const idx     = shoppingRenderItems.length;
        shoppingRenderItems.push(item);
        const checked = checkedShoppingItems.has(item.name);
        return `<div class="shopping-item${checked ? ' shopping-item--done' : ''}" id="si-${idx}">
          <div class="shopping-item__check${checked ? ' shopping-item__check--done' : ''}"
               onclick="showBuyForm(${idx})" title="Valider l'achat"
               ${checked ? 'style="pointer-events:none;"' : ''}>${checked ? '✓' : '+'}</div>
          <span class="shopping-item__name">${item.name}</span>
          ${item.inStock > 0 ? `<span class="shopping-item__stock">stock: ${item.inStock} ${item.unit}</span>` : ''}
          <span class="shopping-item__qty">→ ${item.toBuy} ${item.unit}</span>
          <div class="shopping-buy-form" id="sbf-${idx}" style="display:none;align-items:center;gap:6px;flex-wrap:wrap;margin-top:6px;padding:6px 0;">
            <input type="number" id="sbf-qty-${idx}" value="${item.toBuy}" min="0" step="0.1"
              style="width:72px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.15);border-radius:6px;padding:4px 8px;color:var(--text);font-size:13px;text-align:center;" />
            <span style="font-size:12px;color:var(--text-dim);">${item.unit}</span>
            <button class="btn btn--primary btn--sm" onclick="confirmBuy(${idx})">Ajouter au stock</button>
            <button class="btn btn--ghost btn--sm" onclick="cancelBuyForm(${idx})">✕</button>
          </div>
        </div>`;
      }).join('')}
    </div>`;
  }).join('');
}

function showBuyForm(idx) {
  const form = document.getElementById(`sbf-${idx}`);
  if (!form) return;
  form.style.display = 'flex';
  const input = document.getElementById(`sbf-qty-${idx}`);
  if (input) { input.select(); input.focus(); }
}

function cancelBuyForm(idx) {
  const form = document.getElementById(`sbf-${idx}`);
  if (form) form.style.display = 'none';
}

async function confirmBuy(idx) {
  const item = shoppingRenderItems[idx];
  if (!item) return;
  const input = document.getElementById(`sbf-qty-${idx}`);
  const qty   = parseFloat(input?.value);
  if (!qty || qty <= 0) { showToast('Entrez une quantité', 'error'); return; }

  const existing = pantryItems.find(p =>
    (item.food_id && p.food_id === item.food_id) ||
    (item.sub_id  && p.substitute_id === item.sub_id)
  );

  if (existing) {
    const newQty = parseFloat(((existing.quantity || 0) + qty).toFixed(2));
    const { error } = await db.from('pantry_items').update({ quantity: newQty, updated_at: new Date().toISOString() }).eq('id', existing.id);
    if (error) { showToast(`Erreur : ${error.message}`, 'error'); return; }
    existing.quantity = newQty;
  } else {
    const isFood = !!item.food_id;
    const entry  = {
      item_type:    isFood ? 'food' : 'substitute',
      food_id:      isFood ? item.food_id : null,
      substitute_id: !isFood ? item.sub_id : null,
      name:         item.name,
      quantity:     qty,
      unit:         item.unit,
    };
    const { data, error } = await db.from('pantry_items').insert(entry).select().single();
    if (error) { showToast(`Erreur : ${error.message}`, 'error'); return; }
    if (data) pantryItems.push(data);
  }

  checkedShoppingItems.add(item.name);
  cancelBuyForm(idx);
  const el = document.getElementById(`si-${idx}`);
  if (el) {
    el.classList.add('shopping-item--done');
    const check = el.querySelector('.shopping-item__check');
    if (check) { check.classList.add('shopping-item__check--done'); check.textContent = '✓'; check.style.pointerEvents = 'none'; }
  }
  showToast(`${item.name} ajouté au stock`, 'success');
}

// ── Gestion — Goals ────────────────────────────────────────
async function loadGoals() {
  const { data } = await db.from('nutrition_goals').select('*').order('created_at', { ascending: false }).limit(1);
  nutritionGoals = data?.[0] || null;
  if (nutritionGoals) {
    setInputVal('goal-kcal', nutritionGoals.calories);
    setInputVal('goal-prot', nutritionGoals.protein_g);
    setInputVal('goal-gluc', nutritionGoals.carbs_g);
    setInputVal('goal-lip',  nutritionGoals.fat_g);
    setInputVal('goal-fib',  nutritionGoals.fiber_g);
    setInputVal('goal-substitute', nutritionGoals.substitute_target);
  }
  renderSubstituteIndicator();
}

function setInputVal(id, val) {
  const el = document.getElementById(id);
  if (el && val != null) el.value = val;
}

async function saveGoals() {
  const entry = {
    calories:  numI(document.getElementById('goal-kcal').value),
    protein_g: numF(document.getElementById('goal-prot').value),
    carbs_g:   numF(document.getElementById('goal-gluc').value),
    fat_g:     numF(document.getElementById('goal-lip').value),
    fiber_g:   numF(document.getElementById('goal-fib').value),
    substitute_target: numI(document.getElementById('goal-substitute').value),
  };
  if (nutritionGoals) {
    const { error } = await db.from('nutrition_goals').update(entry).eq('id', nutritionGoals.id);
    if (error) { showToast('Erreur : ' + error.message, 'error'); return; }
  } else {
    const { data, error } = await db.from('nutrition_goals').insert(entry).select().single();
    if (error) { showToast('Erreur : ' + error.message, 'error'); return; }
    nutritionGoals = data;
  }
  showToast('Objectifs enregistrés', 'success');
  await loadGoals();
}

// ── Gestion — Tags ─────────────────────────────────────────
async function loadTags() {
  const [tagsRes, linksRes] = await Promise.all([
    db.from('food_tags').select('*').order('name'),
    db.from('food_tag_links').select('food_id, tag_id'),
  ]);
  tags = tagsRes.data || [];
  foodTagLinks = {};
  (linksRes.data || []).forEach(l => {
    if (!foodTagLinks[l.food_id]) foodTagLinks[l.food_id] = [];
    foodTagLinks[l.food_id].push(l.tag_id);
  });
  renderTagList();
  renderNewFoodTagChips();
}

function renderTagList() {
  const container = document.getElementById('tag-list');
  if (!container) return;
  if (!tags.length) { container.innerHTML = '<p class="preset-list-empty">Aucun tag créé.</p>'; return; }
  container.innerHTML = tags.map(t => `
    <div class="preset-item">
      <span class="tag-chip" style="background:${t.color}22;border:1px solid ${t.color};color:${t.color};padding:3px 12px;border-radius:20px;font-size:12px;">${t.name}</span>
      <span style="font-size:11px;color:var(--text-dim);">${t.color}</span>
      <div style="flex:1;"></div>
      <button class="preset-item__del" onclick="deleteTag('${t.id}')">✕</button>
    </div>`).join('');
}

async function saveTag() {
  const name  = document.getElementById('tag-name').value.trim();
  const color = document.getElementById('tag-color').value;
  if (!name) { showToast('Nom requis', 'error'); return; }
  const { error } = await db.from('food_tags').insert({ name, color });
  if (error) { showToast('Erreur : ' + error.message, 'error'); return; }
  document.getElementById('tag-name').value = '';
  showToast('Tag créé', 'success');
  await loadTags();
}

async function deleteTag(id) {
  if (!confirm('Supprimer ce tag ?')) return;
  const { error } = await db.from('food_tags').delete().eq('id', id);
  if (error) { showToast('Erreur', 'error'); return; }
  showToast('Tag supprimé', 'success');
  await loadTags();
}

function renderNewFoodTagChips() {
  const container = document.getElementById('nf-tags');
  if (!container) return;
  if (!tags.length) {
    container.innerHTML = '<span style="font-size:12px;color:var(--text-dim);">Créez des tags dans la section Tags ci-dessus.</span>';
    return;
  }
  container.innerHTML = tags.map(t => {
    const sel = selectedTagsForNewFood.includes(t.id);
    return `<span class="tag-chip${sel ? ' tag-chip--active' : ''}"
      style="background:${sel ? t.color + '28' : 'transparent'};border:1px solid ${sel ? t.color : 'rgba(255,255,255,0.12)'};color:${sel ? t.color : 'var(--text-dim)'};"
      onclick="toggleNewFoodTag('${t.id}')">${t.name}</span>`;
  }).join('');
}

function toggleNewFoodTag(tagId) {
  if (selectedTagsForNewFood.includes(tagId)) selectedTagsForNewFood = selectedTagsForNewFood.filter(id => id !== tagId);
  else selectedTagsForNewFood.push(tagId);
  renderNewFoodTagChips();
}

// ── Gestion — Foods ────────────────────────────────────────
async function loadFoods() {
  const [{ data: foodRows }, { data: bcRows }] = await Promise.all([
    db.from('foods').select('*').order('name'),
    db.from('food_barcodes').select('*'),
  ]);
  foods = foodRows || [];
  barcodeToFood = {};
  foodBarcodes  = {};
  (bcRows || []).forEach(r => {
    barcodeToFood[r.barcode] = r.food_id;
    (foodBarcodes[r.food_id] = foodBarcodes[r.food_id] || []).push(r.barcode);
  });
  renderFoodList();
  populateEquivalenceFoodSelects();
}

function renderFoodList() {
  const container = document.getElementById('food-list');
  if (!container) return;
  if (!foods.length) { container.innerHTML = '<p class="preset-list-empty">Aucun aliment enregistré.</p>'; return; }

  // Sort foods by tag then name
  const sortedFoods = [...foods].sort((a, b) => {
    const tagA = (foodTagLinks[a.id] || []).length ? (tags.find(t => t.id === foodTagLinks[a.id][0])?.name || 'Zzz') : 'Zzz';
    const tagB = (foodTagLinks[b.id] || []).length ? (tags.find(t => t.id === foodTagLinks[b.id][0])?.name || 'Zzz') : 'Zzz';
    if (tagA !== tagB) return tagA.localeCompare(tagB);
    return a.name.localeCompare(b.name);
  });

  // Group by tag
  const tagGroups = {};
  sortedFoods.forEach(f => {
    const tagIds  = foodTagLinks[f.id] || [];
    const tag     = tagIds.length ? tags.find(t => t.id === tagIds[0]) : null;
    const key     = tag?.name  || 'Autres';
    const color   = tag?.color || '#64748b';
    if (!tagGroups[key]) tagGroups[key] = { color, items: [] };
    tagGroups[key].items.push(f);
  });
  const tagKeys = Object.keys(tagGroups).sort((a, b) => {
    if (a === 'Autres') return 1;
    if (b === 'Autres') return -1;
    return a.localeCompare(b);
  });

  const renderFoodCard = (f) => {
    const macros = [
      f.calories_per_100g != null ? f.calories_per_100g + ' kcal' : null,
      f.protein_per_100g  != null ? f.protein_per_100g  + 'g P'   : null,
      f.carbs_per_100g    != null ? f.carbs_per_100g    + 'g G'    : null,
      f.fat_per_100g      != null ? f.fat_per_100g      + 'g L'    : null,
    ].filter(Boolean).join(' · ');
    const unit      = f.unit || 'g';
    const isEditing = editingFoodId === f.id;
    const esc = s => String(s ?? '').replace(/"/g, '&quot;');

    const editForm = isEditing ? `
      <div style="grid-column:1/-1;display:flex;flex-direction:column;gap:8px;padding:8px 0 4px;border-top:1px solid rgba(255,255,255,0.06);margin-top:8px;">
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <input type="text" id="fe-name-${f.id}" class="np-input" value="${esc(f.name)}" placeholder="Nom" style="flex:1;" />
          <select id="fe-unit-${f.id}" class="np-input" style="width:auto;flex:0 0 auto;">
            <option value="g"${unit==='g'?' selected':''}>g</option>
            <option value="L"${unit==='L'?' selected':''}>L</option>
            <option value="unité"${unit==='unité'?' selected':''}>unité</option>
          </select>
        </div>
        <div class="meal-macros-labels"><span>kcal</span><span>Prot (g)</span><span>Gluc (g)</span><span>Lip (g)</span><span>Fib (g)</span></div>
        <div class="meal-macros">
          <input type="number" id="fe-kcal-${f.id}" class="np-input" style="padding:6px 4px;text-align:center;" value="${f.calories_per_100g??''}" min="0" />
          <input type="number" id="fe-prot-${f.id}" class="np-input" style="padding:6px 4px;text-align:center;" value="${f.protein_per_100g??''}" min="0" step="0.1" />
          <input type="number" id="fe-gluc-${f.id}" class="np-input" style="padding:6px 4px;text-align:center;" value="${f.carbs_per_100g??''}" min="0" step="0.1" />
          <input type="number" id="fe-lip-${f.id}"  class="np-input" style="padding:6px 4px;text-align:center;" value="${f.fat_per_100g??''}" min="0" step="0.1" />
          <input type="number" id="fe-fib-${f.id}"  class="np-input" style="padding:6px 4px;text-align:center;" value="${f.fiber_per_100g??''}" min="0" step="0.1" />
        </div>
        <div>
          <p style="font-size:11px;color:var(--text-dim);margin-bottom:4px;">Tags :</p>
          <div class="tag-chips" id="fe-tags-${f.id}">${renderEditFoodTagChips(f.id)}</div>
        </div>
        <div>
          <p style="font-size:11px;color:var(--text-dim);margin-bottom:4px;">Codes-barres (${(foodBarcodes[f.id]||[]).length}/${MAX_BARCODES_PER_FOOD}) :</p>
          <div class="bc-chips" id="fe-bc-${f.id}">${renderFoodEditBarcodes(f.id)}</div>
          <div style="display:flex;gap:6px;margin-top:6px;">
            <input type="text" id="fe-bc-input-${f.id}" class="np-input" placeholder="Ajouter un code…" inputmode="numeric" style="flex:1;" onkeydown="if(event.key==='Enter'){event.preventDefault();addBarcodeToFood('${f.id}')}" />
            <button class="btn btn--ghost btn--sm" onclick="addBarcodeToFood('${f.id}')">+ Code</button>
          </div>
        </div>
        <div style="display:flex;gap:6px;">
          <button class="btn btn--primary btn--sm" onclick="saveFoodEdit('${f.id}')">Sauvegarder</button>
          <button class="btn btn--ghost btn--sm" onclick="cancelFoodEdit()">Annuler</button>
        </div>
      </div>` : '';

    return `<div class="food-grid-card${isEditing ? ' food-grid-card--editing' : ''}">
      <span class="food-grid-card__name">${f.name}</span>
      <span class="food-grid-card__macros">${macros || '—'}</span>
      <span class="food-grid-card__unit">${unit}</span>
      <div class="food-grid-card__actions">
        <button class="habit-manage-btn habit-manage-btn--edit" onclick="startFoodEdit('${f.id}')">✏️</button>
        <button class="preset-item__del" onclick="deleteFood('${f.id}')">✕</button>
      </div>
      ${editForm}
    </div>`;
  };

  container.innerHTML = `<div class="tag-col-layout">${tagKeys.map(tagName => {
    const g = tagGroups[tagName];
    return `<div class="tag-col-group">
      <div style="font-size:11px;color:${g.color};text-transform:uppercase;letter-spacing:0.06em;padding:4px 0 6px;display:flex;align-items:center;gap:6px;">
        <span style="width:8px;height:8px;border-radius:50%;background:${g.color};display:inline-block;flex-shrink:0;"></span>${tagName}
      </div>
      <div class="food-col-stack">${g.items.map(renderFoodCard).join('')}</div>
    </div>`;
  }).join('')}</div>`;
}

function renderEditFoodTagChips(foodId) {
  if (!editingFoodTags[foodId]) editingFoodTags[foodId] = [...(foodTagLinks[foodId] || [])];
  return tags.map(t => {
    const sel = editingFoodTags[foodId].includes(t.id);
    return `<span class="tag-chip${sel ? ' tag-chip--active' : ''}"
      style="background:${sel ? t.color + '28' : 'transparent'};border:1px solid ${sel ? t.color : 'rgba(255,255,255,0.12)'};color:${sel ? t.color : 'var(--text-dim)'};"
      onclick="toggleEditFoodTag('${foodId}','${t.id}')">${t.name}</span>`;
  }).join('');
}

function toggleEditFoodTag(foodId, tagId) {
  if (!editingFoodTags[foodId]) editingFoodTags[foodId] = [...(foodTagLinks[foodId] || [])];
  if (editingFoodTags[foodId].includes(tagId)) editingFoodTags[foodId] = editingFoodTags[foodId].filter(id => id !== tagId);
  else editingFoodTags[foodId].push(tagId);
  const container = document.getElementById(`fe-tags-${foodId}`);
  if (container) container.innerHTML = renderEditFoodTagChips(foodId);
}

function startFoodEdit(id) { editingFoodId = id; editingFoodTags[id] = [...(foodTagLinks[id] || [])]; renderFoodList(); }
function cancelFoodEdit()  { editingFoodId = null; renderFoodList(); }

// ── Food barcodes (edit mode) ──────────────────────────────
function renderFoodEditBarcodes(foodId) {
  const codes = foodBarcodes[foodId] || [];
  if (!codes.length) return '<span style="font-size:11px;color:var(--text-dim);">Aucun code-barre</span>';
  return codes.map(c => `<span class="bc-chip">${c}<button class="bc-chip__del" onclick="removeBarcodeFromFood('${foodId}','${c}')">✕</button></span>`).join('');
}

async function addBarcodeToFood(foodId) {
  const input = document.getElementById(`fe-bc-input-${foodId}`);
  const code = (input?.value || '').trim();
  if (!/^\d{6,14}$/.test(code)) { showToast('Code-barre invalide (6 à 14 chiffres)', 'error'); return; }
  const ok = await attachBarcodeToFoodRow(foodId, code);
  if (!ok) return;
  showToast('Code-barre ajouté', 'success');
  renderFoodList();
}

async function removeBarcodeFromFood(foodId, code) {
  const { error } = await db.from('food_barcodes').delete().eq('barcode', code);
  if (error) { showToast(`Erreur : ${error.message}`, 'error'); return; }
  delete barcodeToFood[code];
  foodBarcodes[foodId] = (foodBarcodes[foodId] || []).filter(c => c !== code);
  showToast('Code-barre retiré', 'success');
  renderFoodList();
}

async function saveFood() {
  const name = document.getElementById('nf-name')?.value.trim();
  if (!name) { showToast('Nom requis', 'error'); return; }
  const unit  = document.getElementById('nf-unit')?.value || 'g';
  const entry = {
    name, unit,
    calories_per_100g: numF(document.getElementById('nf-kcal').value),
    protein_per_100g:  numF(document.getElementById('nf-prot').value),
    carbs_per_100g:    numF(document.getElementById('nf-gluc').value),
    fat_per_100g:      numF(document.getElementById('nf-lip').value),
    fiber_per_100g:    numF(document.getElementById('nf-fib').value),
  };
  const { data: newFood, error } = await db.from('foods').insert(entry).select().single();
  if (error) { showToast('Erreur : ' + error.message, 'error'); return; }
  if (selectedTagsForNewFood.length) {
    await db.from('food_tag_links').insert(selectedTagsForNewFood.map(tagId => ({ food_id: newFood.id, tag_id: tagId })));
  }
  showToast('Aliment ajouté', 'success');
  ['nf-name','nf-kcal','nf-prot','nf-gluc','nf-lip','nf-fib'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  document.getElementById('nf-unit').value = 'g';
  selectedTagsForNewFood = [];
  await loadTags();
  await loadFoods();
}

async function saveFoodEdit(id) {
  const name = document.getElementById(`fe-name-${id}`)?.value.trim();
  if (!name) { showToast('Nom requis', 'error'); return; }
  const unit  = document.getElementById(`fe-unit-${id}`)?.value || 'g';
  const entry = {
    name, unit,
    calories_per_100g: numF(document.getElementById(`fe-kcal-${id}`).value),
    protein_per_100g:  numF(document.getElementById(`fe-prot-${id}`).value),
    carbs_per_100g:    numF(document.getElementById(`fe-gluc-${id}`).value),
    fat_per_100g:      numF(document.getElementById(`fe-lip-${id}`).value),
    fiber_per_100g:    numF(document.getElementById(`fe-fib-${id}`).value),
  };
  const { error } = await db.from('foods').update(entry).eq('id', id);
  if (error) { showToast('Erreur : ' + error.message, 'error'); return; }

  // Update tag links
  const newTagIds = editingFoodTags[id] || [];
  await db.from('food_tag_links').delete().eq('food_id', id);
  if (newTagIds.length) {
    await db.from('food_tag_links').insert(newTagIds.map(tagId => ({ food_id: id, tag_id: tagId })));
  }

  showToast('Aliment mis à jour', 'success');
  editingFoodId = null;
  delete editingFoodTags[id];
  await loadTags();
  await loadFoods();
}

async function deleteFood(id) {
  if (!confirm('Supprimer cet aliment ?')) return;
  const { error } = await db.from('foods').delete().eq('id', id);
  if (error) { showToast('Erreur', 'error'); return; }
  showToast('Aliment supprimé', 'success');
  await loadFoods();
}

// ── Équivalences ───────────────────────────────────────────
async function loadEquivalences() {
  const { data } = await db.from('food_equivalences').select('*').order('created_at');
  equivalences = data || [];
  renderEquivalenceList();
  populateEquivalenceFoodSelects();
}

function populateEquivalenceFoodSelects() {
  const sorted = [...foods].sort((a, b) => a.name.localeCompare(b.name));
  const opts = `<option value="">— aliment —</option>` + sorted.map(f => `<option value="${f.id}">${f.name} (${f.unit || 'g'})</option>`).join('');
  ['eq-food-a', 'eq-food-b'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = opts;
  });
}

function renderEquivalenceList() {
  const container = document.getElementById('equivalence-list');
  if (!container) return;
  if (!equivalences.length) {
    container.innerHTML = '<p class="preset-list-empty">Aucune équivalence configurée.</p>';
    return;
  }
  container.innerHTML = equivalences.map(eq => {
    const foodA = foods.find(f => f.id === eq.food_id_a);
    const foodB = foods.find(f => f.id === eq.food_id_b);
    if (!foodA || !foodB) return '';
    const unitA   = foodA.unit || 'g';
    const qtyB    = eq.qty_b || 1;
    const lo      = parseFloat((eq.ratio - eq.tolerance).toFixed(2));
    const hi      = parseFloat((eq.ratio + eq.tolerance).toFixed(2));
    const dir     = eq.both_ways ? '↔' : '→';
    const autoTag = eq.auto_add_food_a ? ' <span style="font-size:10px;color:var(--primary);">🔁 auto</span>' : '';
    return `<div class="preset-item">
      <div style="flex:1;min-width:0;">
        <span class="preset-item__name">${foodA.name}</span>
        <span class="preset-item__meta"> ${lo}–${hi} ${unitA} ${dir} ${qtyB} ${foodB.name}</span>${autoTag}
      </div>
      <button class="habit-manage-btn habit-manage-btn--edit" style="margin-right:4px;" onclick="startEquivalenceEdit('${eq.id}')">✏️</button>
      <button class="preset-item__del" onclick="deleteEquivalence('${eq.id}')">✕</button>
    </div>`;
  }).join('');
}

function startEquivalenceEdit(id) {
  const eq = equivalences.find(e => e.id === id);
  if (!eq) return;
  editingEquivalenceId = id;
  const setVal = (elId, val) => { const el = document.getElementById(elId); if (el) el.value = val; };
  const setChk = (elId, val) => { const el = document.getElementById(elId); if (el) el.checked = val; };
  setVal('eq-food-a', eq.food_id_a);
  setVal('eq-food-b', eq.food_id_b);
  setVal('eq-ratio', eq.ratio);
  setVal('eq-tolerance', eq.tolerance || 0);
  setVal('eq-qty-b', eq.qty_b || 1);
  setChk('eq-both-ways', eq.both_ways ?? true);
  setChk('eq-auto-add', eq.auto_add_food_a ?? false);
  const btn = document.getElementById('eq-save-btn');
  if (btn) btn.textContent = '✓ Mettre à jour';
  const cancel = document.getElementById('eq-cancel-btn');
  if (cancel) cancel.style.display = '';
  document.getElementById('eq-food-a')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function cancelEquivalenceEdit() {
  editingEquivalenceId = null;
  ['eq-food-a','eq-food-b','eq-ratio','eq-tolerance'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = '';
  });
  const qtyEl = document.getElementById('eq-qty-b'); if (qtyEl) qtyEl.value = '1';
  const btn = document.getElementById('eq-save-btn'); if (btn) btn.textContent = '+ Ajouter';
  const cancel = document.getElementById('eq-cancel-btn'); if (cancel) cancel.style.display = 'none';
}

async function saveEquivalence() {
  const foodAId    = document.getElementById('eq-food-a')?.value;
  const foodBId    = document.getElementById('eq-food-b')?.value;
  const ratio      = parseFloat(document.getElementById('eq-ratio')?.value);
  const tolerance  = parseFloat(document.getElementById('eq-tolerance')?.value) || 0;
  const qtyB       = parseFloat(document.getElementById('eq-qty-b')?.value) || 1;
  const bothWays   = document.getElementById('eq-both-ways')?.checked ?? true;
  const autoAdd    = document.getElementById('eq-auto-add')?.checked ?? false;

  if (!foodAId || !foodBId)  { showToast('Sélectionnez les deux aliments', 'error'); return; }
  if (foodAId === foodBId)   { showToast('Les deux aliments doivent être différents', 'error'); return; }
  if (!ratio || ratio <= 0)  { showToast('Entrez un ratio valide', 'error'); return; }

  const payload = { food_id_a: foodAId, food_id_b: foodBId, ratio, tolerance, qty_b: qtyB, both_ways: bothWays, auto_add_food_a: autoAdd };

  let error;
  if (editingEquivalenceId) {
    ({ error } = await db.from('food_equivalences').update(payload).eq('id', editingEquivalenceId));
    if (!error) showToast('Équivalence mise à jour', 'success');
  } else {
    ({ error } = await db.from('food_equivalences').insert(payload));
    if (!error) showToast('Équivalence enregistrée', 'success');
  }
  if (error) { showToast('Erreur : ' + error.message, 'error'); return; }

  cancelEquivalenceEdit();
  await loadEquivalences();
}

async function deleteEquivalence(id) {
  const { error } = await db.from('food_equivalences').delete().eq('id', id);
  if (error) { showToast('Erreur', 'error'); return; }
  showToast('Équivalence supprimée', 'success');
  await loadEquivalences();
}

// ── Utils ──────────────────────────────────────────────────
function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function daysAgo(n) {
  const d = new Date(); d.setDate(d.getDate()-n);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function numF(v)          { return v!==undefined&&v!==''?parseFloat(v)||null:null; }
function numI(v)          { return v!==undefined&&v!==''?parseInt(v)||null:null; }
function formatDate(str)  { return new Date(str+'T12:00:00').toLocaleDateString('fr-FR',{ day:'2-digit', month:'short', year:'2-digit' }); }
function formatDateShort(str){ return new Date(str+'T12:00:00').toLocaleDateString('fr-FR',{ day:'2-digit', month:'2-digit' }); }
function formatDateLong(str){ return new Date(str+'T12:00:00').toLocaleDateString('fr-FR',{ weekday:'long', day:'2-digit', month:'long' }); }
function setEl(id, val)   { const el=document.getElementById(id); if(el) el.textContent=val; }
function showToast(msg, type='success') {
  const t=document.createElement('div'); t.className=`toast toast--${type}`; t.textContent=msg;
  document.body.appendChild(t); requestAnimationFrame(()=>t.classList.add('show'));
  setTimeout(()=>{ t.classList.remove('show'); setTimeout(()=>t.remove(),400); },3800);
}
