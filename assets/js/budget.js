// ============================================================
// BUDGET TRACKER
// ============================================================

let allTransactions = [];
let allGoals = {};
let donutChart = null;
let monthlyChart = null;
let currentPage = 1;
const PAGE_SIZE = 50;

const C = {
  green:  '#22c55e', orange: '#f97316', cyan: '#64dcff',
  purple: '#a855f7', red: '#ef4444',   yellow: '#facc15',
  pink:   '#ec4899', teal: '#14b8a6',  blue: '#3b82f6', indigo: '#6366f1',
};

const CAT_COLORS = {};
let colorIdx = 0;
const COLOR_PALETTE = Object.values(C);
function catColor(cat) {
  if (!CAT_COLORS[cat]) CAT_COLORS[cat] = COLOR_PALETTE[colorIdx++ % COLOR_PALETTE.length];
  return CAT_COLORS[cat];
}

// ============================================================
// INIT
// ============================================================
document.addEventListener('DOMContentLoaded', async () => {
  // Auth check
  const { data: { session } } = await db.auth.getSession();
  if (!session) { window.location.href = 'personal.html'; return; }

  Chart.defaults.color       = '#64748b';
  Chart.defaults.borderColor = 'rgba(255,255,255,0.05)';
  Chart.defaults.font.family = 'Space Grotesk';

  initTabs();
  await loadAll();
  initImport();
  initCAForm();
  initFilters();
});

// ============================================================
// DATA LOADING
// ============================================================
async function loadAll() {
  const { data: { user } } = await db.auth.getUser();
  const [txRes, goalRes] = await Promise.all([
    db.from('budget_transactions').select('*').eq('user_id', user.id).order('date', { ascending: false }),
    db.from('budget_goals').select('*').eq('user_id', user.id),
  ]);
  allTransactions = txRes.data || [];
  allGoals = {};
  (goalRes.data || []).forEach(g => { allGoals[g.category] = g.monthly_limit; });

  populateMonthSelectors();
  populateFilterDropdowns();
  renderStats();
  renderDonut();
  renderMonthly();
  renderCategoryBars();
  renderTransactions();
  renderGoalsGrid();
}

// ============================================================
// TABS
// ============================================================
function initTabs() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
    });
  });
}

// ============================================================
// HELPERS
// ============================================================
function currentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function fmtAmount(n) {
  return (n < 0 ? '−' : '+') + Math.abs(n).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
}

function fmtDate(d) {
  if (!d) return '';
  const [y, m, day] = d.split('-');
  return `${day}/${m}/${y}`;
}

function getMonths() {
  const months = new Set(allTransactions.map(t => t.date?.slice(0, 7)));
  return [...months].sort().reverse();
}

function populateMonthSelectors() {
  const months = getMonths();
  const cur = currentMonth();
  [document.getElementById('apercu-month'), document.getElementById('filter-month')].forEach(sel => {
    if (!sel) return;
    sel.innerHTML = months.map(m => {
      const [y, mo] = m.split('-');
      const label = new Date(y, mo - 1).toLocaleString('fr-FR', { month: 'long', year: 'numeric' });
      return `<option value="${m}" ${m === cur ? 'selected' : ''}>${label}</option>`;
    }).join('') || `<option value="${cur}">Mois en cours</option>`;
  });
}

function populateFilterDropdowns() {
  const accounts = [...new Set(allTransactions.map(t => t.account_label || t.account).filter(Boolean))];
  const accSel = document.getElementById('filter-account');
  accSel.innerHTML = '<option value="">Tous les comptes</option>' +
    accounts.map(a => `<option value="${a}">${a}</option>`).join('');

  const cats = [...new Set(allTransactions.map(t => t.category).filter(Boolean))].sort();
  const catSel = document.getElementById('filter-cat');
  catSel.innerHTML = '<option value="">Toutes catégories</option>' +
    cats.map(c => `<option value="${c}">${c}</option>`).join('');
}

function txForMonth(month) {
  return allTransactions.filter(t => t.date?.startsWith(month));
}

