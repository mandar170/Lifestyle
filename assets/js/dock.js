const DOCK_PAGES = ['lifestyle.html', 'nutrition.html', 'budget.html'];
const DOCK_STORAGE_KEY = 'mandar170_dock_last';
const DOCK_DEFAULT = 'lifestyle.html';

function dockNavigate(page) {
  const frame = document.getElementById('dock-frame');
  if (frame.getAttribute('src') !== page) frame.setAttribute('src', page);
  localStorage.setItem(DOCK_STORAGE_KEY, page);
  setActiveDockItem(page);
}

function setActiveDockItem(page) {
  document.querySelectorAll('.dock__item[data-page]').forEach(el => {
    el.classList.toggle('dock__item--active', el.dataset.page === page);
  });
}

document.addEventListener('DOMContentLoaded', () => {
  let stored = null;
  try { stored = localStorage.getItem(DOCK_STORAGE_KEY); } catch (e) { /* private mode / storage disabled */ }
  const initial = DOCK_PAGES.includes(stored) ? stored : DOCK_DEFAULT;
  dockNavigate(initial);
});
