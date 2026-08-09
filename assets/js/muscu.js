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
  await loadSessions();
  await loadTemplates();
});

function initMuscuTabs() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      const panel = document.getElementById('panel-' + btn.dataset.tab);
      if (panel) panel.classList.add('active');
      if (btn.dataset.tab === 'stats') renderStats();
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

// ══ Sessions (saisie de séance) ════════════════════════════
let sessions        = [];
let templates       = [];
let sessionDraft    = null;   // in-memory draft while editing (session OR template)
let seExSearch      = '';     // exercise-picker search term in the editor
let importPickerOpen = false; // template-import picker toggle

const SET_TYPES = [
  { key: 'echauffement', label: 'É', color: '#f59e0b', title: 'Échauffement' },
  { key: 'travail',      label: 'T', color: '#22c55e', title: 'Travail' },
  { key: 'recup',        label: 'R', color: '#94a3b8', title: 'Récup' },
];
const setTypeDef = k => SET_TYPES.find(s => s.key === k) || SET_TYPES[1];

function muscuToday() {
  const d = new Date();
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
function fmtDateFR(s) {
  if (!s) return '';
  const d = new Date(s + 'T12:00:00');
  return d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
}

async function loadSessions() {
  const { data } = await db.from('workout_sessions').select('*').eq('is_template', false).order('session_date', { ascending: false });
  sessions = data || [];
  renderSessionList();
}

async function renderSessionList() {
  const el = document.getElementById('session-list');
  if (!el) return;
  if (!sessions.length) { el.innerHTML = '<p class="preset-list-empty">Aucune séance. Crée-en une avec « + Nouvelle séance ».</p>'; return; }
  // Count exercises per session in one query.
  const ids = sessions.map(s => s.id);
  const { data: sx } = await db.from('session_exercises').select('session_id').in('session_id', ids);
  const counts = {};
  (sx || []).forEach(r => { counts[r.session_id] = (counts[r.session_id] || 0) + 1; });
  el.innerHTML = sessions.map(s => `
    <div class="wo-session-card" onclick="editSession('${s.id}')">
      <div class="wo-session-card__head">
        <span class="wo-session-card__name">${esc(s.name)}</span>
        <span class="wo-session-card__date">${fmtDateFR(s.session_date)}</span>
      </div>
      <div class="wo-session-card__meta">${counts[s.id] || 0} exo${(counts[s.id] || 0) > 1 ? 's' : ''}${s.duration_min ? ` · ${s.duration_min} min` : ''}</div>
      ${s.notes ? `<div class="wo-session-card__note">📝 ${esc(s.notes.length > 90 ? s.notes.slice(0, 90) + '…' : s.notes)}</div>` : ''}
    </div>`).join('');
}

function activateTab(name) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.toggle('active', p.id === 'panel-' + name));
}

// Leave the editor and go back to the right list (séances or modèles).
function closeEditor() {
  const wasTemplate = !!(sessionDraft && sessionDraft.isTemplate);
  document.getElementById('session-editor-view').style.display = 'none';
  document.getElementById('session-list-view').style.display = '';
  sessionDraft = null; importPickerOpen = false;
  if (wasTemplate) { activateTab('modeles'); loadTemplates(); }
  else { activateTab('seances'); loadSessions(); }
}

function newSession() {
  sessionDraft = { id: null, isTemplate: false, name: '', session_date: muscuToday(), duration_min: null, notes: '', exercises: [] };
  seExSearch = ''; importPickerOpen = false;
  openEditor();
}

// Load a session or a template into the draft and open the editor.
async function editSessionRow(id, isTemplate) {
  const src = (isTemplate ? templates : sessions).find(x => x.id === id);
  if (!src) return;
  const { data: sx } = await db.from('session_exercises').select('*').eq('session_id', id).order('order_index');
  const sxIds = (sx || []).map(e => e.id);
  const { data: sets } = sxIds.length
    ? await db.from('exercise_sets').select('*').in('session_exercise_id', sxIds)
    : { data: [] };
  const setsByEx = {};
  (sets || []).forEach(st => { (setsByEx[st.session_exercise_id] = setsByEx[st.session_exercise_id] || []).push(st); });
  sessionDraft = {
    id: src.id, isTemplate, name: src.name, session_date: src.session_date, duration_min: src.duration_min,
    notes: src.notes || '',
    exercises: (sx || []).map(e => ({
      exercise_id: e.exercise_id, exercise_name: e.exercise_name, is_cardio: e.is_cardio,
      cardio_duration_min: e.cardio_duration_min,
      sets: (setsByEx[e.id] || []).sort((a, b) => a.set_index - b.set_index)
        .map(st => ({ set_type: st.set_type, reps: st.reps, weight_kg: st.weight_kg })),
    })),
  };
  seExSearch = ''; importPickerOpen = false;
  openEditor();
}
function editSession(id)  { return editSessionRow(id, false); }
function editTemplate(id) { return editSessionRow(id, true); }

