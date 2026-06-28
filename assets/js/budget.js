// ============================================================
// BUDGET TRACKER v4
// ============================================================

let allTransactions = [];
let allGoals = {};
let allAccounts = {};
let donutChart = null;
let monthlyChart = null;
let soldeChart = null;
let currentPage = 1;
const PAGE_SIZE = 50;
let monthlyOffset = 0;
let sortCol = 'date';
let sortDir = 'desc';
let filterType = '';

const INTERNAL_CATS = new Set(['Virements internes', 'Virements envoyés', 'Virements reçus']);

// Soldes initiaux codés en dur — modifiables dans Budgets > Soldes initiaux
const DEFAULT_ACCOUNTS = {
  'BoursoBank':      { initial_balance: 972.54,  initial_balance_date: '2026-04-30' },
  'Crédit Agricole': { initial_balance: 1225.12, initial_balance_date: '2026-05-22' },
};

function loadStoredAccounts() {
  const overrides = JSON.parse(localStorage.getItem('budget_accounts') || '{}');
  return { ...DEFAULT_ACCOUNTS, ...overrides };
}

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
  Chart.defaults.color       = '#64748b';
  Chart.defaults.borderColor = 'rgba(255,255,255,0.05)';
  Chart.defaults.font.family = 'Space Grotesk';

  initTabs();
  await loadAll();
  initImport();
  initFilters();
});

