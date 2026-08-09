// Muscu Phase 4: tableau de bord — récap séries/muscle + progression (1RM Epley, volume).
const { makeAsserter } = require('./_assert');

async function run(page) {
  const t = makeAsserter();
  const out = await page.evaluate(async () => {
    const S = window.__STORE;
    [S.muscle_groups, S.exercises, S.exercise_muscles, S.workout_sessions, S.session_exercises, S.exercise_sets]
      .forEach(a => { a.length = 0; });

    const p = n => String(n).padStart(2, '0');
    const dstr = off => { const d = new Date(); d.setDate(d.getDate() - off); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; };

    S.muscle_groups.push({ id: 'm1', name: 'Pecs', order_index: 1 }, { id: 'm2', name: 'Dos', order_index: 2 });
    S.exercises.push({ id: 'e1', name: 'Bench', is_cardio: false }, { id: 'e2', name: 'Rowing', is_cardio: false });
    S.exercise_muscles.push({ exercise_id: 'e1', muscle_id: 'm1' }, { exercise_id: 'e2', muscle_id: 'm2' });

    // 3 sessions over the last week, progressive load on Bench.
    S.workout_sessions.push(
      { id: 's1', name: 'A', is_template: false, session_date: dstr(7), duration_min: 60 },
      { id: 's2', name: 'B', is_template: false, session_date: dstr(3), duration_min: 60 },
      { id: 's3', name: 'C', is_template: false, session_date: dstr(0), duration_min: 60 });
    S.session_exercises.push(
      { id: 'x1', session_id: 's1', exercise_id: 'e1', exercise_name: 'Bench', is_cardio: false, order_index: 0 },
      { id: 'x2', session_id: 's2', exercise_id: 'e1', exercise_name: 'Bench', is_cardio: false, order_index: 0 },
      { id: 'x3', session_id: 's3', exercise_id: 'e1', exercise_name: 'Bench', is_cardio: false, order_index: 0 },
      { id: 'x4', session_id: 's3', exercise_id: 'e2', exercise_name: 'Rowing', is_cardio: false, order_index: 1 });
    S.exercise_sets.push(
      { id: 'st1', session_exercise_id: 'x1', set_index: 0, set_type: 'travail', reps: 10, weight_kg: 50 },
      { id: 'st2', session_exercise_id: 'x2', set_index: 0, set_type: 'travail', reps: 8, weight_kg: 60 },
      { id: 'st3', session_exercise_id: 'x2', set_index: 1, set_type: 'travail', reps: 8, weight_kg: 60 },
      { id: 'st4', session_exercise_id: 'x3', set_index: 0, set_type: 'travail', reps: 6, weight_kg: 70 },
      { id: 'st5', session_exercise_id: 'x4', set_index: 0, set_type: 'travail', reps: 12, weight_kg: 20 });

    await window.loadMuscleGroups();
    await window.loadExercises();
    await window.renderStats();

    const res = {};
    res.epley = Math.round(window.epley1RM(70, 6) * 100) / 100; // 84
    // Muscle recap rows (name -> set count).
    res.recap = [...document.querySelectorAll('#panel-stats .mg-recap__row')]
      .map(r => [r.querySelector('.mg-recap__name').textContent, r.querySelector('.mg-recap__val').textContent]);
    // Progression chart.
    const sel = document.querySelector('#stats-progression select');
    res.defaultExercise = sel && sel.value;                 // e1 (Bench, alphabetical)
    res.exerciseOptions = sel ? sel.options.length : 0;      // 2
    res.hasChart = !!document.querySelector('#stats-progression svg.stats-chart');
    res.chartPoints = document.querySelectorAll('#stats-progression svg circle').length; // 3 (Bench)
    res.currentKPI = document.querySelector('#panel-stats .stats-kpi__v')?.textContent;   // 84 (1RM actuel)

    // Switch to volume metric.
    window.setStatsMetric('volume');
    res.volKPI = document.querySelector('#panel-stats .stats-kpi__v')?.textContent; // last vol = 70*6 = 420

    // Switch selected exercise to Rowing (only 1 session).
    window.setStatsExercise('e2');
    res.rowingPoints = document.querySelectorAll('#stats-progression svg circle').length; // 1
    return res;
  });

  t.eq('Epley 1RM formula (70kg × 6)', out.epley, 84);
  t.eq('muscle recap counts sets per muscle', out.recap, [['Pecs', '4'], ['Dos', '1']]);
  t.eq('default exercise is alphabetical first', out.defaultExercise, 'e1');
  t.eq('exercise picker lists exercises with data', out.exerciseOptions, 2);
  t.ok('progression chart rendered', out.hasChart);
  t.eq('chart plots one point per session', out.chartPoints, 3);
  t.eq('current 1RM KPI (last session best)', out.currentKPI, '84');
  t.eq('volume metric switches KPI', out.volKPI, '420');
  t.eq('changing exercise re-plots its points', out.rowingPoints, 1);
  return t.results;
}

module.exports = { fixture: 'tests/fixtures/muscu.html', run };
