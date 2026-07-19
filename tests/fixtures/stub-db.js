// Minimal in-memory stand-in for the Supabase postgrest client, for offline
// testing. Loaded in place of assets/js/config.js: it defines the same global
// `db` the app uses, backed by an in-memory STORE the specs can seed/inspect
// via window.__STORE.
const STORE = {
  meals: [],
  meal_plans: [],
  meal_food_items: [],
  meal_substitute_entries: [],
  foods: [
    { id: 'f1', name: 'Poulet', unit: 'g', calories_per_100g: 165, protein_per_100g: 31, carbs_per_100g: 0, fat_per_100g: 3.6, fiber_per_100g: 0 },
    { id: 'f2', name: 'Riz',    unit: 'g', calories_per_100g: 130, protein_per_100g: 2.7, carbs_per_100g: 28, fat_per_100g: 0.3, fiber_per_100g: 0.4 },
    { id: 'f3', name: 'Barre praliné', unit: 'unité', calories_per_100g: 108, protein_per_100g: 8.2, carbs_per_100g: 9.9, fat_per_100g: 4.2, fiber_per_100g: 5.4 },
    { id: 'f4', name: 'Flan patissier vanille', unit: 'unité', calories_per_100g: 84, protein_per_100g: 18.0, carbs_per_100g: 1.3, fat_per_100g: 0.7, fiber_per_100g: 0.6 },
  ],
  food_tags: [
    { id: 't1', name: 'Substitut', color: '#7c3a04' },
  ],
  food_tag_links: [
    { food_id: 'f3', tag_id: 't1' },
    { food_id: 'f4', tag_id: 't1' },
  ],
  pantry_items: [
    { id: 'p1', item_type: 'food', food_id: 'f1', name: 'Poulet', quantity: 100, unit: 'g' },
  ],
  food_equivalences: [],
  nutrition_goals: [
    { id: 'g1', calories: 2000, protein_g: 150, carbs_g: 200, fat_g: 70, fiber_g: 30, substitute_target: 4, created_at: '2026-01-01' },
  ],
  nutrition: [],
  daily_water: [],
  meal_substitutes: [],
};
let idCounter = 1;
function genId() { return 'id' + (idCounter++); }

function matchFilters(row, filters) {
  return filters.every(f => {
    if (f.op === 'eq') return row[f.col] === f.val;
    if (f.op === 'gte') return row[f.col] >= f.val;
    if (f.op === 'lte') return row[f.col] <= f.val;
    if (f.op === 'not_is_null') return row[f.col] != null;
    return true;
  });
}

class QueryBuilder {
  constructor(table) {
    this.table = table;
    this.filters = [];
    this._single = false;
    this._maybeSingle = false;
    this._order = null;
    this._limit = null;
    this._mode = 'select';
    this._payload = null;
    this._onConflict = null;
  }
  select() { return this; }
  eq(col, val)  { this.filters.push({ op: 'eq',  col, val }); return this; }
  gte(col, val) { this.filters.push({ op: 'gte', col, val }); return this; }
  lte(col, val) { this.filters.push({ op: 'lte', col, val }); return this; }
  not(col)      { this.filters.push({ op: 'not_is_null', col }); return this; }
  order()  { return this; }
  limit(n) { this._limit = n; return this; }
  single()      { this._single = true; return this; }
  maybeSingle() { this._maybeSingle = true; return this; }
  insert(payload) { this._mode = 'insert'; this._payload = payload; return this; }
  update(payload) { this._mode = 'update'; this._payload = payload; return this; }
  upsert(payload, opts) { this._mode = 'upsert'; this._payload = payload; this._onConflict = opts?.onConflict; return this; }
  delete() { this._mode = 'delete'; return this; }

  _exec() {
    const clone = (x) => JSON.parse(JSON.stringify(x));
    const store = STORE[this.table] || (STORE[this.table] = []);
    if (this._mode === 'select') {
      let rows = store.filter(r => matchFilters(r, this.filters));
      if (this._order === 'created_at_desc') rows = rows.slice().sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
      if (this._limit) rows = rows.slice(0, this._limit);
      if (this._single)      return { data: rows[0] ? clone(rows[0]) : null, error: rows[0] ? null : { message: 'not found' } };
      if (this._maybeSingle) return { data: rows[0] ? clone(rows[0]) : null, error: null };
      return { data: clone(rows), error: null };
    }
    if (this._mode === 'insert') {
      const items = Array.isArray(this._payload) ? this._payload : [this._payload];
      const inserted = items.map(item => ({ id: genId(), created_at: '2026-01-01', ...item }));
      store.push(...inserted);
      return this._single ? { data: clone(inserted[0]), error: null } : { data: clone(inserted), error: null };
    }
    if (this._mode === 'update') {
      const rows = store.filter(r => matchFilters(r, this.filters));
      rows.forEach(r => Object.assign(r, this._payload));
      return { data: clone(rows), error: null };
    }
    if (this._mode === 'delete') {
      const toDelete = store.filter(r => matchFilters(r, this.filters));
      toDelete.forEach(r => { const idx = store.indexOf(r); if (idx >= 0) store.splice(idx, 1); });
      return { data: clone(toDelete), error: null };
    }
    if (this._mode === 'upsert') {
      const items = Array.isArray(this._payload) ? this._payload : [this._payload];
      const conflictCols = (this._onConflict || '').split(',').filter(Boolean);
      const results = items.map(item => {
        let existing = null;
        if (conflictCols.length) existing = store.find(r => conflictCols.every(c => r[c] === item[c]));
        if (existing) { Object.assign(existing, item); return existing; }
        const row = { id: genId(), created_at: '2026-01-01', ...item };
        store.push(row);
        return row;
      });
      return this._single ? { data: clone(results[0]), error: null } : { data: clone(results), error: null };
    }
  }
  then(resolve, reject) {
    try { resolve(this._exec()); } catch (e) { reject ? reject(e) : console.error(e); }
  }
}

function rpcCall(name, params) {
  return {
    then(resolve, reject) {
      try {
        if (name === 'adjust_pantry_quantity') {
          // Mirrors the Postgres function: atomic +/- with a clamp at zero.
          const row = STORE.pantry_items.find(r => r.id === params.p_item_id);
          if (!row) return resolve({ data: null, error: null });
          row.quantity = Math.max(0, (Number(row.quantity) || 0) + Number(params.p_delta));
          return resolve({ data: row.quantity, error: null });
        }
        resolve({ data: null, error: { message: 'unknown rpc ' + name } });
      } catch (e) { reject ? reject(e) : console.error(e); }
    },
  };
}

window.db = { from(table) { return new QueryBuilder(table); }, rpc(name, params) { return rpcCall(name, params); } };
window.__STORE = STORE; // exposed for test inspection