function openEditor() {
  activateTab('seances'); // the editor lives in the séances panel
  document.getElementById('session-list-view').style.display = 'none';
  const view = document.getElementById('session-editor-view');
  view.style.display = '';
  renderSessionEditor();
}

// ── Templates (séances type) ───────────────────────────────
async function loadTemplates() {
  const { data } = await db.from('workout_sessions').select('*').eq('is_template', true).order('name');
  templates = data || [];
  renderTemplateList();
}

async function renderTemplateList() {
  const el = document.getElementById('template-list');
  if (!el) return;
  if (!templates.length) { el.innerHTML = '<p class="preset-list-empty">Aucun modèle. Crée-en un, ou « ⭐ Modèle » depuis une séance.</p>'; return; }
  const ids = templates.map(s => s.id);
  const { data: sx } = await db.from('session_exercises').select('session_id').in('session_id', ids);
  const counts = {};
  (sx || []).forEach(r => { counts[r.session_id] = (counts[r.session_id] || 0) + 1; });
  el.innerHTML = templates.map(tpl => `
    <div class="wo-session-card" onclick="editTemplate('${tpl.id}')">
      <div class="wo-session-card__head">
        <span class="wo-session-card__name">📋 ${esc(tpl.name)}</span>
        <button class="preset-item__del" onclick="event.stopPropagation();deleteTemplate('${tpl.id}')">✕</button>
      </div>
      <div class="wo-session-card__meta">${counts[tpl.id] || 0} exo${(counts[tpl.id] || 0) > 1 ? 's' : ''}</div>
    </div>`).join('');
}

function newTemplate() {
  sessionDraft = { id: null, isTemplate: true, name: '', session_date: null, duration_min: null, exercises: [] };
  seExSearch = ''; importPickerOpen = false;
  openEditor();
}

async function deleteTemplate(id) {
  if (!confirm('Supprimer ce modèle ?')) return;
  const { error } = await db.from('workout_sessions').delete().eq('id', id);
  if (error) { showToast(`Erreur : ${error.message}`, 'error'); return; }
  showToast('Modèle supprimé', 'success');
  await loadTemplates();
}

// Save the current session's structure as a NEW template (types kept, reps/poids vides).
async function saveAsTemplate() {
  const d = sessionDraft;
  if (!d) return;
  const name = (d.name || '').trim() || 'Modèle';
  const { data: tpl, error } = await db.from('workout_sessions').insert({ name, is_template: true, session_date: null }).select().single();
  if (error) { showToast(`Erreur : ${error.message}`, 'error'); return; }
  for (let i = 0; i < d.exercises.length; i++) {
    const ex = d.exercises[i];
    const { data: se } = await db.from('session_exercises').insert({
      session_id: tpl.id, exercise_id: ex.exercise_id, exercise_name: ex.exercise_name,
      order_index: i, is_cardio: ex.is_cardio, cardio_duration_min: null,
    }).select().single();
    if (!ex.is_cardio && ex.sets.length) {
      await db.from('exercise_sets').insert(ex.sets.map((s, j) => ({
        session_exercise_id: se.id, set_index: j, set_type: s.set_type || 'travail', reps: null, weight_kg: null,
      })));
    }
  }
  await loadTemplates();
  showToast('Séance enregistrée comme modèle ⭐', 'success');
}

// Fill the current (empty) session draft from a template — user then fills reps/poids.
function toggleImportPicker() { importPickerOpen = !importPickerOpen; renderSessionEditor(); }

