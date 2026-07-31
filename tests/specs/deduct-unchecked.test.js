// Verifies that marking a meal "Mangé" with the "Déduire du stock" checkbox
// unchecked neither blocks on stock nor deducts — even when stock is short.
const { makeAsserter } = require('./_assert');

async function run(page) {
  const t = makeAsserter();
  const out = await page.evaluate(async () => {
    const S = window.__STORE;
    const pad = n => String(n).padStart(2, '0');
    const d = new Date();
    const today = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

    S.foods.length = 0; S.foods.push({ id: 'f1', name: 'Poulet', unit: 'g' });
    S.meals.length = 0;
    S.meal_food_items.length = 0;
    // Needs 150 g but only 100 g in stock -> would normally block + deduct.
    S.meal_food_items.push({ id: 'i1', date: today, meal_type: 'lunch', food_id: 'f1', food_name: 'Poulet', grams: 150, calories: 250, protein_g: 40, deduct_from_stock: true, stock_deducted: false });
    S.pantry_items.length = 0;
    S.pantry_items.push({ id: 'pa', item_type: 'food', food_id: 'f1', name: 'Poulet', quantity: 100, unit: 'g' });
    await window.loadFoods(); await window.loadPantry(); await window.loadWeekData();

    window.openMealModal(today, 'lunch');
    document.getElementById('deduct-modal').checked = false; // user unchecks "déduire du stock"
    window.setMealState('logged');
    await window.saveMealFromModal();

    const logged = S.meals.filter(m => m.date === today && m.meal_type === 'lunch' && m.status === 'logged').length;
    return {
      logged,
      pantry: S.pantry_items.find(p => p.id === 'pa').quantity,
      itemDeduct: S.meal_food_items.find(m => m.id === 'i1').deduct_from_stock,
      itemDeducted: S.meal_food_items.find(m => m.id === 'i1').stock_deducted,
    };
  });

  t.eq('meal is logged (not blocked) despite short stock', out.logged, 1);
  t.eq('stock is NOT deducted', out.pantry, 100);
  t.eq('items flagged not-to-deduct', out.itemDeduct, false);
  t.eq('items were not deducted', out.itemDeducted, false);
  return t.results;
}

module.exports = { run };
