/**
 * AI-granskning av redan ifyllda fält på tjänst och övrig riskfaktor.
 * Delas av servern (prompt + normalisering) och formulären (granskningskort).
 */
(function (global) {
  const TJANST_FALT = {
    tjanstebeskrivning: { etikett: 'Tjänstebeskrivning och inneboende risk' },
    sxk: { etikett: 'Sannolikhet och konsekvens' },
    residual: { etikett: 'Risk efter åtgärder' },
    hot: { etikett: 'Hot' },
    sarbarheter: { etikett: 'Sårbarheter' },
    atgarder: { etikett: 'Åtgärder' },
    tfMotivering: { etikett: 'TF-motivering' }
  };

  const OVRIG_FALT = {
    beskrivning: { etikett: 'Beskrivning och inneboende risk' },
    atgard: { etikett: 'Åtgärd' },
    ptTfRelevans: { etikett: 'PT/TF-relevans' },
    sxk: { etikett: 'Sannolikhet och konsekvens' },
    residual: { etikett: 'Risk efter åtgärd' }
  };

  const REVIEW_PROMPT_RULES = `GRANSKNINGSLÄGE (när befintligt innehåll finns):
- Tomma fält: fyll i som vanligt i huvudfälten.
- Ifyllda fält: kopiera användarens nuvarande text tillbaka till huvudfältet. Skriv inte om den där.
- För varje ifyllt fält: lägg en post i granskning.poster.
- kommentar: 1–2 meningar om vad som är bra, vad som saknas eller vad som bör ändras.
- Om du föreslår ändring: andra=true och forslag med den nya texten (sträng) eller den nya listan (array av objekt).
- Om texten är bra: andra=false och forslag="" (eller tom lista).
- Föreslå ändring bara när det behövs (fel, saknad risk, nämner byrån i inneboende beskrivning, svag källa). Inte bara omformulering.`;

  function trimStr(v) {
    return v == null ? '' : String(v).trim();
  }

  function fold(v) {
    return trimStr(v)
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }

  function isFilledText(v) {
    return trimStr(v).length > 0;
  }

  function isFilledScore(v) {
    if (v == null || String(v).trim() === '') return false;
    const n = Number(v);
    return Number.isFinite(n) && n > 0;
  }

  function asList(v) {
    return Array.isArray(v) ? v : [];
  }

  function hasListItems(v) {
    return asList(v).some((item) => item && (isFilledText(item.titel || item.namn || item.beskrivning || item.title)));
  }

  function filledTjanstKeys(befintligt) {
    const o = befintligt || {};
    const keys = [];
    if (isFilledText(o.tjanstebeskrivning)) keys.push('tjanstebeskrivning');
    if (isFilledScore(o.sannolikhet) || isFilledScore(o.konsekvens)) keys.push('sxk');
    if (isFilledScore(o.sannolikhetEfter) || isFilledScore(o.konsekvensEfter)) keys.push('residual');
    if (hasListItems(o.hot)) keys.push('hot');
    if (hasListItems(o.sarbarheter)) keys.push('sarbarheter');
    if (hasListItems(o.atgarder)) keys.push('atgarder');
    if (isFilledText(o.tfMotivering)) keys.push('tfMotivering');
    return keys;
  }

  function filledOvrigKeys(befintligt) {
    const o = befintligt || {};
    const keys = [];
    if (isFilledText(o.beskrivning)) keys.push('beskrivning');
    if (isFilledText(o.atgard)) keys.push('atgard');
    if (isFilledText(o.ptTfRelevans)) keys.push('ptTfRelevans');
    if (isFilledScore(o.sannolikhet) || isFilledScore(o.konsekvens)) keys.push('sxk');
    if (isFilledScore(o.sannolikhetEfter) || isFilledScore(o.konsekvensEfter)) keys.push('residual');
    return keys;
  }

  function hasExistingTjanstContent(befintligt) {
    return filledTjanstKeys(befintligt).length > 0;
  }

  function hasExistingOvrigContent(befintligt) {
    return filledOvrigKeys(befintligt).some((key) => key !== 'ptTfRelevans');
  }

  function formatList(items, lineFn) {
    const list = asList(items).filter(Boolean);
    if (!list.length) return '(inga)';
    return list.map((item, i) => `${i + 1}. ${lineFn(item)}`).join('\n');
  }

  function formatTjanstExistingBlock(befintligt) {
    const o = befintligt || {};
    const keys = filledTjanstKeys(o);
    if (!keys.length) return '';
    const parts = ['BEFINTLIGT INNEHÅLL (användaren har redan fyllt i — skriv inte över i onödan):'];
    if (keys.includes('tjanstebeskrivning')) {
      parts.push(`Tjänstebeskrivning:\n${trimStr(o.tjanstebeskrivning)}`);
    }
    if (keys.includes('sxk')) {
      parts.push(`Inneboende S×K: sannolikhet ${o.sannolikhet || '–'}, konsekvens ${o.konsekvens || '–'}`);
    }
    if (keys.includes('residual')) {
      parts.push(`Residual S×K: sannolikhet ${o.sannolikhetEfter || '–'}, konsekvens ${o.konsekvensEfter || '–'}`);
    }
    if (keys.includes('hot')) {
      parts.push('Hot:\n' + formatList(o.hot, (h) => {
        const kalla = h.kalla ? ` (källa: ${h.kalla})` : '';
        return `${h.typ || 'PT'}: ${h.titel || ''} — ${h.beskrivning || ''}${kalla}`;
      }));
    }
    if (keys.includes('sarbarheter')) {
      parts.push('Sårbarheter:\n' + formatList(o.sarbarheter, (s) => (
        `${s.kategori || ''}: ${s.titel || ''} — ${s.beskrivning || ''}`
      )));
    }
    if (keys.includes('atgarder')) {
      parts.push('Åtgärder:\n' + formatList(o.atgarder, (a) => (
        `${a.titel || a.namn || ''} — ${a.beskrivning || ''}`
      )));
    }
    if (keys.includes('tfMotivering')) {
      parts.push(`TF-motivering:\n${trimStr(o.tfMotivering)}`);
    }
    return parts.join('\n\n');
  }

  function formatOvrigExistingBlock(befintligt) {
    const o = befintligt || {};
    const keys = filledOvrigKeys(o);
    if (!keys.length) return '';
    const parts = ['BEFINTLIGT INNEHÅLL (användaren har redan fyllt i — skriv inte över i onödan):'];
    if (keys.includes('beskrivning')) parts.push(`Beskrivning:\n${trimStr(o.beskrivning)}`);
    if (keys.includes('atgard')) parts.push(`Åtgärd:\n${trimStr(o.atgard)}`);
    if (keys.includes('ptTfRelevans')) parts.push(`PT/TF-relevans: ${trimStr(o.ptTfRelevans)}`);
    if (keys.includes('sxk')) {
      parts.push(`Inneboende S×K: sannolikhet ${o.sannolikhet || '–'}, konsekvens ${o.konsekvens || '–'}`);
    }
    if (keys.includes('residual')) {
      parts.push(`Residual S×K: sannolikhet ${o.sannolikhetEfter || '–'}, konsekvens ${o.konsekvensEfter || '–'}`);
    }
    return parts.join('\n\n');
  }

  const FALT_ALIAS = {
    tjanstebeskrivning: ['tjanstebeskrivning', 'beskrivning', 'tjanstebeskrivning och inneboende risk'],
    beskrivning: ['beskrivning', 'beskrivning och inneboende risk'],
    atgard: ['atgard', 'atgarder', 'atgjard', 'action'],
    atgarder: ['atgarder', 'atgard', 'tjanstespecifika atgarder'],
    tfMotivering: ['tfmotivering', 'tf motivering', 'tf analys'],
    hot: ['hot'],
    sarbarheter: ['sarbarheter', 'sarbarhet'],
    sxk: ['sxk', 'sannolikhet', 'konsekvens', 'inneboende', 'riskniva'],
    residual: ['residual', 'sannolikhetefter', 'konsekvensefter', 'risk efter'],
    ptTfRelevans: ['pttfrelevans', 'pt tf', 'pttf']
  };

  function aliasFalt(raw, catalog) {
    const t = fold(raw);
    if (!t) return '';
    if (catalog[raw]) return raw;
    for (const key of Object.keys(catalog)) {
      const aliases = FALT_ALIAS[key] || [];
      if (aliases.some((a) => t === a || t.includes(a))) return key;
    }
    return '';
  }

  function hasForslag(falt, forslag) {
    if (falt === 'hot' || falt === 'sarbarheter' || falt === 'atgarder') {
      return asList(forslag).length > 0;
    }
    if (falt === 'sxk' || falt === 'residual') {
      if (forslag && typeof forslag === 'object' && !Array.isArray(forslag)) {
        return isFilledScore(forslag.sannolikhet) || isFilledScore(forslag.konsekvens);
      }
      return isFilledText(forslag);
    }
    return isFilledText(forslag);
  }

  function parseForslag(falt, raw) {
    if (raw == null || raw === false) return falt === 'hot' || falt === 'sarbarheter' || falt === 'atgarder' ? [] : '';
    if (falt === 'hot' || falt === 'sarbarheter' || falt === 'atgarder') {
      if (Array.isArray(raw)) return raw;
      if (typeof raw === 'string') {
        const t = raw.trim();
        if (!t) return [];
        try {
          const parsed = JSON.parse(t);
          if (Array.isArray(parsed)) return parsed;
        } catch (_) { /* vanlig text */ }
      }
      return [];
    }
    if (falt === 'sxk' || falt === 'residual') {
      if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
        return {
          sannolikhet: raw.sannolikhet ?? raw.sannolikhetEfter ?? '',
          konsekvens: raw.konsekvens ?? raw.konsekvensEfter ?? ''
        };
      }
      const m = String(raw).match(/(\d)\D+(\d)/);
      if (m) return { sannolikhet: Number(m[1]), konsekvens: Number(m[2]) };
      return trimStr(raw);
    }
    return trimStr(raw);
  }

  function normalizeGranskning(raw, kind) {
    const catalog = kind === 'ovrig' ? OVRIG_FALT : TJANST_FALT;
    const src = raw && typeof raw === 'object'
      ? (Array.isArray(raw.poster) ? raw.poster : (Array.isArray(raw) ? raw : []))
      : [];
    const poster = [];
    const seen = new Set();
    src.forEach((item) => {
      if (!item || typeof item !== 'object') return;
      const key = aliasFalt(item.falt || item.field || item.namn, catalog);
      if (!key || seen.has(key)) return;
      seen.add(key);
      const kommentar = trimStr(item.kommentar || item.kommentarer || item.comment);
      const parsed = parseForslag(key, item.forslag ?? item.förslag ?? item.suggestion);
      const wantsChange = item.andra === true || item.andra === 'true';
      const canApply = hasForslag(key, parsed);
      const andra = (wantsChange || (item.andra == null && canApply)) && canApply;
      if (!kommentar && !andra) return;
      poster.push({
        falt: key,
        etikett: catalog[key].etikett,
        kommentar,
        andra,
        forslag: andra ? parsed : (key === 'hot' || key === 'sarbarheter' || key === 'atgarder' ? [] : '')
      });
    });
    return poster;
  }

  function generatedValueFor(falt, generated) {
    const g = generated || {};
    if (falt === 'tjanstebeskrivning') return trimStr(g.tjanstebeskrivning || g.beskrivning);
    if (falt === 'tfMotivering') return trimStr(g.tfMotivering);
    if (falt === 'beskrivning') return trimStr(g.beskrivning);
    if (falt === 'atgard') return trimStr(g.atgard);
    if (falt === 'ptTfRelevans') return trimStr(g.ptTfRelevans);
    if (falt === 'hot') return asList(g.hot);
    if (falt === 'sarbarheter') return asList(g.sarbarheter);
    if (falt === 'atgarder') return asList(g.atgarder);
    if (falt === 'sxk') return { sannolikhet: g.sannolikhet, konsekvens: g.konsekvens };
    if (falt === 'residual') return { sannolikhet: g.sannolikhetEfter, konsekvens: g.konsekvensEfter };
    return '';
  }

  function formatForslagPreview(falt, forslag) {
    if (falt === 'sxk' || falt === 'residual') {
      if (forslag && typeof forslag === 'object' && !Array.isArray(forslag)) {
        return `Sannolikhet ${forslag.sannolikhet || '–'} · Konsekvens ${forslag.konsekvens || '–'}`;
      }
    }
    if (Array.isArray(forslag)) {
      if (!forslag.length) return '(tom lista)';
      return forslag.map((item, i) => {
        const typ = item.typ || item.kategori || '';
        const title = item.titel || item.namn || '';
        const desc = item.beskrivning || '';
        return `${i + 1}. ${typ ? `${typ}: ` : ''}${title}${desc ? ` — ${desc}` : ''}`;
      }).join('\n');
    }
    return trimStr(forslag);
  }

  function fallbackPosters(kind, generated) {
    const catalog = kind === 'ovrig' ? OVRIG_FALT : TJANST_FALT;
    const keys = kind === 'ovrig' ? Object.keys(OVRIG_FALT) : Object.keys(TJANST_FALT);
    return keys.map((key) => {
      const forslag = generatedValueFor(key, generated);
      if (!hasForslag(key, forslag)) return null;
      return {
        falt: key,
        etikett: catalog[key].etikett,
        kommentar: 'AI har ett ändringsförslag för det här fältet.',
        andra: true,
        forslag
      };
    }).filter(Boolean);
  }

  function esc(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function hideReview(host) {
    if (!host) return;
    host.hidden = true;
    host.innerHTML = '';
  }

  function renderReview(host, poster, handlers) {
    if (!host) return;
    const items = Array.isArray(poster) ? poster : [];
    if (!items.length) {
      hideReview(host);
      return;
    }
    const onApply = handlers && handlers.onApply;
    const onDismiss = handlers && handlers.onDismiss;
    const onDismissAll = handlers && handlers.onDismissAll;
    host.hidden = false;
    host.innerHTML = `
      <div class="ai-review-head">
        <div>
          <strong>AI har tittat på era texter</strong>
          <p>Kopiera in ett ändringsförslag eller avfärda det. Befintliga fält skrivs inte över förrän du väljer.</p>
        </div>
        <button type="button" class="btn btn-secondary btn-sm" data-ai-dismiss-all>Avfärda alla</button>
      </div>
      <div class="ai-review-list">
        ${items.map((item) => {
          const preview = item.andra ? formatForslagPreview(item.falt, item.forslag) : '';
          return `
            <article class="ai-review-card" data-falt="${esc(item.falt)}">
              <h5>${esc(item.etikett)}</h5>
              ${item.kommentar ? `<p class="ai-review-comment">${esc(item.kommentar)}</p>` : ''}
              ${preview ? `<pre class="ai-review-forslag">${esc(preview)}</pre>` : '<p class="ai-review-ok">Ingen ändring föreslagen.</p>'}
              <div class="ai-review-actions">
                ${item.andra ? '<button type="button" class="btn btn-primary btn-sm" data-ai-apply>Kopiera in</button>' : ''}
                <button type="button" class="btn btn-secondary btn-sm" data-ai-dismiss>Avfärda</button>
              </div>
            </article>
          `;
        }).join('')}
      </div>
    `;
    host._aiPoster = items;
    host.onclick = (ev) => {
      const applyBtn = ev.target.closest('[data-ai-apply]');
      const dismissBtn = ev.target.closest('[data-ai-dismiss]');
      const dismissAllBtn = ev.target.closest('[data-ai-dismiss-all]');
      if (dismissAllBtn) {
        hideReview(host);
        if (onDismissAll) onDismissAll();
        return;
      }
      const card = ev.target.closest('.ai-review-card');
      if (!card) return;
      const falt = card.getAttribute('data-falt');
      const row = (host._aiPoster || []).find((p) => p.falt === falt);
      if (applyBtn && row && onApply) onApply(row);
      if ((applyBtn || dismissBtn) && onDismiss) onDismiss(row);
      if (applyBtn || dismissBtn) card.remove();
      if (!host.querySelector('.ai-review-card')) hideReview(host);
    };
  }

  const api = {
    TJANST_FALT,
    OVRIG_FALT,
    REVIEW_PROMPT_RULES,
    isFilledText,
    isFilledScore,
    filledTjanstKeys,
    filledOvrigKeys,
    hasExistingTjanstContent,
    hasExistingOvrigContent,
    formatTjanstExistingBlock,
    formatOvrigExistingBlock,
    normalizeGranskning,
    generatedValueFor,
    formatForslagPreview,
    fallbackPosters,
    hasForslag,
    renderReview,
    hideReview
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  global.AiFaltGranskning = api;
})(typeof window !== 'undefined' ? window : globalThis);
