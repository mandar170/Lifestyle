// ============================================================
// HOME — animations + accès privé
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
    function resize() { canvas.width = window.innerWidth; canvas.height = window.innerHeight; }
    resize();
    window.addEventListener('resize', resize);

    const particles = Array.from({ length: 55 }, () => ({
      x: Math.random() * canvas.width,  y: Math.random() * canvas.height,
      r: Math.random() * 1.5 + 0.3,
      vx: (Math.random() - 0.5) * 0.25, vy: (Math.random() - 0.5) * 0.25,
      a: Math.random() * 0.4 + 0.1,
    }));

    (function draw() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      particles.forEach(p => {
        p.x = (p.x + p.vx + canvas.width)  % canvas.width;
        p.y = (p.y + p.vy + canvas.height) % canvas.height;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(100,220,255,${p.a})`; ctx.fill();
      });
      for (let i = 0; i < particles.length; i++)
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x, dy = particles[i].y - particles[j].y;
          const d  = Math.sqrt(dx*dx + dy*dy);
          if (d < 110) {
            ctx.beginPath(); ctx.moveTo(particles[i].x, particles[i].y); ctx.lineTo(particles[j].x, particles[j].y);
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
  // ACCÈS PRIVÉ — modal + hash SHA-256
  // ============================================================
  const modal       = document.getElementById('private-modal');
  const lockBtn     = document.getElementById('private-lock-btn');
  const closeBtn    = document.getElementById('modal-close');
  const submitBtn   = document.getElementById('private-submit');
  const pwdInput    = document.getElementById('private-pwd');
  const errorEl     = document.getElementById('private-error');
  const privateSection = document.getElementById('private-section');

  // Vérifie si déjà authentifié dans cette session
  if (sessionStorage.getItem('priv_auth') === '1') revealPrivate();

  function openModal() {
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
    setTimeout(() => pwdInput && pwdInput.focus(), 100);
  }

  function closeModal() {
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
    if (pwdInput) pwdInput.value = '';
    if (errorEl)  errorEl.textContent = '';
  }

  lockBtn  && lockBtn.addEventListener('click', openModal);
  closeBtn && closeBtn.addEventListener('click', closeModal);

  // Fermer en cliquant l'overlay
  modal && modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });

  // Fermer avec Escape
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && modal.classList.contains('open')) closeModal();
    if (e.key === 'Enter'  && modal.classList.contains('open')) checkPassword();
  });

  submitBtn && submitBtn.addEventListener('click', checkPassword);

  async function checkPassword() {
    const pwd = pwdInput ? pwdInput.value.trim() : '';
    if (!pwd) return;

    submitBtn.disabled = true;
    submitBtn.textContent = '…';

    const hash = await hashPassword(pwd);

    if (hash === PRIVATE_HASH) {
      sessionStorage.setItem('priv_auth', '1');
      revealPrivate();
      closeModal();
    } else {
      errorEl.textContent = 'Mot de passe incorrect';
      pwdInput.value = '';
      pwdInput.focus();
      // Petite animation de shake
      pwdInput.classList.add('shake');
      setTimeout(() => pwdInput.classList.remove('shake'), 500);
    }

    submitBtn.disabled = false;
    submitBtn.textContent = 'Accéder';
  }

  function revealPrivate() {
    if (!privateSection) return;
    privateSection.style.display = 'block';
    privateSection.setAttribute('aria-hidden', 'false');
    // Changer l'icône du cadenas en ouvert
    if (lockBtn) lockBtn.classList.add('unlocked');
    // Scroll reveal pour les nouvelles cartes
    privateSection.querySelectorAll('.card').forEach(el => obs.observe(el));
  }

})();