async function importTemplateInto(id) {
  const { data: sx } = await db.from('session_exercises').select('*').eq('session_id', id).order('order_index');
  const sxIds = (sx || []).map(e => e.id);
  const { data: sets } = sxIds.length
    ? await db.from('exercise_sets').select('*').in('session_exercise_id', sxIds)
    : { data: [] };
  const setsByEx = {};
  (sets || []).forEach(st => { (setsByEx[st.session_exercise_id] = setsByEx[st.session_exercise_id] || []).push(st); });
  sessionDraft.exercises = (sx || []).map(e => ({
    exercise_id: e.exercise_id, exercise_name: e.exercise_name, is_cardio: e.is_cardio, cardio_duration_min: null,
    sets: (setsByEx[e.id] || []).sort((a, b) => a.set_index - b.set_index).map(st => ({ set_type: st.set_type, reps: null, weight_kg: null })),
  }));
  if (!sessionDraft.name.trim()) { const tpl = templates.find(t => t.id === id); if (tpl) sessionDraft.name = tpl.name; }
  importPickerOpen = false;
  showToast('Modèle importé — remplis reps + poids', 'success');
  renderSessionEditor();
}

// ── Draft mutations ────────────────────────────────────────
function draftSetField(field, value) { if (sessionDraft) sessionDraft[field] = value; }

function addDraftExercise(exId) {
  const ex = exercises.find(e => e.id === exId);
  if (!ex || !sessionDraft) return;
  sessionDraft.exercises.push({
    exercise_id: ex.id, exercise_name: ex.name, is_cardio: ex.is_cardio,
    cardio_duration_min: ex.is_cardio ? null : null,
    sets: ex.is_cardio ? [] : [{ set_type: 'travail', reps: null, weight_kg: null }],
  });
  seExSearch = '';
  renderSessionEditor();
}

function removeDraftExercise(i) { sessionDraft.exercises.splice(i, 1); renderSessionEditor(); }

function addSet(i) {
  const ex = sessionDraft.exercises[i];
  const last = ex.sets[ex.sets.length - 1];
  ex.sets.push(last ? { ...last } : { set_type: 'travail', reps: null, weight_kg: null });
  renderSessionEditor();
}
function removeSet(i, j) { sessionDraft.exercises[i].sets.splice(j, 1); renderSessionEditor(); }
function updateSet(i, j, field, value) {
  const set = sessionDraft.exercises[i].sets[j];
  set[field] = value === '' ? null : (field === 'reps' ? parseInt(value) : parseFloat(value));
}
function cycleSetType(i, j) {
  const set = sessionDraft.exercises[i].sets[j];
  const idx = SET_TYPES.findIndex(s => s.key === set.set_type);
  set.set_type = SET_TYPES[(idx + 1) % SET_TYPES.length].key;
  renderSessionEditor();
}
function updateCardioDuration(i, value) { sessionDraft.exercises[i].cardio_duration_min = value === '' ? null : parseInt(value); }

// ── Editor rendering ───────────────────────────────────────
function renderSessionEditor() {
  const view = document.getElementById('session-editor-view');
  if (!view || !sessionDraft) return;
  const d = sessionDraft;
  const isT = !!d.isTemplate;
  const canImport = !isT && templates.length && !d.exercises.length;
  view.innerHTML = `
    <div class="wo-editor-top">
      <button class="btn btn--ghost btn--sm" onclick="closeEditor()">← Retour</button>
      <div style="display:flex;gap:6px;">
        ${isT ? '' : '<button class="btn btn--ghost btn--sm" onclick="saveAsTemplate()">⭐ Modèle</button>'}
        <button class="btn btn--primary btn--sm" onclick="saveSession()">${isT ? 'Enregistrer le modèle' : 'Enregistrer'}</button>
      </div>
    </div>
    <div class="section-card" style="margin-bottom:14px;">
      <input type="text" class="np-input" placeholder="${isT ? 'Nom du modèle (ex. Push, Upper A)…' : 'Nom de la séance (ex. Push A)…'}" value="${esc(d.name)}"
        oninput="draftSetField('name', this.value)" style="width:100%;${isT ? '' : 'margin-bottom:8px;'}" />
      ${isT ? '<p style="font-size:11px;color:var(--text-dim);margin-top:8px;">Un modèle définit la structure (exercices + séries). Tu rempliras reps et poids à l\'import.</p>' : `<div style="display:flex;gap:8px;">
        <input type="date" class="np-input" value="${d.session_date || ''}" oninput="draftSetField('session_date', this.value)" style="flex:1;" />
        <input type="number" class="np-input" placeholder="Durée (min)" min="0" value="${d.duration_min ?? ''}"
          oninput="draftSetField('duration_min', this.value === '' ? null : parseInt(this.value))" style="width:120px;" />
      </div>
      <textarea class="np-input" placeholder="Notes : ressenti, forme du jour…" rows="2"
        oninput="draftSetField('notes', this.value)" style="width:100%;margin-top:8px;resize:vertical;">${esc(d.notes || '')}</textarea>`}
    </div>

    ${canImport ? `<button class="btn btn--ghost btn--sm" style="width:100%;margin-bottom:12px;" onclick="toggleImportPicker()">📥 Importer un modèle</button>${importPickerOpen ? renderImportPicker() : ''}` : ''}

    ${d.exercises.map((ex, i) => renderDraftExercise(ex, i)).join('')}

    ${renderExercisePicker()}
  `;
}

