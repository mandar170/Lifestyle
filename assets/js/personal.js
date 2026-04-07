// ============================================================
// PERSONAL HUB — auth gate
// ============================================================
(function () {
  const gate      = document.getElementById('auth-gate');
  const hub       = document.getElementById('personal-hub');
  const pwdInput  = document.getElementById('auth-pwd');
  const submitBtn = document.getElementById('auth-submit');
  const errorEl   = document.getElementById('auth-error');
  const logoutBtn = document.getElementById('logout-btn');

  // Particules sur l'auth gate
  const canvas = document.getElementById('particles-auth');
  if (canvas) {
    const ctx = canvas.getContext('2d');
    const resize = () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight; };
    resize(); window.addEventListener('resize', resize);
    const pts = Array.from({ length: 40 }, () => ({
      x: Math.random() * canvas.width, y: Math.random() * canvas.height,
      r: Math.random() * 1.2 + 0.3,
      vx: (Math.random() - 0.5) * 0.2, vy: (Math.random() - 0.5) * 0.2,
      a: Math.random() * 0.3 + 0.08,
    }));
    (function draw() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      pts.forEach(p => {
        p.x = (p.x + p.vx + canvas.width) % canvas.width;
        p.y = (p.y + p.vy + canvas.height) % canvas.height;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(100,220,255,${p.a})`; ctx.fill();
      });
      requestAnimationFrame(draw);
    })();
  }

  function showHub() {
    gate.style.display = 'none';
    hub.hidden = false;
  }

  // Vérifier session existante
  db.auth.getSession().then(({ data: { session } }) => {
    if (session) showHub();
  });

  async function login() {
    const pwd = pwdInput.value.trim();
    if (!pwd) return;
    submitBtn.disabled = true;
    submitBtn.textContent = '…';
    errorEl.textContent = '';

    const { error } = await db.auth.signInWithPassword({
      email: 'me@mandar170.fr',
      password: pwd,
    });

    if (error) {
      errorEl.textContent = 'Mot de passe incorrect.';
      pwdInput.value = '';
      pwdInput.focus();
      pwdInput.classList.add('shake');
      setTimeout(() => pwdInput.classList.remove('shake'), 500);
    } else {
      showHub();
    }
    submitBtn.disabled = false;
    submitBtn.textContent = 'Accéder';
  }

  submitBtn?.addEventListener('click', login);
  pwdInput?.addEventListener('keydown', e => { if (e.key === 'Enter') login(); });

  logoutBtn?.addEventListener('click', async () => {
    await db.auth.signOut();
    hub.hidden = true;
    gate.style.display = '';
    pwdInput.value = '';
  });
})();
