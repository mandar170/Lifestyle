// Muscu Phase 3: séances type (templates) — create, import into a session,
// save a session as a template, delete.
const { makeAsserter } = require('./_assert');

async function run(page) {
  const t = makeAsserter();
  const out = await page.evaluate(async () => {
    window.confirm = () => true;
    const S = window.__STORE;
    S.muscle_groups.length = 0;
    S.exercises.length = 0;
    S.exercise_muscles.length = 0;
    S.workout_sessions.length = 0;
    S.session_exercises.length = 0;
    S.exercise_sets.length = 0;
    S.exercises.push(
      { id: 'e1', name: 'Développé couché', is_cardio: false },
      { id: 'e2', name: 'Rowing', is_cardio: false });
    await window.loadExercises();
    await window.loadSessions();
    await window.loadTemplates();

    const res = {};

    // 1) Create a template (structure only, no reps/weight).
    window.newTemplate();
    window.draftSetField('name', 'Push type');
    window.addDraftExercise('e1');
    window.addSet(0);              // 2 sets on e1
    window.cycleSetType(0, 0);     // travail -> recup on first set
    window.addDraftExercise('e2');
    await window.saveSession();

    res.templateCount = S.workout_sessions.filter(x => x.is_template).length; // 1
    const tpl = S.workout_sessions.find(x => x.is_template);
    res.templateName = tpl && tpl.name;                 // Push type
    res.templateDateNull = tpl && tpl.session_date === null; // true
    res.notInSessions = S.workout_sessions.filter(x => !x.is_template).length; // 0
    const tplEx = S.session_exercises.filter(x => x.session_id === tpl.id);
    res.templateExercises = tplEx.length;               // 2
    const tplE1 = tplEx.find(x => x.exercise_id === 'e1');
    const tplE1Sets = S.exercise_sets.filter(x => x.session_exercise_id === tplE1.id);
    res.templateSets = tplE1Sets.length;                // 2 (e1 got a 2nd set)
    res.templateFirstSetType = tplE1Sets.find(s => s.set_index === 0)?.set_type; // recup

    // 2) Import the template into a fresh session, fill reps/weight, save.
    await window.loadTemplates();
    window.newSession();
    await window.importTemplateInto(tpl.id);
    // Fill the first set of the first exercise.
    window.updateSet(0, 0, 'reps', '8');
    window.updateSet(0, 0, 'weight_kg', '60');
    window.draftSetField('name', 'Push A');
    await window.saveSession();

    const sess = S.workout_sessions.find(x => !x.is_template);
    res.sessionCreated = !!sess;                        // true
    res.sessionName = sess && sess.name;                // Push A
    const sessEx = S.session_exercises.filter(x => x.session_id === sess.id);
    res.sessionExercises = sessEx.length;               // 2 (proves import filled the draft)
    const e1se = sessEx.find(x => x.exercise_id === 'e1');
    const e1sets = S.exercise_sets.filter(x => x.session_exercise_id === e1se.id);
    res.filledReps = e1sets.find(s => s.set_index === 0)?.reps; // 8
    res.stillOneTemplate = S.workout_sessions.filter(x => x.is_template).length; // 1

    // 3) Save that session as a NEW template (structure kept, reps blanked).
    await window.loadSessions();
    await window.editSession(sess.id);
    await window.saveAsTemplate();
    res.templatesAfterSaveAs = S.workout_sessions.filter(x => x.is_template).length; // 2
    const newTpl = S.workout_sessions.filter(x => x.is_template).find(x => x.id !== tpl.id);
    const newTplEx = S.session_exercises.filter(x => x.session_id === newTpl.id);
    const newTplSets = S.exercise_sets.filter(x => newTplEx.some(e => e.id === x.session_exercise_id));
    res.savedAsHasBlankReps = newTplSets.every(s => s.reps === null); // true

    // 4) Delete the first template.
    await window.loadTemplates();
    await window.deleteTemplate(tpl.id);
    res.templatesAfterDelete = S.workout_sessions.filter(x => x.is_template).length; // 1

    return res;
  });

  t.eq('template created', out.templateCount, 1);
  t.eq('template name saved', out.templateName, 'Push type');
  t.ok('template has no date', out.templateDateNull);
  t.eq('template does not appear as a session', out.notInSessions, 0);
  t.eq('template keeps 2 exercises', out.templateExercises, 2);
  t.eq('template keeps its added set', out.templateSets, 2);
  t.eq('template keeps set type', out.templateFirstSetType, 'recup');
  t.ok('imported session created', out.sessionCreated);
  t.eq('imported session name', out.sessionName, 'Push A');
  t.eq('import fills exercises into the session', out.sessionExercises, 2);
  t.eq('reps filled after import', out.filledReps, 8);
  t.eq('import did not duplicate the template', out.stillOneTemplate, 1);
  t.eq('save-as-template adds a template', out.templatesAfterSaveAs, 2);
  t.ok('save-as-template blanks reps', out.savedAsHasBlankReps);
  t.eq('delete removes the template', out.templatesAfterDelete, 1);
  return t.results;
}

module.exports = { fixture: 'tests/fixtures/muscu.html', run };
