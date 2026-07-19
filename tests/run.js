// Headless test runner for the Nutrition module.
//
// Serves the repo root over a tiny static HTTP server, loads the REAL
// assets/js/nutrition.js inside tests/fixtures/test.html (only the Supabase
// client is stubbed), then runs every spec in tests/specs/*.test.js against a
// fresh page. Exits non-zero if any assertion fails or any JS error fires, so
// CI can block the merge.
//
// Portability:
//   - require('playwright') resolves from tests/node_modules in CI, or from a
//     global install via NODE_PATH locally.
//   - PW_CHROMIUM (optional) points at a prebuilt Chromium; otherwise Playwright
//     uses its own downloaded browser.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.env.PORT || 8123);
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

function startServer() {
  const server = http.createServer((req, res) => {
    let rel = decodeURIComponent(req.url.split('?')[0]);
    if (rel === '/') rel = '/index.html';
    const file = path.normalize(path.join(ROOT, rel));
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404); res.end('not found'); return;
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'text/plain' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise(resolve => server.listen(PORT, () => resolve(server)));
}

async function main() {
  const server = await startServer();
  const launchOpts = process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {};
  const browser = await chromium.launch(launchOpts);

  const specDir = path.join(__dirname, 'specs');
  const specs = fs.readdirSync(specDir).filter(f => f.endsWith('.test.js')).sort();
  let failedFiles = 0;
  let totalAssertions = 0;

  for (const f of specs) {
    const spec = require(path.join(specDir, f));
    const page = await browser.newPage();
    const jsErrors = [];
    page.on('pageerror', e => jsErrors.push('[pageerror] ' + e.message));
    page.on('console', m => {
      if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) jsErrors.push('[console.error] ' + m.text());
    });

    let assertions = [];
    let threw = null;
    try {
      await page.goto(`http://localhost:${PORT}/tests/fixtures/test.html`, { waitUntil: 'networkidle', timeout: 20000 });
      await page.waitForTimeout(300); // let initJournal() settle
      assertions = await spec.run(page) || [];
    } catch (e) {
      threw = e;
    }

    const failed = assertions.filter(a => !a.ok);
    const ok = !threw && jsErrors.length === 0 && failed.length === 0;
    totalAssertions += assertions.length;

    if (ok) {
      console.log(`✓ ${f}  (${assertions.length} assertions)`);
    } else {
      failedFiles++;
      console.log(`✗ ${f}`);
      if (threw) console.log(`    threw: ${threw.message}`);
      failed.forEach(a => console.log(`    - ${a.name}: expected ${JSON.stringify(a.expected)}, got ${JSON.stringify(a.actual)}`));
      if (jsErrors.length) jsErrors.forEach(e => console.log(`    - JS error: ${e}`));
    }
    await page.close();
  }

  await browser.close();
  server.close();

  console.log('');
  if (failedFiles) {
    console.log(`FAIL — ${failedFiles}/${specs.length} spec file(s) failed`);
    process.exit(1);
  }
  console.log(`PASS — ${specs.length} spec file(s), ${totalAssertions} assertions`);
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
