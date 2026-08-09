// Muscu Phase 5: notes de séance + records perso (PR sur 1RM estimé).
const { makeAsserter } = require('./_assert');

async function run(page) {
  const t = makeAsserter();
  const out = await page.evaluate(async () => {
    const S = window.__STORE;
    [S.muscle_groups, S.exercises, S.exercise_muscles, S.workout_sessions, S.session_exercises, S.exercise_sets]
      .forEach(a => { a.length = 0; });
    S.muscle_groups.push({ id: 'm1', name: 'Pecs', order_index: 1 });
    S.exercises.push({ id: 'e1', name: 'Bench', is_cardio: false });
    S.exercise_muscles.push({ exercise_id: 'e1', muscle_id: 'm1' });
    await window.loadMuscleGroups();
    await window.loadExercises();
    await window.loadSessions();

    // Capture toasts (bare showToast resolves to the reassignable global property).
    let toasts = [];
    window.showToast = (m) => { toasts.push(m); };
    const prCount = () => toasts.filter(m => /Record/.test(m)).length;

    const res = {};

    // Session 1: Bench 60×8 → 1RM 76. No history yet → no PR.
    toasts = [];
    window.newSession();
    window.draftSetField('name', 'S1');
    window.draftSetField('notes', 'Bien dormi, en forme');
    window.addDraftExercise('e1');
    window.updateSet(0, 0, 'reps', '8');
    window.updateSet(0, 0, 'weight_kg', '60');
    await window.saveSession();
    res.s1PRs = prCount();                                  // 0
    res.s1Notes = S.workout_sessions.find(x => x.name === 'S1')?.notes; // 'Bien dormi, en forme'

    // Session 2: Bench 70×6 → 1RM 84 > 76 → PR.
    toasts = [];
    window.newSession();
    window.draftSetField('name', 'S2');
    window.addDraftExercise('e1');
    window.updateSet(0, 0, 'reps', '6');
    window.updateSet(0, 0, 'weight_kg', '70');
    await window.saveSession();
    res.s2PRs = prCount();                                  // 1
    res.s2Msg = toasts.find(m => /Record/.test(m)) || '';   // mentions Bench + 84

    // Session 3: Bench 65×6 → 1RM 78 < 84 → no PR.
    toasts = [];
    window.newSession();
    window.draftSetField('name', 'S3');
    window.addDraftExercise('e1');
    window.updateSet(0, 0, 'reps', '6');
    window.updateSet(0, 0, 'weight_kg', '65');
    await window.saveSession();
    res.s3PRs = prCount();                                  // 0

    // Editing an existing session must not re-fire a PR.
    toasts = [];
    await window.loadSessions();
    const s2 = S.workout_sessions.find(x => x.name === 'S2');
    await window.editSession(s2.id);
    res.editorNotes = document.querySelector('#session-editor-view textarea')?.value ?? null; // '' (S2 had none)
    await window.saveSession();
    res.editPRs = prCount();                                // 0

    // Records section in Stats: Bench best 1RM = 84 (all-time).
    await window.renderStats();
    const prRow = document.querySelector('#panel-stats .pr-row');
    res.recordName = prRow?.querySelector('.pr-row__name')?.textContent;      // Bench
    res.recordOrm = prRow?.querySelector('.pr-row__orm')?.textContent;        // 84kg

    // Note snippet shows on the session card.
    await window.loadSessions();
    res.noteOnCard = !!document.querySelector('.wo-session-card__note');
    return res;
  });

  t.eq('first-ever entry is not flagged as a PR', out.s1PRs, 0);
  t.eq('session notes persisted', out.s1Notes, 'Bien dormi, en forme');
  t.eq('beating the best 1RM fires exactly one PR', out.s2PRs, 1);
  t.ok('PR toast names the exercise', /Bench/.test(out.s2Msg));
  t.ok('PR toast shows the 1RM (84)', /84/.test(out.s2Msg));
  t.eq('a sub-record session fires no PR', out.s3PRs, 0);
  t.eq('editing an existing session fires no PR', out.editPRs, 0);
  t.eq('editor loads the stored notes', out.editorNotes, '');
  t.eq('records list shows the exercise', out.recordName, 'Bench');
  t.ok('records list shows best 1RM (84)', /84/.test(out.recordOrm || ''));
  t.ok('note snippet shown on the session card', out.noteOnCard);
  return t.results;
}

module.exports = { fixture: 'tests/fixtures/muscu.html', run };
