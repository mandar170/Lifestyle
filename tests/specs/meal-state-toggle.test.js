// Verifies the single Prévu/Mangé toggle: a meal ends up in exactly one state.
// Saving as "mangé" logs it (+ deducts stock, + removes any plan); saving as
// "prévu" plans it (+ removes any journal row, + refunds its stock).
const { makeAsserter } = require('./_assert');

async function run(page) {
  const t = makeAsserter();

  const out = await page.evaluate(async () => {
    const S = window.__STORE;
    const pad = n => String(n).padStart(2, '0');
    const d = new Date();
    const today = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const res = {};

    S.foods.length = 0;
    S.foods.push({ id: 'f1', name: 'Poulet', unit: 'g', calories_per_100g: 165, protein_per_100g: 31 });
    const setMacros = () => { document.getElementById('kcal-modal').value = '250'; document.getElementById('desc-modal').value = 'Poulet'; };
    const rows = (st) => S.meals.filter(m => m.date === today && m.meal_type === 'lunch' && m.status === st).length;
    const pantryQ = () => { const p = S.pantry_items.find(x => x.id === 'pa'); return p ? p.quantity : null; };

    // ---- Save as "mangé": logs + deducts + removes any plan ----
    S.meals.length = 0;
    S.meals.push({ id: 'pl', date: today, meal_type: 'lunch', status: 'planned', description: 'ancien plan', calories: 999 });
    S.pantry_items.length = 0;
    S.pantry_items.push({ id: 'pa', item_type: 'food', food_id: 'f1', name: 'Poulet', quantity: 300, unit: 'g' });
    S.meal_food_items.length = 0;
    S.meal_food_items.push({ id: 'mi', date: today, meal_type: 'lunch', food_id: 'f1', food_name: 'Poulet', grams: 100, calories: 165, deduct_from_stock: true, stock_deducted: false });
    await window.loadFoods(); await window.loadPantry(); await window.loadWeekData();
    window.openMealModal(today, 'lunch');
    res.initStatePlanned = window.mealDisplayData(today, 'lunch').state; // 'planned' -> toggle should init Prévu
    window.setMealState('logged'); setMacros();
    await window.saveMealFromModal();
    res.loggedRows = rows('logged');     // 1
    res.plannedRowsGone = rows('planned'); // 0 (plan realised)
    res.pantryAfterLog = pantryQ();      // 200 (300 - 100)

    // ---- Save as "prévu" on that logged meal: unplans + refunds ----
    await window.loadWeekData();
    window.openMealModal(today, 'lunch');
    window.setMealState('planned'); setMacros();
    await window.saveMealFromModal();
    res.plannedRows = rows('planned');   // 1
    res.loggedRowsGone = rows('logged'); // 0 (removed from journal)
    res.pantryAfterUnlog = pantryQ();    // 300 (refunded)
    return res;
  });

  t.eq('toggle inits to Prévu for a planned meal', out.initStatePlanned, 'planned');
  t.eq('save as mangé creates one logged row', out.loggedRows, 1);
  t.eq('save as mangé removes the plan', out.plannedRowsGone, 0);
  t.eq('save as mangé deducts stock', out.pantryAfterLog, 200);
  t.eq('save as prévu creates one planned row', out.plannedRows, 1);
  t.eq('save as prévu removes the journal row', out.loggedRowsGone, 0);
  t.eq('save as prévu refunds the stock', out.pantryAfterUnlog, 300);
  return t.results;
}

module.exports = { run };
