// Verifies the −/+ steppers on stock rows: +25 g for gram foods, +1 for unit
// foods, floored at 0.
const { makeAsserter } = require('./_assert');

async function run(page) {
  const t = makeAsserter();
  const out = await page.evaluate(async () => {
    const S = window.__STORE;
    S.foods.length = 0;
    S.pantry_items.length = 0;
    S.pantry_items.push(
      { id: 'pa', item_type: 'food', food_id: 'fa', name: 'Riz', quantity: 100, unit: 'g' },
      { id: 'pb', item_type: 'food', food_id: 'fb', name: 'Barre', quantity: 3, unit: 'unité' });
    await window.loadPantry(); // renders the rows

    const q = id => S.pantry_items.find(p => p.id === id).quantity;

    await window.stepPantryQty('pa', 25);   // 100 -> 125
    const gramsPlus = q('pa');
    await window.stepPantryQty('pa', -25);  // 125 -> 100
    const gramsMinus = q('pa');
    await window.stepPantryQty('pb', 1);    // 3 -> 4
    const unitPlus = q('pb');
    for (let i = 0; i < 10; i++) await window.stepPantryQty('pb', -1); // floor at 0
    const unitFloor = q('pb');

    return { gramsPlus, gramsMinus, unitPlus, unitFloor };
  });

  t.eq('+ adds 25 g for a gram food', out.gramsPlus, 125);
  t.eq('− removes 25 g for a gram food', out.gramsMinus, 100);
  t.eq('+ adds 1 for a unit food', out.unitPlus, 4);
  t.eq('quantity is floored at 0', out.unitFloor, 0);
  return t.results;
}

module.exports = { run };
