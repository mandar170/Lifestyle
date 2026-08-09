// ============================================================
// MUSCU — strength-training tracker
// Phase 1: exercise library + muscle groups.
// ============================================================

// ── State ──────────────────────────────────────────────────
let exercises        = [];
let muscleGroups     = [];
let exerciseMuscles  = {};   // exercise_id -> [muscle_id]
let newExMuscles     = [];   // muscle_ids selected in the "new exercise" form
let editingExId      = null;
let editingExMuscles = [];   // muscle_ids while editing an exercise

// ── Init ───────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  initMuscuTabs();
  await loadMuscleGroups();
  await loadExercises();
});

function initMuscuTabs() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      const panel = document.getElementById('panel-' + btn.dataset.tab);
      if (panel) panel.classList.add('active');
    });
  });
}

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const muscleName = id => (muscleGroups.find(m => m.id === id)?.name) || '';

// ── Data loading ───────────────────────────────────────────
async function loadMuscleGroups() {
  const { data } = await db.from('muscle_groups').select('*').order('order_index');
  muscleGroups = data || [];
  renderMuscleGroupList();
  renderNewExMuscleChips();
}

async function loadExercises() {
  const [{ data: ex }, { data: links }] = await Promise.all([
    db.from('exercises').select('*').order('name'),
    db.from('exercise_muscles').select('*'),
  ]);
  exercises = ex || [];
  exerciseMuscles = {};
  (links || []).forEach(l => { (exerciseMuscles[l.exercise_id] = exerciseMuscles[l.exercise_id] || []).push(l.muscle_id); });
  renderExerciseList();
}

// ── New-exercise form ──────────────────────────────────────
function renderNewExMuscleChips() {
  const el = document.getElementById('ex-muscle-chips');
  if (!el) return;
  el.innerHTML = muscleGroups.map(m => {
    const sel = newExMuscles.includes(m.id);
    return `<span class="muscle-chip${sel ? ' muscle-chip--on' : ''}" onclick="toggleNewExMuscle('${m.id}')">${esc(m.name)}</span>`;
  }).join('');
}

function toggleNewExMuscle(id) {
  newExMuscles = newExMuscles.includes(id) ? newExMuscles.filter(x => x !== id) : [...newExMuscles, id];
  renderNewExMuscleChips();
}

async function saveExercise() {
  const name = document.getElementById('ex-name')?.value.trim();
  if (!name) { showToast('Nom requis', 'error'); return; }
  const isCardio = !!document.getElementById('ex-cardio')?.checked;
  const { data: ex, error } = await db.from('exercises').insert({ name, is_cardio: isCardio }).select().single();
  if (error) { showToast(`Erreur : ${error.message}`, 'error'); return; }
  if (newExMuscles.length) {
    await db.from('exercise_muscles').insert(newExMuscles.map(mid => ({ exercise_id: ex.id, muscle_id: mid })));
  }
  document.getElementById('ex-name').value = '';
  document.getElementById('ex-cardio').checked = false;
  newExMuscles = [];
  renderNewExMuscleChips();
  showToast('Exercice ajouté', 'success');
  await loadExercises();
}

// ── Exercise list ──────────────────────────────────────────
function renderExerciseList() {
  const container = document.getElementById('exercise-list');
  if (!container) return;
  if (!exercises.length) { container.innerHTML = '<p class="preset-list-empty">Aucun exercice. Ajoute-en un ci-dessus.</p>'; return; }

  container.innerHTML = exercises.map(ex => {
    const muscles = (exerciseMuscles[ex.id] || []).map(muscleName).filter(Boolean);
    const badges = muscles.map(m => `<span class="muscle-badge">${esc(m)}</span>`).join('');
    const cardio = ex.is_cardio ? '<span class="ex-cardio-badge">🏃 cardio</span>' : '';
    const editing = editingExId === ex.id;
    const editForm = editing ? `
      <div class="ex-edit">
        <input type="text" id="ex-edit-name-${ex.id}" class="np-input" value="${esc(ex.name)}" style="width:100%;margin-bottom:8px;" />
        <label class="ex-cardio-label"><input type="checkbox" id="ex-edit-cardio-${ex.id}" ${ex.is_cardio ? 'checked' : ''} /> Exercice cardio</label>
        <div class="muscle-chips" id="ex-edit-muscles-${ex.id}" style="margin-top:8px;">${renderEditMuscleChips(ex.id)}</div>
        <div style="display:flex;gap:6px;margin-top:10px;">
          <button class="btn btn--primary btn--sm" onclick="saveExerciseEdit('${ex.id}')">Sauvegarder</button>
          <button class="btn btn--ghost btn--sm" onclick="cancelExerciseEdit()">Annuler</button>
        </div>
      </div>` : '';
    return `<div class="ex-card${editing ? ' ex-card--editing' : ''}">
      <div class="ex-card__head">
        <span class="ex-card__name">${esc(ex.name)} ${cardio}</span>
        <div class="ex-card__actions">
          <button class="habit-manage-btn habit-manage-btn--edit" onclick="startExerciseEdit('${ex.id}')">✏️</button>
          <button class="preset-item__del" onclick="deleteExercise('${ex.id}')">✕</button>
        </div>
      </div>
      <div class="ex-card__muscles">${badges || '<span class="muscle-badge muscle-badge--none">aucun muscle</span>'}</div>
      ${editForm}
    </div>`;
  }).join('');
}