function renderImportPicker() {
  return `<div class="section-card wo-picker" style="margin-bottom:12px;">
    ${templates.map(t => `<div class="wo-ex-pick" onclick="importTemplateInto('${t.id}')">📋 ${esc(t.name)}</div>`).join('')}
  </div>`;
}

function renderDraftExercise(ex, i) {
  const body = ex.is_cardio
    ? `<div class="wo-cardio-row">
         <span>⏱️ Durée</span>
         <input type="number" class="np-input" placeholder="min" min="0" value="${ex.cardio_duration_min ?? ''}"
           oninput="updateCardioDuration(${i}, this.value)" style="width:90px;text-align:center;" />
         <span style="color:var(--text-dim);font-size:12px;">min</span>
       </div>`
    : `<div class="wo-sets">
         <div class="wo-sets__head"><span></span><span>Reps</span><span>Poids</span><span></span></div>
         ${ex.sets.map((s, j) => renderSetRow(s, i, j)).join('')}
         <button class="btn btn--ghost btn--sm wo-add-set" onclick="addSet(${i})">+ Série</button>
       </div>`;
  return `<div class="wo-ex-card">
    <div class="wo-ex-card__head">
      <span class="wo-ex-card__name">${esc(ex.exercise_name)}${ex.is_cardio ? ' <span class="ex-cardio-badge">🏃 cardio</span>' : ''}</span>
      <button class="preset-item__del" onclick="removeDraftExercise(${i})">✕</button>
    </div>
    ${body}
  </div>`;
}

function renderSetRow(s, i, j) {
  const td = setTypeDef(s.set_type);
  return `<div class="wo-set-row">
    <button type="button" class="set-type-pill" title="${td.title}" style="background:${td.color}22;color:${td.color};border-color:${td.color}66;" onclick="cycleSetType(${i},${j})">${td.label}</button>
    <input type="number" class="np-input wo-set-input" inputmode="numeric" placeholder="—" value="${s.reps ?? ''}" oninput="updateSet(${i},${j},'reps',this.value)" />
    <input type="number" class="np-input wo-set-input" inputmode="decimal" step="0.5" placeholder="kg" value="${s.weight_kg ?? ''}" oninput="updateSet(${i},${j},'weight_kg',this.value)" />
    <button class="wo-set-del" onclick="removeSet(${i},${j})">✕</button>
  </div>`;
}

function renderExercisePicker() {
  const q = seExSearch.toLowerCase();
  const matches = exercises.filter(e => e.name.toLowerCase().includes(q)).slice(0, 8);
  const list = q
    ? (matches.length
        ? matches.map(e => `<div class="wo-ex-pick" onclick="addDraftExercise('${e.id}')">${esc(e.name)}${e.is_cardio ? ' 🏃' : ''}</div>`).join('')
        : '<p class="preset-list-empty">Aucun exercice. Crée-le dans l\'onglet Exercices.</p>')
    : '';
  return `<div class="section-card wo-picker">
    <input type="text" class="np-input" placeholder="+ Ajouter un exercice…" value="${esc(seExSearch)}"
      oninput="seExSearch=this.value;renderExercisePickerResults()" style="width:100%;" />
    <div id="wo-ex-results">${list}</div>
  </div>`;
}
// Re-render only the picker results (so typing in the search doesn't rebuild the whole editor).
function renderExercisePickerResults() {
  const el = document.getElementById('wo-ex-results');
  if (!el) return;
  const q = seExSearch.toLowerCase();
  const matches = exercises.filter(e => e.name.toLowerCase().includes(q)).slice(0, 8);
  el.innerHTML = q
    ? (matches.length
        ? matches.map(e => `<div class="wo-ex-pick" onclick="addDraftExercise('${e.id}')">${esc(e.name)}${e.is_cardio ? ' 🏃' : ''}</div>`).join('')
        : '<p class="preset-list-empty">Aucun exercice.</p>')
    : '';
}

