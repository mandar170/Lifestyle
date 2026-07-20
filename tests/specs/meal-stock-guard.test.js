// Verifies a meal can only be added to the journal when every food item that
// would be deducted is present in the pantry in sufficient quantity.
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
    const loggedLunch = () => S.meals.filter(m => m.date === today && m.meal_type === 'lunch' && m.status === 'logged').length;
    const setFoodItem = (over) => {
      S.meal_food_items.length = 0;
      S.meal_food_items.push(Object.assign(
        { id: 'mfi1', date: today, meal_type: 'lunch', food_id: 'f1', food_name: 'Poulet', grams: 150, calories: 250, deduct_from_stock: true, stock_deducted: false },
        over || {}));
    };
    const setPantry = (qty) => { S.pantry_items.length = 0; S.pantry_items.push({ id: 'pa', item_type: 'food', food_id: 'f1', name: 'Poulet', quantity: qty, unit: 'g' }); };

    // 1) Insufficient stock (need 150, have 100) -> blocked, no journal entry.
    S.meals.length = 0;
    setPantry(100); setFoodItem();
    await window.loadFoods(); await window.loadPantry(); await window.loadWeekData();
    await window.quickAddMeal(today, 'lunch', null);
    res.blockedWhenShort = loggedLunch();          // 0

    // 2) Sufficient stock (need 150, have 200) -> committed + pantry deducted.
    S.meals.length = 0;
    setPantry(200); setFoodItem();
    await window.loadFoods(); await window.loadPantry(); await window.loadWeekData();
    await window.quickAddMeal(today, 'lunch', null);
    res.allowedWhenEnough = loggedLunch();         // 1
    res.pantryAfter = S.pantry_items.find(p => p.id === 'pa').quantity; // 50 (200-150)

    // 3) Item flagged "ne pas déduire du stock" -> exempt, allowed even with no stock.
    S.meals.length = 0;
    setPantry(0); setFoodItem({ deduct_from_stock: false });
    await window.loadFoods(); await window.loadPantry(); await window.loadWeekData();
    await window.quickAddMeal(today, 'lunch', null);
    res.allowedWhenExempt = loggedLunch();         // 1

    // 4) Item already deducted -> exempt (re-saving a journaled meal isn't blocked).
    S.meals.length = 0;
    setPantry(0); setFoodItem({ stock_deducted: true });
    await window.loadFoods(); await window.loadPantry(); await window.loadWeekData();
    await window.quickAddMeal(today, 'lunch', null);
    res.allowedWhenAlreadyDeducted = loggedLunch(); // 1

    // 5) The helper reports the shortage precisely.
    setPantry(100); setFoodItem();
    await window.loadFoods(); await window.loadPantry(); await window.loadWeekData();
    const sh = window.mealStockShortages(today, 'lunch');
    res.shortageName = sh[0] && sh[0].name;   // 'Poulet'
    res.shortageNeed = sh[0] && sh[0].need;   // 150
    res.shortageHave = sh[0] && sh[0].have;   // 100

    return res;
  });

  t.eq('blocked when stock insufficient', out.blockedWhenShort, 0);
  t.eq('allowed when stock sufficient', out.allowedWhenEnough, 1);
  t.eq('pantry deducted after commit', out.pantryAfter, 50);
  t.eq('exempt item (no deduct) is allowed', out.allowedWhenExempt, 1);
  t.eq('already-deducted item is allowed', out.allowedWhenAlreadyDeducted, 1);
  t.eq('shortage reports the food', out.shortageName, 'Poulet');
  t.eq('shortage reports need', out.shortageNeed, 150);
  t.eq('shortage reports have', out.shortageHave, 100);
  return t.results;
}

module.exports = { run };