// ============================================================
// DATA LOADING
// ============================================================
async function loadAll() {
  const [txRes, goalRes] = await Promise.all([
    db.from('budget_transactions').select('*').order('date', { ascending: false }),
    db.from('budget_goals').select('*'),
  ]);
  allTransactions = txRes.data || [];
  allGoals = {};
  (goalRes.data || []).forEach(g => { allGoals[g.category] = g.monthly_limit; });
  allAccounts = loadStoredAccounts();

  renderSoldesActuels();
  injectCatDatalist();
  populateMonthSelectors();
  populateSoldeAccountSelector();
  populateFilterDropdowns();
  renderStats();
  renderSolde();
  renderDonut();
  renderMonthly();
  renderCategoryBars();
  renderTransactions();
  renderGoalsGrid();
  renderAccountsGrid();
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

const MONTH_NAMES = ['Jan','Fév','Mar','Avr','Mai','Juin','Juil','Août','Sep','Oct','Nov','Déc'];

function getMonths() {
  const months = new Set(allTransactions.map(t => t.date?.slice(0, 7)));
  return [...months].sort().reverse();
}

function getSelectedMonth(prefix) {
  const year  = document.getElementById(prefix + '-year')?.value  || '';
  const month = document.getElementById(prefix + '-month-num')?.value || '';
  if (!year) return '';
  if (!month) return year;
  return `${year}-${month}`;
}

function populateMonthSelectors() {
  const months  = getMonths();
  const years   = [...new Set(months.map(m => m.slice(0, 4)))].sort().reverse();
  const curYear = currentMonth().slice(0, 4);
  const curMon  = currentMonth().slice(5, 7);

  const aYearOpts = years.map(y => `<option value="${y}" ${y === curYear ? 'selected' : ''}>${y}</option>`).join('');
  const aMonOpts  = MONTH_NAMES.map((n, i) => {
    const m = String(i + 1).padStart(2, '0');
    return `<option value="${m}" ${m === curMon ? 'selected' : ''}>${n}</option>`;
  }).join('');

  const aYear = document.getElementById('apercu-year');
  const aMon  = document.getElementById('apercu-month-num');
  if (aYear) aYear.innerHTML = aYearOpts;
  if (aMon)  aMon.innerHTML  = aMonOpts;

  const fYearOpts = years.map(y => `<option value="${y}">${y}</option>`).join('');
  const fMonOpts  = MONTH_NAMES.map((n, i) => {
    const m = String(i + 1).padStart(2, '0');
    return `<option value="${m}">${n}</option>`;
  }).join('');

  const fYear = document.getElementById('filter-year');
  const fMon  = document.getElementById('filter-month-num');
  if (fYear) fYear.innerHTML = '<option value="">Toutes années</option>' + fYearOpts;
  if (fMon)  fMon.innerHTML  = '<option value="">Tous mois</option>' + fMonOpts;
}

function populateSoldeAccountSelector() {
  const accounts = [...new Set(allTransactions.map(t => t.account_label).filter(Boolean))].sort();
  const sel = document.getElementById('solde-account');
  if (!sel) return;
  const cur = sel.value;
  sel.innerHTML = '<option value="">Tous les comptes</option>' +
    accounts.map(a => `<option value="${a}" ${a === cur ? 'selected' : ''}>${a}</option>`).join('');
}

function populateFilterDropdowns() {
  const accounts = [...new Set(allTransactions.map(t => t.account_label).filter(Boolean))].sort();
  const accSel = document.getElementById('filter-account');
  if (accSel) {
    const cur = accSel.value;
    accSel.innerHTML = '<option value="">Tous les comptes</option>' +
      accounts.map(a => `<option value="${a}" ${a === cur ? 'selected' : ''}>${a}</option>`).join('');
  }

  const cats = [...new Set(allTransactions.map(t => t.category).filter(Boolean))].sort();
  const catSel = document.getElementById('filter-cat');
  if (catSel) {
    const cur = catSel.value;
    catSel.innerHTML = '<option value="">Toutes catégories</option>' +
      cats.map(c => `<option value="${c}" ${c === cur ? 'selected' : ''}>${c}</option>`).join('');
  }
}

function injectCatDatalist() {
  const cats = [...new Set(allTransactions.map(t => t.category).filter(Boolean))].sort();
  let dl = document.getElementById('cat-datalist');
  if (!dl) { dl = document.createElement('datalist'); dl.id = 'cat-datalist'; document.body.appendChild(dl); }
  dl.innerHTML = cats.map(c => `<option value="${c}">`).join('');
}

function txForMonth(month) {
  return allTransactions.filter(t => t.date?.startsWith(month));
}

// ============================================================
// SOLDES ACTUELS (basés sur soldes initiaux + toutes transactions)
// ============================================================
function computeCurrentBalance(label) {
  const acc = allAccounts[label];
  if (!acc?.initial_balance_date) return null;
  const after = allTransactions.filter(t => t.account_label === label && t.date > acc.initial_balance_date);
  return acc.initial_balance + after.reduce((s, t) => s + t.amount, 0);
}

function renderSoldesActuels() {
  const container = document.getElementById('soldes-actuels-row');
  if (!container) return;

  const accountLabels = [...new Set(allTransactions.map(t => t.account_label).filter(Boolean))].sort();
  const cards = accountLabels.map(label => {
    const bal = computeCurrentBalance(label);
    if (bal === null) return '';
    const color = bal >= 0 ? C.green : C.red;
    return `<div class="solde-actuel-card">
      <div class="solde-actuel-card__label">${label}</div>
      <div class="solde-actuel-card__value" style="color:${color}">
        ${bal.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
      </div>
    </div>`;
  }).filter(Boolean);

  if (!cards.length) { container.innerHTML = ''; return; }

  const total = accountLabels.reduce((s, l) => {
    const b = computeCurrentBalance(l); return b !== null ? s + b : s;
  }, 0);
  const totalColor = total >= 0 ? C.cyan : C.red;

  container.innerHTML = `
    <div class="soldes-actuels-inner">
      <span class="soldes-actuels-label">Soldes actuels</span>
      <div class="soldes-actuels-cards">
        ${cards.join('')}
        <div class="solde-actuel-card solde-actuel-card--total">
          <div class="solde-actuel-card__label">Total</div>
          <div class="solde-actuel-card__value" style="color:${totalColor}">
            ${total.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
          </div>
        </div>
      </div>
    </div>`;
}

// ============================================================
// STATS
// ============================================================
function renderStats() {
  const month = getSelectedMonth('apercu') || currentMonth();
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
// SOLDE CUMULÉ
// ============================================================

// Calcule la série de soldes pour un compte sur un tableau de dates trié.
// Formule : balance(d) = B0 + cum(d) - cum(D0)
// → fonctionne pour les transactions avant ET après la date de snapshot.
function computeBalanceSeries(label, dates) {
  const acc = allAccounts[label];
  const txs = allTransactions.filter(t => t.account_label === label && t.date);

  const txByDate = {};
  txs.forEach(t => { txByDate[t.date] = (txByDate[t.date] || 0) + t.amount; });

  let running = 0;
  const cumAtDate = {};
  dates.forEach(d => { running += txByDate[d] || 0; cumAtDate[d] = running; });

  if (!acc?.initial_balance_date) {
    return dates.map(d => cumAtDate[d]);
  }

  const D0 = acc.initial_balance_date;
  const B0 = acc.initial_balance;
  const cumD0 = cumAtDate[D0] ?? 0;
  return dates.map(d => Math.round((B0 + cumAtDate[d] - cumD0) * 100) / 100);
}

function renderSolde() {
  const account = document.getElementById('solde-account')?.value || '';
  const nodata  = document.getElementById('nodata-solde');

  const accountLabels = account
    ? [account]
    : [...new Set(allTransactions.map(t => t.account_label).filter(Boolean))];

  // Collecte toutes les dates pertinentes (transactions + dates de snapshot)
  const allDatesSet = new Set();
  accountLabels.forEach(label => {
    const acc = allAccounts[label];
    if (acc?.initial_balance_date) allDatesSet.add(acc.initial_balance_date);
    allTransactions.filter(t => t.account_label === label && t.date).forEach(t => allDatesSet.add(t.date));
  });

  const dates = [...allDatesSet].sort();

  if (!dates.length) {
    nodata.style.display = 'flex';
    if (soldeChart) { soldeChart.destroy(); soldeChart = null; }
    return;
  }
  nodata.style.display = 'none';

  // Somme des soldes par compte à chaque date
  const totalByIdx = new Array(dates.length).fill(0);
  accountLabels.forEach(label => {
    const series = computeBalanceSeries(label, dates);
    series.forEach((v, i) => { totalByIdx[i] += v; });
  });

  const values = totalByIdx.map(v => Math.round(v * 100) / 100);
  const labels = dates.map(d => { const [y, m, day] = d.split('-'); return `${day}/${m}/${y.slice(2)}`; });

  const ctx = document.getElementById('chart-solde').getContext('2d');
  if (soldeChart) soldeChart.destroy();

  const gradient = ctx.createLinearGradient(0, 0, 0, 220);
  gradient.addColorStop(0, 'rgba(100,220,255,0.2)');
  gradient.addColorStop(1, 'rgba(100,220,255,0)');

  soldeChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Solde',
        data: values,
        borderColor: C.cyan,
        backgroundColor: gradient,
        borderWidth: 2,
        pointRadius: dates.length > 60 ? 0 : 3,
        pointHoverRadius: 5,
        tension: 0.3,
        fill: true,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: c => ` ${c.parsed.y.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} €` } },
      },
      scales: {
        x: { ticks: { maxTicksLimit: 10, maxRotation: 0 } },
        y: { ticks: { callback: v => v.toLocaleString('fr-FR') + ' €' } },
      },
    },
  });
}

