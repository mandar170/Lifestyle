// Verifies multi-barcode-per-food behavior:
//   - a known barcode resolves to its existing food (no OFF lookup, no dup)
//   - a barcode can be attached to an existing food, capped at 5
//   - creating a food from a scanned code uses the EDITED name and links the code
const { makeAsserter } = require('./_assert');

async function run(page) {
  const t = makeAsserter();

  const out = await page.evaluate(async () => {
    const S = window.__STORE;
    const res = {};

    // Seed foods + barcodes. f1 Poulet has one code; f5 has five (at the cap).
    S.foods.length = 0;
    S.foods.push({ id: 'f1', name: 'Poulet', unit: 'g', calories_per_100g: 165 });
    S.foods.push({ id: 'f5', name: 'Barre', unit: 'unité', calories_per_100g: 108 });
    S.food_barcodes.length = 0;
    S.food_barcodes.push({ id: 'bc0', food_id: 'f1', barcode: '3000000000001' });
    ['a', 'b', 'c', 'd', 'e'].forEach((s, i) => S.food_barcodes.push({ id: 'bx' + i, food_id: 'f5', barcode: '900000000000' + i }));
    S.pantry_items.length = 0;
    await window.loadFoods();

    // 1) Known barcode -> existing food shown (no duplicate created).
    document.getElementById('bc-result-view').innerHTML = '';
    await window.lookupBarcode('3000000000001');
    res.knownShowsFood = document.getElementById('bc-result-view').innerHTML.includes('Poulet');
    res.foodsCountAfterKnown = S.foods.length; // still 2, no new food

    // 2) Attach a new code to an existing food (under the cap) succeeds.
    const okAttach = await window.attachBarcodeToFoodRow('f1', '3000000000002');
    res.attachOk = okAttach;
    res.f1CodeCount = S.food_barcodes.filter(b => b.food_id === 'f1').length; // 2

    // 3) Cap: f5 already has 5 codes -> a 6th is refused.
    const okOverCap = await window.attachBarcodeToFoodRow('f5', '9999999999999');
    res.capRefused = okOverCap === false;
    res.f5CodeCount = S.food_barcodes.filter(b => b.food_id === 'f5').length; // still 5

    // 4) Create-from-scan uses the EDITED name (not the OFF name) and links the code.
    window.showBarcodeResult(null, { code: '3000000000009', product_name: 'Blanc de poulet Marque X', nutriments: {}, quantity: '' });
    document.getElementById('bc-new-name').value = 'Poulet maison'; // user edits the OFF name
    document.getElementById('bc-qty').value = '500';
    await window.confirmBarcodeCreateAndAdd();
    const newFood = S.foods.find(f => f.name === 'Poulet maison');
    res.createdWithEditedName = !!newFood;
    res.createdLinkedBarcode = !!(newFood && S.food_barcodes.find(b => b.food_id === newFood.id && b.barcode === '3000000000009'));

    return res;
  });

  t.ok('known barcode shows the existing food', out.knownShowsFood);
  t.eq('known barcode creates no duplicate food', out.foodsCountAfterKnown, 2);
  t.ok('attach under cap succeeds', out.attachOk);
  t.eq('food f1 now has 2 barcodes', out.f1CodeCount, 2);
  t.ok('6th barcode refused (cap 5)', out.capRefused);
  t.eq('food f5 still has 5 barcodes', out.f5CodeCount, 5);
  t.ok('create-from-scan uses the edited name', out.createdWithEditedName);
  t.ok('create-from-scan links the scanned barcode', out.createdLinkedBarcode);
  return t.results;
}

module.exports = { run };
