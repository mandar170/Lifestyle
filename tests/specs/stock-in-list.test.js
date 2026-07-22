// Verifies the meal food-item list shows remaining pantry stock, colour-coded
// (green comfortable / orange just-enough / red not-enough), and nothing when
// the food isn't tracked in the pantry.
const { makeAsserter } = require('./_assert');

async function run(page) {
  const t = makeAsserter();
  const out = await page.evaluate(async () => {
    const S = window.__STORE;
    S.foods.length = 0;
    S.foods.push({ id: 'f1', name: 'Riz', unit: 'g' }, { id: 'f2', name: 'Steak', unit: 'g' }, { id: 'f3', name: 'Barre', unit: 'unité' });
    S.pantry_items.length = 0;
    S.pantry_items.push(
      { id: 'p1', item_type: 'food', food_id: 'f1', name: 'Riz', quantity: 620, unit: 'g' },
      { id: 'p2', item_type: 'food', food_id: 'f2', name: 'Steak', quantity: 100, unit: 'g' },
      { id: 'p3', item_type: 'food', food_id: 'f3', name: 'Barre', quantity: 1, unit: 'unité' });
    await window.loadFoods(); await window.loadPantry();

    return {
      comfortable: window.stockLabelForItem('f1', 180, 'g'), // 620 vs 180 -> green
      just:        window.stockLabelForItem('f2', 100, 'g'), // 100 vs 100 -> orange
      short:       window.stockLabelForItem('f3', 3, 'unité'), // 1 vs 3 -> red, unit -> " u"
      untracked:   window.stockLabelForItem('f9', 50, 'g'),  // no pantry -> ''
    };
  });

  t.ok('comfortable stock is green', /#22c55e/.test(out.comfortable) && /reste 620g/.test(out.comfortable));
  t.ok('just-enough stock is orange', /#f59e0b/.test(out.just) && /reste 100g/.test(out.just));
  t.ok('insufficient stock is red + unit label', /#f87171/.test(out.short) && /reste 1 u/.test(out.short));
  t.eq('untracked food shows nothing', out.untracked, '');
  return t.results;
}

module.exports = { run };
