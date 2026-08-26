/**
 * AI-analys av tjänst och övrig riskfaktor: egna kompletta förslag plus jämförelse mot ifylld text.
 * Delas av servern (prompt + normalisering) och formulären (analyskort).
 */
(function (global) {
  const TJANST_FALT = {
    tjanstebeskrivning: { etikett: 'Tjänstebeskrivning och inneboende risk' },
    sxk: { etikett: 'Sannolikhet och konsekvens' },
    motiveringInneboende: { etikett: 'Motivering av S och K (inneboende risk)' },
    residual: { etikett: 'Risk efter åtgärder' },
    motiveringResidual: { etikett: 'Motivering av residual-S och K' },
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
    motiveringInneboende: { etikett: 'Motivering av S och K (inneboende risk)' },
    residual: { etikett: 'Risk efter åtgärd' },
    motiveringResidual: { etikett: 'Motivering av residual-S och K' }
  };

  const MOTIVERING_AI_RULES = `- MOTIVERING AV S×K (krav vid tillsyn): Skriv alltid motiveringInneboende och motiveringResidual när du sätter S/K.
- motiveringInneboende: 2–4 meningar som förklarar VARFÖR sannolikheten är som den är (hot/sårbarhet) och VARFÖR konsekvensen är som den är (skada/regulatorisk påverkan). Minst 50 tecken om inneboende risk blir Förhöjd, Hög eller Oacceptabel.
- motiveringResidual: 2–4 meningar om hur åtgärderna sänkt sannolikhet och/eller konsekvens. Minst 50 tecken om residual blir Förhöjd+. Om residual är Hög eller Oacceptabel: nämn riskaptit eller fattat beslut.`;

  const REVIEW_PROMPT_RULES = `ANALYSLÄGE (när befintligt innehåll finns):
- Du ska INTE bara språkgranska eller kommentera det som redan står. Gör en självständig, omfattande AML-analys av hela tjänsten eller riskfaktorn.
- Ta fram DITT kompletta förslag för ALLA fält: beskrivning (3–5 meningar), S×K, motivering av S/K, residual, motivering av residual, fullständiga listor för hot/sårbarheter/åtgärder (med källor på hot), och TF-täckning.
- Befintlig text är underlag du får förhålla dig till — inte facit. Fyll luckor, lägg till saknade hot (särskilt TF), justera S×K om din analys ger annan nivå, och skriv en rikare beskrivning när den är tunn.
- Kopiera inte rakt av. En lätt omskrivning räcker inte.
- Tomma fält: skriv ditt förslag i huvudfälten (de fylls i automatiskt).
- Ifyllda fält: lägg en post i granskning.poster med andra=true. forslag ska vara SAMMA kompletta innehåll som i huvudfälten (hela listan, inte en kommentar eller en enstaka punkt).
- kommentar: 2–3 meningar om vad din analys tillför (luckor, nya hot, S×K, TF, källor) — inte bara "bra som den är".
- andra=false bara om ditt förslag är identiskt med nuvarande innehåll.
- TF-LUCKA: Om tjänsten saknar TF-hot (typ TF eller Båda) och saknar TF-motivering är det ett måste. Ditt hot-förslag ska innehålla minst ett TF- eller Båda-hot, annars tfMotivering.`;

  function getTjanstTfTackning() {
    if (typeof global !== 'undefined' && global.TjanstTfTackning) return global.TjanstTfTackning;
    if (typeof require === 'function') {
      try { return require('./tjanst-tf-tackning'); } catch (_) { /* valfritt */ }
    }
    return null;
  }

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

  function readMotiveringInneboende(o) {
    return trimStr((o && (o.motiveringInneboende || o.motivering_inneboende_risk)) || '');
  }

  function readMotiveringResidual(o) {
    return trimStr((o && (o.motiveringResidual || o.motivering_residual_risk)) || '');
  }

  function filledTjanstKeys(befintligt) {
    const o = befintligt || {};
    const keys = [];
    if (isFilledText(o.tjanstebeskrivning)) keys.push('tjanstebeskrivning');
    if (isFilledScore(o.sannolikhet) || isFilledScore(o.konsekvens)) keys.push('sxk');
    if (readMotiveringInneboende(o)) keys.push('motiveringInneboende');
    if (isFilledScore(o.sannolikhetEfter) || isFilledScore(o.konsekvensEfter)) keys.push('residual');
    if (readMotiveringResidual(o)) keys.push('motiveringResidual');
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
    if (readMotiveringInneboende(o)) keys.push('motiveringInneboende');
    if (isFilledScore(o.sannolikhetEfter) || isFilledScore(o.konsekvensEfter)) keys.push('residual');
    if (readMotiveringResidual(o)) keys.push('motiveringResidual');
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
    const parts = ['BEFINTLIGT INNEHÅLL (underlag för din egen analys — kopiera inte rakt av. Gör en komplett egen bedömning av alla fält.):'];
    if (keys.includes('tjanstebeskrivning')) {
      parts.push(`Tjänstebeskrivning:\n${trimStr(o.tjanstebeskrivning)}`);
    }
    if (keys.includes('sxk')) {
      parts.push(`Inneboende S×K: sannolikhet ${o.sannolikhet || '–'}, konsekvens ${o.konsekvens || '–'}`);
    }
    if (keys.includes('motiveringInneboende')) {
      parts.push(`Motivering inneboende risk:\n${readMotiveringInneboende(o)}`);
    }
    if (keys.includes('residual')) {
      parts.push(`Residual S×K: sannolikhet ${o.sannolikhetEfter || '–'}, konsekvens ${o.konsekvensEfter || '–'}`);
    }
    if (keys.includes('motiveringResidual')) {
      parts.push(`Motivering residualrisk:\n${readMotiveringResidual(o)}`);
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
    const Tf = getTjanstTfTackning();
    if (Tf && Tf.tjanstSaknarTfTackning(o)) {
      parts.push('TF-LUCKA: Inget TF-hot och ingen TF-motivering. Du MÅSTE föreslå minst ett TF- eller Båda-hot (prefererat) eller en tfMotivering.');
    }
    return parts.join('\n\n');
  }

  function formatOvrigExistingBlock(befintligt) {
    const o = befintligt || {};
    const keys = filledOvrigKeys(o);
    if (!keys.length) return '';
    const parts = ['BEFINTLIGT INNEHÅLL (underlag för din egen analys — kopiera inte rakt av. Gör en komplett egen bedömning av alla fält.):'];
    if (keys.includes('beskrivning')) parts.push(`Beskrivning:\n${trimStr(o.beskrivning)}`);
    if (keys.includes('atgard')) parts.push(`Åtgärd:\n${trimStr(o.atgard)}`);
    if (keys.includes('ptTfRelevans')) parts.push(`PT/TF-relevans: ${trimStr(o.ptTfRelevans)}`);
    if (keys.includes('sxk')) {
      parts.push(`Inneboende S×K: sannolikhet ${o.sannolikhet || '–'}, konsekvens ${o.konsekvens || '–'}`);
    }
    if (keys.includes('motiveringInneboende')) {
      parts.push(`Motivering inneboende risk:\n${readMotiveringInneboende(o)}`);
    }
    if (keys.includes('residual')) {
      parts.push(`Residual S×K: sannolikhet ${o.sannolikhetEfter || '–'}, konsekvens ${o.konsekvensEfter || '–'}`);
    }
    if (keys.includes('motiveringResidual')) {
      parts.push(`Motivering residualrisk:\n${readMotiveringResidual(o)}`);
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
    motiveringInneboende: ['motiveringinneboende', 'motivering inneboende', 'motivering av riskniva', 'motivering av s och k'],
    motiveringResidual: ['motiveringresidual', 'motivering residual', 'motivering av residual'],
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

  function normalizeGranskning(raw, kind, befintligt) {
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
      let andra = (wantsChange || (item.andra == null && canApply)) && canApply;
      if (andra && sameForslag(key, currentValueFor(key, befintligt), parsed)) andra = false;
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
    if (falt === 'motiveringInneboende') return readMotiveringInneboende(g);
    if (falt === 'residual') return { sannolikhet: g.sannolikhetEfter, konsekvens: g.konsekvensEfter };
    if (falt === 'motiveringResidual') return readMotiveringResidual(g);
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

  function currentValueFor(falt, befintligt) {
    const o = befintligt || {};
    if (falt === 'tjanstebeskrivning') return trimStr(o.tjanstebeskrivning);
    if (falt === 'tfMotivering') return trimStr(o.tfMotivering);
    if (falt === 'beskrivning') return trimStr(o.beskrivning);
    if (falt === 'atgard') return trimStr(o.atgard);
    if (falt === 'ptTfRelevans') return trimStr(o.ptTfRelevans);
    if (falt === 'hot') return asList(o.hot);
    if (falt === 'sarbarheter') return asList(o.sarbarheter);
    if (falt === 'atgarder') return asList(o.atgarder);
    if (falt === 'sxk') return { sannolikhet: o.sannolikhet, konsekvens: o.konsekvens };
    if (falt === 'motiveringInneboende') return readMotiveringInneboende(o);
    if (falt === 'residual') return { sannolikhet: o.sannolikhetEfter, konsekvens: o.konsekvensEfter };
    if (falt === 'motiveringResidual') return readMotiveringResidual(o);
    return '';
  }

  function isEmptyCurrent(falt, current) {
    if (falt === 'hot' || falt === 'sarbarheter' || falt === 'atgarder') return !hasListItems(current);
    if (falt === 'sxk' || falt === 'residual') {
      return !(current && (isFilledScore(current.sannolikhet) || isFilledScore(current.konsekvens)));
    }
    return !isFilledText(current);
  }

  function itemKey(item) {
    return fold((item && (item.titel || item.namn || item.beskrivning)) || '');
  }

  function addedListItems(current, forslag) {
    const have = new Set(asList(current).map(itemKey).filter(Boolean));
    return asList(forslag).filter((item) => {
      const key = itemKey(item);
      return key && !have.has(key);
    });
  }

  function removedListItems(current, forslag) {
    const next = new Set(asList(forslag).map(itemKey).filter(Boolean));
    return asList(current).filter((item) => {
      const key = itemKey(item);
      return key && !next.has(key);
    });
  }

  function listItemSignature(item) {
    return [
      fold(item && (item.typ || '')),
      fold(item && (item.kategori || '')),
      fold(item && (item.titel || item.namn || '')),
      fold(item && (item.beskrivning || '')),
      fold(item && (item.kalla || item.källa || ''))
    ].join('|');
  }

  function scoreKey(v) {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? String(n) : '';
  }

  function sameForslag(falt, current, forslag) {
    if (falt === 'hot' || falt === 'sarbarheter' || falt === 'atgarder') {
      const a = asList(current).map(listItemSignature).sort();
      const b = asList(forslag).map(listItemSignature).sort();
      return a.length === b.length && a.every((sig, i) => sig === b[i]);
    }
    if (falt === 'sxk' || falt === 'residual') {
      const cur = current && typeof current === 'object' ? current : {};
      const next = forslag && typeof forslag === 'object' && !Array.isArray(forslag) ? forslag : {};
      return scoreKey(cur.sannolikhet) === scoreKey(next.sannolikhet)
        && scoreKey(cur.konsekvens) === scoreKey(next.konsekvens);
    }
    return fold(current) === fold(forslag);
  }

  function isGenericReviewComment(text) {
    const t = fold(text);
    if (!t) return true;
    return t === fold('AI har ett ändringsförslag för det här fältet.')
      || t === fold('AI:s eget förslag efter en samlad analys. Jämför med nuvarande text.');
  }

  function usefulComment(text) {
    const t = trimStr(text);
    if (!t || isGenericReviewComment(t)) return '';
    return t;
  }

  function similarKeys(a, b) {
    if (!a || !b) return false;
    if (a === b) return true;
    if (a.length >= 6 && b.length >= 6 && (a.includes(b) || b.includes(a))) return true;
    const words = (s) => String(s).split(' ').filter((w) => w.length > 3);
    const aw = words(a);
    const bw = new Set(words(b));
    if (!aw.length || !bw.size) return false;
    const hit = aw.filter((w) => bw.has(w)).length;
    return hit >= 2 || hit / aw.length >= 0.6;
  }

  function listDiff(current, forslag) {
    const cur = asList(current).map((item, i) => ({ item, i, key: itemKey(item), used: false }));
    const next = asList(forslag).map((item, i) => ({ item, i, key: itemKey(item), used: false }));

    function takeMatch(n, pred) {
      const c = cur.find((x) => !x.used && pred(x, n));
      if (!c) return null;
      c.used = true;
      n.used = true;
      return c;
    }

    const updated = [];
    next.forEach((n) => {
      if (!n.key) return;
      const c = takeMatch(n, (x) => x.key === n.key);
      if (!c) return;
      if (listItemSignature(c.item) !== listItemSignature(n.item)) {
        updated.push({ current: c.item, forslag: n.item, currentIndex: c.i });
      }
    });
    next.filter((n) => !n.used).forEach((n) => {
      const c = takeMatch(n, (x) => similarKeys(x.key, n.key));
      if (!c) return;
      if (listItemSignature(c.item) !== listItemSignature(n.item)) {
        updated.push({ current: c.item, forslag: n.item, currentIndex: c.i });
      }
    });

    return {
      updated,
      added: next.filter((n) => !n.used).map((n) => n.item),
      removed: cur.filter((c) => !c.used).map((c) => ({ item: c.item, currentIndex: c.i }))
    };
  }

  function listDiffHasChanges(diff) {
    return !!(diff && (diff.updated.length || diff.added.length || diff.removed.length));
  }

  function classifyAndring(falt, current, forslag, andra) {
    if (!andra || sameForslag(falt, current, forslag)) return { key: 'ingen', label: 'Ingen ändring' };
    if (isEmptyCurrent(falt, current)) return { key: 'lagg-till', label: 'Lägger till' };
    if (falt === 'hot' || falt === 'sarbarheter' || falt === 'atgarder') {
      const added = addedListItems(current, forslag);
      const removed = removedListItems(current, forslag);
      if (added.length && !removed.length) {
        return {
          key: 'lagg-till',
          label: added.length === 1 ? 'Lägger till en faktor' : 'Lägger till faktorer'
        };
      }
      if (added.length && removed.length) return { key: 'andra', label: 'Ändrar och lägger till' };
      return { key: 'andra', label: 'Ändrar lista' };
    }
    return { key: 'andra', label: 'Ändrar nuvarande text' };
  }

  function decoratePoster(item, befintligt) {
    const nuvarande = currentValueFor(item.falt, befintligt);
    let andra = !!item.andra;
    if (andra && sameForslag(item.falt, nuvarande, item.forslag)) andra = false;
    return Object.assign({}, item, {
      nuvarande,
      andra,
      forslag: andra ? item.forslag : (item.falt === 'hot' || item.falt === 'sarbarheter' || item.falt === 'atgarder' ? [] : ''),
      klass: classifyAndring(item.falt, nuvarande, andra ? item.forslag : '', andra)
    });
  }

  function isVisibleReviewItem(item) {
    if (item.andra && item.klass && item.klass.key !== 'ingen') return true;
    if (item.andra) return true;
    return !isGenericReviewComment(item.kommentar);
  }

  function scoreSelectHtml(name, selected) {
    const cur = String(selected == null ? '' : selected);
    let html = `<select data-ai-${name} aria-label="${name === 's' ? 'Sannolikhet' : 'Konsekvens'}">`;
    html += '<option value="">Ej satt</option>';
    for (let i = 1; i <= 5; i++) {
      html += `<option value="${i}"${cur === String(i) ? ' selected' : ''}>${i}</option>`;
    }
    html += '</select>';
    return html;
  }

  function listItemChanges(current, forslag) {
    const added = addedListItems(current, forslag);
    const removed = removedListItems(current, forslag);
    const curByKey = new Map();
    asList(current).forEach((item) => {
      const key = itemKey(item);
      if (key) curByKey.set(key, item);
    });
    const changed = asList(forslag).reduce((acc, item) => {
      const prev = curByKey.get(itemKey(item));
      if (prev && listItemSignature(prev) !== listItemSignature(item)) {
        acc.push({ prev, next: item });
      }
      return acc;
    }, []);
    return { added, removed, changed };
  }

  function listItemEditorHtml(falt, item, isNew, prev) {
    const typ = item.typ || 'PT';
    const kat = item.kategori || 'Verksamhet';
    const extra = falt === 'hot'
      ? `<select data-ai-typ aria-label="PT eller TF">
          <option value="PT"${typ === 'PT' ? ' selected' : ''}>PT</option>
          <option value="TF"${typ === 'TF' ? ' selected' : ''}>TF</option>
          <option value="Båda"${typ === 'Båda' ? ' selected' : ''}>Båda</option>
        </select>`
      : falt === 'sarbarheter'
        ? `<select data-ai-kat aria-label="Kategori">
            <option${kat === 'Verksamhet' ? ' selected' : ''}>Verksamhet</option>
            <option${kat === 'Kunder' ? ' selected' : ''}>Kunder</option>
            <option${kat === 'Distribution' ? ' selected' : ''}>Distribution</option>
            <option${kat === 'Geografi' ? ' selected' : ''}>Geografi</option>
          </select>`
        : '';
    const descChanged = !isNew && prev && fold(prev.beskrivning) !== fold(item.beskrivning);
    const kallaChanged = !isNew && prev && falt === 'hot'
      && fold(prev.kalla || prev.källa) !== fold(item.kalla || item.källa);
    return `
      <div class="ai-review-item"${isNew ? ' data-ai-new' : ''}${descChanged || kallaChanged ? ' data-ai-changed' : ''} data-ai-item>
        <div class="ai-review-item-head">
          ${isNew ? '<span class="ai-review-item-new">Ny</span>' : descChanged || kallaChanged ? '<span class="ai-review-item-changed">Ändrad</span>' : ''}
          ${extra}
          <input type="text" data-ai-titel value="${esc(item.titel || item.namn || '')}" placeholder="Titel">
        </div>
        <textarea data-ai-beskrivning rows="3" placeholder="Beskrivning">${esc(item.beskrivning || '')}</textarea>
        ${falt === 'hot' ? `<input type="text" data-ai-kalla value="${esc(item.kalla || item.källa || '')}" placeholder="Källa">` : ''}
      </div>
    `;
  }

  function forslagEditorHtml(item) {
    const falt = item.falt;
    if (falt === 'sxk' || falt === 'residual') {
      const s = item.forslag && typeof item.forslag === 'object' ? item.forslag : {};
      return `
        <div class="ai-review-scores">
          <label>Sannolikhet ${scoreSelectHtml('s', s.sannolikhet)}</label>
          <label>Konsekvens ${scoreSelectHtml('k', s.konsekvens)}</label>
        </div>
      `;
    }
    if (falt === 'hot' || falt === 'sarbarheter' || falt === 'atgarder') {
      const added = new Set(addedListItems(item.nuvarande, item.forslag).map(itemKey));
      const curByKey = new Map();
      asList(item.nuvarande).forEach((row) => {
        const key = itemKey(row);
        if (key) curByKey.set(key, row);
      });
      const rows = asList(item.forslag).map((row) => (
        listItemEditorHtml(falt, row, added.has(itemKey(row)), curByKey.get(itemKey(row)))
      ));
      return `<div class="ai-review-items">${rows.join('')}</div>`;
    }
    if (falt === 'ptTfRelevans') {
      const cur = trimStr(item.forslag) || 'PT';
      return `
        <select data-ai-forslag>
          <option value="PT"${cur === 'PT' ? ' selected' : ''}>PT</option>
          <option value="TF"${cur === 'TF' ? ' selected' : ''}>TF</option>
          <option value="Båda"${cur === 'Båda' ? ' selected' : ''}>Båda</option>
        </select>
      `;
    }
    const text = trimStr(item.forslag);
    const rows = Math.min(12, Math.max(4, text.split('\n').length + 1));
    return `<textarea class="ai-review-forslag-edit" data-ai-forslag rows="${rows}">${esc(text)}</textarea>`;
  }

  function readEditedForslag(card, row) {
    if (!card || !row) return row && row.forslag;
    const falt = row.falt;
    if (falt === 'sxk' || falt === 'residual') {
      return {
        sannolikhet: card.querySelector('[data-ai-s]')?.value || '',
        konsekvens: card.querySelector('[data-ai-k]')?.value || ''
      };
    }
    if (falt === 'hot' || falt === 'sarbarheter' || falt === 'atgarder') {
      return [...card.querySelectorAll('[data-ai-item]')].map((el) => {
        const item = {
          titel: (el.querySelector('[data-ai-titel]')?.value || '').trim(),
          beskrivning: (el.querySelector('[data-ai-beskrivning]')?.value || '').trim()
        };
        if (falt === 'hot') {
          item.typ = el.querySelector('[data-ai-typ]')?.value || 'PT';
          item.kalla = (el.querySelector('[data-ai-kalla]')?.value || '').trim();
        }
        if (falt === 'sarbarheter') item.kategori = el.querySelector('[data-ai-kat]')?.value || 'Verksamhet';
        return item;
      }).filter((item) => item.titel || item.beskrivning || item.kalla);
    }
    const field = card.querySelector('[data-ai-forslag]');
    return field ? String(field.value || '').trim() : row.forslag;
  }

  function mergeHotLists(current, incoming) {
    const out = asList(current).map((item) => Object.assign({}, item));
    const have = new Set(out.map(itemKey).filter(Boolean));
    asList(incoming).forEach((item) => {
      if (!item || typeof item !== 'object') return;
      const key = itemKey(item);
      if (key && have.has(key)) {
        const idx = out.findIndex((row) => itemKey(row) === key);
        if (idx >= 0 && getTjanstTfTackning() && getTjanstTfTackning().isTfHot(item) && !getTjanstTfTackning().isTfHot(out[idx])) {
          out[idx] = Object.assign({}, out[idx], item);
        }
        return;
      }
      out.push(Object.assign({}, item));
      if (key) have.add(key);
    });
    return out;
  }

  function upsertPoster(list, row) {
    const idx = list.findIndex((item) => item && item.falt === row.falt);
    if (idx >= 0) list[idx] = Object.assign({}, list[idx], row);
    else list.push(row);
    return list;
  }

  function ensureAnalysisPosters(kind, befintligt, generated, posters) {
    const catalog = kind === 'ovrig' ? OVRIG_FALT : TJANST_FALT;
    const list = Array.isArray(posters) ? posters.slice() : [];
    Object.keys(catalog).forEach((key) => {
      const current = currentValueFor(key, befintligt);
      if (isEmptyCurrent(key, current)) return;
      const forslag = generatedValueFor(key, generated);
      if (!hasForslag(key, forslag) || sameForslag(key, current, forslag)) return;
      const existing = list.find((item) => item && item.falt === key);
      upsertPoster(list, {
        falt: key,
        etikett: catalog[key].etikett,
        kommentar: (existing && existing.kommentar) || 'AI:s eget förslag efter en samlad analys. Jämför med nuvarande text.',
        andra: true,
        forslag
      });
    });
    return list;
  }

  function ensureTfCoveragePosters(befintligt, generated, posters) {
    const Tf = getTjanstTfTackning();
    const list = Array.isArray(posters) ? posters.slice() : [];
    const existingHot = list.find((item) => item && item.falt === 'hot');
    if (existingHot && Tf && Tf.hasTfHot(existingHot.forslag)) return list;
    if (!Tf || !Tf.tjanstSaknarTfTackning(befintligt || {})) return list;
    const genHot = generated && generated.hot;
    const genMot = generated && generated.tfMotivering;
    if (Tf.hasTfHot(genHot)) {
      const base = existingHot && hasForslag('hot', existingHot.forslag)
        ? existingHot.forslag
        : (befintligt && befintligt.hot);
      return upsertPoster(list, {
        falt: 'hot',
        etikett: TJANST_FALT.hot.etikett,
        kommentar: (existingHot && existingHot.kommentar)
          || 'Tjänsten saknade TF-hot. AI föreslår minst ett TF-hot som komplement till era befintliga hot.',
        andra: true,
        forslag: mergeHotLists(base, genHot)
      });
    }
    if (Tf.tfMotiveringOk(genMot)) {
      return upsertPoster(list, {
        falt: 'tfMotivering',
        etikett: TJANST_FALT.tfMotivering.etikett,
        kommentar: 'Tjänsten saknade TF-täckning. AI föreslår en motivering till varför PT-analysen räcker.',
        andra: true,
        forslag: trimStr(genMot)
      });
    }
    return list;
  }

  function fallbackPosters(kind, generated, befintligt) {
    const catalog = kind === 'ovrig' ? OVRIG_FALT : TJANST_FALT;
    const keys = kind === 'ovrig' ? Object.keys(OVRIG_FALT) : Object.keys(TJANST_FALT);
    return keys.map((key) => {
      const forslag = generatedValueFor(key, generated);
      if (!hasForslag(key, forslag)) return null;
      if (sameForslag(key, currentValueFor(key, befintligt), forslag)) return null;
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
    host._aiPoster = [];
  }

  const TJANST_TAB_FOR_FALT = {
    tjanstebeskrivning: 'oversikt',
    sxk: 'oversikt',
    motiveringInneboende: 'oversikt',
    hot: 'hot',
    tfMotivering: 'hot',
    sarbarheter: 'sarbarhet',
    atgarder: 'atgard',
    residual: 'atgard',
    motiveringResidual: 'atgard'
  };

  const OVRIG_HOST_FOR_FALT = {
    beskrivning: 'beskrivning',
    ptTfRelevans: 'beskrivning',
    sxk: 'sxk',
    motiveringInneboende: 'sxk',
    atgard: 'atgard',
    residual: 'atgard',
    motiveringResidual: 'atgard'
  };

  function tabForFalt(falt, kind) {
    if (kind === 'ovrig') return OVRIG_HOST_FOR_FALT[falt] || 'beskrivning';
    return TJANST_TAB_FOR_FALT[falt] || 'oversikt';
  }

  function tokenizeWords(text) {
    return String(text || '').split(/(\s+)/).filter((t) => t.length);
  }

  function wordDiffTokens(before, after) {
    const a = tokenizeWords(before);
    const b = tokenizeWords(after);
    const m = a.length;
    const n = b.length;
    const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
    const out = [];
    let i = m;
    let j = n;
    while (i > 0 && j > 0) {
      if (a[i - 1] === b[j - 1]) {
        out.push({ t: 'eq', v: a[i - 1] });
        i--;
        j--;
      } else if (dp[i - 1][j] >= dp[i][j - 1]) {
        out.push({ t: 'del', v: a[i - 1] });
        i--;
      } else {
        out.push({ t: 'ins', v: b[j - 1] });
        j--;
      }
    }
    while (i > 0) out.push({ t: 'del', v: a[--i] });
    while (j > 0) out.push({ t: 'ins', v: b[--j] });
    return out.reverse();
  }

  function wordDiffHtml(before, after) {
    const left = trimStr(before);
    const right = trimStr(after);
    if (!left && !right) return '';
    if (!left) return `<ins>${esc(right)}</ins>`;
    if (!right) return `<del>${esc(left)}</del>`;
    if (fold(left) === fold(right)) return esc(left);
    return wordDiffTokens(left, right).map((part) => {
      if (/^\s+$/.test(part.v)) return esc(part.v);
      if (part.t === 'del') return `<del>${esc(part.v)}</del>`;
      if (part.t === 'ins') return `<ins>${esc(part.v)}</ins>`;
      return esc(part.v);
    }).join('');
  }

  function visibleDecorated(poster, befintligt) {
    return (Array.isArray(poster) ? poster : [])
      .map((item) => decoratePoster(item, befintligt))
      .filter(isVisibleReviewItem);
  }

  function itemTitle(item) {
    return trimStr((item && (item.titel || item.namn)) || '') || 'Utan titel';
  }

  function changePoints(item) {
    if (!item || !item.andra) return [];
    if (item.falt === 'hot' || item.falt === 'sarbarheter' || item.falt === 'atgarder') {
      const changes = listItemChanges(item.nuvarande, item.forslag);
      return [
        ...changes.added.map((row) => `Lägger till: ${itemTitle(row)}`),
        ...changes.changed.map((row) => `Justerar: ${itemTitle(row.next)}`),
        ...changes.removed.map((row) => `Tar bort: ${itemTitle(row)}`)
      ];
    }
    if (item.falt === 'sxk' || item.falt === 'residual') {
      return [`Föreslår ${formatForslagPreview(item.falt, item.forslag)}.`];
    }
    if (isEmptyCurrent(item.falt, item.nuvarande)) return ['Fältet är tomt — det här är ett tillägg.'];
    return [];
  }

  function reviewCardHtml(item) {
    const klass = item.klass || { key: 'ingen', label: 'Ingen ändring' };
    const points = changePoints(item);
    return `
      <article class="ai-review-card" data-falt="${esc(item.falt)}">
        <div class="ai-review-card-head">
          <h5>${esc(item.etikett)}</h5>
          <span class="ai-review-kind is-${esc(klass.key)}">${esc(klass.label)}</span>
        </div>
        ${item.kommentar ? `<p class="ai-review-comment">${esc(item.kommentar)}</p>` : ''}
        ${points.length ? `<ul class="ai-review-points">${points.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>` : ''}
        <div class="ai-review-actions">
          ${item.andra ? '<button type="button" class="btn btn-primary btn-sm" data-ai-apply>Kopiera in</button>' : ''}
          <button type="button" class="btn btn-secondary btn-sm" data-ai-dismiss>Avfärda</button>
        </div>
        ${item.andra ? `
          <details class="ai-review-edit">
            <summary>Visa och redigera förslaget</summary>
            ${forslagEditorHtml(item)}
          </details>
        ` : ''}
      </article>
    `;
  }

  function bindReviewHost(host, handlers) {
    const onApply = handlers && handlers.onApply;
    const onDismiss = handlers && handlers.onDismiss;
    const onDismissAll = handlers && handlers.onDismissAll;
    const onEmpty = handlers && handlers.onEmpty;
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
      if (applyBtn && row && onApply) {
        onApply(Object.assign({}, row, { forslag: readEditedForslag(card, row) }));
      }
      if (applyBtn || dismissBtn) card.remove();
      host._aiPoster = (host._aiPoster || []).filter((p) => host.querySelector(`[data-falt="${p.falt}"]`));
      if ((applyBtn || dismissBtn) && onDismiss) onDismiss(row);
      if (!host.querySelector('.ai-review-card')) {
        hideReview(host);
        if (onEmpty) onEmpty(host);
      }
    };
  }

  function renderReview(host, poster, handlers) {
    if (!host) return;
    const items = visibleDecorated(poster, (handlers && handlers.befintligt) || {});
    if (!items.length) {
      hideReview(host);
      return;
    }
    host.hidden = false;
    host.innerHTML = `
      <div class="ai-review-head">
        <div>
          <strong>AI:s egen analys</strong>
          <p>AI har tagit fram kompletta egna förslag. Jämför med nuvarande text, redigera och kopiera in det du vill behålla. Inget skrivs över förrän du väljer.</p>
        </div>
        <button type="button" class="btn btn-secondary btn-sm" data-ai-dismiss-all>Avfärda alla</button>
      </div>
      <div class="ai-review-list">
        ${items.map(reviewCardHtml).join('')}
      </div>
    `;
    host._aiPoster = items;
    bindReviewHost(host, handlers || {});
  }

  function renderReviewByHosts(hostMap, poster, handlers) {
    const opts = handlers || {};
    const items = visibleDecorated(poster, opts.befintligt || {});
    const grouped = {};
    items.forEach((item) => {
      const tab = tabForFalt(item.falt, opts.kind);
      if (!grouped[tab]) grouped[tab] = [];
      grouped[tab].push(item);
    });
    const map = hostMap || {};
    Object.keys(map).forEach((tab) => {
      const host = map[tab];
      if (!host) return;
      const rows = grouped[tab] || [];
      if (!rows.length) {
        hideReview(host);
        return;
      }
      host.hidden = false;
      host.classList.add('ai-review', 'ai-review--inline');
      host.innerHTML = `<div class="ai-review-list">${rows.map(reviewCardHtml).join('')}</div>`;
      host._aiPoster = rows;
      bindReviewHost(host, {
        onApply: opts.onApply,
        onDismiss: opts.onDismiss,
        onEmpty: () => {
          if (opts.onTabCounts) {
            const counts = {};
            Object.keys(map).forEach((key) => {
              const el = map[key];
              counts[key] = el && el.querySelectorAll ? el.querySelectorAll('.ai-review-card').length : 0;
            });
            opts.onTabCounts(counts);
          }
        }
      });
    });
    if (opts.onTabCounts) {
      const counts = {};
      Object.keys(map).forEach((key) => {
        counts[key] = (grouped[key] || []).length;
      });
      opts.onTabCounts(counts);
    }
    return items;
  }

  function hideReviewHosts(hostMap) {
    Object.keys(hostMap || {}).forEach((key) => hideReview(hostMap[key]));
  }

  const api = {
    TJANST_FALT,
    OVRIG_FALT,
    REVIEW_PROMPT_RULES,
    MOTIVERING_AI_RULES,
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
    currentValueFor,
    classifyAndring,
    sameForslag,
    similarKeys,
    listDiff,
    listDiffHasChanges,
    usefulComment,
    isGenericReviewComment,
    decoratePoster,
    isVisibleReviewItem,
    readEditedForslag,
    fallbackPosters,
    ensureAnalysisPosters,
    ensureTfCoveragePosters,
    mergeHotLists,
    hasForslag,
    renderReview,
    renderReviewByHosts,
    hideReview,
    hideReviewHosts,
    tabForFalt,
    wordDiffHtml,
    listItemChanges,
    changePoints,
    itemKey,
    TJANST_TAB_FOR_FALT
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  global.AiFaltGranskning = api;
})(typeof window !== 'undefined' ? window : globalThis);
