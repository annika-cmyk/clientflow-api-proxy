/**
 * ClientFlow marketing site – shared nav, artikel-dropdown, mobilmeny.
 * Lägg nya artiklar i ARTICLES-arrayen.
 */
(function () {
  const APP_LOGIN = 'https://app.clientflow.se/login.html';
  const CONTACT = 'mailto:hej@clientflow.se';

  /** @type {{ slug: string, title: string, href: string }[]} */
  const ARTICLES = [
    {
      slug: '12-hot-lansstyrelsen',
      title: 'De 12 hot som Länsstyrelsen säger att din byrå måste förstå',
      href: '/articles/12-hot-lansstyrelsen.html',
    },
    // Fler artiklar läggs till här
  ];

  function renderHeader() {
    const el = document.getElementById('site-header');
    if (!el) return;

    const currentPath = window.location.pathname.replace(/\/$/, '') || '/';
    const articleLinks = ARTICLES.map((a) => {
      const active = currentPath.endsWith(a.href.replace(/^\//, '')) ? ' is-active' : '';
      return `<li><a class="nav-dropdown-link${active}" href="${a.href}">${escapeHtml(a.title)}</a></li>`;
    }).join('');

    const articlesActive = ARTICLES.some((a) => currentPath.endsWith(a.slug) || currentPath.includes('/articles/'))
      ? ' is-active'
      : '';

    el.innerHTML = `
      <div class="nav-inner container">
        <a class="nav-brand" href="/index.html" aria-label="ClientFlow startsida">
          <img src="/images/Clientflow logga.png" alt="ClientFlow" width="160" height="48">
        </a>
        <button type="button" class="nav-toggle" id="nav-toggle" aria-expanded="false" aria-controls="nav-menu" aria-label="Öppna meny">
          <i class="fas fa-bars"></i>
        </button>
        <nav class="nav-menu" id="nav-menu" aria-label="Huvudmeny">
          <ul class="nav-list">
            <li><a class="nav-link${currentPath === '/' || currentPath.endsWith('index.html') ? ' is-active' : ''}" href="/index.html#funktioner">Funktioner</a></li>
            <li class="nav-dropdown${articlesActive}">
              <button type="button" class="nav-link nav-dropdown-trigger" id="articles-dropdown-trigger" aria-expanded="false" aria-haspopup="true">
                Artiklar <i class="fas fa-chevron-down nav-chevron" aria-hidden="true"></i>
              </button>
              <ul class="nav-dropdown-menu" id="articles-dropdown-menu" role="menu">
                ${articleLinks}
              </ul>
            </li>
            <li><a class="nav-link" href="/index.html#kontakt">Kontakt</a></li>
            <li><a class="btn btn-primary btn-nav" href="${APP_LOGIN}">Logga in</a></li>
          </ul>
        </nav>
      </div>
    `;

    bindNav();
  }

  function bindNav() {
    const toggle = document.getElementById('nav-toggle');
    const menu = document.getElementById('nav-menu');
    const dropdownTrigger = document.getElementById('articles-dropdown-trigger');
    const dropdown = document.querySelector('.nav-dropdown');

    toggle?.addEventListener('click', () => {
      const open = menu.classList.toggle('is-open');
      toggle.setAttribute('aria-expanded', String(open));
    });

    dropdownTrigger?.addEventListener('click', (e) => {
      e.stopPropagation();
      const open = dropdown.classList.toggle('is-open');
      dropdownTrigger.setAttribute('aria-expanded', String(open));
    });

    document.addEventListener('click', () => {
      dropdown?.classList.remove('is-open');
      dropdownTrigger?.setAttribute('aria-expanded', 'false');
    });

    dropdown?.querySelector('.nav-dropdown-menu')?.addEventListener('click', (e) => e.stopPropagation());
  }

  function escapeHtml(str) {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function renderFooter() {
    const el = document.getElementById('site-footer');
    if (!el) return;
    el.innerHTML = `
      <div class="container footer-inner">
        <p>&copy; ${new Date().getFullYear()} ClientFlow. Kundhantering &amp; riskbedömning för redovisningsbyråer.</p>
        <p>
          <a href="${APP_LOGIN}">Logga in</a>
          · <a href="${CONTACT}">hej@clientflow.se</a>
        </p>
      </div>
    `;
  }

  document.addEventListener('DOMContentLoaded', () => {
    renderHeader();
    renderFooter();
  });
})();
