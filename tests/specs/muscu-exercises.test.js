// Muscu Phase 1: exercise library CRUD + muscle groups.
const { makeAsserter } = require('./_assert');

async function run(page) {
  const t = makeAsserter();
  const out = await page.evaluate(async () => {
    const S = window.__STORE;
    // Seed a couple of muscle groups, then reload the module state.
    S.muscle_groups.length = 0;
    S.muscle_groups.push(
      { id: 'm1', name: 'Pectoraux', order_index: 1 },
      { id: 'm2', name: 'Triceps', order_index: 2 });
    S.exercises.length = 0;
    S.exercise_muscles.length = 0;
    await window.loadMuscleGroups();
    await window.loadExercises();

    const res = {};

    // Create an exercise targeting two muscles.
    document.getElementById('ex-name').value = 'Développé couché';
    window.toggleNewExMuscle('m1');
    window.toggleNewExMuscle('m2');
    await window.saveExercise();
    res.exCount = S.exercises.length;
    const ex = S.exercises[0];
    res.exName = ex && ex.name;
    res.exMuscleLinks = S.exercise_muscles.filter(l => l.exercise_id === (ex && ex.id)).length;
    res.formCleared = document.getElementById('ex-name').value === '';

    // Create a cardio exercise (no muscles).
    document.getElementById('ex-name').value = 'Tapis';
    document.getElementById('ex-cardio').checked = true;
    await window.saveExercise();
    const cardio = S.exercises.find(e => e.name === 'Tapis');
    res.cardioFlag = cardio && cardio.is_cardio;

    // Add a muscle group.
    document.getElementById('mg-name').value = 'Abdos';
    await window.addMuscleGroup();
    res.muscleCount = S.muscle_groups.length;

    // Delete the first exercise (confirm() auto-true in headless via override).
    window.confirm = () => true;
    await window.deleteExercise(ex.id);
    res.afterDelete = S.exercises.length;
    res.linksCleaned = S.exercise_muscles.filter(l => l.exercise_id === ex.id).length;

    return res;
  });

  t.eq('exercise created', out.exCount, 1);
  t.eq('exercise name saved', out.exName, 'Développé couché');
  t.eq('two muscles linked', out.exMuscleLinks, 2);
  t.ok('form cleared after add', out.formCleared);
  t.ok('cardio flag saved', out.cardioFlag);
  t.eq('muscle group added (2 seeded + 1)', out.muscleCount, 3);
  t.eq('exercise deleted', out.afterDelete, 1);
  t.eq('its muscle links removed', out.linksCleaned, 0);
  return t.results;
}

module.exports = { fixture: 'tests/fixtures/muscu.html', run };
