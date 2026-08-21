/**
 * Kortlayout för identifierade risker — samma som Byråns tjänster / Övriga riskfaktorer.
 * Används i Dokumentation och Allmän riskbedömning (read-only).
 */
(function (global) {
  function skala() {
    if (typeof window !== 'undefined' && window.RiskSkala) return window.RiskSkala;
    try { return require('./risk-skala'); } catch (_) { return null; }
  }

  function tfLib() {
    if (typeof window !== 'undefined' && window.TjanstTfTackning) return window.TjanstTfTackning;
    try { return require('./tjanst-tf-tackning'); } catch (_) { return null; }
  }

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function nl(value) {
    const t = String(value == null ? '' : value).trim();
    if (!t) return '<em>Ingen text</em>';
    return esc(t).replace(/\n/g, '<br>');
  }

  function text(value) {
    return String(value == null ? '' : value).trim();
  }

  function asList(value) {
    return Array.isArray(value) ? value.filter((x) => x && typeof x === 'object') : [];
  }

  function levelClass(level) {
    const S = skala();
    return (S && S.riskItemClass(level)) || 'risk-normal';
  }

  function scoredFrom(item) {
    const S = skala();
    const inherent = S
      ? S.assessRisk(item && item.sannolikhet, item && item.konsekvens)
      : {};
    const residual = S
      ? S.assessRisk(item && item.sannolikhetEfter, item && item.konsekvensEfter)
      : {};
    const level = inherent.level || text(item && item.riskbedomning);
    const residualLevel = residual.level || text(item && item.residualrisk);
    const scored = {
      level: level,
      badge: inherent.badge || level,
      residualLevel: residualLevel,
      residualBadge: residual.badge || residualLevel,
      sannolikhet: inherent.sannolikhet,
      konsekvens: inherent.konsekvens
    };
    const badges = S && S.listBadgeLabels
      ? S.listBadgeLabels(scored)
      : {
        inneboende: level ? ('Inneboende risk: ' + (inherent.badge || level)) : 'Inneboende risk: Ej satt',
        residual: residualLevel ? ('Residualrisk: ' + (residual.badge || residualLevel)) : '',
        inneboendeTitle: '',
        residualTitle: ''
      };
    return { scored: scored, badges: badges };
  }

  function coverageOf(item) {
    const Tf = tfLib();
    if (Tf && Tf.ptTfCoverage) return Tf.ptTfCoverage(item && item.hot, item && item.ptTfRelevans);
    const S = skala();
    return (S && S.normalizePtTf && S.normalizePtTf(item && item.ptTfRelevans)) || '';
  }

  function renderPtTfPills(coverage) {
    if (coverage === 'Båda') {
      return '<span class="pt-tf-tag is-pt">PT</span><span class="pt-tf-tag is-tf">TF</span>';
    }
    if (coverage === 'TF') return '<span class="pt-tf-tag is-tf">TF</span>';
    if (coverage === 'PT') return '<span class="pt-tf-tag is-pt">PT</span>';
    return '';
  }

  function renderHot(hot) {
    const Tf = tfLib();
    const rows = asList(hot).map((h) => {
      const typ = (Tf && Tf.hotTyp && Tf.hotTyp(h))
        || (skala() && skala().normalizePtTf && skala().normalizePtTf(h.typ))
        || ((String(h.typ || 'PT').toUpperCase() === 'TF') ? 'TF' : 'PT');
      const title = text(h.titel || h.title);
      const desc = text(h.beskrivning || h.description);
      if (!title && !desc) return '';
      const tags = typ === 'Båda'
        ? '<span class="tag tag-pt">PT</span><span class="tag tag-tf">TF</span>'
        : '<span class="tag ' + (typ === 'TF' ? 'tag-tf' : 'tag-pt') + '">' + esc(typ || 'PT') + '</span>';
      return '<div class="threat-row">'
        + tags
        + '<div class="threat-body">'
        + (title ? '<div class="threat-title">' + esc(title) + '</div>' : '')
        + (desc ? '<div class="threat-desc">' + nl(desc) + '</div>' : '')
        + '</div></div>';
    }).filter(Boolean).join('');
    if (!rows) return '';
    return section('fa-triangle-exclamation', 'Hot', '<div class="threat-list">' + rows + '</div>');
  }

  function renderSarbarheter(items) {
    const tagClassMap = { Kunder: 'tag-kund', Distribution: 'tag-dist', Geografi: 'tag-geo', Verksamhet: 'tag-verk' };
    const cards = asList(items).map((s) => {
      const kat = text(s.kategori || s.category) || 'Verksamhet';
      const title = text(s.titel || s.title);
      const desc = text(s.beskrivning || s.description);
      if (!title && !desc) return '';
      return '<div class="vuln-item">'
        + '<div class="tags-row"><span class="tag ' + (tagClassMap[kat] || 'tag-verk') + '">' + esc(kat) + '</span></div>'
        + (title ? '<div class="vuln-item-title">' + esc(title) + '</div>' : '')
        + (desc ? '<div class="vuln-item-desc">' + nl(desc) + '</div>' : '')
        + '</div>';
    }).filter(Boolean).join('');
    if (!cards) return '';
    return section('fa-shield-halved', 'Sårbarheter', '<div class="vuln-grid">' + cards + '</div>');
  }

  function renderAtgarder(items, legacy) {
    const list = asList(items);
    if (list.length) {
      const rows = list.map((a) => {
        const title = text(a.titel || a.title || a.namn);
        const desc = text(a.beskrivning || a.description);
        if (!title && !desc) return '';
        return '<div class="action-item"><i class="fas fa-check action-icon"></i>'
          + '<span class="action-text">'
          + (title ? '<strong>' + esc(title) + '</strong>' : '')
          + (desc ? (title ? ' — ' : '') + esc(desc) : '')
          + '</span></div>';
      }).filter(Boolean).join('');
      if (!rows) return '';
      return section('fa-list-check', 'Åtgärder', '<div class="action-list">' + rows + '</div>');
    }
    if (text(legacy)) {
      return section('fa-tools', 'Åtgärd', '<p class="risk-content-text">' + nl(legacy) + '</p>');
    }
    return '';
  }

  function section(icon, title, html) {
    return '<div class="risk-content-section"><h5><i class="fas ' + icon + '"></i> ' + esc(title)
      + '</h5>' + html + '</div>';
  }

  function cardShell(opts) {
    const checked = opts.aktuell === true;
    const tfTag = renderPtTfPills(opts.ptTf);
    const residualBadge = opts.badges.residual
      ? '<span class="risk-level-badge ' + esc(opts.residualClass) + '" title="' + esc(opts.badges.residualTitle || '') + '">'
        + esc(opts.badges.residual) + '</span>'
      : '';
    const tfMissing = opts.saknarTf
      ? '<span class="tf-missing-pill"><span class="tf-missing-dot" aria-hidden="true"></span>TF saknas</span>'
      : '';
    return '<div class="risk-item ' + esc(opts.levelClass) + (checked ? '' : ' inactive') + '"'
      + (opts.id ? ' data-record-id="' + esc(opts.id) + '"' : '') + '>'
      + '<div class="risk-item-header">'
      + '<div class="risk-item-title">'
      + '<div class="risk-status-indicator ' + (checked ? 'checked' : 'unchecked') + '">' + (checked ? '✓' : '○') + '</div>'
      + '<div class="risk-item-info">'
      + '<h4 class="risk-task-name">' + esc(opts.title) + ' ' + tfTag + '</h4>'
      + '<div class="risk-meta-info">'
      + '<span class="risk-level-badge ' + esc(opts.levelClass) + '" title="' + esc(opts.badges.inneboendeTitle || '') + '">'
      + esc(opts.badges.inneboende) + '</span>'
      + residualBadge
      + tfMissing
      + '</div></div></div>'
      + '<div class="risk-item-actions">'
      + '<button type="button" class="expand-toggle" aria-label="Visa mer"><i class="fas fa-chevron-down"></i></button>'
      + '</div></div>'
      + '<div class="risk-item-content">' + opts.body
      + (opts.footer || '')
      + '</div></div>';
  }

  function renderTjanstCard(t) {
    const item = t || {};
    const info = scoredFrom(item);
    const Tf = tfLib();
    const saknarTf = item.saknarTfTackning === true
      || (Tf && Tf.tjanstSaknarTfTackning && Tf.tjanstSaknarTfTackning(item));
    const beskrivning = text(item.tjanstebeskrivning || item.beskrivning);
    const parts = [];
    if (beskrivning) {
      parts.push(section('fa-file-lines', 'Tjänstebeskrivning och inneboende risk',
        '<p class="risk-content-text">' + nl(beskrivning) + '</p>'));
    }
    parts.push(renderHot(item.hot));
    parts.push(renderSarbarheter(item.sarbarheter));
    if (!Tf || !Tf.hasTfHot || !Tf.hasTfHot(item.hot)) {
      const motivering = text(item.tfMotivering);
      if (motivering) {
        parts.push(section('fa-scale-balanced', 'TF-analys',
          '<p class="risk-content-text">' + nl(motivering) + '</p>'));
      }
    }
    parts.push(renderAtgarder(item.atgarder, item.atgard));
    const body = parts.filter(Boolean).join('') || section('fa-circle-info', 'Innehåll',
      '<p class="risk-content-text"><em>Inget innehåll ännu.</em></p>');
    return cardShell({
      id: item.id,
      title: text(item.namn || item.title) || 'Namnlös tjänst',
      aktuell: item.aktuell === true,
      ptTf: coverageOf(item),
      saknarTf: saknarTf,
      levelClass: levelClass(info.scored.level),
      residualClass: levelClass(info.scored.residualLevel),
      badges: info.badges,
      body: body,
      footer: '<div class="risk-item-footer"><a class="btn btn-secondary btn-sm" href="riskbedomning-byra.html">Öppna Byråns tjänster</a></div>'
    });
  }

  function renderOvrigCard(r) {
    const item = r || {};
    const info = scoredFrom(item);
    const typ = text(item.typ);
    const namn = text(item.namn);
    const title = typ && namn ? (typ + ': ' + namn) : (namn || typ || 'Namnlös riskfaktor');
    const parts = [];
    if (item.beskrivning) {
      parts.push(section('fa-info-circle', 'Beskrivning och inneboende risk',
        '<p class="risk-content-text">' + nl(item.beskrivning) + '</p>'));
    }
    parts.push(renderAtgarder([], item.atgard));
    const body = parts.filter(Boolean).join('') || section('fa-circle-info', 'Innehåll',
      '<p class="risk-content-text"><em>Inget innehåll ännu.</em></p>');
    return cardShell({
      id: item.id,
      title: title,
      aktuell: item.aktuell === true,
      ptTf: coverageOf(item),
      saknarTf: false,
      levelClass: levelClass(info.scored.level),
      residualClass: levelClass(info.scored.residualLevel),
      badges: info.badges,
      body: body,
      footer: '<div class="risk-item-footer"><a class="btn btn-secondary btn-sm" href="ovriga-riskfaktorer.html">Öppna Övriga riskfaktorer</a></div>'
    });
  }

  function heading(title) {
    return '<h4 class="identifierade-group-title">' + esc(title) + '</h4>';
  }

  function render(source) {
    const data = source || {};
    const tjanster = Array.isArray(data.tjanster) ? data.tjanster : [];
    const ovriga = Array.isArray(data.ovriga) ? data.ovriga : [];
    const tjanstCards = tjanster.filter((t) => text(t && (t.namn || t.title))).map(renderTjanstCard);
    const ovrigCards = ovriga.filter((r) => text(r && (r.namn || r.beskrivning || r.typ))).map(renderOvrigCard);
    if (!tjanstCards.length && !ovrigCards.length) {
      return '<p class="identifierade-empty">Inga tjänster eller övriga riskfaktorer är ifyllda ännu. '
        + 'Gå till <a href="riskbedomning-byra.html">Byråns tjänster</a> och '
        + '<a href="ovriga-riskfaktorer.html">Övriga riskfaktorer</a>.</p>';
    }
    const parts = [];
    if (tjanstCards.length) {
      parts.push(heading('Produkter och tjänster'));
      parts.push('<div class="risk-items">' + tjanstCards.join('') + '</div>');
    }
    if (ovrigCards.length) {
      parts.push(heading('Övriga riskfaktorer'));
      parts.push('<div class="risk-items">' + ovrigCards.join('') + '</div>');
    }
    return '<div class="identifierade-kort">' + parts.join('') + '</div>';
  }

  function bind(root) {
    if (!root || root.getAttribute('data-identifierade-bound') === '1') return;
    root.setAttribute('data-identifierade-bound', '1');
    root.addEventListener('click', function (ev) {
      const header = ev.target.closest('.risk-item-header');
      if (!header || !root.contains(header)) return;
      if (ev.target.closest('a, button.btn')) return;
      ev.preventDefault();
      const item = header.closest('.risk-item');
      if (!item) return;
      item.classList.toggle('expanded');
      const toggle = item.querySelector('.expand-toggle');
      if (toggle) toggle.classList.toggle('expanded', item.classList.contains('expanded'));
    });
  }

  function mount(el, source) {
    if (!el) return '';
    const html = render(source);
    el.innerHTML = html;
    bind(el);
    return html;
  }

  const api = {
    render: render,
    renderTjanstCard: renderTjanstCard,
    renderOvrigCard: renderOvrigCard,
    bind: bind,
    mount: mount
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  global.IdentifieradeRiskerView = api;
})(typeof window !== 'undefined' ? window : globalThis);
