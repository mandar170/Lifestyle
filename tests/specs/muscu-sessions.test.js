// Muscu Phase 2: build a session (exercises + sets, cardio), save, reload.
const { makeAsserter } = require('./_assert');

async function run(page) {
  const t = makeAsserter();
  const out = await page.evaluate(async () => {
    const S = window.__STORE;
    S.muscle_groups.length = 0;
    S.exercises.length = 0;
    S.exercise_muscles.length = 0;
    S.workout_sessions.length = 0;
    S.session_exercises.length = 0;
    S.exercise_sets.length = 0;
    S.exercises.push(
      { id: 'e1', name: 'Développé couché', is_cardio: false },
      { id: 'e2', name: 'Tapis', is_cardio: true });
    await window.loadExercises();
    await window.loadSessions();

    const res = {};

    // New session with a strength exercise (2 sets) + a cardio exercise.
    window.newSession();
    window.draftSetField('name', 'Push A');
    window.addDraftExercise('e1');
    window.addSet(0); // now 2 sets on e1 (1 default + 1 added)
    window.updateSet(0, 0, 'reps', '8');
    window.updateSet(0, 0, 'weight_kg', '60');
    window.cycleSetType(0, 0); // travail -> recup
    window.cycleSetType(0, 0); // recup -> echauffement
    window.updateSet(0, 1, 'reps', '10');
    window.updateSet(0, 1, 'weight_kg', '55');
    window.addDraftExercise('e2'); // cardio
    window.updateCardioDuration(1, '20');
    await window.saveSession();

    res.sessionCount = S.workout_sessions.length;          // 1
    const sess = S.workout_sessions[0];
    res.sessionName = sess && sess.name;                   // Push A
    const sx = S.session_exercises.filter(x => x.session_id === sess.id);
    res.exerciseCount = sx.length;                          // 2
    const strength = sx.find(x => x.exercise_id === 'e1');
    const cardio = sx.find(x => x.exercise_id === 'e2');
    res.cardioDuration = cardio && cardio.cardio_duration_min; // 20
    const sets = S.exercise_sets.filter(x => x.session_exercise_id === (strength && strength.id));
    res.setCount = sets.length;                             // 2
    res.firstSetType = sets.find(s => s.set_index === 0)?.set_type; // echauffement
    res.firstSetReps = sets.find(s => s.set_index === 0)?.reps;     // 8
    res.cardioHasNoSets = S.exercise_sets.filter(x => x.session_exercise_id === (cardio && cardio.id)).length; // 0

    // Editing it: reload draft, remove one set, save.
    await window.loadSessions();
    await window.editSession(sess.id);
    window.removeSet(0, 1); // strength now has 1 set
    await window.saveSession();
    const sx2 = S.session_exercises.filter(x => x.session_id === sess.id);
    const strength2 = sx2.find(x => x.exercise_id === 'e1');
    res.afterEditSets = S.exercise_sets.filter(x => x.session_exercise_id === (strength2 && strength2.id)).length; // 1
    res.stillOneSession = S.workout_sessions.length;       // 1 (updated, not duplicated)
    return res;
  });

  t.eq('session created', out.sessionCount, 1);
  t.eq('session name saved', out.sessionName, 'Push A');
  t.eq('two exercises in the session', out.exerciseCount, 2);
  t.eq('cardio duration saved', out.cardioDuration, 20);
  t.eq('strength exercise has 2 sets', out.setCount, 2);
  t.eq('set type cycles (travail→recup→échauffement)', out.firstSetType, 'echauffement');
  t.eq('set reps saved', out.firstSetReps, 8);
  t.eq('cardio exercise has no sets', out.cardioHasNoSets, 0);
  t.eq('editing removes a set (now 1)', out.afterEditSets, 1);
  t.eq('editing updates in place (still 1 session)', out.stillOneSession, 1);
  return t.results;
}

module.exports = { fixture: 'tests/fixtures/muscu.html', run };