async function saveSession() {
  const d = sessionDraft;
  if (!d) return;
  if (!d.name.trim()) { showToast('Nom de séance requis', 'error'); return; }

  const isNewSession = !d.id;
  const row = {
    name: d.name.trim(),
    session_date: d.isTemplate ? null : (d.session_date || muscuToday()),
    duration_min: d.isTemplate ? null : d.duration_min,
    notes: d.isTemplate ? null : (d.notes && d.notes.trim() ? d.notes.trim() : null),
    is_template: !!d.isTemplate,
  };
  let sessionId = d.id;
  if (sessionId) {
    await db.from('workout_sessions').update(row).eq('id', sessionId);
    await db.from('session_exercises').delete().eq('session_id', sessionId); // cascade removes old sets
  } else {
    const { data: created, error } = await db.from('workout_sessions').insert(row).select().single();
    if (error) { showToast(`Erreur : ${error.message}`, 'error'); return; }
    sessionId = created.id;
  }

  for (let i = 0; i < d.exercises.length; i++) {
    const ex = d.exercises[i];
    const { data: se, error } = await db.from('session_exercises').insert({
      session_id: sessionId, exercise_id: ex.exercise_id, exercise_name: ex.exercise_name,
      order_index: i, is_cardio: ex.is_cardio, cardio_duration_min: ex.is_cardio ? ex.cardio_duration_min : null,
    }).select().single();
    if (error) { showToast(`Erreur : ${error.message}`, 'error'); return; }
    if (!ex.is_cardio && ex.sets.length) {
      await db.from('exercise_sets').insert(ex.sets.map((s, j) => ({
        session_exercise_id: se.id, set_index: j, set_type: s.set_type || 'travail', reps: s.reps, weight_kg: s.weight_kg,
      })));
    }
  }
  showToast(d.isTemplate ? 'Modèle enregistré ✓' : 'Séance enregistrée ✓', 'success');

  // Records perso : signale un nouvel exercice où tu bats ton meilleur 1RM estimé.
  if (!d.isTemplate && isNewSession) {
    for (const ex of d.exercises) {
      if (ex.is_cardio || !ex.sets.length) continue;
      let sessBest = 0;
      ex.sets.forEach(s => { const o = epley1RM(s.weight_kg, s.reps); if (o > sessBest) sessBest = o; });
      if (sessBest <= 0) continue;
      const prev = await historicalBest1RM(ex.exercise_id, sessionId);
      if (prev > 0 && sessBest > prev + 0.01) {
        showToast(`🏆 Record ! ${ex.exercise_name} : ${Math.round(sessBest)} kg (1RM estimé)`, 'success');
      }
    }
  }
  closeEditor();
}

// Best estimated 1RM for an exercise across all OTHER sessions (for PR detection).
async function historicalBest1RM(exerciseId, excludeSessionId) {
  if (!exerciseId) return 0;
  const { data: sx } = await db.from('session_exercises').select('*').eq('exercise_id', exerciseId);
  const rows = (sx || []).filter(e => e.session_id !== excludeSessionId && !e.is_cardio);
  const ids = rows.map(r => r.id);
  if (!ids.length) return 0;
  const { data: sets } = await db.from('exercise_sets').select('*').in('session_exercise_id', ids);
  let best = 0;
  (sets || []).forEach(st => { const o = epley1RM(st.weight_kg, st.reps); if (o > best) best = o; });
  return best;
}

// ══ Stats (tableau de bord) ════════════════════════════════
let statsPeriod     = 30;      // days; 0 = tout
let statsMetric     = '1rm';   // '1rm' | 'volume'
let statsExerciseId = null;    // selected exercise for the progression chart
let statsData       = null;    // { sessions, byExercise } cache

const PERIODS = [{ d: 7, l: '7 j' }, { d: 30, l: '30 j' }, { d: 90, l: '90 j' }, { d: 0, l: 'Tout' }];

// 1RM estimé (formule d'Epley) — permet de comparer des séries de reps/poids différents.
function epley1RM(weight, reps) {
  const w = Number(weight), r = Number(reps);
  if (!w || !r) return 0;
  return w * (1 + r / 30);
}

