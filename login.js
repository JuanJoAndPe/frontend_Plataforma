document.addEventListener('DOMContentLoaded', () => {

  // =========================
  // Config
  // =========================
  const API_BASE = "https://backend-plataforma-ftw7.onrender.com";

  // =========================
  // Elementos base
  // =========================
  const loginContainer = document.getElementById('login-container');
  const appContainer = document.getElementById('app-container');
  const logo = document.getElementById('logo');

  // =========================
  // Navegación
  // =========================
  const navCotizador = document.getElementById('nav-cotizador');
  const navPrecalificacion = document.getElementById('nav-precalificacion');
  const viewCotizador = document.getElementById('view-cotizador');
  const viewPrecalificacion = document.getElementById('view-precalificacion');
  const viewTitle = document.getElementById('view-title');

  function setActiveNav(activeBtn) {
    [navCotizador, navPrecalificacion].forEach(btn =>
      btn && btn.classList.remove('is-active')
    );
    if (activeBtn) activeBtn.classList.add('is-active');
  }

  function setView(viewName) {
    const name = viewName === 'precalificacion' ? 'precalificacion' : 'cotizador';
    localStorage.setItem('active_view', name);

    if (name === 'precalificacion') {
      viewCotizador.style.display = 'none';
      viewPrecalificacion.style.display = 'block';
      if (viewTitle) viewTitle.textContent = 'Precalificación';
      setActiveNav(navPrecalificacion);
    } else {
      viewPrecalificacion.style.display = 'none';
      viewCotizador.style.display = 'block';
      if (viewTitle) viewTitle.textContent = 'Cotizador';
      setActiveNav(navCotizador);
    }
  }

  // =========================
  // Auth
  // =========================
  function showApp() {
    loginContainer.style.display = 'none';
    appContainer.style.display = 'flex';
    logo.style.display = 'none';

    const last = localStorage.getItem('active_view') || 'cotizador';
    setView(last);
  }

  function showLogin() {
    loginContainer.style.display = 'block';
    appContainer.style.display = 'none';
    logo.style.display = 'block';
  }

  document.getElementById('login-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();

    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;

    try {
      const response = await fetch(`${API_BASE}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });

      if (!response.ok) throw new Error('Credenciales incorrectas');

      const data = await response.json();
      localStorage.setItem('token', data.token);

      showApp();
    } catch (err) {
      alert(err.message);
    }
  });

  // Logout
  document.getElementById('logout-btn')?.addEventListener('click', () => {
    localStorage.removeItem('token');
    showLogin();
  });

  // =========================
  // Eventos menú
  // =========================
  navCotizador?.addEventListener('click', () => setView('cotizador'));
  navPrecalificacion?.addEventListener('click', () => setView('precalificacion'));

  // =========================
  // Auto-login
  // =========================
  if (localStorage.getItem('token')) {
    showApp();
  } else {
    showLogin();
  }
});