// ============================================================
// STATS
// ============================================================
function renderStats() {
  const month = document.getElementById('apercu-month')?.value || currentMonth();
  const txs = txForMonth(month);
  const depenses = txs.filter(t => t.amount < 0).reduce((s, t) => s + t.amount, 0);
  const revenus  = txs.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0);
  const balance  = depenses + revenus;

  document.getElementById('stat-depenses').textContent =
    Math.abs(depenses).toLocaleString('fr-FR', { minimumFractionDigits: 2 }) + ' €';
  document.getElementById('stat-revenus').textContent =
    revenus.toLocaleString('fr-FR', { minimumFractionDigits: 2 }) + ' €';
  const balEl = document.getElementById('stat-balance');
  balEl.textContent = (balance >= 0 ? '+' : '') +
    balance.toLocaleString('fr-FR', { minimumFractionDigits: 2 }) + ' €';
  balEl.style.color = balance >= 0 ? C.green : C.red;
  document.getElementById('stat-count').textContent = txs.length;
}

// ============================================================
// DONUT CHART
// ============================================================
function renderDonut() {
  const month = document.getElementById('apercu-month')?.value || currentMonth();
  const txs = txForMonth(month).filter(t => t.amount < 0);

  const bycat = {};
  txs.forEach(t => {
    const cat = t.category || 'Autre';
    bycat[cat] = (bycat[cat] || 0) + Math.abs(t.amount);
  });

  const labels = Object.keys(bycat).sort((a, b) => bycat[b] - bycat[a]);
  const values = labels.map(l => bycat[l]);
  const nodata = document.getElementById('nodata-donut');

  if (!labels.length) {
    nodata.style.display = 'flex';
    if (donutChart) { donutChart.destroy(); donutChart = null; }
    return;
  }
  nodata.style.display = 'none';

  const ctx = document.getElementById('chart-donut').getContext('2d');
  if (donutChart) donutChart.destroy();
  donutChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{ data: values, backgroundColor: labels.map(catColor), borderWidth: 2, borderColor: '#07070e' }],
    },
    options: {
      cutout: '65%',
      plugins: {
        legend: { position: 'right', labels: { boxWidth: 12, font: { size: 11 }, padding: 12 } },
        tooltip: {
          callbacks: {
            label: ctx => ` ${ctx.label}: ${ctx.parsed.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} €`,
          },
        },
      },
    },
  });
}

// ============================================================
// MONTHLY BAR CHART
// ============================================================
function renderMonthly() {
  const months = getMonths().slice(0, 6).reverse();
  const nodata = document.getElementById('nodata-monthly');

  if (!months.length) {
    nodata.style.display = 'flex';
    if (monthlyChart) { monthlyChart.destroy(); monthlyChart = null; }
    return;
  }
  nodata.style.display = 'none';

  const depenses = months.map(m => Math.abs(txForMonth(m).filter(t => t.amount < 0).reduce((s, t) => s + t.amount, 0)));
  const revenus  = months.map(m => txForMonth(m).filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0));
  const labels   = months.map(m => {
    const [y, mo] = m.split('-');
    return new Date(y, mo - 1).toLocaleString('fr-FR', { month: 'short' });
  });

  const ctx = document.getElementById('chart-monthly').getContext('2d');
  if (monthlyChart) monthlyChart.destroy();
  monthlyChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label: 'Dépenses', data: depenses, backgroundColor: 'rgba(249,115,22,0.6)', borderColor: C.orange, borderWidth: 1, borderRadius: 4 },
        { label: 'Revenus',  data: revenus,  backgroundColor: 'rgba(34,197,94,0.5)',  borderColor: C.green,  borderWidth: 1, borderRadius: 4 },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { labels: { boxWidth: 12 } } },
      scales: {
        y: { beginAtZero: true, ticks: { callback: v => v.toLocaleString('fr-FR') + ' €' } },
      },
    },
  });
}

