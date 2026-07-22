// Verifies the meals/meal_plans merge: a single `meals` table with a `status`
// column ('planned' | 'logged'), where a slot can hold both at once.
const { makeAsserter } = require('./_assert');

async function run(page) {
  const t = makeAsserter();
  const out = await page.evaluate(async () => {
    const S = window.__STORE;
    const pad = n => String(n).padStart(2, '0');
    const d = new Date();
    const today = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const res = {};

    // 1) Load-split: a logged + a planned row route to the right cache/state.
    S.meals.length = 0;
    S.meals.push({ id: 'm1', date: today, meal_type: 'lunch',  status: 'logged',  description: 'Poulet riz', calories: 500, protein_g: 40, carbs_g: 50, fat_g: 10, fiber_g: 3 });
    S.meals.push({ id: 'm2', date: today, meal_type: 'dinner', status: 'planned', description: 'Salade',     calories: 200, protein_g: 10, carbs_g: 15, fat_g: 8,  fiber_g: 5 });
    await window.loadWeekData();
    const lunch = window.mealDisplayData(today, 'lunch');
    const dinner = window.mealDisplayData(today, 'dinner');
    res.lunchState = lunch.state; res.lunchKcal = lunch.calories;
    res.dinnerState = dinner.state; res.dinnerKcal = dinner.calories;

    // 2) Quick-adding a planned meal realises it: the plan is replaced by a
    //    single logged row (a meal ends up in exactly one state).
    S.meals.length = 0;
    S.meals.push({ id: 'b1', date: today, meal_type: 'breakfast', status: 'planned', description: 'Oeufs', calories: 300, protein_g: 20, carbs_g: 2, fat_g: 22, fiber_g: 0 });
    await window.loadWeekData();
    await window.quickAddMeal(today, 'breakfast', null);
    const bf = S.meals.filter(m => m.date === today && m.meal_type === 'breakfast');
    res.breakfastRowCount = bf.length;
    res.breakfastStatuses = bf.map(m => m.status).sort().join(',');
    res.loggedBfKcal = (bf.find(m => m.status === 'logged') || {}).calories;
    await window.loadWeekData();
    res.afterQuickAddState = window.mealDisplayData(today, 'breakfast').state;

    // 3) The retired meal_plans table is never written to.
    res.mealPlansUntouched = !(S.meal_plans && S.meal_plans.length > 0);
    return res;
  });

  t.eq('logged row shows as saved', out.lunchState, 'saved');
  t.eq('logged calories preserved', out.lunchKcal, 500);
  t.eq('planned row shows as planned', out.dinnerState, 'planned');
  t.eq('planned calories preserved', out.dinnerKcal, 200);
  t.eq('quick-add realises the plan into one logged row', out.breakfastRowCount, 1);
  t.eq('only the logged status remains', out.breakfastStatuses, 'logged');
  t.eq('logged row copied plan calories', out.loggedBfKcal, 300);
  t.eq('logged wins display after quick-add', out.afterQuickAddState, 'saved');
  t.ok('meal_plans table not written', out.mealPlansUntouched);
  return t.results;
}

module.exports = { run };