// ============================================================
// DONUT CHART
// ============================================================
function renderDonut() {
  const month = getSelectedMonth('apercu') || currentMonth();
  const txs = txForMonth(month).filter(t => t.amount < 0 && !INTERNAL_CATS.has(t.category));

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
      responsive: true, maintainAspectRatio: false,
      layout: { padding: 10 }, cutout: '62%',
      plugins: {
        legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 }, padding: 14, color: '#94a3b8' } },
        tooltip: { callbacks: { label: c => ` ${c.label}: ${c.parsed.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} €` } },
      },
    },
  });
}

// ============================================================
// MONTHLY BAR CHART
// ============================================================
function renderMonthly() {
  const allMonths = getMonths();
  const nodata = document.getElementById('nodata-monthly');

  if (!allMonths.length) {
    nodata.style.display = 'flex';
    if (monthlyChart) { monthlyChart.destroy(); monthlyChart = null; }
    return;
  }
  nodata.style.display = 'none';

  const WINDOW = 6;
  const maxOffset = Math.max(0, allMonths.length - WINDOW);
  monthlyOffset = Math.min(Math.max(monthlyOffset, 0), maxOffset);
  const slice = allMonths.slice(monthlyOffset, monthlyOffset + WINDOW).reverse();

  document.getElementById('monthly-prev').disabled = monthlyOffset >= maxOffset;
  document.getElementById('monthly-next').disabled = monthlyOffset <= 0;

  const depenses = slice.map(m =>
    Math.abs(txForMonth(m).filter(t => t.amount < 0 && !INTERNAL_CATS.has(t.category)).reduce((s, t) => s + t.amount, 0)));
  const revenus = slice.map(m =>
    txForMonth(m).filter(t => t.amount > 0 && !INTERNAL_CATS.has(t.category)).reduce((s, t) => s + t.amount, 0));
  const labels = slice.map(m => {
    const [y, mo] = m.split('-');
    return new Date(y, mo - 1).toLocaleString('fr-FR', { month: 'short' }) + ' ' + y.slice(2);
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
      scales: { y: { beginAtZero: true, ticks: { callback: v => v.toLocaleString('fr-FR') + ' €' } } },
    },
  });
}