function renderEditMuscleChips(exId) {
  return muscleGroups.map(m => {
    const sel = editingExMuscles.includes(m.id);
    return `<span class="muscle-chip${sel ? ' muscle-chip--on' : ''}" onclick="toggleEditMuscle('${exId}','${m.id}')">${esc(m.name)}</span>`;
  }).join('');
}

function toggleEditMuscle(exId, id) {
  editingExMuscles = editingExMuscles.includes(id) ? editingExMuscles.filter(x => x !== id) : [...editingExMuscles, id];
  const el = document.getElementById(`ex-edit-muscles-${exId}`);
  if (el) el.innerHTML = renderEditMuscleChips(exId);
}

function startExerciseEdit(id) {
  editingExId = id;
  editingExMuscles = [...(exerciseMuscles[id] || [])];
  renderExerciseList();
}

function cancelExerciseEdit() {
  editingExId = null;
  renderExerciseList();
}

async function saveExerciseEdit(id) {
  const name = document.getElementById(`ex-edit-name-${id}`)?.value.trim();
  if (!name) { showToast('Nom requis', 'error'); return; }
  const isCardio = !!document.getElementById(`ex-edit-cardio-${id}`)?.checked;
  const { error } = await db.from('exercises').update({ name, is_cardio: isCardio }).eq('id', id);
  if (error) { showToast(`Erreur : ${error.message}`, 'error'); return; }
  await db.from('exercise_muscles').delete().eq('exercise_id', id);
  if (editingExMuscles.length) {
    await db.from('exercise_muscles').insert(editingExMuscles.map(mid => ({ exercise_id: id, muscle_id: mid })));
  }
  editingExId = null;
  showToast('Exercice mis à jour', 'success');
  await loadExercises();
}

async function deleteExercise(id) {
  if (!confirm('Supprimer cet exercice ?')) return;
  await db.from('exercise_muscles').delete().eq('exercise_id', id);
  const { error } = await db.from('exercises').delete().eq('id', id);
  if (error) { showToast(`Erreur : ${error.message}`, 'error'); return; }
  showToast('Exercice supprimé', 'success');
  await loadExercises();
}

// ── Muscle groups management ───────────────────────────────
function renderMuscleGroupList() {
  const el = document.getElementById('muscle-group-list');
  if (!el) return;
  el.innerHTML = muscleGroups.map(m =>
    `<span class="muscle-chip muscle-chip--static">${esc(m.name)}<button class="muscle-chip__del" onclick="deleteMuscleGroup('${m.id}')">✕</button></span>`
  ).join('');
}

async function addMuscleGroup() {
  const input = document.getElementById('mg-name');
  const name = (input?.value || '').trim();
  if (!name) { showToast('Nom requis', 'error'); return; }
  const nextOrder = (muscleGroups.reduce((m, g) => Math.max(m, g.order_index || 0), 0)) + 1;
  const { error } = await db.from('muscle_groups').insert({ name, order_index: nextOrder });
  if (error) { showToast(/duplicate|unique/i.test(error.message) ? 'Ce groupe existe déjà' : `Erreur : ${error.message}`, 'error'); return; }
  if (input) input.value = '';
  showToast('Groupe ajouté', 'success');
  await loadMuscleGroups();
}

async function deleteMuscleGroup(id) {
  if (!confirm('Supprimer ce groupe musculaire ? Il sera retiré des exercices associés.')) return;
  await db.from('exercise_muscles').delete().eq('muscle_id', id);
  const { error } = await db.from('muscle_groups').delete().eq('id', id);
  if (error) { showToast(`Erreur : ${error.message}`, 'error'); return; }
  showToast('Groupe supprimé', 'success');
  await loadMuscleGroups();
  await loadExercises();
}

// ── Toast (stacked, shared style) ──────────────────────────
function showToast(msg, type = 'success') {
  let cont = document.getElementById('toast-container');
  if (!cont) { cont = document.createElement('div'); cont.id = 'toast-container'; cont.className = 'toast-container'; document.body.appendChild(cont); }
  const t = document.createElement('div'); t.className = `toast toast--${type}`; t.textContent = msg;
  cont.appendChild(t); requestAnimationFrame(() => t.classList.add('show'));
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 400); }, 3600);
}
