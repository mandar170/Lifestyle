// ============================================================
// NUTRITION — Journal, Planification, Pantry, Courses, Gestion
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

const PRESET_TYPE_LABELS = {
  breakfast:'Petit déj.', morning_snack:'Collation mat.', lunch:'Déjeuner',
  afternoon_snack:'Collation a-m', dinner:'Dîner', evening_snack:'Collation soir',
};

const C = {
  primary:'#64dcff', purple:'#a855f7', orange:'#f97316', yellow:'#facc15', green:'#22d3ee',
};

// ── State ──────────────────────────────────────────────────
let journalDate = today();
let planDate    = today();
let planInitialized = false;
let mealPresets = [];
let substitutes = [];
let foods       = [];
let tags        = [];
let foodTagLinks = {};   // food_id → tag_id[]
let pantryItems = [];
let mealFoodItems = {};
let mealSubEntries = {};
const foodPickerState = {};
let planFoodItems  = {};
let planSubEntries = {};
let editingPresetId = null;
let editingFoodId   = null;
let nutritionGoals  = null;
let selectedTagsForNewFood = [];
let editingFoodTags = {};  // foodId → tag_id[] (for edit mode)
let pantrySelectedItem = null;
let checkedShoppingItems = new Set();

// ── Init ───────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  initTabs();

  // Handle ?date= URL param
  const dateParam = new URLSearchParams(window.location.search).get('date');
  if (dateParam) journalDate = dateParam;

  initJournal();

  await Promise.all([loadSubstitutes(), loadFoods(), loadTags(), loadGoals()]);
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
      if (t === 'planification' && !planInitialized) { initPlan(); planInitialized = true; }
      if (t === 'pantry') loadPantry();
      if (t === 'courses') { updateCoursePeriodLabel(); }
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
        <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;">
          <button class="btn btn--ghost btn--sm preset-pick-btn" onclick="toggleSubstitutePicker('${key}')">💊 Substitut</button>
          <button class="btn btn--ghost btn--sm preset-pick-btn" onclick="toggleFoodPicker('meal-${key}')">🥗 Aliment</button>
        </div>
        <div class="preset-picker" id="sp-${key}"></div>
        <div class="food-picker" id="fp-meal-${key}">
          <input type="text" class="np-input food-search" id="fp-search-meal-${key}" placeholder="Rechercher un aliment…" oninput="renderFoodPickerContent('meal-${key}')" />
          <div class="food-picker-list" id="fp-list-meal-${key}"></div>
          <div class="food-weight-row" id="fp-weight-meal-${key}" style="display:none;">
            <span id="fp-fname-meal-${key}" style="font-size:12px;color:var(--primary);flex:1;min-width:80px;"></span>
            <input type="number" id="fp-grams-meal-${key}" class="np-input" placeholder="g" min="1" style="width:80px;padding:6px 8px;" onkeydown="if(event.key==='Enter')applyFoodToJournal('meal-${key}')" />
            <button class="btn btn--primary btn--sm" onclick="applyFoodToJournal('meal-${key}')">+ Ajouter</button>
          </div>
        </div>
        <div class="meal-food-items" id="mfi-${key}"></div>
        <div class="meal-sub-items" id="msi-${key}"></div>
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
  const [{ data: meals }, { data: foodItems }, { data: subItems }] = await Promise.all([
    db.from('meals').select('*').eq('date', journalDate),
    db.from('meal_food_items').select('*').eq('date', journalDate),
    db.from('meal_substitute_entries').select('*').eq('date', journalDate),
  ]);
  mealFoodItems = {};
  (foodItems || []).forEach(item => {
    if (!mealFoodItems[item.meal_type]) mealFoodItems[item.meal_type] = [];
    mealFoodItems[item.meal_type].push(item);
  });
  mealSubEntries = {};
  (subItems || []).forEach(item => {
    if (!mealSubEntries[item.meal_type]) mealSubEntries[item.meal_type] = [];
    mealSubEntries[item.meal_type].push(item);
  });
  renderMealCards(meals || []);
  MEAL_TYPES.forEach(({ key }) => { renderMealFoodItems(key); renderMealSubEntries(key); });
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
    const pct = Math.min(100, Math.round(totKcal / nutritionGoals.calories * 100));
    const color = pct >= 90 ? '#22c55e' : pct >= 60 ? '#f97316' : '#64dcff';
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

