// Verifies that after confirming a food in the meal modal, the search field
// and the (filtered) results list both reset — the fix for "le champ de
// recherche reste rempli après avoir validé un aliment".
const { makeAsserter } = require('./_assert');

async function run(page) {
  const t = makeAsserter();

  // Open a meal modal for today.
  await page.evaluate(() => {
    const pad = n => String(n).padStart(2, '0');
    const d = new Date();
    const today = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    window.openMealModal(today, 'lunch');
  });
  await page.waitForTimeout(100);

  // Type a search term; the list filters down.
  await page.fill('#fp-search-modal', 'Poulet');
  await page.waitForTimeout(100);
  const searchBefore = await page.$eval('#fp-search-modal', el => el.value);
  const listBefore = await page.$$eval('#fp-list-modal .preset-item', els => els.length);

  // Pick the first result, set a quantity, confirm.
  await page.click('#fp-list-modal .preset-item');
  await page.waitForTimeout(50);
  await page.fill('#fp-grams-modal', '100');
  await page.click('#fp-weight-modal .btn--primary');
  await page.waitForTimeout(150);

  const searchAfter = await page.$eval('#fp-search-modal', el => el.value);
  const listAfter = await page.$$eval('#fp-list-modal .preset-item', els => els.length);
  const itemsAdded = await page.$$eval('.meal-food-item', els => els.length);

  t.eq('search filled before add', searchBefore, 'Poulet');
  t.ok('list filtered before add (at least 1 result)', listBefore >= 1);
  t.eq('search field cleared after add', searchAfter, '');
  t.ok('results list reset to full list after add', listAfter > listBefore);
  t.ok('food item was actually added', itemsAdded >= 1);
  return t.results;
}

module.exports = { run };
