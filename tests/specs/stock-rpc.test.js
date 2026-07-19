// Verifies atomic pantry stock deduction via the adjust_pantry_quantity RPC:
// deduction + clamp, refund, equivalence propagation, and idempotent commit.
const { makeAsserter } = require('./_assert');

async function run(page) {
  const t = makeAsserter();
  const out = await page.evaluate(async () => {
    const S = window.__STORE;
    const res = {};

    // Setup: Poulet (g) + Barre (unité), with 1 barre = 30 g de poulet.
    S.pantry_items.length = 0;
    S.pantry_items.push({ id: 'pa', item_type: 'food', food_id: 'f1', name: 'Poulet', quantity: 100, unit: 'g' });
    S.pantry_items.push({ id: 'pb', item_type: 'food', food_id: 'f3', name: 'Barre',  quantity: 5,   unit: 'unité' });
    S.food_equivalences.length = 0;
    S.food_equivalences.push({ id: 'e1', food_id_a: 'f1', food_id_b: 'f3', ratio: 30, qty_b: 1, tolerance: 5, both_ways: true });
    await window.loadPantry();
    await window.loadEquivalences();
    const q = id => S.pantry_items.find(p => p.id === id).quantity;

    // 1) Deduct + clamp at zero.
    await window.deductFoodFromStock('f1', 40);   res.after40 = q('pa');   // 60
    await window.deductFoodFromStock('f1', 1000); res.clamped = q('pa');   // 0

    // 2) Refund.
    await window.refundFoodToStock('f1', 25);     res.refunded = q('pa');  // 25

    // 3) Equivalence: deducting 60 g Poulet also removes 2 barres.
    S.pantry_items.find(p => p.id === 'pa').quantity = 100;
    S.pantry_items.find(p => p.id === 'pb').quantity = 5;
    await window.loadPantry();
    await window.deductFoodFromStock('f1', 60);
    res.pouletEq = q('pa'); // 40
    res.barreEq = q('pb');  // 3

    // 4) commitStockDeductionForMeal: deduct pending, mark deducted, idempotent.
    S.pantry_items.find(p => p.id === 'pa').quantity = 100;
    await window.loadPantry();
    const pad = n => String(n).padStart(2, '0');
    const d = new Date();
    const today = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    S.meal_food_items.length = 0;
    S.meal_food_items.push({ id: 'mfi1', date: today, meal_type: 'lunch', food_id: 'f1', food_name: 'Poulet', grams: 30, deduct_from_stock: true, stock_deducted: false });
    await window.loadWeekData();
    await window.commitStockDeductionForMeal(today, 'lunch');
    res.afterCommit = q('pa');                                                       // 70
    res.marked = S.meal_food_items.find(m => m.id === 'mfi1').stock_deducted;        // true
    await window.commitStockDeductionForMeal(today, 'lunch');
    res.afterSecondCommit = q('pa');                                                 // 70 (idempotent)
    return res;
  });

  t.eq('deduct 40 from 100', out.after40, 60);
  t.eq('clamp at zero', out.clamped, 0);
  t.eq('refund adds back', out.refunded, 25);
  t.eq('equivalence: main food deducted', out.pouletEq, 40);
  t.eq('equivalence: linked food deducted', out.barreEq, 3);
  t.eq('commit deducts pending', out.afterCommit, 70);
  t.ok('commit marks item deducted', out.marked);
  t.eq('second commit is a no-op', out.afterSecondCommit, 70);
  return t.results;
}

module.exports = { run };