function periodCutoff() {
  if (!statsPeriod) return null;
  const d = new Date();
  d.setDate(d.getDate() - statsPeriod);
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// Load every non-template session with its exercises + sets. The recap and the
// progression chart are filtered to the selected period; personal records are
// computed all-time.
async function loadStatsData() {
  const { data: allSess } = await db.from('workout_sessions').select('*').eq('is_template', false);
  const sessionsAll = (allSess || []).filter(s => s.session_date).sort((a, b) => (a.session_date < b.session_date ? -1 : 1));
  const sIds = sessionsAll.map(s => s.id);
  const { data: sx } = sIds.length
    ? await db.from('session_exercises').select('*').in('session_id', sIds)
    : { data: [] };
  const sxIds = (sx || []).map(e => e.id);
  const { data: sets } = sxIds.length
    ? await db.from('exercise_sets').select('*').in('session_exercise_id', sxIds)
    : { data: [] };
  const setsByEx = {};
  (sets || []).forEach(st => { (setsByEx[st.session_exercise_id] = setsByEx[st.session_exercise_id] || []).push(st); });
  const dateById = {};
  sessionsAll.forEach(s => { dateById[s.id] = s.session_date; });

  const cutoff = periodCutoff();
  const inPeriod = date => !cutoff || (date && date >= cutoff);
  const sessions = sessionsAll.filter(s => inPeriod(s.session_date));

  // Per-exercise time series (period) + all-time personal records (best 1RM).
  const byExercise = {};
  const records = {};
  (sx || []).forEach(e => {
    if (e.is_cardio) return;
    const rows = setsByEx[e.id] || [];
    if (!rows.length) return;
    const date = dateById[e.session_id];
    const key = e.exercise_id || ('name:' + e.exercise_name);
    let best = 0, vol = 0, bestSet = null;
    rows.forEach(st => {
      const orm = epley1RM(st.weight_kg, st.reps);
      if (orm > best) { best = orm; bestSet = st; }
      vol += (Number(st.weight_kg) || 0) * (Number(st.reps) || 0);
    });
    // Record (all-time): keep the best 1RM ever and the set that produced it.
    if (best > 0) {
      const cur = records[key];
      if (!cur || best > cur.orm) records[key] = { name: e.exercise_name, orm: best, reps: bestSet.reps, weight: bestSet.weight_kg, date };
    }
    // Time series: period only, one point per session date.
    if (!inPeriod(date)) return;
    const bucket = (byExercise[key] = byExercise[key] || { name: e.exercise_name, points: [] });
    const existing = bucket.points.find(p => p.date === date);
    if (existing) { existing.best = Math.max(existing.best, best); existing.vol += vol; }
    else bucket.points.push({ date, best, vol });
  });
  Object.values(byExercise).forEach(b => b.points.sort((a, b2) => (a.date < b2.date ? -1 : 1)));

  // Sets per muscle group (period): attribute each exercise's set count to every targeted muscle.
  const byMuscle = {};
  muscleGroups.forEach(m => { byMuscle[m.id] = 0; });
  (sx || []).forEach(e => {
    if (e.is_cardio) return;
    if (!inPeriod(dateById[e.session_id])) return;
    const nSets = (setsByEx[e.id] || []).length;
    if (!nSets) return;
    const muscles = exerciseMuscles[e.exercise_id] || [];
    muscles.forEach(mid => { if (byMuscle[mid] != null) byMuscle[mid] += nSets; });
  });

  statsData = { sessions, byExercise, byMuscle, records };
  return statsData;
}

const fmtWeight = w => { const n = Number(w) || 0; return Number.isInteger(n) ? String(n) : n.toFixed(1); };

function setStatsPeriod(d) { statsPeriod = d; renderStats(); }
function setStatsMetric(m) { statsMetric = m; renderStatsChart(); }
function setStatsExercise(id) { statsExerciseId = id; renderStatsChart(); }

async function renderStats() {
  const panel = document.getElementById('panel-stats');
  if (!panel) return;
  panel.innerHTML = '<div class="section-card"><p class="stats-empty">Chargement…</p></div>';
  await loadStatsData();
  const d = statsData;
  const hasData = d.sessions.length > 0;

  const periodSeg = `<div class="stats-seg">${PERIODS.map(p =>
    `<button class="${p.d === statsPeriod ? 'on' : ''}" onclick="setStatsPeriod(${p.d})">${p.l}</button>`).join('')}</div>`;

  if (!hasData) {
    panel.innerHTML = `<div style="display:flex;justify-content:flex-end;margin-bottom:12px;">${periodSeg}</div>
      <div class="section-card"><p class="stats-empty">Aucune séance sur cette période.<br>Enregistre des séances pour voir tes stats.</p></div>`;
    return;
  }

  // Muscle recap (sorted desc, non-zero first).
  const muscleRows = muscleGroups
    .map(m => ({ name: m.name, n: d.byMuscle[m.id] || 0 }))
    .sort((a, b) => b.n - a.n);
  const maxN = Math.max(1, ...muscleRows.map(r => r.n));
  const anySets = muscleRows.some(r => r.n > 0);
  const recap = anySets
    ? `<div class="mg-recap">${muscleRows.filter(r => r.n > 0).map(r => `
        <div class="mg-recap__row">
          <span class="mg-recap__name">${esc(r.name)}</span>
          <div class="mg-recap__bar"><div class="mg-recap__fill" style="width:${Math.round(r.n / maxN * 100)}%;"></div></div>
          <span class="mg-recap__val">${r.n}</span>
        </div>`).join('')}</div>`
    : '<p class="stats-empty">Associe des muscles à tes exercices pour voir le récap.</p>';

  // Personal records (all-time).
  const recs = Object.values(d.records).sort((a, b) => b.orm - a.orm);
  const recordsHtml = recs.length
    ? `<div class="pr-list">${recs.map(r => `
        <div class="pr-row">
          <span class="pr-row__name">${esc(r.name)}</span>
          <span class="pr-row__meta">${fmtWeight(r.weight)} kg × ${r.reps} rep${r.reps > 1 ? 's' : ''}${r.date ? ` · ${fmtDateFR(r.date)}` : ''}</span>
          <span class="pr-row__orm">${Math.round(r.orm)}<small>kg</small></span>
        </div>`).join('')}</div>`
    : '<p class="stats-empty">Renseigne des séries chiffrées pour établir tes records.</p>';

  panel.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
      <span style="font-size:12px;color:var(--text-dim);">${d.sessions.length} séance${d.sessions.length > 1 ? 's' : ''}</span>
      ${periodSeg}
    </div>
    <div class="section-card" style="margin-bottom:16px;">
      <div class="section-card__header"><span class="section-card__title">Séries par groupe musculaire</span></div>
      ${recap}
    </div>
    <div class="section-card" style="margin-bottom:16px;">
      <div class="section-card__header"><span class="section-card__title">🏆 Records personnels</span><span style="font-size:11px;color:var(--text-dim);">1RM estimé · tous temps</span></div>
      ${recordsHtml}
    </div>
    <div class="section-card">
      <div class="section-card__header"><span class="section-card__title">Progression par exercice</span></div>
      <div id="stats-progression"></div>
    </div>`;
  renderStatsChart();
}

function renderStatsChart() {
  const host = document.getElementById('stats-progression');
  if (!host || !statsData) return;
  const exList = Object.entries(statsData.byExercise)
    .map(([id, b]) => ({ id, name: b.name, pts: b.points.length }))
    .filter(e => e.pts > 0)
    .sort((a, b) => a.name.localeCompare(b.name));
  if (!exList.length) { host.innerHTML = '<p class="stats-empty">Aucune série chiffrée sur cette période.</p>'; return; }
  if (!statsExerciseId || !exList.find(e => e.id === statsExerciseId)) statsExerciseId = exList[0].id;

  const bucket = statsData.byExercise[statsExerciseId];
  const pts = bucket.points;
  const series = pts.map(p => ({ date: p.date, y: statsMetric === '1rm' ? p.best : p.vol }));
  const last = series[series.length - 1]?.y || 0;
  const first = series[0]?.y || 0;
  const peak = Math.max(...series.map(s => s.y));
  const delta = first ? ((last - first) / first * 100) : 0;
  const unit = statsMetric === '1rm' ? 'kg' : 'kg·rep';
  const fmt = v => statsMetric === '1rm' ? Math.round(v) : Math.round(v);

  host.innerHTML = `
    <select class="np-input stats-select" onchange="setStatsExercise(this.value)">
      ${exList.map(e => `<option value="${e.id}"${e.id === statsExerciseId ? ' selected' : ''}>${esc(e.name)}</option>`).join('')}
    </select>
    <div class="stats-seg" style="margin-bottom:10px;">
      <button class="${statsMetric === '1rm' ? 'on' : ''}" onclick="setStatsMetric('1rm')">1RM estimé</button>
      <button class="${statsMetric === 'volume' ? 'on' : ''}" onclick="setStatsMetric('volume')">Volume</button>
    </div>
    <div class="stats-chart-wrap">${lineChartSVG(series, series.findIndex(s => s.y === peak))}</div>
    <div class="stats-kpis">
      <div class="stats-kpi"><div class="stats-kpi__v">${fmt(last)}</div><div class="stats-kpi__l">Actuel (${unit})</div></div>
      <div class="stats-kpi"><div class="stats-kpi__v">${fmt(peak)}</div><div class="stats-kpi__l">Record</div></div>
      <div class="stats-kpi"><div class="stats-kpi__v">${delta >= 0 ? '+' : ''}${Math.round(delta)}%</div><div class="stats-kpi__l">Évolution</div></div>
    </div>
    ${statsMetric === '1rm' ? '<p style="font-size:11px;color:var(--text-dim);margin-top:10px;">1RM estimé (Epley) = poids × (1 + reps/30) — compare des séries même avec des reps différentes.</p>' : ''}`;
}

// Minimal self-contained SVG line chart (no external lib). peakIdx gets a gold marker.
function lineChartSVG(series, peakIdx = -1) {
  const W = 320, H = 170, PL = 34, PR = 10, PT = 12, PB = 26;
  const iw = W - PL - PR, ih = H - PT - PB;
  const ys = series.map(s => s.y);
  let yMax = Math.max(...ys), yMin = Math.min(...ys, 0);
  if (yMax === yMin) yMax = yMin + 1;
  const n = series.length;
  const x = i => PL + (n === 1 ? iw / 2 : (i / (n - 1)) * iw);
  const y = v => PT + ih - ((v - yMin) / (yMax - yMin)) * ih;
  const pts = series.map((s, i) => ({ px: x(i), py: y(s.y), s }));
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${p.px.toFixed(1)},${p.py.toFixed(1)}`).join(' ');
  const area = `${line} L${pts[pts.length - 1].px.toFixed(1)},${(PT + ih).toFixed(1)} L${pts[0].px.toFixed(1)},${(PT + ih).toFixed(1)} Z`;
  const grid = [0, 0.5, 1].map(f => {
    const gv = yMin + (yMax - yMin) * (1 - f);
    const gy = PT + ih * f;
    return `<line x1="${PL}" y1="${gy}" x2="${W - PR}" y2="${gy}" stroke="rgba(255,255,255,.07)" />
            <text x="${PL - 5}" y="${gy + 3}" text-anchor="end" font-size="9" fill="#8a90a2">${Math.round(gv)}</text>`;
  }).join('');
  const shortDate = s => { const dd = new Date(s + 'T12:00:00'); return dd.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }); };
  // Show at most ~4 x labels to avoid crowding.
  const step = Math.ceil(n / 4);
  const xlabels = pts.map((p, i) => (i % step === 0 || i === n - 1)
    ? `<text x="${p.px.toFixed(1)}" y="${H - 8}" text-anchor="middle" font-size="9" fill="#8a90a2">${shortDate(p.s.date)}</text>` : '').join('');
  const dots = pts.map((p, i) => i === peakIdx
    ? `<circle cx="${p.px.toFixed(1)}" cy="${p.py.toFixed(1)}" r="5" fill="#fbbf24" stroke="#07070e" stroke-width="1.5" />`
    : `<circle cx="${p.px.toFixed(1)}" cy="${p.py.toFixed(1)}" r="3" fill="#c084fc" />`).join('');
  return `<svg class="stats-chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Graphe de progression">
    <defs><linearGradient id="statsGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="rgba(168,85,247,.28)" /><stop offset="1" stop-color="rgba(168,85,247,0)" />
    </linearGradient></defs>
    ${grid}
    <path d="${area}" fill="url(#statsGrad)" />
    <path d="${line}" fill="none" stroke="#a855f7" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" />
    ${dots}${xlabels}
  </svg>`;
}

// ── Toast (stacked, shared style) ──────────────────────────
function showToast(msg, type = 'success') {
  let cont = document.getElementById('toast-container');
  if (!cont) { cont = document.createElement('div'); cont.id = 'toast-container'; cont.className = 'toast-container'; document.body.appendChild(cont); }
  const t = document.createElement('div'); t.className = `toast toast--${type}`; t.textContent = msg;
  cont.appendChild(t); requestAnimationFrame(() => t.classList.add('show'));
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 400); }, 3600);
}
