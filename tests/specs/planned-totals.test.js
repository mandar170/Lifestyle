// Verifies the day summary totals include PLANNED meals (not just logged), so
// planning a day shows a projected total instead of staying at zero.
const { makeAsserter } = require('./_assert');

async function run(page) {
  const t = makeAsserter();
  const out = await page.evaluate(async () => {
    const S = window.__STORE;
    const pad = n => String(n).padStart(2, '0');
    const d = new Date();
    const today = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

    S.nutrition_goals.length = 0;
    S.nutrition_goals.push({ id: 'g1', calories: 2100, protein_g: 150, carbs_g: 200, fat_g: 70, fiber_g: 30, created_at: '2026-01-01' });
    // Only a PLANNED lunch (nothing logged) + a logged breakfast.
    S.meals.length = 0;
    S.meals.push({ id: 'p1', date: today, meal_type: 'lunch', status: 'planned', description: 'Poulet riz', calories: 430, protein_g: 40, carbs_g: 50, fat_g: 10, fiber_g: 4 });
    S.meals.push({ id: 'l1', date: today, meal_type: 'breakfast', status: 'logged', description: 'Avoine', calories: 320, protein_g: 14, carbs_g: 48, fat_g: 7, fiber_g: 6 });
    await window.loadGoals();
    await window.loadWeekData(); // triggers renderDayPanel

    return {
      kcal: document.getElementById('j-total-kcal').textContent,
      note: document.getElementById('j-summary-note').textContent,
    };
  });

  // 320 logged + 430 planned = 750 projected
  t.eq('summary total includes planned meals', out.kcal, '750');
  t.ok('a "prévu inclus" note is shown', /prévu/.test(out.note));
  return t.results;
}

module.exports = { run };
