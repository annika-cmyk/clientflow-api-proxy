(function () {
  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function formatDate(value) {
    const s = String(value || '').trim();
    if (!s) return '';
    return s.slice(0, 10);
  }

  function authOpts() {
    return (window.AuthManager && AuthManager.getAuthFetchOptions && AuthManager.getAuthFetchOptions()) || {
      credentials: 'include',
      headers: {}
    };
  }

  function setStatus(text, isError) {
    const el = document.getElementById('personregister-status');
    if (!el) return;
    el.textContent = text || '';
    el.classList.toggle('is-error', !!isError);
  }

  function renderResults(data) {
    const root = document.getElementById('personregister-results');
    if (!root) return;
    const people = data.people || [];
    if (!people.length) {
      root.innerHTML = `<div class="kundlista-empty"><p>Ingen träff på företrädare eller verklig huvudman.</p></div>`;
      return;
    }
    root.innerHTML = people.map((person) => {
      const idLabel = person.identitet
        ? `<span class="personregister-id">${esc(person.identitet)}</span>`
        : '<span class="personregister-id is-missing">Identitet saknas</span>';
      const kinds = (person.kopplingar || []).map((k) => `<span class="personregister-chip">${esc(k)}</span>`).join('');
      const bolagHtml = (person.bolag || []).map((bolag) => {
        const flags = [
          bolag.dold ? 'Dold' : '',
          bolag.avslutad ? 'Avslutad' : '',
          bolag.aktiv ? 'Aktiv koppling' : 'Tidigare koppling'
        ].filter(Boolean).join(' · ');
        const uppdrag = (bolag.uppdrag || []);
        const uppdragHtml = uppdrag.length
          ? `<ul class="personregister-uppdrag">${uppdrag.map((u) => {
            const when = [formatDate(u.startdatum), formatDate(u.avslutas)].filter(Boolean).join(' – ');
            return `<li><strong>${esc(u.namn || u.typ || 'Uppdrag')}</strong>${u.status ? ` <span class="personregister-muted">${esc(u.status)}</span>` : ''}${when ? ` <span class="personregister-muted">${esc(when)}</span>` : ''}</li>`;
          }).join('')}</ul>`
          : '<p class="personregister-muted">Inga uppdrag under de senaste 5 åren.</p>';
        return `
          <article class="personregister-bolag">
            <a class="personregister-bolag-link" href="kundkort.html?id=${esc(bolag.kundId)}">
              <span class="personregister-bolag-namn">${esc(bolag.namn)}</span>
              ${bolag.orgnr ? `<span class="personregister-muted">${esc(bolag.orgnr)}</span>` : ''}
            </a>
            <p class="personregister-muted">${esc([bolag.roller.join(', '), flags].filter(Boolean).join(' · '))}</p>
            ${uppdragHtml}
          </article>`;
      }).join('');
      return `
        <section class="personregister-person">
          <header class="personregister-person-head">
            <h2>${esc(person.namn)}</h2>
            <div class="personregister-person-meta">${idLabel}${kinds}</div>
          </header>
          ${bolagHtml}
        </section>`;
    }).join('');
  }

  async function search(query) {
    const submit = document.getElementById('personregister-submit');
    const results = document.getElementById('personregister-results');
    if (submit) submit.disabled = true;
    setStatus('Söker i samtliga kunder, inklusive dolda och avslutade...');
    if (results) results.innerHTML = '<div class="kundlista-loading"><i class="fas fa-spinner fa-spin"></i><span>Söker...</span></div>';
    try {
      const baseUrl = window.apiConfig?.baseUrl || '';
      const opts = authOpts();
      const res = await fetch(`${baseUrl}/api/personregister?q=${encodeURIComponent(query)}`, {
        method: 'GET',
        credentials: 'include',
        headers: { ...(opts.headers || {}) }
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      const bolag = data.bolagCount || 0;
      const uppdrag = data.uppdragCount || 0;
      setStatus(`${(data.people || []).length} träffar · ${bolag} bolag · ${uppdrag} uppdrag de senaste 5 åren`);
      renderResults(data);
    } catch (err) {
      setStatus(err.message || 'Kunde inte söka', true);
      if (results) results.innerHTML = '';
    } finally {
      if (submit) submit.disabled = false;
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('personregister-form');
    const input = document.getElementById('personregister-q');
    if (!form || !input) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('q')) {
      input.value = params.get('q');
      search(params.get('q'));
    }
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const q = input.value.trim();
      if (!q) return;
      const next = new URL(window.location.href);
      next.searchParams.set('q', q);
      history.replaceState({}, '', next);
      search(q);
    });
    input.focus();
  });
})();
