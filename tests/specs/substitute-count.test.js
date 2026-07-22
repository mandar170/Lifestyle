// Verifies the daily substitute counter sums UNITS eaten (2 barres = 2), not
// the number of item rows — the 22/07 bug where 4 substitutes counted as 3.
const { makeAsserter } = require('./_assert');

async function run(page) {
  const t = makeAsserter();

  const out = await page.evaluate(async () => {
    const S = window.__STORE;
    const pad = n => String(n).padStart(2, '0');
    const d = new Date();
    const today = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

    // Stub seed: t1 'Substitut' tags f3 (Barre, unité) and f4 (Flan, unité).
    // f1 (Poulet, g) is NOT a substitute.
    S.meal_food_items.length = 0;
    S.meal_food_items.push({ id: 'a', date: today, meal_type: 'morning_snack', food_id: 'f3', food_name: 'Barre', grams: 2 });   // 2 units
    S.meal_food_items.push({ id: 'b', date: today, meal_type: 'afternoon_snack', food_id: 'f4', food_name: 'Flan', grams: 1 }); // 1 unit
    S.meal_food_items.push({ id: 'c', date: today, meal_type: 'lunch', food_id: 'f1', food_name: 'Poulet', grams: 150 });       // not a substitute
    await window.loadTags();
    await window.loadFoods();
    await window.loadWeekData();

    const res = {};
    res.total = window.countSubstitutesForDay(today); // expect 2 + 1 = 3

    // Change the barre count to 1 -> total should drop to 2.
    S.meal_food_items.find(x => x.id === 'a').grams = 1;
    await window.loadWeekData();
    res.afterChange = window.countSubstitutesForDay(today); // expect 1 + 1 = 2
    return res;
  });

  t.eq('sums units eaten (2 barres + 1 flan = 3)', out.total, 3);
  t.eq('reflects unit quantity change (1 + 1 = 2)', out.afterChange, 2);
  return t.results;
}

module.exports = { run };
