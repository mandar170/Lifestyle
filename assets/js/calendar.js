// ============================================================
// CALENDRIER INTERACTIF
// Affiche : séances muscu, course, + événements personnels
// ============================================================

const CAL = (() => {

  let currentYear  = new Date().getFullYear();
  let currentMonth = new Date().getMonth(); // 0-based

  // Cache des données chargées pour le mois affiché
  let cacheKey    = null;
  let cachedData  = null;

  const DAYS_FR   = ['Lun','Mar','Mer','Jeu','Ven','Sam','Dim'];
  const MONTHS_FR = ['Janvier','Février','Mars','Avril','Mai','Juin',
                     'Juillet','Août','Septembre','Octobre','Novembre','Décembre'];

  const TYPE_COLORS = {
    workout:     { dot: '#64dcff', bg: 'rgba(100,220,255,0.12)', border: 'rgba(100,220,255,0.3)' },
    run:         { dot: '#22d3ee', bg: 'rgba(34,211,238,0.12)',  border: 'rgba(34,211,238,0.3)' },
    note:        { dot: '#94a3b8', bg: 'rgba(148,163,184,0.1)',  border: 'rgba(148,163,184,0.25)' },
    goal:        { dot: '#facc15', bg: 'rgba(250,204,21,0.12)',  border: 'rgba(250,204,21,0.3)' },
    rest:        { dot: '#4ade80', bg: 'rgba(74,222,128,0.1)',   border: 'rgba(74,222,128,0.25)' },
    competition: { dot: '#f97316', bg: 'rgba(249,115,22,0.15)',  border: 'rgba(249,115,22,0.35)' },
    other:       { dot: '#a855f7', bg: 'rgba(168,85,247,0.12)', border: 'rgba(168,85,247,0.3)' },
  };

  // ---- Init ----
  function init() {
    document.getElementById('cal-prev')?.addEventListener('click', () => navigate(-1));
    document.getElementById('cal-next')?.addEventListener('click', () => navigate(1));
    document.getElementById('cal-today')?.addEventListener('click', () => {
      currentYear  = new Date().getFullYear();
      currentMonth = new Date().getMonth();
      render();
    });

    // Ouvrir le calendrier au clic sur l'onglet
    document.querySelector('[data-tab="calendar"]')?.addEventListener('click', () => {
      if (!document.getElementById('cal-grid').children.length) render();
    });

    initEventModal();
  }

  function navigate(dir) {
    currentMonth += dir;
    if (currentMonth > 11) { currentMonth = 0;  currentYear++; }
    if (currentMonth < 0)  { currentMonth = 11; currentYear--; }
    render();
  }

  // ---- Rendu principal ----
  async function render() {
    document.getElementById('cal-title').textContent =
      `${MONTHS_FR[currentMonth]} ${currentYear}`;

    const key = `${currentYear}-${currentMonth}`;
    if (key !== cacheKey) {
      cachedData = await fetchMonthData(currentYear, currentMonth);
      cacheKey   = key;
    }

    buildGrid(cachedData);
  }

  // ---- Fetch données du mois ----
  async function fetchMonthData(year, month) {
    const firstDay = `${year}-${String(month+1).padStart(2,'0')}-01`;
    const lastDay  = new Date(year, month+1, 0).toISOString().split('T')[0];

    const [workoutsRes, runsRes, eventsRes] = await Promise.all([
      db.from('workout_sets')
        .select('workout_date, workout_title')
        .gte('workout_date', firstDay)
        .lte('workout_date', lastDay),
      db.from('running_sessions')
        .select('date, distance_km, session_type, avg_pace_seconds')
        .gte('date', firstDay)
        .lte('date', lastDay),
      db.from('calendar_events')
        .select('id, date, title, type, notes')
        .gte('date', firstDay)
        .lte('date', lastDay),
    ]);

    // Regrouper par date
    const map = {};

    // Séances muscu — une entrée par (date, titre de séance)
    const seenWorkouts = new Set();
    (workoutsRes.data || []).forEach(w => {
      const k = `${w.workout_date}|${w.workout_title}`;
      if (seenWorkouts.has(k)) return;
      seenWorkouts.add(k);
      if (!map[w.workout_date]) map[w.workout_date] = [];
      map[w.workout_date].push({ type: 'workout', label: w.workout_title, readonly: true });
    });

    // Séances course
    (runsRes.data || []).forEach(r => {
      if (!map[r.date]) map[r.date] = [];
      const pace = r.avg_pace_seconds ? formatPace(r.avg_pace_seconds) + '/km' : '';
      map[r.date].push({
        type: 'run',
        label: `${r.distance_km.toFixed(1)} km${pace ? ' · ' + pace : ''}`,
        subtype: r.session_type,
        readonly: true,
      });
    });

    // Événements personnels
    (eventsRes.data || []).forEach(e => {
      if (!map[e.date]) map[e.date] = [];
      map[e.date].push({ type: e.type, label: e.title, notes: e.notes, id: e.id, readonly: false });
    });

    return map;
  }

  // ---- Construction de la grille ----
  function buildGrid(data) {
    const grid    = document.getElementById('cal-grid');
    const today   = new Date().toISOString().split('T')[0];
    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();

    // Jour de la semaine du 1er (lundi = 0)
    let startDow = new Date(currentYear, currentMonth, 1).getDay();
    startDow = startDow === 0 ? 6 : startDow - 1;

    grid.innerHTML = '';

    // Cases vides avant le 1er
    for (let i = 0; i < startDow; i++) {
      const empty = document.createElement('div');
      empty.className = 'cal-cell cal-cell--empty';
      grid.appendChild(empty);
    }

    // Jours du mois
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${currentYear}-${String(currentMonth+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
      const events  = data[dateStr] || [];
      const isToday = dateStr === today;

      const cell = document.createElement('div');
      cell.className = 'cal-cell' + (isToday ? ' cal-cell--today' : '');
      cell.dataset.date = dateStr;

      // Numéro du jour
      const num = document.createElement('span');
      num.className = 'cal-day-num';
      num.textContent = d;
      cell.appendChild(num);

      // Événements (max 3 visibles + badge "+N")
      const MAX_VISIBLE = 3;
      events.slice(0, MAX_VISIBLE).forEach(ev => {
        cell.appendChild(buildEventChip(ev));
      });
      if (events.length > MAX_VISIBLE) {
        const more = document.createElement('span');
        more.className = 'cal-more';
        more.textContent = `+${events.length - MAX_VISIBLE}`;
        cell.appendChild(more);
      }

      // Clic sur la cellule → ouvrir modal pour ajouter
      cell.addEventListener('click', e => {
        if (e.target.closest('.cal-chip[data-id]')) return; // géré par le chip
        openEventModal(dateStr, null);
      });

      grid.appendChild(cell);
    }
  }

  function buildEventChip(ev) {
    const chip = document.createElement('div');
    const col  = TYPE_COLORS[ev.type] || TYPE_COLORS.other;
    chip.className = 'cal-chip';
    chip.style.cssText = `background:${col.bg};border-color:${col.border};`;

    const dot = document.createElement('span');
    dot.className = 'cal-chip-dot';
    dot.style.background = col.dot;

    const label = document.createElement('span');
    label.className = 'cal-chip-label';
    label.textContent = ev.label;

    chip.appendChild(dot);
    chip.appendChild(label);

    if (!ev.readonly) {
      chip.dataset.id    = ev.id;
      chip.dataset.type  = ev.type;
      chip.dataset.title = ev.label;
      chip.dataset.notes = ev.notes || '';
      chip.addEventListener('click', e => {
        e.stopPropagation();
        openEventModal(chip.closest('.cal-cell').dataset.date, ev);
      });
      chip.title = 'Cliquer pour modifier';
    } else {
      chip.style.cursor = 'default';
      chip.title = ev.label;
    }

    return chip;
  }

  // ---- Modal événement ----
  function initEventModal() {
    const modal     = document.getElementById('event-modal');
    const closeBtn  = document.getElementById('event-modal-close');
    const form      = document.getElementById('event-form');
    const deleteBtn = document.getElementById('event-delete-btn');

    closeBtn?.addEventListener('click',  closeEventModal);
    modal?.addEventListener('click', e => { if (e.target === modal) closeEventModal(); });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && modal?.classList.contains('open')) closeEventModal();
    });

    form?.addEventListener('submit', async e => {
      e.preventDefault();
      const id    = document.getElementById('event-id').value;
      const entry = {
        date:  document.getElementById('event-date').value,
        title: document.getElementById('event-title-input').value.trim(),
        type:  document.getElementById('event-type-input').value,
        notes: document.getElementById('event-notes-input').value.trim() || null,
      };
      if (!entry.title) return;

      let error;
      if (id) {
        ({ error } = await db.from('calendar_events').update(entry).eq('id', id));
      } else {
        ({ error } = await db.from('calendar_events').insert(entry));
      }

      if (error) { showToast(`Erreur : ${error.message}`, 'error'); return; }
      showToast(id ? 'Événement modifié' : 'Événement ajouté', 'success');
      closeEventModal();
      await invalidateAndRender();
    });

    deleteBtn?.addEventListener('click', async () => {
      const id = document.getElementById('event-id').value;
      if (!id) return;
      const { error } = await db.from('calendar_events').delete().eq('id', id);
      if (error) { showToast(`Erreur : ${error.message}`, 'error'); return; }
      showToast('Événement supprimé', 'success');
      closeEventModal();
      await invalidateAndRender();
    });
  }

  function openEventModal(dateStr, ev) {
    const modal       = document.getElementById('event-modal');
    const title       = document.getElementById('event-modal-title');
    const dateLabel   = document.getElementById('event-modal-date');
    const idInput     = document.getElementById('event-id');
    const dateInput   = document.getElementById('event-date');
    const titleInput  = document.getElementById('event-title-input');
    const typeInput   = document.getElementById('event-type-input');
    const notesInput  = document.getElementById('event-notes-input');
    const deleteBtn   = document.getElementById('event-delete-btn');

    // Formatter la date en français
    const d = new Date(dateStr + 'T12:00:00');
    dateLabel.textContent = d.toLocaleDateString('fr-FR', { weekday:'long', day:'numeric', month:'long', year:'numeric' });

    if (ev) {
      title.textContent       = 'Modifier l\'événement';
      idInput.value           = ev.id;
      titleInput.value        = ev.label;
      typeInput.value         = ev.type;
      notesInput.value        = ev.notes || '';
      deleteBtn.style.display = 'block';
    } else {
      title.textContent       = 'Nouvel événement';
      idInput.value           = '';
      titleInput.value        = '';
      typeInput.value         = 'note';
      notesInput.value        = '';
      deleteBtn.style.display = 'none';
    }

    dateInput.value = dateStr;
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
    setTimeout(() => titleInput.focus(), 80);
  }

  function closeEventModal() {
    const modal = document.getElementById('event-modal');
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
  }

  async function invalidateAndRender() {
    cacheKey = null;
    await render();
  }

  // ---- Utils ----
  function formatPace(s) {
    return `${Math.floor(s/60)}'${String(Math.round(s%60)).padStart(2,'0')}"`;
  }

  function showToast(msg, type = 'success') {
    const t = document.createElement('div');
    t.className = `toast toast--${type}`;
    t.textContent = msg;
    document.body.appendChild(t);
    requestAnimationFrame(() => t.classList.add('show'));
    setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 400); }, 3200);
  }

  return { init, render };
})();

document.addEventListener('DOMContentLoaded', () => CAL.init());