// ============================================================
// CATEGORY BARS
// ============================================================
function renderCategoryBars() {
  const month = document.getElementById('apercu-month')?.value || currentMonth();
  const txs   = txForMonth(month).filter(t => t.amount < 0);

  const bycat = {};
  txs.forEach(t => {
    const cat = t.category || 'Autre';
    bycat[cat] = (bycat[cat] || 0) + Math.abs(t.amount);
  });

  const sorted = Object.entries(bycat).sort((a, b) => b[1] - a[1]);
  const container = document.getElementById('category-bars');

  if (!sorted.length) {
    container.innerHTML = '<div style="color:var(--text-dim);font-size:13px;text-align:center;padding:32px;">Aucune dépense ce mois.</div>';
    return;
  }

  const max = sorted[0][1];
  container.innerHTML = sorted.map(([cat, amount]) => {
    const pct = (amount / max * 100).toFixed(1);
    const goal = allGoals[cat];
    const goalPct = goal ? Math.min(amount / goal * 100, 100).toFixed(1) : null;
    const color = catColor(cat);
    const overBudget = goal && amount > goal;
    return `
      <div class="cat-bar-row">
        <div class="cat-bar-label">
          <span class="cat-dot" style="background:${color}"></span>
          <span>${cat}</span>
          ${goal ? `<span class="cat-goal ${overBudget ? 'cat-goal--over' : ''}">${overBudget ? '⚠ ' : ''}Budget: ${goal.toLocaleString('fr-FR')} €</span>` : ''}
        </div>
        <div class="cat-bar-track">
          <div class="cat-bar-fill" style="width:${pct}%;background:${color}"></div>
          ${goalPct ? `<div class="cat-bar-goal-line" style="left:${Math.min(goal / max * 100, 100)}%"></div>` : ''}
        </div>
        <span class="cat-bar-amount" style="color:${overBudget ? C.red : color}">${amount.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} €</span>
      </div>`;
  }).join('');
}

// ============================================================
// TRANSACTIONS TABLE
// ============================================================
function renderTransactions() {
  const month   = document.getElementById('filter-month')?.value || '';
  const account = document.getElementById('filter-account')?.value || '';
  const cat     = document.getElementById('filter-cat')?.value || '';
  const search  = (document.getElementById('filter-search')?.value || '').toLowerCase();

  let txs = allTransactions.filter(t => {
    if (month && !t.date?.startsWith(month)) return false;
    if (account && t.account_label !== account && t.account !== account) return false;
    if (cat && t.category !== cat) return false;
    if (search && !t.label?.toLowerCase().includes(search)) return false;
    return true;
  });

  const total = txs.length;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  currentPage = Math.min(currentPage, pages);
  const slice = txs.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const tbody = document.getElementById('tx-body');
  if (!slice.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="tx-empty">Aucune transaction.</td></tr>';
  } else {
    tbody.innerHTML = slice.map(t => {
      const pos = t.amount >= 0;
      return `<tr>
        <td class="tx-date">${fmtDate(t.date)}</td>
        <td class="tx-label">${t.label || ''}</td>
        <td><span class="tx-cat" style="border-color:${catColor(t.category || 'Autre')};color:${catColor(t.category || 'Autre')}">${t.category || '—'}</span></td>
        <td style="color:var(--text-dim);font-size:12px;">${t.account_label || t.account || '—'}</td>
        <td class="tx-amount ${pos ? 'tx-amount--pos' : 'tx-amount--neg'}">${fmtAmount(t.amount)}</td>
      </tr>`;
    }).join('');
  }

  // Pagination
  const pag = document.getElementById('tx-pagination');
  if (pages <= 1) { pag.innerHTML = ''; return; }
  pag.innerHTML = `
    <button onclick="goPage(${currentPage - 1})" ${currentPage <= 1 ? 'disabled' : ''} class="btn btn--ghost btn--sm">←</button>
    <span style="color:var(--text-muted);font-size:13px;">Page ${currentPage} / ${pages} (${total} transactions)</span>
    <button onclick="goPage(${currentPage + 1})" ${currentPage >= pages ? 'disabled' : ''} class="btn btn--ghost btn--sm">→</button>`;
}

function goPage(n) { currentPage = n; renderTransactions(); }
window.goPage = goPage;

function initFilters() {
  ['filter-month', 'filter-account', 'filter-cat'].forEach(id => {
    document.getElementById(id)?.addEventListener('change', () => { currentPage = 1; renderTransactions(); });
  });
  document.getElementById('filter-search')?.addEventListener('input', () => { currentPage = 1; renderTransactions(); });
  document.getElementById('apercu-month')?.addEventListener('change', () => {
    renderStats(); renderDonut(); renderCategoryBars();
  });
}

// ============================================================
// IMPORT BOURSOBANK
// ============================================================
let pendingBourso = [];
let pendingCA     = [];

function parseBoursoCSV(text) {
  const result = Papa.parse(text, { delimiter: ';', header: true, skipEmptyLines: true });
  return result.data.map(row => {
    const rawAmount = (row.amount || row.montant || '').replace(',', '.').replace(/\s/g, '');
    const amount = parseFloat(rawAmount);
    if (isNaN(amount)) return null;
    return {
      date: row.dateOp || row.date || '',
      label: (row.label || row.libelle || '').replace(/^"(.*)"$/, '$1').split('|')[0].trim(),
      category: (row.category || row.categorie || '').replace(/^"(.*)"$/, '$1') || 'Autre',
      category_parent: (row.categoryParent || '').replace(/^"(.*)"$/, '$1'),
      amount,
      account: row.accountNum || '',
      account_label: row.accountLabel || 'BoursoBank',
      source: 'boursobank',
    };
  }).filter(Boolean);
}

