// ============================================================
// HOME — animations + accès privé
// Les projets perso ne sont JAMAIS dans le HTML.
// Ils sont injectés par ce script uniquement après auth.
// ============================================================

(function () {

  // ---- CURSEUR ----
  const cursor    = document.getElementById('cursor');
  const cursorDot = document.getElementById('cursor-dot');
  if (cursor && cursorDot) {
    document.addEventListener('mousemove', e => {
      cursor.style.transform    = `translate(${e.clientX - 20}px, ${e.clientY - 20}px)`;
      cursorDot.style.transform = `translate(${e.clientX - 3}px, ${e.clientY - 3}px)`;
    });
    document.querySelectorAll('a, button, .card').forEach(el => {
      el.addEventListener('mouseenter', () => cursor.classList.add('hover'));
      el.addEventListener('mouseleave', () => cursor.classList.remove('hover'));
    });
  }

  // ---- PARTICULES ----
  const canvas = document.getElementById('particles');
  if (canvas) {
    const ctx = canvas.getContext('2d');
    const resize = () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight; };
    resize();
    window.addEventListener('resize', resize);
    const pts = Array.from({ length: 55 }, () => ({
      x: Math.random() * canvas.width,  y: Math.random() * canvas.height,
      r: Math.random() * 1.5 + 0.3,
      vx: (Math.random() - 0.5) * 0.25, vy: (Math.random() - 0.5) * 0.25,
      a: Math.random() * 0.4 + 0.1,
    }));
    (function draw() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      pts.forEach(p => {
        p.x = (p.x + p.vx + canvas.width)  % canvas.width;
        p.y = (p.y + p.vy + canvas.height) % canvas.height;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(100,220,255,${p.a})`; ctx.fill();
      });
      for (let i = 0; i < pts.length; i++)
        for (let j = i + 1; j < pts.length; j++) {
          const dx = pts[i].x - pts[j].x, dy = pts[i].y - pts[j].y;
          const d = Math.sqrt(dx*dx + dy*dy);
          if (d < 110) {
            ctx.beginPath(); ctx.moveTo(pts[i].x, pts[i].y); ctx.lineTo(pts[j].x, pts[j].y);
            ctx.strokeStyle = `rgba(100,220,255,${0.08*(1-d/110)})`; ctx.lineWidth = 0.5; ctx.stroke();
          }
        }
      requestAnimationFrame(draw);
    })();
  }

  // ---- SCROLL REVEAL ----
  const obs = new IntersectionObserver(
    es => es.forEach(e => { if (e.isIntersecting) e.target.classList.add('visible'); }),
    { threshold: 0.15 }
  );
  document.querySelectorAll('.reveal').forEach(el => obs.observe(el));

  // ============================================================
  // ACCÈS PRIVÉ
  // Le contenu privé n'est jamais dans le HTML — il est
  // construit ici et injecté dans #private-mount après auth.
  // ============================================================

  // Projets perso définis uniquement dans ce script
  const PRIVATE_PROJECTS = [
    {
      href:  'fitness.html',
      icon:  '🏋️',
      tag:   'Lifestyle',
      title: 'Fitness Tracker',
      desc:  'Suivi musculation (import Hevy), course à pied, mensurations, nutrition, pas quotidiens et calendrier.',
      tech:  ['Supabase', 'Chart.js', 'Hevy CSV'],
      featured: true,
    },
    // Ajoute d'autres projets perso ici :
    // { href: '...', icon: '...', tag: '...', title: '...', desc: '...', tech: [...] },
  ];

  function buildPrivateSection() {
    const cards = PRIVATE_PROJECTS.map((p, i) => `
      <a href="${p.href}" class="card ${p.featured ? 'card--featured' : ''} reveal reveal-delay-${i + 1}">
        <div class="card__icon">${p.icon}</div>
        <span class="card__tag">${p.tag}</span>
        <h3 class="card__title">${p.title}</h3>
        <p class="card__desc">${p.desc}</p>
        <div class="card__footer">
          <div class="card__tech">${p.tech.map(t => `<span>${t}</span>`).join('')}</div>
          <span class="card__link">Ouvrir →</span>
        </div>
      </a>`).join('');

    return `
      <section class="private-section">
        <div class="container">
          <div class="section__header">
            <p class="section__label section__label--private">Espace privé</p>
            <h2 class="section__title">Projets personnels</h2>
          </div>
          <div class="projects__grid">${cards}</div>
        </div>
      </section>`;
  }

  // ---- Éléments UI ----
  const modal     = document.getElementById('private-modal');
  const lockBtn   = document.getElementById('private-lock-btn');
  const closeBtn  = document.getElementById('modal-close');
  const submitBtn = document.getElementById('private-submit');
  const pwdInput  = document.getElementById('private-pwd');
  const errorEl   = document.getElementById('private-error');
  const mount     = document.getElementById('private-mount');

  // Déjà auth dans cette session ?
  if (sessionStorage.getItem('priv_auth') === '1') injectPrivate();

  const openModal  = () => { modal.classList.add('open'); modal.setAttribute('aria-hidden','false'); setTimeout(() => pwdInput?.focus(), 80); };
  const closeModal = () => { modal.classList.remove('open'); modal.setAttribute('aria-hidden','true'); if (pwdInput) pwdInput.value=''; if (errorEl) errorEl.textContent=''; };

  lockBtn?.addEventListener('click', openModal);
  closeBtn?.addEventListener('click', closeModal);
  modal?.addEventListener('click', e => { if (e.target === modal) closeModal(); });
  document.addEventListener('keydown', e => {
    if (!modal?.classList.contains('open')) return;
    if (e.key === 'Escape') closeModal();
    if (e.key === 'Enter')  verify();
  });
  submitBtn?.addEventListener('click', verify);

  async function verify() {
    const pwd = pwdInput?.value.trim() ?? '';
    if (!pwd) return;

    submitBtn.disabled    = true;
    submitBtn.textContent = '…';
    errorEl.textContent   = '';

    try {
      // SHA-256 via Web Crypto — fonctionne uniquement en HTTPS ou localhost
      const buf  = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(pwd));
      const hash = Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join('');

      if (hash === PRIVATE_HASH) {
        sessionStorage.setItem('priv_auth', '1');
        injectPrivate();
        closeModal();
        // Scroll vers la section privée
        setTimeout(() => mount?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 200);
      } else {
        errorEl.textContent = 'Mot de passe incorrect';
        pwdInput.value = '';
        pwdInput.focus();
        pwdInput.classList.add('shake');
        setTimeout(() => pwdInput.classList.remove('shake'), 500);
      }
    } catch (err) {
      // Fallback si crypto.subtle indisponible (HTTP non sécurisé)
      errorEl.textContent = 'Erreur de chiffrement — accède au site en HTTPS.';
      console.error(err);
    }

    submitBtn.disabled    = false;
    submitBtn.textContent = 'Accéder';
  }

  function injectPrivate() {
    if (!mount || mount.dataset.injected) return;
    mount.dataset.injected = '1';
    mount.innerHTML = buildPrivateSection();
    lockBtn?.classList.add('unlocked');
    // Active le scroll reveal sur les nouvelles cartes
    mount.querySelectorAll('.reveal').forEach(el => obs.observe(el));
    // Met à jour le curseur hover
    mount.querySelectorAll('a, button, .card').forEach(el => {
      el.addEventListener('mouseenter', () => cursor?.classList.add('hover'));
      el.addEventListener('mouseleave', () => cursor?.classList.remove('hover'));
    });
  }

})();