// ── Food picker (journal) ───────────────────────────────────
function toggleFoodPicker(ctx) {
  const picker = document.getElementById(`fp-${ctx}`);
  if (!picker) return;
  const isOpen = picker.classList.contains('preset-picker--open');
  document.querySelectorAll('.preset-picker, .food-picker').forEach(p => p.classList.remove('preset-picker--open'));
  if (isOpen) return;
  picker.classList.add('preset-picker--open');
  renderFoodPickerContent(ctx);
  setTimeout(() => document.getElementById(`fp-search-${ctx}`)?.focus(), 50);
}

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
    return `<div class="preset-item" onclick="selectFoodForPicker('${ctx}','${f.id}')">
      <span class="preset-item__name">${f.name}</span>
      <span class="preset-item__meta">${meta} /100${unit}</span>
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
  if (!state?.selectedId) return;
  const food  = foods.find(f => f.id === state.selectedId);
  const qty   = parseFloat(document.getElementById(`fp-grams-${ctx}`)?.value);
  if (!food)               { showToast('Sélectionne un aliment', 'error'); return; }
  if (!qty || qty <= 0)    { showToast('Indique la quantité', 'error'); return; }

  const isMeal = ctx.startsWith('meal-');
  const key    = isMeal ? ctx.slice(5) : null;
  const factor = qty / 100;

  const calcKcal = food.calories_per_100g != null ? food.calories_per_100g * factor : null;
  const calcProt = food.protein_per_100g  != null ? food.protein_per_100g  * factor : null;
  const calcGluc = food.carbs_per_100g    != null ? food.carbs_per_100g    * factor : null;
  const calcLip  = food.fat_per_100g      != null ? food.fat_per_100g      * factor : null;
  const calcFib  = food.fiber_per_100g    != null ? food.fiber_per_100g    * factor : null;

  const addTo = (fieldId, added) => {
    if (added == null) return;
    const el = document.getElementById(fieldId);
    if (!el) return;
    const current = parseFloat(el.value) || 0;
    el.value = fieldId.startsWith('kcal') ? Math.round(current + added) : parseFloat((current + added).toFixed(1));
  };

  if (isMeal) {
    const getId = f => `${f}-${key}`;
    addTo(getId('kcal'), calcKcal); addTo(getId('prot'), calcProt);
    addTo(getId('gluc'), calcGluc); addTo(getId('lip'),  calcLip); addTo(getId('fib'), calcFib);

    const item = {
      date: journalDate, meal_type: key, food_id: food.id, food_name: food.name, grams: qty,
      calories:  calcKcal != null ? Math.round(calcKcal) : null,
      protein_g: calcProt != null ? parseFloat(calcProt.toFixed(1)) : null,
      carbs_g:   calcGluc != null ? parseFloat(calcGluc.toFixed(1)) : null,
      fat_g:     calcLip  != null ? parseFloat(calcLip.toFixed(1))  : null,
      fiber_g:   calcFib  != null ? parseFloat(calcFib.toFixed(1))  : null,
    };
    const { data, error } = await db.from('meal_food_items').insert(item).select().single();
    if (error) { showToast(`Erreur : ${error.message}`, 'error'); return; }
    if (!mealFoodItems[key]) mealFoodItems[key] = [];
    mealFoodItems[key].push(data);
    renderMealFoodItems(key);
  }

  document.getElementById(`fp-grams-${ctx}`).value = '';
  document.getElementById(`fp-weight-${ctx}`).style.display = 'none';
  delete foodPickerState[ctx];
  showToast(`${food.name} (${qty}${food.unit || 'g'}) ajouté`, 'success');
}

function renderMealFoodItems(mealType) {
  const container = document.getElementById(`mfi-${mealType}`);
  if (!container) return;
  const items = mealFoodItems[mealType] || [];
  const descEl = document.getElementById(`desc-${mealType}`);
  if (descEl && items.length) descEl.value = items.map(i => i.food_name).join(', ');
  if (!items.length) { container.innerHTML = ''; return; }
  container.innerHTML = items.map(item => `
    <div class="meal-food-item" id="mfi-item-${item.id}">
      <div class="meal-food-item__label">${item.food_name}</div>
      <div class="meal-food-item__meta">${item.grams}g · ${item.calories ?? '—'} kcal${item.protein_g != null ? ` · ${item.protein_g}g P` : ''}</div>
      <div class="meal-food-item__edit-input" id="mfi-edit-${item.id}" style="display:none;">
        <input type="number" id="mfi-qty-${item.id}" class="np-input" placeholder="g" min="1" style="width:70px;padding:4px 6px;" value="${item.grams}" onkeydown="if(event.key==='Enter')confirmFoodQtyEdit('${mealType}','${item.id}')" />
        <button class="btn btn--primary btn--sm" onclick="confirmFoodQtyEdit('${mealType}','${item.id}')">OK</button>
        <button class="btn btn--ghost btn--sm" onclick="cancelFoodQtyEdit('${item.id}')">✕</button>
      </div>
      <div style="display:flex;gap:4px;margin-left:auto;">
        <button class="btn btn--ghost btn--sm" onclick="editMealFoodItemQty('${item.id}')" title="Modifier">✏️</button>
        <button class="btn btn--ghost btn--sm" style="color:rgba(248,113,113,0.8);" onclick="removeMealFoodItem('${mealType}','${item.id}')">✕</button>
      </div>
    </div>`).join('');
}

function editMealFoodItemQty(itemId) {
  const el = document.getElementById(`mfi-edit-${itemId}`);
  if (el) { el.style.display = 'flex'; document.getElementById(`mfi-qty-${itemId}`)?.focus(); }
}
function cancelFoodQtyEdit(itemId) {
  const el = document.getElementById(`mfi-edit-${itemId}`);
  if (el) el.style.display = 'none';
}

async function confirmFoodQtyEdit(mealType, itemId) {
  const items = mealFoodItems[mealType] || [];
  const item  = items.find(i => String(i.id) === String(itemId));
  if (!item) return;
  const newQty = parseFloat(document.getElementById(`mfi-qty-${itemId}`)?.value);
  if (!newQty || newQty <= 0) { showToast('Indique la quantité', 'error'); return; }
  const food   = foods.find(f => f.id === item.food_id);
  const factor = newQty / 100;
  const updated = {
    grams:     newQty,
    calories:  food ? Math.round(food.calories_per_100g * factor) : item.calories,
    protein_g: food ? parseFloat((food.protein_per_100g * factor).toFixed(1)) : item.protein_g,
    carbs_g:   food ? parseFloat((food.carbs_per_100g   * factor).toFixed(1)) : item.carbs_g,
    fat_g:     food ? parseFloat((food.fat_per_100g     * factor).toFixed(1)) : item.fat_g,
    fiber_g:   food ? parseFloat((food.fiber_per_100g   * factor).toFixed(1)) : item.fiber_g,
  };
  const { error } = await db.from('meal_food_items').update(updated).eq('id', itemId);
  if (error) { showToast(`Erreur : ${error.message}`, 'error'); return; }
  Object.assign(item, updated);
  renderMealFoodItems(mealType);
  showToast('Quantité mise à jour', 'success');
}

async function removeMealFoodItem(mealType, itemId) {
  const { error } = await db.from('meal_food_items').delete().eq('id', itemId);
  if (error) { showToast(`Erreur : ${error.message}`, 'error'); return; }
  mealFoodItems[mealType] = (mealFoodItems[mealType] || []).filter(i => String(i.id) !== String(itemId));
  renderMealFoodItems(mealType);
  showToast('Aliment supprimé', 'success');
}

// ── Substitutes in journal ─────────────────────────────────
function toggleSubstitutePicker(mealType) {
  const picker = document.getElementById(`sp-${mealType}`);
  if (!picker) return;
  const isOpen = picker.classList.contains('preset-picker--open');
  document.querySelectorAll('.preset-picker, .food-picker').forEach(p => p.classList.remove('preset-picker--open'));
  if (isOpen) return;
  picker.innerHTML = substitutes.length
    ? substitutes.map(s => `
        <div class="preset-item" onclick="applySubstitute('${s.id}','${mealType}')">
          <span class="preset-item__name">${s.name}</span>
          <span class="preset-item__meta">${[s.calories?s.calories+'kcal':null,s.protein_g?s.protein_g+'g p':null].filter(Boolean).join(' · ')}</span>
        </div>`).join('')
    : '<p class="preset-list-empty">Aucun substitut — allez dans Gestion.</p>';
  picker.classList.add('preset-picker--open');
}

async function applySubstitute(subId, mealType) {
  const s = substitutes.find(x => x.id === subId);
  if (!s) return;
  document.getElementById(`sp-${mealType}`)?.classList.remove('preset-picker--open');
  const item = {
    date: journalDate, meal_type: mealType,
    substitute_id: s.id, substitute_name: s.name,
    included: false,
    calories: s.calories || null, protein_g: s.protein_g || null,
    carbs_g: s.carbs_g || null, fat_g: s.fat_g || null, fiber_g: s.fiber_g || null,
  };
  const { data, error } = await db.from('meal_substitute_entries').insert(item).select().single();
  if (error) { showToast(`Erreur : ${error.message}`, 'error'); return; }
  if (!mealSubEntries[mealType]) mealSubEntries[mealType] = [];
  mealSubEntries[mealType].push(data);

  const addTo = (field, val) => {
    if (val == null) return;
    const el = document.getElementById(`${field}-${mealType}`);
    if (!el) return;
    const cur = parseFloat(el.value) || 0;
    el.value = field === 'kcal' ? Math.round(cur + val) : parseFloat((cur + val).toFixed(1));
  };
  addTo('kcal', s.calories); addTo('prot', s.protein_g);
  addTo('gluc', s.carbs_g); addTo('lip', s.fat_g); addTo('fib', s.fiber_g);
  renderMealSubEntries(mealType);
  showToast(`${s.name} ajouté`, 'success');
}

function renderMealSubEntries(mealType) {
  const container = document.getElementById(`msi-${mealType}`);
  if (!container) return;
  const items = mealSubEntries[mealType] || [];
  if (!items.length) { container.innerHTML = ''; return; }
  container.innerHTML = items.map(item => `
    <div class="meal-sub-item" id="msi-item-${item.id}">
      <span style="font-size:13px;">💊</span>
      <span class="meal-sub-item__name">${item.substitute_name}</span>
      <span class="meal-sub-item__meta">${item.calories ?? '—'} kcal${item.protein_g != null ? ` · ${item.protein_g}g P` : ''}</span>
      <button class="meal-sub-toggle${item.included ? ' meal-sub-toggle--on' : ''}" onclick="toggleSubEntry('${mealType}','${item.id}')">${item.included ? '✓ comprises' : '+ à ajouter'}</button>
      <button class="btn btn--ghost btn--sm" style="color:rgba(248,113,113,0.8);" onclick="removeSubEntry('${mealType}','${item.id}')">✕</button>
    </div>`).join('');
}

async function toggleSubEntry(mealType, entryId) {
  const items = mealSubEntries[mealType] || [];
  const item  = items.find(i => String(i.id) === String(entryId));
  if (!item) return;
  const nowIncluded = !item.included;
  const { error } = await db.from('meal_substitute_entries').update({ included: nowIncluded }).eq('id', entryId);
  if (error) { showToast(`Erreur : ${error.message}`, 'error'); return; }
  const sign = nowIncluded ? -1 : 1;
  const adj = (field, val) => {
    if (val == null) return;
    const el = document.getElementById(`${field}-${mealType}`);
    if (!el) return;
    const cur = parseFloat(el.value) || 0;
    el.value = field === 'kcal' ? Math.round(cur + sign * val) : parseFloat((cur + sign * val).toFixed(1));
  };
  adj('kcal', item.calories); adj('prot', item.protein_g);
  adj('gluc', item.carbs_g); adj('lip', item.fat_g); adj('fib', item.fiber_g);
  item.included = nowIncluded;
  renderMealSubEntries(mealType);
}

async function removeSubEntry(mealType, entryId) {
  const items = mealSubEntries[mealType] || [];
  const item  = items.find(i => String(i.id) === String(entryId));
  if (!item) return;
  if (!item.included) {
    const sub = (field, val) => {
      if (val == null) return;
      const el = document.getElementById(`${field}-${mealType}`);
      if (!el) return;
      const cur = parseFloat(el.value) || 0;
      el.value = field === 'kcal' ? Math.max(0, Math.round(cur - val)) : parseFloat(Math.max(0, cur - val).toFixed(1));
    };
    sub('kcal', item.calories); sub('prot', item.protein_g);
    sub('gluc', item.carbs_g); sub('lip', item.fat_g); sub('fib', item.fiber_g);
  }
  const { error } = await db.from('meal_substitute_entries').delete().eq('id', entryId);
  if (error) { showToast(`Erreur : ${error.message}`, 'error'); return; }
  mealSubEntries[mealType] = items.filter(i => String(i.id) !== String(entryId));
  renderMealSubEntries(mealType);
  showToast('Substitut retiré', 'success');
}

// ── Planification ──────────────────────────────────────────
function initPlan() {
  const dateInput = document.getElementById('p-date');
  dateInput.value = planDate;
  document.getElementById('p-prev').addEventListener('click', () => changePlanDate(-1));
  document.getElementById('p-next').addEventListener('click', () => changePlanDate(1));
  document.getElementById('p-today-btn').addEventListener('click', () => {
    planDate = today(); dateInput.value = planDate; loadPlanData();
  });
  dateInput.addEventListener('change', () => { planDate = dateInput.value; loadPlanData(); });
  buildPlanCards();
  loadPlanData();
}

function changePlanDate(delta) {
  const d = new Date(planDate + 'T12:00:00');
  d.setDate(d.getDate() + delta);
  planDate = d.toISOString().split('T')[0];
  document.getElementById('p-date').value = planDate;
  loadPlanData();
}

function buildPlanCards() {
  document.getElementById('plan-cards-grid').innerHTML = MEAL_TYPES.map(({ key, label }) => `
    <div class="plan-card" id="pmc-${key}">
      <div class="plan-card__header">
        <span class="meal-label">${label}</span>
        <span class="plan-kcal-tag" id="pkcal-tag-${key}">— kcal</span>
        <button class="btn btn--primary btn--sm" style="margin-left:auto;font-size:11px;" onclick="applyMealPlanToJournal('${key}')">→ Journal</button>
      </div>
      <div class="plan-card__body">
        <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;">
          <button class="btn btn--ghost btn--sm preset-pick-btn" onclick="togglePlanSubPicker('${key}')">💊 Substitut</button>
          <button class="btn btn--ghost btn--sm preset-pick-btn" onclick="toggleFoodPicker('plan-${key}')">🥗 Aliment</button>
        </div>
        <div class="preset-picker" id="psp-${key}"></div>
        <div class="food-picker" id="fp-plan-${key}">
          <input type="text" class="np-input food-search" id="fp-search-plan-${key}" placeholder="Rechercher un aliment…" oninput="renderFoodPickerContent('plan-${key}')" />
          <div class="food-picker-list" id="fp-list-plan-${key}"></div>
          <div class="food-weight-row" id="fp-weight-plan-${key}" style="display:none;">
            <span id="fp-fname-plan-${key}" style="font-size:12px;color:var(--primary);flex:1;min-width:80px;"></span>
            <input type="number" id="fp-grams-plan-${key}" class="np-input" placeholder="g" min="1" style="width:80px;padding:6px 8px;" onkeydown="if(event.key==='Enter')applyFoodToPlan('plan-${key}')" />
            <button class="btn btn--primary btn--sm" onclick="applyFoodToPlan('plan-${key}')">+ Ajouter</button>
          </div>
        </div>
        <div class="meal-food-items" id="pfi-${key}"></div>
        <div class="meal-sub-items" id="psi-${key}"></div>
      </div>
    </div>`).join('');
}

async function loadPlanData() {
  const [{ data: items }, { data: subs }] = await Promise.all([
    db.from('meal_plan_items').select('*').eq('plan_date', planDate),
    db.from('meal_plan_sub_entries').select('*').eq('plan_date', planDate),
  ]);
  planFoodItems = {};
  (items || []).forEach(item => {
    if (!planFoodItems[item.meal_type]) planFoodItems[item.meal_type] = [];
    planFoodItems[item.meal_type].push(item);
  });
  planSubEntries = {};
  (subs || []).forEach(s => {
    if (!planSubEntries[s.meal_type]) planSubEntries[s.meal_type] = [];
    planSubEntries[s.meal_type].push(s);
  });
  MEAL_TYPES.forEach(({ key }) => { renderPlanFoodItems(key); renderPlanSubEntries(key); });
}

async function applyFoodToPlan(ctx) {
  const state = foodPickerState[ctx];
  if (!state?.selectedId) return;
  const food  = foods.find(f => f.id === state.selectedId);
  const qty   = parseFloat(document.getElementById(`fp-grams-${ctx}`)?.value);
  if (!food)           { showToast('Sélectionne un aliment', 'error'); return; }
  if (!qty || qty <= 0){ showToast('Indique la quantité', 'error'); return; }

  const key    = ctx.slice(5);
  const factor = qty / 100;
  const item   = {
    plan_date: planDate, meal_type: key, food_id: food.id, food_name: food.name, grams: qty,
    calories:  food.calories_per_100g != null ? Math.round(food.calories_per_100g * factor) : null,
    protein_g: food.protein_per_100g  != null ? parseFloat((food.protein_per_100g  * factor).toFixed(1)) : null,
    carbs_g:   food.carbs_per_100g    != null ? parseFloat((food.carbs_per_100g    * factor).toFixed(1)) : null,
    fat_g:     food.fat_per_100g      != null ? parseFloat((food.fat_per_100g      * factor).toFixed(1)) : null,
    fiber_g:   food.fiber_per_100g    != null ? parseFloat((food.fiber_per_100g    * factor).toFixed(1)) : null,
  };
  const { data, error } = await db.from('meal_plan_items').insert(item).select().single();
  if (error) { showToast(`Erreur : ${error.message}`, 'error'); return; }
  if (!planFoodItems[key]) planFoodItems[key] = [];
  planFoodItems[key].push(data);
  document.getElementById(`fp-grams-${ctx}`).value = '';
  document.getElementById(`fp-weight-${ctx}`).style.display = 'none';
  delete foodPickerState[ctx];
  renderPlanFoodItems(key);
  showToast(`${food.name} (${qty}${food.unit || 'g'}) ajouté au plan`, 'success');
}

function renderPlanFoodItems(mealType) {
  const container = document.getElementById(`pfi-${mealType}`);
  const tag       = document.getElementById(`pkcal-tag-${mealType}`);
  if (!container) return;
  const items = planFoodItems[mealType] || [];
  if (tag) {
    const foodKcal = items.reduce((s, i) => s + (i.calories || 0), 0);
    const subKcal  = (planSubEntries[mealType] || []).filter(s => !s.included).reduce((s, i) => s + (i.calories || 0), 0);
    const total = foodKcal + subKcal;
    const hasSomething = items.length || (planSubEntries[mealType] || []).length;
    tag.textContent = hasSomething ? `${total} kcal` : '— kcal';
  }
  if (!items.length) { container.innerHTML = ''; return; }
  container.innerHTML = items.map(item => `
    <div class="meal-food-item" id="pfi-item-${item.id}">
      <div class="meal-food-item__label">${item.food_name}</div>
      <div class="meal-food-item__meta">${item.grams}g · ${item.calories ?? '—'} kcal${item.protein_g != null ? ` · ${item.protein_g}g P` : ''}</div>
      <div class="meal-food-item__edit-input" id="pfi-edit-${item.id}" style="display:none;">
        <input type="number" id="pfi-qty-${item.id}" class="np-input" placeholder="g" min="1" style="width:70px;padding:4px 6px;" value="${item.grams}" onkeydown="if(event.key==='Enter')confirmPlanQtyEdit('${mealType}','${item.id}')" />
        <button class="btn btn--primary btn--sm" onclick="confirmPlanQtyEdit('${mealType}','${item.id}')">OK</button>
        <button class="btn btn--ghost btn--sm" onclick="cancelPlanQtyEdit('${item.id}')">✕</button>
      </div>
      <div style="display:flex;gap:4px;margin-left:auto;">
        <button class="btn btn--ghost btn--sm" onclick="editPlanFoodItemQty('${item.id}')">✏️</button>
        <button class="btn btn--ghost btn--sm" style="color:rgba(248,113,113,0.8);" onclick="removePlanFoodItem('${mealType}','${item.id}')">✕</button>
      </div>
    </div>`).join('');
}

function editPlanFoodItemQty(itemId) {
  const el = document.getElementById(`pfi-edit-${itemId}`);
  if (el) { el.style.display = 'flex'; document.getElementById(`pfi-qty-${itemId}`)?.focus(); }
}
function cancelPlanQtyEdit(itemId) {
  const el = document.getElementById(`pfi-edit-${itemId}`);
  if (el) el.style.display = 'none';
}

async function confirmPlanQtyEdit(mealType, itemId) {
  const item = (planFoodItems[mealType] || []).find(i => String(i.id) === String(itemId));
  if (!item) return;
  const newQty = parseFloat(document.getElementById(`pfi-qty-${itemId}`)?.value);
  if (!newQty || newQty <= 0) { showToast('Indique la quantité', 'error'); return; }
  const food   = foods.find(f => f.id === item.food_id);
  const factor = newQty / 100;
  const updated = {
    grams: newQty,
    calories:  food ? Math.round(food.calories_per_100g * factor) : item.calories,
    protein_g: food ? parseFloat((food.protein_per_100g * factor).toFixed(1)) : item.protein_g,
    carbs_g:   food ? parseFloat((food.carbs_per_100g   * factor).toFixed(1)) : item.carbs_g,
    fat_g:     food ? parseFloat((food.fat_per_100g     * factor).toFixed(1)) : item.fat_g,
    fiber_g:   food ? parseFloat((food.fiber_per_100g   * factor).toFixed(1)) : item.fiber_g,
  };
  const { error } = await db.from('meal_plan_items').update(updated).eq('id', itemId);
  if (error) { showToast(`Erreur : ${error.message}`, 'error'); return; }
  Object.assign(item, updated);
  renderPlanFoodItems(mealType);
  showToast('Quantité mise à jour', 'success');
}

async function removePlanFoodItem(mealType, itemId) {
  const { error } = await db.from('meal_plan_items').delete().eq('id', itemId);
  if (error) { showToast(`Erreur : ${error.message}`, 'error'); return; }
  planFoodItems[mealType] = (planFoodItems[mealType] || []).filter(i => String(i.id) !== String(itemId));
  renderPlanFoodItems(mealType);
  showToast('Aliment retiré du plan', 'success');
}

// ── Plan substitutes ───────────────────────────────────────
function togglePlanSubPicker(mealType) {
  const picker = document.getElementById(`psp-${mealType}`);
  if (!picker) return;
  const isOpen = picker.classList.contains('preset-picker--open');
  document.querySelectorAll('.preset-picker, .food-picker').forEach(p => p.classList.remove('preset-picker--open'));
  if (isOpen) return;
  picker.innerHTML = substitutes.length
    ? substitutes.map(s => `
        <div class="preset-item" onclick="addSubToPlan('${mealType}','${s.id}')">
          <span class="preset-item__name">${s.name}</span>
          <span class="preset-item__meta">${[s.calories?s.calories+' kcal':null,s.protein_g?s.protein_g+'g P':null].filter(Boolean).join(' · ')}</span>
        </div>`).join('')
    : '<p class="preset-list-empty">Aucun substitut — allez dans Gestion.</p>';
  picker.classList.add('preset-picker--open');
}

async function addSubToPlan(mealType, subId) {
  const s = substitutes.find(x => x.id === subId);
  if (!s) return;
  document.getElementById(`psp-${mealType}`)?.classList.remove('preset-picker--open');
  const item = {
    plan_date: planDate, meal_type: mealType, substitute_id: s.id, substitute_name: s.name,
    included: false, calories: s.calories || null, protein_g: s.protein_g || null,
    carbs_g: s.carbs_g || null, fat_g: s.fat_g || null, fiber_g: s.fiber_g || null,
  };
  const { data, error } = await db.from('meal_plan_sub_entries').insert(item).select().single();
  if (error) { showToast(`Erreur : ${error.message}`, 'error'); return; }
  if (!planSubEntries[mealType]) planSubEntries[mealType] = [];
  planSubEntries[mealType].push(data);
  renderPlanSubEntries(mealType);
  renderPlanFoodItems(mealType);
  showToast(`${s.name} ajouté au plan`, 'success');
}

function renderPlanSubEntries(mealType) {
  const container = document.getElementById(`psi-${mealType}`);
  if (!container) return;
  const items = planSubEntries[mealType] || [];
  if (!items.length) { container.innerHTML = ''; return; }
  container.innerHTML = items.map(item => `
    <div class="meal-sub-item" id="psi-item-${item.id}">
      <span style="font-size:13px;">💊</span>
      <span class="meal-sub-item__name">${item.substitute_name}</span>
      <span class="meal-sub-item__meta">${item.calories ?? '—'} kcal${item.protein_g != null ? ` · ${item.protein_g}g P` : ''}</span>
      <button class="meal-sub-toggle${item.included ? ' meal-sub-toggle--on' : ''}" onclick="togglePlanSubEntry('${mealType}','${item.id}')">${item.included ? '✓ comprises' : '+ à ajouter'}</button>
      <button class="btn btn--ghost btn--sm" style="color:rgba(248,113,113,0.8);" onclick="removePlanSubEntry('${mealType}','${item.id}')">✕</button>
    </div>`).join('');
}

async function togglePlanSubEntry(mealType, entryId) {
  const item = (planSubEntries[mealType] || []).find(i => String(i.id) === String(entryId));
  if (!item) return;
  const nowIncluded = !item.included;
  const { error } = await db.from('meal_plan_sub_entries').update({ included: nowIncluded }).eq('id', entryId);
  if (error) { showToast(`Erreur : ${error.message}`, 'error'); return; }
  item.included = nowIncluded;
  renderPlanSubEntries(mealType);
  renderPlanFoodItems(mealType);
}

async function removePlanSubEntry(mealType, entryId) {
  const { error } = await db.from('meal_plan_sub_entries').delete().eq('id', entryId);
  if (error) { showToast(`Erreur : ${error.message}`, 'error'); return; }
  planSubEntries[mealType] = (planSubEntries[mealType] || []).filter(i => String(i.id) !== String(entryId));
  renderPlanSubEntries(mealType);
  renderPlanFoodItems(mealType);
  showToast('Substitut retiré du plan', 'success');
}

async function applyMealPlanToJournal(mealType) {
  const items = planFoodItems[mealType] || [];
  const subs  = planSubEntries[mealType] || [];
  if (!items.length && !subs.length) { showToast('Aucun aliment planifié pour ce repas', 'error'); return; }

  const ops = [];
  if (items.length) {
    ops.push(db.from('meal_food_items').insert(items.map(i => ({
      date: planDate, meal_type: mealType,
      food_id: i.food_id, food_name: i.food_name, grams: i.grams,
      calories: i.calories, protein_g: i.protein_g, carbs_g: i.carbs_g,
      fat_g: i.fat_g, fiber_g: i.fiber_g,
    }))));
  }
  if (subs.length) {
    ops.push(db.from('meal_substitute_entries').insert(subs.map(s => ({
      date: planDate, meal_type: mealType,
      substitute_id: s.substitute_id, substitute_name: s.substitute_name,
      included: s.included, calories: s.calories, protein_g: s.protein_g,
      carbs_g: s.carbs_g, fat_g: s.fat_g, fiber_g: s.fiber_g,
    }))));
  }
  const results = await Promise.all(ops);
  const firstErr = results.find(r => r.error)?.error;
  if (firstErr) { showToast(`Erreur : ${firstErr.message}`, 'error'); return; }

  const { data: allItems } = await db.from('meal_food_items').select('*').eq('date', planDate).eq('meal_type', mealType);
  const addSubs = subs.filter(s => !s.included);
  const t = [...(allItems || []), ...addSubs].reduce((acc, i) => ({
    calories:  acc.calories  + (i.calories  || 0),
    protein_g: acc.protein_g + (i.protein_g || 0),
    carbs_g:   acc.carbs_g   + (i.carbs_g   || 0),
    fat_g:     acc.fat_g     + (i.fat_g     || 0),
    fiber_g:   acc.fiber_g   + (i.fiber_g   || 0),
  }), { calories:0, protein_g:0, carbs_g:0, fat_g:0, fiber_g:0 });

  await db.from('meals').upsert({
    date: planDate, meal_type: mealType, done: true,
    description: (allItems || []).map(i => i.food_name).join(', '),
    calories:  Math.round(t.calories),
    protein_g: parseFloat(t.protein_g.toFixed(1)),
    carbs_g:   parseFloat(t.carbs_g.toFixed(1)),
    fat_g:     parseFloat(t.fat_g.toFixed(1)),
    fiber_g:   parseFloat(t.fiber_g.toFixed(1)),
  }, { onConflict: 'date,meal_type' });

  // Deduct from pantry
  for (const item of items) {
    if (!item.food_id) continue;
    const pantryItem = pantryItems.find(p => p.food_id === item.food_id);
    if (pantryItem) {
      const newQty = Math.max(0, pantryItem.quantity - (item.grams || 0));
      await db.from('pantry_items').update({ quantity: newQty, updated_at: new Date().toISOString() }).eq('id', pantryItem.id);
      pantryItem.quantity = newQty;
    }
  }
  for (const sub of subs.filter(s => !s.included)) {
    if (!sub.substitute_id) continue;
    const pantryItem = pantryItems.find(p => p.substitute_id === sub.substitute_id);
    if (pantryItem) {
      const newQty = Math.max(0, pantryItem.quantity - 1);
      await db.from('pantry_items').update({ quantity: newQty, updated_at: new Date().toISOString() }).eq('id', pantryItem.id);
      pantryItem.quantity = newQty;
    }
  }

  showToast('Repas ajouté au journal ✓', 'success');
  journalDate = planDate;
  document.getElementById('j-date').value = planDate;
  switchNutritionTab('journal');
  await loadJournalData();
  syncNutritionTable(journalDate);
}

// ── Pantry ─────────────────────────────────────────────────
async function loadPantry() {
  const { data } = await db.from('pantry_items').select('*').order('item_name');
  pantryItems = data || [];
  renderPantryList();
}

function renderPantryList() {
  const container = document.getElementById('pantry-list');
  if (!pantryItems.length) {
    container.innerHTML = '<p style="color:var(--text-dim);font-size:13px;text-align:center;padding:32px 0;">Stock vide. Ajoutez vos aliments et substituts.</p>';
    return;
  }
  const foodPantry = pantryItems.filter(p => p.item_type === 'food');
  const subPantry  = pantryItems.filter(p => p.item_type === 'substitute');
  let html = '';
  if (foodPantry.length) {
    html += '<div style="margin-bottom:6px;font-size:11px;color:var(--text-dim);text-transform:uppercase;letter-spacing:0.06em;padding:4px 0;">🥗 Aliments</div>';
    html += foodPantry.map(p => renderPantryRow(p)).join('');
  }
  if (subPantry.length) {
    html += '<div style="margin-bottom:6px;margin-top:16px;font-size:11px;color:var(--text-dim);text-transform:uppercase;letter-spacing:0.06em;padding:4px 0;">💊 Substituts</div>';
    html += subPantry.map(p => renderPantryRow(p)).join('');
  }
  container.innerHTML = html;
}

function renderPantryRow(p) {
  return `<div class="pantry-stock-row" id="pantry-row-${p.id}">
    <div class="pantry-stock-row__name">${p.item_name}</div>
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

  const foodMatches = foods.filter(f => f.name.toLowerCase().includes(search)).slice(0, 6);
  const subMatches  = substitutes.filter(s => s.name.toLowerCase().includes(search)).slice(0, 4);
  const all = [
    ...foodMatches.map(f => ({ type:'food', id:f.id, name:f.name, unit:f.unit||'g' })),
    ...subMatches.map(s => ({ type:'sub',  id:s.id, name:s.name, unit:'unité' })),
  ];

  if (!all.length) { results.style.display = 'none'; return; }
  results.innerHTML = all.map(m => `
    <div class="preset-item" onclick="selectPantryItem('${m.type}','${m.id}','${m.name.replace(/'/g,"\\'")}','${m.unit}')">
      <span class="preset-item__name">${m.name}</span>
      <span class="preset-item__meta">${m.type === 'food' ? '🥗' : '💊'} ${m.unit}</span>
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
      item_name:    pantrySelectedItem.name,
      quantity:     qty,
      unit:         pantrySelectedItem.unit,
    };
    const { error } = await db.from('pantry_items').insert(item);
    if (error) { showToast(`Erreur : ${error.message}`, 'error'); return; }
  }

  showToast(`${pantrySelectedItem.name} mis à jour dans le stock`, 'success');
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

// ── Shopping list ──────────────────────────────────────────
function getShoppingPeriod() {
  const now        = new Date();
  const dayOfWeek  = now.getDay();
  const toMonday   = (dayOfWeek === 0) ? 6 : dayOfWeek - 1;
  const lastMonday = new Date(now);
  lastMonday.setDate(now.getDate() - toMonday);
  const nextMonday = new Date(lastMonday);
  nextMonday.setDate(lastMonday.getDate() + 7);
  return {
    start: lastMonday.toISOString().split('T')[0],
    end:   nextMonday.toISOString().split('T')[0],
  };
}

function updateCoursePeriodLabel() {
  const { start, end } = getShoppingPeriod();
  setEl('courses-period', `Semaine du ${formatDateShort(start)} au ${formatDateShort(end)}`);
}

async function generateShoppingList() {
  const { start, end } = getShoppingPeriod();
  setEl('courses-period', `Semaine du ${formatDateShort(start)} au ${formatDateShort(end)}`);
  setEl('shopping-list-content', '<p style="color:var(--text-dim);font-size:13px;text-align:center;padding:24px;">Calcul en cours…</p>');

  const [planItemsRes, planSubsRes, pantryRes, tagsRes, tagLinksRes] = await Promise.all([
    db.from('meal_plan_items').select('food_id, food_name, grams').gte('plan_date', start).lte('plan_date', end),
    db.from('meal_plan_sub_entries').select('substitute_id, substitute_name').gte('plan_date', start).lte('plan_date', end).eq('included', false),
    db.from('pantry_items').select('*'),
    db.from('food_tags').select('*'),
    db.from('food_tag_links').select('food_id, tag_id'),
  ]);

  const planItems  = planItemsRes.data  || [];
  const planSubs   = planSubsRes.data   || [];
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

  // Aggregate sub needs
  const subNeeds = {};
  planSubs.forEach(sub => {
    if (!subNeeds[sub.substitute_id]) {
      subNeeds[sub.substitute_id] = {
        name: sub.substitute_name, totalQty: 0, unit: 'unité',
        tag: { name: 'Substituts', color: '#a855f7' },
      };
    }
    subNeeds[sub.substitute_id].totalQty += 1;
  });

  // Compute what's needed
  const shoppingItems = [];
  Object.entries(foodNeeds).forEach(([foodId, need]) => {
    const pantryItem = pantrySnap.find(p => p.food_id === foodId);
    const inStock    = pantryItem?.quantity || 0;
    const toBuy      = Math.max(0, need.totalQty - inStock);
    if (toBuy > 0) shoppingItems.push({ ...need, inStock, toBuy: Math.round(toBuy * 10) / 10 });
  });
  Object.entries(subNeeds).forEach(([subId, need]) => {
    const pantryItem = pantrySnap.find(p => p.substitute_id === subId);
    const inStock    = pantryItem?.quantity || 0;
    const toBuy      = Math.max(0, need.totalQty - inStock);
    if (toBuy > 0) shoppingItems.push({ ...need, inStock, toBuy: Math.ceil(toBuy) });
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

  // Sort: Substituts last, Autres second-to-last, others alphabetical
  const keys = Object.keys(groups).sort((a, b) => {
    if (a === 'Substituts') return 1;
    if (b === 'Substituts') return -1;
    if (a === 'Autres') return 1;
    if (b === 'Autres') return -1;
    return a.localeCompare(b);
  });

  container.innerHTML = keys.map(tagName => {
    const g = groups[tagName];
    return `<div class="shopping-group">
      <div class="shopping-group__title" style="color:${g.color};">
        <span class="shopping-group__dot" style="background:${g.color};"></span>${tagName}
      </div>
      ${g.items.map(item => {
        const key = `${item.name}`;
        const checked = checkedShoppingItems.has(key);
        return `<div class="shopping-item${checked ? '" style="opacity:.45;' : '"'}>
          <div class="shopping-item__check${checked ? ' shopping-item__check--done' : ''}" onclick="toggleShoppingCheck('${key.replace(/'/g,"\\'")}')" title="Cocher">${checked ? '✓' : ''}</div>
          <span class="shopping-item__name" style="${checked ? 'text-decoration:line-through;' : ''}">${item.name}</span>
          <span class="shopping-item__qty">${item.toBuy} ${item.unit}</span>
          ${item.inStock > 0 ? `<span class="shopping-item__stock">en stock: ${item.inStock}</span>` : ''}
        </div>`;
      }).join('')}
    </div>`;
  }).join('');
}

function toggleShoppingCheck(key) {
  if (checkedShoppingItems.has(key)) checkedShoppingItems.delete(key);
  else checkedShoppingItems.add(key);
  // Re-render just the item's styling
  document.querySelectorAll('.shopping-item').forEach(el => {
    const nameEl  = el.querySelector('.shopping-item__name');
    const checkEl = el.querySelector('.shopping-item__check');
    if (!nameEl) return;
    const itemKey = nameEl.textContent;
    const done    = checkedShoppingItems.has(itemKey);
    el.style.opacity = done ? '0.45' : '';
    nameEl.style.textDecoration = done ? 'line-through' : '';
    checkEl.classList.toggle('shopping-item__check--done', done);
    checkEl.textContent = done ? '✓' : '';
  });
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
  }
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
  const { data } = await db.from('foods').select('*').order('name');
  foods = data || [];
  renderFoodList();
}

function renderFoodList() {
  const container = document.getElementById('food-list');
  if (!container) return;
  if (!foods.length) { container.innerHTML = '<p class="preset-list-empty">Aucun aliment enregistré.</p>'; return; }
  container.innerHTML = foods.map(f => {
    const macros = [
      f.calories_per_100g != null ? f.calories_per_100g + 'kcal' : null,
      f.protein_per_100g  != null ? f.protein_per_100g  + 'g p'  : null,
      f.carbs_per_100g    != null ? f.carbs_per_100g    + 'g gl'  : null,
    ].filter(Boolean).join(' · ');
    const unit      = f.unit || 'g';
    const isEditing = editingFoodId === f.id;
    const myTagIds  = isEditing ? (editingFoodTags[f.id] || foodTagLinks[f.id] || []) : (foodTagLinks[f.id] || []);
    const myTags    = myTagIds.map(tid => tags.find(t => t.id === tid)).filter(Boolean);
    const tagChips  = myTags.map(t => `<span style="font-size:10px;padding:2px 8px;border-radius:12px;background:${t.color}22;border:1px solid ${t.color};color:${t.color};">${t.name}</span>`).join('');
    const esc = s => String(s ?? '').replace(/"/g, '&quot;');

    const editForm = isEditing ? `
      <div style="width:100%;display:flex;flex-direction:column;gap:8px;padding:8px 0 4px;">
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
        <div style="display:flex;gap:6px;">
          <button class="btn btn--primary btn--sm" onclick="saveFoodEdit('${f.id}')">Sauvegarder</button>
          <button class="btn btn--ghost btn--sm" onclick="cancelFoodEdit()">Annuler</button>
        </div>
      </div>` : '';

    return `<div class="preset-item" style="flex-wrap:wrap;">
      <div style="flex:1;min-width:0;">
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
          <span class="preset-item__name">${f.name}</span>
          <span style="font-size:10px;color:var(--text-dim);background:rgba(255,255,255,0.05);padding:1px 6px;border-radius:4px;">${unit}</span>
          ${tagChips}
        </div>
        ${macros ? `<div class="preset-item__meta" style="margin-top:2px;">${macros} /100${unit}</div>` : ''}
      </div>
      <button class="habit-manage-btn habit-manage-btn--edit" onclick="startFoodEdit('${f.id}')">✏</button>
      <button class="preset-item__del" onclick="deleteFood('${f.id}')">✕</button>
      ${editForm}
    </div>`;
  }).join('');
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

// ── Gestion — Substitutes ──────────────────────────────────
async function loadSubstitutes() {
  const { data } = await db.from('meal_substitutes').select('*').order('name');
  substitutes = data || [];
  renderSubstituteList();
}

function renderSubstituteList() {
  const container = document.getElementById('substitute-list');
  if (!container) return;
  if (!substitutes.length) {
    container.innerHTML = '<p class="preset-list-empty">Aucun substitut enregistré.</p>';
    return;
  }
  container.innerHTML = substitutes.map(s => {
    const macros = [
      s.calories  ? s.calories  + 'kcal' : null,
      s.protein_g ? s.protein_g + 'g p'  : null,
    ].filter(Boolean).join(' · ');
    return `<div class="preset-item">
      <div style="flex:1;min-width:0;">
        <div class="preset-item__name">${s.name}</div>
        ${macros ? `<div class="preset-item__meta" style="margin-top:2px;">${macros}</div>` : ''}
      </div>
      <button class="preset-item__del" onclick="deleteMealSubstitute('${s.id}')">✕</button>
    </div>`;
  }).join('');
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
  ['ns-name','ns-kcal','ns-prot','ns-gluc','ns-lip','ns-fib'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  await loadSubstitutes();
}

async function deleteMealSubstitute(id) {
  if (!confirm('Supprimer ce substitut ?')) return;
  const { error } = await db.from('meal_substitutes').delete().eq('id', id);
  if (error) { showToast('Erreur', 'error'); return; }
  showToast('Substitut supprimé', 'success');
  await loadSubstitutes();
}

// ── Utils ──────────────────────────────────────────────────
function today()          { return new Date().toISOString().split('T')[0]; }
function daysAgo(n)       { const d=new Date(); d.setDate(d.getDate()-n); return d.toISOString().split('T')[0]; }
function numF(v)          { return v!==undefined&&v!==''?parseFloat(v)||null:null; }
function numI(v)          { return v!==undefined&&v!==''?parseInt(v)||null:null; }
function formatDate(str)  { return new Date(str+'T12:00:00').toLocaleDateString('fr-FR',{ day:'2-digit', month:'short', year:'2-digit' }); }
function formatDateShort(str){ return new Date(str+'T12:00:00').toLocaleDateString('fr-FR',{ day:'2-digit', month:'2-digit' }); }
function setEl(id, val)   { const el=document.getElementById(id); if(el) el.textContent=val; }
function showToast(msg, type='success') {
  const t=document.createElement('div'); t.className=`toast toast--${type}`; t.textContent=msg;
  document.body.appendChild(t); requestAnimationFrame(()=>t.classList.add('show'));
  setTimeout(()=>{ t.classList.remove('show'); setTimeout(()=>t.remove(),400); },3800);
}