function parseCACSV(text) {
  const lines = text.trim().split('\n').slice(1); // skip header
  return lines.map(line => {
    const parts = line.split(';');
    if (parts.length < 3) return null;
    const [rawDate, label, rawDebit, rawCredit] = parts;
    const debit  = parseFloat((rawDebit  || '').replace(',', '.').replace(/\s/g, '')) || 0;
    const credit = parseFloat((rawCredit || '').replace(',', '.').replace(/\s/g, '')) || 0;
    const amount = credit > 0 ? credit : -Math.abs(debit);
    if (!rawDate || (!debit && !credit)) return null;
    // Normalize date: DD/MM/YYYY or DD.MM.YYYY → YYYY-MM-DD
    const dp = rawDate.trim().split(/[\/\.]/).map(s => s.trim());
    const date = dp.length === 3 ? `${dp[2]}-${dp[1].padStart(2,'0')}-${dp[0].padStart(2,'0')}` : rawDate.trim();
    return {
      date, label: label?.trim() || '',
      category: 'Non catégorisé', category_parent: '',
      amount, account: '23071108341', account_label: 'Crédit Agricole', source: 'ca',
    };
  }).filter(Boolean);
}

function showPreview(rows, bodyId, countId, containerId) {
  const tbody = document.getElementById(bodyId);
  tbody.innerHTML = rows.slice(0, 20).map(t => {
    const pos = t.amount >= 0;
    return `<tr>
      <td class="tx-date">${fmtDate(t.date)}</td>
      <td class="tx-label">${t.label}</td>
      <td>${t.category || '—'}</td>
      <td style="color:var(--text-dim);font-size:12px;">${t.account_label || ''}</td>
      <td class="tx-amount ${pos ? 'tx-amount--pos' : 'tx-amount--neg'}">${fmtAmount(t.amount)}</td>
    </tr>`;
  }).join('');
  document.getElementById(countId).textContent =
    `${rows.length} transaction${rows.length > 1 ? 's' : ''} détectée${rows.length > 1 ? 's' : ''} (aperçu: 20 premières)`;
  document.getElementById(containerId).hidden = false;
}

async function importRows(rows) {
  const { data: { user } } = await db.auth.getUser();
  const payload = rows.map(r => ({ ...r, user_id: user.id }));
  // Upsert par lot de 200
  for (let i = 0; i < payload.length; i += 200) {
    await db.from('budget_transactions').insert(payload.slice(i, i + 200));
  }
}

