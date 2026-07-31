// Verifies the −/+ quantity steppers appear for unit foods (default qty 1) and
// step by 1 with a floor of 1, while gram/litre foods keep a plain field.
const { makeAsserter } = require('./_assert');

async function run(page) {
  const t = makeAsserter();
  const out = await page.evaluate(async () => {
    const S = window.__STORE;
    const pad = n => String(n).padStart(2, '0');
    const d = new Date();
    const today = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    // Stub foods include f1 Poulet (g) and f3 Barre praliné (unité).
    await window.loadFoods();
    window.openMealModal(today, 'lunch');

    const vis = id => { const el = document.getElementById(id); return el && el.style.display !== 'none'; };
    const grams = () => document.getElementById('fp-grams-modal').value;

    // Unit food -> steppers shown, quantity defaults to 1.
    window.selectFoodForPicker('modal', 'f3');
    const unitShows = vis('fp-minus-modal') && vis('fp-plus-modal');
    const unitDefault = grams();
    window.stepFoodQty('modal', 1); const afterPlus = grams();
    window.stepFoodQty('modal', -1); window.stepFoodQty('modal', -1); const afterFloor = grams(); // 2 -> 1 -> floor 1

    // Gram food -> steppers hidden.
    window.selectFoodForPicker('modal', 'f1');
    const gramHidden = !vis('fp-minus-modal') && !vis('fp-plus-modal');

    return { unitShows, unitDefault, afterPlus, afterFloor, gramHidden };
  });

  t.ok('unit food shows −/+ steppers', out.unitShows);
  t.eq('unit food defaults quantity to 1', out.unitDefault, '1');
  t.eq('+ increments the quantity', out.afterPlus, '2');
  t.eq('− has a floor of 1', out.afterFloor, '1');
  t.ok('gram food hides the steppers', out.gramHidden);
  return t.results;
}

module.exports = { run };
