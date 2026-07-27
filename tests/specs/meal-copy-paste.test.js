// Verifies copying a meal and pasting it into another slot recreates its food
// items in the target slot.
const { makeAsserter } = require('./_assert');

async function run(page) {
  const t = makeAsserter();
  const out = await page.evaluate(async () => {
    const S = window.__STORE;
    const pad = n => String(n).padStart(2, '0');
    const d = new Date();
    const today = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

    S.foods.length = 0;
    S.foods.push({ id: 'f1', name: 'Poulet', unit: 'g' }, { id: 'f2', name: 'Riz', unit: 'g' });
    // A lunch with two food items.
    S.meals.length = 0;
    S.meal_food_items.length = 0;
    S.meal_food_items.push(
      { id: 'i1', date: today, meal_type: 'lunch', food_id: 'f1', food_name: 'Poulet', grams: 200, calories: 220, protein_g: 46, deduct_from_stock: true, stock_deducted: false },
      { id: 'i2', date: today, meal_type: 'lunch', food_id: 'f2', food_name: 'Riz', grams: 150, calories: 195, protein_g: 4, deduct_from_stock: true, stock_deducted: false });
    S.pantry_items.length = 0;
    await window.loadFoods(); await window.loadPantry(); await window.loadWeekData();

    // Copy the lunch.
    window.openMealModal(today, 'lunch');
    window.copyMeal();

    // Paste button should be visible when opening another (empty) slot.
    window.openMealModal(today, 'dinner');
    const pasteBtn = document.getElementById('meal-paste-btn');
    const pasteVisible = pasteBtn && pasteBtn.style.display !== 'none';

    await window.pasteMeal();

    const dinnerItems = S.meal_food_items.filter(m => m.date === today && m.meal_type === 'dinner');
    return {
      pasteVisible,
      dinnerCount: dinnerItems.length,
      dinnerNames: dinnerItems.map(i => i.food_name).sort().join(','),
      dinnerGramsSum: dinnerItems.reduce((s, i) => s + i.grams, 0),
      lunchUntouched: S.meal_food_items.filter(m => m.meal_type === 'lunch').length,
    };
  });

  t.ok('paste button shows when clipboard has a meal', out.pasteVisible);
  t.eq('pasted meal recreates both items in the target slot', out.dinnerCount, 2);
  t.eq('pasted the same foods', out.dinnerNames, 'Poulet,Riz');
  t.eq('pasted the same quantities', out.dinnerGramsSum, 350);
  t.eq('source meal is left untouched', out.lunchUntouched, 2);
  return t.results;
}

module.exports = { run };
