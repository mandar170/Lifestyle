// ============================================================
// GARDE-MANGER
// ============================================================

let allItems = [];
let editingId = null;

document.addEventListener('DOMContentLoaded', async () => {
  const { data: { session } } = await db.auth.getSession();
  if (!session) { window.location.href = 'personal.html'; return; }

  initTabs();
  await loadItems();
});

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
// DATA
// ============================================================
async function loadItems() {
  const { data: { user } } = await db.auth.getUser();
  const { data } = await db.from('pantry_items').select('*').eq('user_id', user.id).order('expiry_date', { ascending: true, nullsFirst: false });
  allItems = data || [];
  renderAll();
}

function renderAll() {
  ['frigo', 'congelateur', 'placard'].forEach(loc => renderLocation(loc));
  renderStats();
}

function renderStats() {
  const total  = allItems.length;
  const frigo  = allItems.filter(i => i.location === 'frigo').length;
  const congel = allItems.filter(i => i.location === 'congelateur').length;
  const soon   = allItems.filter(i => expiryStatus(i.expiry_date) !== 'ok').length;

  document.getElementById('stat-total').textContent      = total;
  document.getElementById('stat-frigo').textContent      = frigo;
  document.getElementById('stat-congelateur').textContent = congel;
  const expEl = document.getElementById('stat-expiring');
  expEl.textContent = soon;
  expEl.style.color = soon > 0 ? '#f97316' : '#22c55e';
}

function expiryStatus(dateStr) {
  if (!dateStr) return 'ok';
  const diff = Math.ceil((new Date(dateStr) - new Date()) / 86400000);
  if (diff < 0)  return 'expired';
  if (diff <= 3) return 'urgent';
  if (diff <= 7) return 'soon';
  return 'ok';
}

function expiryLabel(dateStr) {
  if (!dateStr) return '';
  const diff = Math.ceil((new Date(dateStr) - new Date()) / 86400000);
  if (diff < 0)  return `Expiré il y a ${Math.abs(diff)}j`;
  if (diff === 0) return 'Expire aujourd\'hui';
  if (diff === 1) return 'Expire demain';
  return `${diff}j restants`;
}

function renderLocation(loc) {
  const items = allItems.filter(i => i.location === loc);
  const container = document.getElementById('items-' + loc);

  if (!items.length) {
    container.innerHTML = `<div class="pantry-empty">Aucun article. <button class="btn btn--ghost btn--sm" onclick="openAddModal('${loc}')">+ Ajouter</button></div>`;
    return;
  }

  // Group by category
  const bycat = {};
  items.forEach(item => {
    const cat = item.category || 'Autre';
    if (!bycat[cat]) bycat[cat] = [];
    bycat[cat].push(item);
  });

  container.innerHTML = Object.entries(bycat).map(([cat, catItems]) => `
    <div class="pantry-category">
      <div class="pantry-category__label">${cat}</div>
      <div class="pantry-items-row">
        ${catItems.map(item => itemCard(item)).join('')}
      </div>
    </div>`).join('');
}

function itemCard(item) {
  const status = expiryStatus(item.expiry_date);
  const label  = expiryLabel(item.expiry_date);
  const qtyStr = item.quantity != null ? `${item.quantity} ${item.unit || 'pcs'}` : '';
  return `
    <div class="pantry-item pantry-item--${status}" onclick="openEditModal('${item.id}')">
      <div class="pantry-item__name">${item.name}</div>
      ${qtyStr ? `<div class="pantry-item__qty">${qtyStr}</div>` : ''}
      ${item.notes ? `<div class="pantry-item__notes">${item.notes}</div>` : ''}
      ${label ? `<div class="pantry-item__expiry pantry-expiry--${status}">${label}</div>` : ''}
    </div>`;
}

// ============================================================
// MODAL
// ============================================================
window.openAddModal = function(loc) {
  editingId = null;
  document.getElementById('modal-title').textContent = 'Ajouter un article';
  document.getElementById('modal-id').value = '';
  document.getElementById('modal-name').value = '';
  document.getElementById('modal-location').value = loc || 'frigo';
  document.getElementById('modal-category').value = '';
  document.getElementById('modal-qty').value = '1';
  document.getElementById('modal-unit').value = 'pcs';
  document.getElementById('modal-expiry').value = '';
  document.getElementById('modal-notes').value = '';
  document.getElementById('modal-delete').style.display = 'none';
  showModal();
};

window.openEditModal = function(id) {
  const item = allItems.find(i => i.id === id);
  if (!item) return;
  editingId = id;
  document.getElementById('modal-title').textContent = 'Modifier';
  document.getElementById('modal-id').value = id;
  document.getElementById('modal-name').value = item.name || '';
  document.getElementById('modal-location').value = item.location || 'frigo';
  document.getElementById('modal-category').value = item.category || '';
  document.getElementById('modal-qty').value = item.quantity ?? 1;
  document.getElementById('modal-unit').value = item.unit || 'pcs';
  document.getElementById('modal-expiry').value = item.expiry_date || '';
  document.getElementById('modal-notes').value = item.notes || '';
  document.getElementById('modal-delete').style.display = '';
  showModal();
};

function showModal() {
  const m = document.getElementById('pantry-modal');
  m.classList.add('open');
  m.setAttribute('aria-hidden', 'false');
  setTimeout(() => document.getElementById('modal-name').focus(), 60);
}

window.closeModal = function() {
  const m = document.getElementById('pantry-modal');
  m.classList.remove('open');
  m.setAttribute('aria-hidden', 'true');
};

document.getElementById('pantry-modal')?.addEventListener('click', e => {
  if (e.target === document.getElementById('pantry-modal')) window.closeModal();
});

window.saveItem = async function() {
  const name     = document.getElementById('modal-name').value.trim();
  if (!name) { document.getElementById('modal-name').focus(); return; }

  const { data: { user } } = await db.auth.getUser();
  const payload = {
    name,
    location: document.getElementById('modal-location').value,
    category: document.getElementById('modal-category').value.trim() || null,
    quantity: parseFloat(document.getElementById('modal-qty').value) || 1,
    unit:     document.getElementById('modal-unit').value.trim() || 'pcs',
    expiry_date: document.getElementById('modal-expiry').value || null,
    notes:    document.getElementById('modal-notes').value.trim() || null,
    user_id:  user.id,
  };

  if (editingId) {
    await db.from('pantry_items').update(payload).eq('id', editingId);
  } else {
    await db.from('pantry_items').insert(payload);
  }

  window.closeModal();
  await loadItems();
};

window.deleteItem = async function() {
  if (!editingId) return;
  if (!confirm('Supprimer cet article ?')) return;
  await db.from('pantry_items').delete().eq('id', editingId);
  window.closeModal();
  await loadItems();
};

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') window.closeModal();
});