// ============================================================
// CATEGORY BARS
// ============================================================
function renderCategoryBars() {
  const month = getSelectedMonth('apercu') || currentMonth();
  const txs   = txForMonth(month).filter(t => t.amount < 0 && !INTERNAL_CATS.has(t.category));

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
          ${goal ? `<div class="cat-bar-goal-line" style="left:${Math.min(goal / max * 100, 100)}%"></div>` : ''}
        </div>
        <span class="cat-bar-amount" style="color:${overBudget ? C.red : color}">${amount.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} €</span>
      </div>`;
  }).join('');
}

// ============================================================
// TRANSACTIONS TABLE
// ============================================================
function renderTransactions() {
  const period  = getSelectedMonth('filter') || '';
  const account = document.getElementById('filter-account')?.value || '';
  const cat     = document.getElementById('filter-cat')?.value || '';
  const search  = (document.getElementById('filter-search')?.value || '').toLowerCase();

  let txs = allTransactions.filter(t => {
    if (period !== '' && !t.date?.startsWith(period)) return false;
    if (account && t.account_label !== account) return false;
    if (cat && t.category !== cat) return false;
    if (filterType === 'depenses' && t.amount >= 0) return false;
    if (filterType === 'revenus'  && t.amount <  0) return false;
    if (search && !t.label?.toLowerCase().includes(search) && !(t.description || '').toLowerCase().includes(search)) return false;
    return true;
  });

  txs = [...txs].sort((a, b) => {
    let av, bv;
    if      (sortCol === 'date')     { av = a.date     || ''; bv = b.date     || ''; }
    else if (sortCol === 'amount')   { av = a.amount;         bv = b.amount;         }
    else if (sortCol === 'category') { av = a.category || ''; bv = b.category || ''; }
    else if (sortCol === 'label')    { av = a.label    || ''; bv = b.label    || ''; }
    if (av < bv) return sortDir === 'asc' ? -1 :  1;
    if (av > bv) return sortDir === 'asc' ?  1 : -1;
    return 0;
  });

  document.querySelectorAll('.tx-table th.sortable').forEach(th => {
    const icon = th.querySelector('.sort-icon');
    if (!icon) return;
    icon.textContent = th.dataset.col === sortCol ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ' ↕';
  });

  const total = txs.length;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  currentPage = Math.min(currentPage, pages);
  const slice = txs.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const tbody = document.getElementById('tx-body');
  if (!slice.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="tx-empty">Aucune transaction.</td></tr>';
  } else {
    tbody.innerHTML = slice.map(t => {
      const pos   = t.amount >= 0;
      const desc  = t.description || '';
      const color = catColor(t.category || 'Autre');
      return `<tr>
        <td class="tx-date">${fmtDate(t.date)}</td>
        <td class="tx-label tx-editable" data-field="label" data-id="${t.id}" title="Cliquer pour modifier">${t.label || ''}</td>
        <td class="tx-editable" data-field="category" data-id="${t.id}" title="Cliquer pour modifier">
          <span class="tx-cat" style="border-color:${color};color:${color}">${t.category || '—'}</span>
        </td>
        <td style="color:var(--text-dim);font-size:12px;">${t.account_label || '—'}</td>
        <td class="tx-amount ${pos ? 'tx-amount--pos' : 'tx-amount--neg'}">${fmtAmount(t.amount)}</td>
        <td class="tx-note-cell" data-id="${t.id}">
          <span class="tx-note-text ${!desc ? 'tx-note-empty' : ''}">${desc || '+'}</span>
        </td>
      </tr>`;
    }).join('');

    tbody.querySelectorAll('.tx-editable').forEach(cell => {
      cell.addEventListener('click', () => startEditField(cell));
    });
    tbody.querySelectorAll('.tx-note-cell').forEach(cell => {
      cell.addEventListener('click', () => startEditNote(cell));
    });
  }

  const pag = document.getElementById('tx-pagination');
  if (pages <= 1) { pag.innerHTML = ''; return; }
  pag.innerHTML = `
    <button onclick="goPage(${currentPage - 1})" ${currentPage <= 1 ? 'disabled' : ''} class="btn btn--ghost btn--sm">←</button>
    <span style="color:var(--text-muted);font-size:13px;">Page ${currentPage} / ${pages} (${total} transactions)</span>
    <button onclick="goPage(${currentPage + 1})" ${currentPage >= pages ? 'disabled' : ''} class="btn btn--ghost btn--sm">→</button>`;
}

function goPage(n) { currentPage = n; renderTransactions(); }
window.goPage = goPage;

function startEditField(cell) {
  if (cell.querySelector('input')) return;
  const id    = cell.dataset.id;
  const field = cell.dataset.field;
  const tx    = allTransactions.find(t => t.id === id);
  const prev  = tx?.[field] || '';

  const input = document.createElement('input');
  input.type = 'text';
  input.value = prev;
  input.className = 'tx-note-input';
  if (field === 'category') input.setAttribute('list', 'cat-datalist');
  cell.innerHTML = '';
  cell.appendChild(input);
  input.focus();
  input.select();

  const save = async () => {
    const val = input.value.trim() || prev;
    await db.from('budget_transactions').update({ [field]: val }).eq('id', id);
    if (tx) tx[field] = val;
    if (field === 'category') injectCatDatalist();
    renderTransactions();
  };
  input.addEventListener('blur', save);
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter')  input.blur();
    if (e.key === 'Escape') { if (tx) tx[field] = prev; renderTransactions(); }
  });
}

function startEditNote(cell) {
  if (cell.querySelector('input')) return;
  const id = cell.dataset.id;
  const tx = allTransactions.find(t => t.id === id);
  const prev = tx?.description || '';

  const input = document.createElement('input');
  input.type = 'text';
  input.value = prev;
  input.className = 'tx-note-input';
  input.placeholder = 'Ajouter une note…';
  cell.innerHTML = '';
  cell.appendChild(input);
  input.focus();

  const save = async () => {
    const val = input.value.trim();
    await db.from('budget_transactions').update({ description: val }).eq('id', id);
    if (tx) tx.description = val;
    renderTransactions();
  };
  input.addEventListener('blur', save);
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter')  input.blur();
    if (e.key === 'Escape') { if (tx) tx.description = prev; renderTransactions(); }
  });
}

function initFilters() {
  ['filter-year', 'filter-month-num', 'filter-account', 'filter-cat'].forEach(id => {
    document.getElementById(id)?.addEventListener('change', () => { currentPage = 1; renderTransactions(); });
  });
  document.getElementById('filter-search')?.addEventListener('input', () => { currentPage = 1; renderTransactions(); });

  document.querySelectorAll('.filter-type-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filter-type-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      filterType = btn.dataset.type;
      currentPage = 1;
      renderTransactions();
    });
  });

  document.querySelectorAll('.tx-table th.sortable').forEach(th => {
    th.style.cursor = 'pointer';
    th.addEventListener('click', () => {
      const col = th.dataset.col;
      if (sortCol === col) sortDir = sortDir === 'asc' ? 'desc' : 'asc';
      else { sortCol = col; sortDir = col === 'date' ? 'desc' : 'asc'; }
      renderTransactions();
    });
  });

  ['apercu-year', 'apercu-month-num'].forEach(id => {
    document.getElementById(id)?.addEventListener('change', () => {
      renderStats(); renderDonut(); renderCategoryBars();
    });
  });

  document.getElementById('monthly-prev')?.addEventListener('click', () => { monthlyOffset++; renderMonthly(); });
  document.getElementById('monthly-next')?.addEventListener('click', () => { monthlyOffset = Math.max(0, monthlyOffset - 1); renderMonthly(); });
  document.getElementById('solde-account')?.addEventListener('change', renderSolde);
}

// ============================================================
// IMPORT — CSV UNIVERSEL
// ============================================================
let pendingImport = [];

function parseUniversalCSV(text) {
  const result = Papa.parse(text, {
    header: true,
    delimiter: ',',
    skipEmptyLines: 'greedy',
    transformHeader: h => h.trim().toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, ''),
  });

  return result.data.map(row => {
    const date          = (row.date        || '').trim();
    const label         = (row.intitule    || row.label   || '').trim();
    const category      = (row.categorie   || row.category || '').trim() || 'Non catégorisé';
    const account_label = (row.compte      || row.account_label || '').trim() || 'Autre';
    const rawAmount     = (row.montant     || row.amount  || '').trim().replace(',', '.');
    const amount        = parseFloat(rawAmount);
    const description   = (row.description || row.note   || '').trim();

    if (!date || isNaN(amount)) return null;
    return { date, label, category, account_label, amount, description, source: 'csv' };
  }).filter(Boolean);
}

function initImport() {
  const fileInput = document.getElementById('file-universal');
  const dropZone  = document.getElementById('drop-universal');

  fileInput?.addEventListener('change', e => {
    const f = e.target.files[0]; if (!f) return;
    readAndPreview(f);
    e.target.value = '';
  });

  ['dragover', 'dragenter'].forEach(ev =>
    dropZone?.addEventListener(ev, e => { e.preventDefault(); dropZone.classList.add('drop-zone--active'); }));
  ['dragleave', 'drop'].forEach(ev =>
    dropZone?.addEventListener(ev, e => { e.preventDefault(); dropZone.classList.remove('drop-zone--active'); }));
  dropZone?.addEventListener('drop', e => {
    const f = e.dataTransfer.files[0]; if (!f) return;
    readAndPreview(f);
  });

  document.getElementById('confirm-import')?.addEventListener('click', async () => {
    if (!pendingImport.length) return;
    const btn = document.getElementById('confirm-import');
    btn.textContent = 'Import…'; btn.disabled = true;
    const { inserted, skipped } = await importRows(pendingImport);
    btn.textContent = 'Importer'; btn.disabled = false;
    document.getElementById('preview-universal').hidden = true;
    pendingImport = [];
    showImportResult(
      `✓ ${inserted} transaction${inserted > 1 ? 's' : ''} importée${inserted > 1 ? 's' : ''}` +
      (skipped ? `, ${skipped} doublon${skipped > 1 ? 's' : ''} ignoré${skipped > 1 ? 's' : ''}.` : '.'),
      C.green);
    await loadAll();
  });

  document.getElementById('cancel-import')?.addEventListener('click', () => {
    document.getElementById('preview-universal').hidden = true;
    pendingImport = [];
    document.getElementById('import-result').textContent = '';
  });

  document.getElementById('btn-clear-data')?.addEventListener('click', async () => {
    if (!confirm('Supprimer TOUTES les transactions ? Cette action est irréversible.')) return;
    await db.from('budget_transactions').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    showImportResult('Toutes les transactions ont été supprimées.', C.orange);
    await loadAll();
  });
}

function readAndPreview(file) {
  document.getElementById('import-result').textContent = '';
  const r = new FileReader();
  r.onload = ev => {
    pendingImport = parseUniversalCSV(ev.target.result);
    if (!pendingImport.length) {
      showImportResult('Aucune transaction lisible. Vérifiez le format CSV.', C.red);
      return;
    }
    showUniversalPreview(pendingImport);
  };
  r.readAsText(file, 'UTF-8');
}

function showImportResult(msg, color) {
  const el = document.getElementById('import-result');
  el.textContent = msg;
  el.style.color = color || 'var(--text-muted)';
}

function showUniversalPreview(rows) {
  const tbody = document.getElementById('preview-universal-body');
  tbody.innerHTML = rows.slice(0, 20).map(t => {
    const pos = t.amount >= 0;
    return `<tr>
      <td class="tx-date">${fmtDate(t.date)}</td>
      <td class="tx-label">${t.label}</td>
      <td>${t.category || '—'}</td>
      <td style="color:var(--text-dim);font-size:12px;">${t.account_label}</td>
      <td class="tx-amount ${pos ? 'tx-amount--pos' : 'tx-amount--neg'}">${fmtAmount(t.amount)}</td>
    </tr>`;
  }).join('');
  document.getElementById('preview-universal-count').textContent =
    `${rows.length} transaction${rows.length > 1 ? 's' : ''} détectée${rows.length > 1 ? 's' : ''}` +
    (rows.length > 20 ? ' (aperçu : 20 premières)' : '');
  document.getElementById('preview-universal').hidden = false;
}

async function importRows(rows) {
  let inserted = 0;
  let skipped  = 0;

  for (let i = 0; i < rows.length; i += 200) {
    const batch = rows.slice(i, i + 200);
    const { data } = await db
      .from('budget_transactions')
      .upsert(batch, { onConflict: 'date,label,amount,account_label', ignoreDuplicates: true })
      .select('id');
    inserted += data?.length || 0;
    skipped  += batch.length - (data?.length || 0);
  }
  return { inserted, skipped };
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
  const rows = [];
  document.querySelectorAll('.goal-input').forEach(inp => {
    const val = parseFloat(inp.value);
    if (!isNaN(val) && val > 0) rows.push({ category: inp.dataset.cat, monthly_limit: val });
    else if (inp.dataset.cat in allGoals) db.from('budget_goals').delete().eq('category', inp.dataset.cat);
  });
  if (rows.length) await db.from('budget_goals').upsert(rows, { onConflict: 'category' });
  await loadAll();
});

// ============================================================
// ACCOUNTS — Soldes initiaux
// ============================================================
function renderAccountsGrid() {
  const accountLabels = [...new Set(allTransactions.map(t => t.account_label).filter(Boolean))].sort();
  const container = document.getElementById('accounts-grid');
  if (!container) return;
  if (!accountLabels.length) {
    container.innerHTML = '<div style="color:var(--text-dim);font-size:13px;">Importez des transactions pour voir les comptes.</div>';
    return;
  }
  container.innerHTML = accountLabels.map(label => {
    const acc = allAccounts[label] || {};
    return `
      <div class="account-item">
        <div class="account-item__label">${label}</div>
        <div class="account-item__fields">
          <div style="display:flex;flex-direction:column;gap:4px;">
            <label style="font-size:11px;color:var(--text-dim);">Solde initial (€)</label>
            <input type="number" class="account-balance-input" data-account="${label}"
              value="${acc.initial_balance ?? ''}" placeholder="0.00" step="0.01" style="width:130px;" />
          </div>
          <div style="display:flex;flex-direction:column;gap:4px;">
            <label style="font-size:11px;color:var(--text-dim);">Date du solde</label>
            <input type="date" class="account-date-input" data-account="${label}"
              value="${acc.initial_balance_date ?? ''}" style="width:150px;" />
          </div>
        </div>
      </div>`;
  }).join('');
}

document.getElementById('save-accounts')?.addEventListener('click', async () => {
  const overrides = JSON.parse(localStorage.getItem('budget_accounts') || '{}');
  document.querySelectorAll('.account-balance-input').forEach(inp => {
    const label  = inp.dataset.account;
    const bal    = parseFloat(inp.value);
    const dateEl = document.querySelector(`.account-date-input[data-account="${label}"]`);
    const date   = dateEl?.value || null;
    if (!isNaN(bal) && date) {
      overrides[label] = { initial_balance: bal, initial_balance_date: date };
    }
  });
  localStorage.setItem('budget_accounts', JSON.stringify(overrides));
  allAccounts = loadStoredAccounts();
  renderSolde();
  const btn = document.getElementById('save-accounts');
  const orig = btn.textContent;
  btn.textContent = '✓ Sauvegardé';
  setTimeout(() => { btn.textContent = orig; }, 1500);
});
