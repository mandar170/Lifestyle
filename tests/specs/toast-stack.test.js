// Verifies toasts stack in a container (each in its own box) instead of piling
// up at the same fixed spot and overlapping into illegibility.
const { makeAsserter } = require('./_assert');

async function run(page) {
  const t = makeAsserter();
  const out = await page.evaluate(() => {
    window.showToast('Premier message', 'success');
    window.showToast('Deuxième message', 'error');
    window.showToast('Troisième message', 'success');
    const cont = document.getElementById('toast-container');
    const toasts = cont ? cont.querySelectorAll('.toast') : [];
    return {
      hasContainer: !!cont,
      containerIsFixed: cont ? getComputedStyle(cont).position : null,
      count: toasts.length,
      // Distinct vertical positions => they are stacked, not overlapping.
      distinctTops: new Set(Array.from(toasts).map(el => Math.round(el.getBoundingClientRect().top))).size,
    };
  });

  t.ok('toasts live in a dedicated container', out.hasContainer);
  t.eq('container is fixed-positioned', out.containerIsFixed, 'fixed');
  t.eq('all three toasts coexist', out.count, 3);
  t.eq('each toast has its own vertical slot (no overlap)', out.distinctTops, 3);
  return t.results;
}

module.exports = { run };