function initImport() {
  // BoursoBank
  const fileBourso = document.getElementById('file-bourso');
  const dropBourso = document.getElementById('drop-bourso');

  fileBourso.addEventListener('change', e => {
    const f = e.target.files[0]; if (!f) return;
    const r = new FileReader();
    r.onload = ev => {
      pendingBourso = parseBoursoCSV(ev.target.result);
      showPreview(pendingBourso, 'preview-bourso-body', 'preview-bourso-count', 'preview-bourso');
    };
    r.readAsText(f, 'UTF-8');
  });

  ['dragover', 'dragenter'].forEach(ev => dropBourso.addEventListener(ev, e => { e.preventDefault(); dropBourso.classList.add('drop-zone--active'); }));
  ['dragleave', 'drop'].forEach(ev => dropBourso.addEventListener(ev, e => { e.preventDefault(); dropBourso.classList.remove('drop-zone--active'); }));
  dropBourso.addEventListener('drop', e => {
    const f = e.dataTransfer.files[0]; if (!f) return;
    const r = new FileReader();
    r.onload = ev => { pendingBourso = parseBoursoCSV(ev.target.result); showPreview(pendingBourso, 'preview-bourso-body', 'preview-bourso-count', 'preview-bourso'); };
    r.readAsText(f, 'UTF-8');
  });

  document.getElementById('confirm-bourso').addEventListener('click', async () => {
    if (!pendingBourso.length) return;
    await importRows(pendingBourso);
    document.getElementById('preview-bourso').hidden = true;
    pendingBourso = [];
    await loadAll();
  });
  document.getElementById('cancel-bourso').addEventListener('click', () => {
    document.getElementById('preview-bourso').hidden = true; pendingBourso = [];
  });

  // CA CSV
  const fileCA = document.getElementById('file-ca');
  const dropCA = document.getElementById('drop-ca');

  fileCA.addEventListener('change', e => {
    const f = e.target.files[0]; if (!f) return;
    const r = new FileReader();
    r.onload = ev => { pendingCA = parseCACSV(ev.target.result); showPreview(pendingCA, 'preview-ca-body', 'preview-ca-count', 'preview-ca'); };
    r.readAsText(f, 'UTF-8');
  });

  ['dragover','dragenter'].forEach(ev => dropCA.addEventListener(ev, e => { e.preventDefault(); dropCA.classList.add('drop-zone--active'); }));
  ['dragleave','drop'].forEach(ev => dropCA.addEventListener(ev, e => { e.preventDefault(); dropCA.classList.remove('drop-zone--active'); }));
  dropCA.addEventListener('drop', e => {
    const f = e.dataTransfer.files[0]; if (!f) return;
    const r = new FileReader();
    r.onload = ev => { pendingCA = parseCACSV(ev.target.result); showPreview(pendingCA, 'preview-ca-body', 'preview-ca-count', 'preview-ca'); };
    r.readAsText(f, 'UTF-8');
  });

  document.getElementById('confirm-ca').addEventListener('click', async () => {
    if (!pendingCA.length) return;
    await importRows(pendingCA);
    document.getElementById('preview-ca').hidden = true;
    pendingCA = [];
    await loadAll();
  });
  document.getElementById('cancel-ca').addEventListener('click', () => {
    document.getElementById('preview-ca').hidden = true; pendingCA = [];
  });
}

// ============================================================
// CA MANUAL FORM
// ============================================================
function initCAForm() {
  document.getElementById('ca-date').value = new Date().toISOString().slice(0, 10);
  document.getElementById('ca-submit').addEventListener('click', async () => {
    const date     = document.getElementById('ca-date').value;
    const label    = document.getElementById('ca-label').value.trim();
    const category = document.getElementById('ca-category').value.trim() || 'Non catégorisé';
    const amount   = parseFloat(document.getElementById('ca-amount').value);
    const msg      = document.getElementById('ca-msg');

    if (!date || !label || isNaN(amount)) { msg.textContent = 'Remplis tous les champs.'; return; }

    const { data: { user } } = await db.auth.getUser();
    await db.from('budget_transactions').insert({
      date, label, category, amount,
      account: '23071108341', account_label: 'Crédit Agricole', source: 'ca', user_id: user.id,
    });

    msg.textContent = '✓ Ajouté.';
    document.getElementById('ca-label').value = '';
    document.getElementById('ca-amount').value = '';
    document.getElementById('ca-category').value = '';
    setTimeout(() => { msg.textContent = ''; }, 2000);
    await loadAll();
  });
}

// ============================================================
// BUDGET GOALS
// ============================================================
function renderGoalsGrid() {
  const cats = [...new Set(allTransactions.map(t => t.category).filter(Boolean))].sort();
  const container = document.getElementById('goals-grid');
  if (!cats.length) {
    container.innerHTML = '<div style="color:var(--text-dim);font-size:13px;">Importez des transactions pour voir les catégories.</div>';
    return;
  }
  container.innerHTML = cats.map(cat => `
    <div class="goal-item">
      <span class="cat-dot" style="background:${catColor(cat)}"></span>
      <label>${cat}</label>
      <input type="number" class="goal-input" data-cat="${cat}" value="${allGoals[cat] || ''}" placeholder="Illimité" min="0" step="10" />
      <span style="color:var(--text-dim);font-size:12px;">€/mois</span>
    </div>`).join('');
}

document.getElementById('save-goals')?.addEventListener('click', async () => {
  const { data: { user } } = await db.auth.getUser();
  const inputs = document.querySelectorAll('.goal-input');
  const rows = [];
  inputs.forEach(inp => {
    const val = parseFloat(inp.value);
    if (!isNaN(val) && val > 0) rows.push({ category: inp.dataset.cat, monthly_limit: val, user_id: user.id });
    else if (inp.dataset.cat in allGoals) {
      db.from('budget_goals').delete().eq('category', inp.dataset.cat).eq('user_id', user.id);
    }
  });
  if (rows.length) {
    await db.from('budget_goals').upsert(rows, { onConflict: 'category,user_id' });
  }
  await loadAll();
});
