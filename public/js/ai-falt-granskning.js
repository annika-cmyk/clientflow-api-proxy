/**
 * AI-analys av tjänst och övrig riskfaktor: egna kompletta förslag plus jämförelse mot ifylld text.
 * Delas av servern (prompt + normalisering) och formulären (analyskort).
 */
(function (global) {
  const TJANST_FALT = {
    tjanstebeskrivning: { etikett: 'Tjänsten' },
    sxk: { etikett: 'Sannolikhet och konsekvens' },
    motiveringInneboende: { etikett: 'Motivering av inneboende risk' },
    residual: { etikett: 'Risk efter åtgärder' },
    motiveringResidual: { etikett: 'Motivering av residualrisk' },
    hot: { etikett: 'Hot och modus' },
    sarbarheter: { etikett: 'Sårbarheter' },
    atgarder: { etikett: 'Åtgärder' }
  };

  const OVRIG_FALT = {
    beskrivning: { etikett: 'Beskrivning' },
    atgard: { etikett: 'Åtgärd' },
    ptTfRelevans: { etikett: 'PT/TF-relevans' },
    sxk: { etikett: 'Sannolikhet och konsekvens' },
    motiveringInneboende: { etikett: 'Motivering av inneboende risk' },
    residual: { etikett: 'Risk efter åtgärd' },
    motiveringResidual: { etikett: 'Motivering av residualrisk' }
  };

  const MOTIVERING_AI_RULES = `- MOTIVERING AV S×K (krav vid tillsyn): Skriv alltid motiveringInneboende och motiveringResidual när du sätter S/K.
- motiveringInneboende: 2–4 meningar som förklarar VARFÖR sannolikheten är som den är (hot/sårbarhet) och VARFÖR konsekvensen är som den är (skada/regulatorisk påverkan). Minst 50 tecken om inneboende risk blir Förhöjd, Hög eller Oacceptabel.
- motiveringResidual: 2–4 meningar om hur åtgärderna sänkt sannolikhet och/eller konsekvens. Minst 50 tecken om residual blir Förhöjd+. Om residual är Hög eller Oacceptabel: nämn riskaptit eller fattat beslut.
- ORDLISTA — skilj dimensioner från risknivå: När du beskriver S eller K ska du alltid nämna siffran (1–5) och använda dimensionsorden: Sannolikhet 1 Mycket låg / 2 Låg / 3 Medel / 4 Hög / 5 Mycket hög; Konsekvens 1 Obetydlig / 2 Lindrig / 3 Kännbar / 4 Allvarlig / 5 Katastrofal.
- Använd ALDRIG orden Förhöjd, Normal eller Oacceptabel som adjektiv för sannolikhet eller konsekvens ensamma. De orden är reserverade för den beräknade risknivån (S×K-produkten: 1–4 Låg, 5–9 Normal, 10–15 Förhöjd, 16–19 Hög, 20–25 Oacceptabel).
- Skriv inte «sannolikheten är förhöjd» eller «konsekvensen är betydande». Rätt: «Sannolikheten bedöms till 3 (medel) … Konsekvensen bedöms till 3 (kännbar) …» Om du nämner inneboende/residual risknivå ska den stämma med S×K.`;

  const REVIEW_PROMPT_RULES = `ANALYSLÄGE (när befintligt innehåll finns):
- Du ska INTE bara språkgranska eller kommentera det som redan står. Gör en självständig, omfattande AML-analys av hela tjänsten eller riskfaktorn.
- OBLIGATORISKT — komplettera ALLA sektioner i ETT svar. Huvudfälten ska alltid innehålla din fullständiga analys för: beskrivning, hot, sarbarheter, atgarder, sannolikhet, konsekvens, motiveringInneboende, sannolikhetEfter, konsekvensEfter, motiveringResidual. Lämna aldrig hot/sårbarheter/åtgärder/motivering tomma bara för att beskrivningen redan är ifylld.
- Ta fram DITT kompletta förslag för ALLA fält: beskrivning (3–5 meningar), S×K, motivering av S/K, residual, motivering av residual, fullständiga listor för hot/sårbarheter/åtgärder (med källor på hot). Antalet poster enligt ANTAL-regeln.
- Befintlig text är underlag du får förhålla dig till — inte facit. Fyll luckor, skriv om vaga hot till konkret mekanism (felaktig uppgift/faktura/betalning/ansökan; hur pengar kommer in, flyttas eller legitimeras; byråns roll; PT, TF eller båda), justera S×K om din analys ger annan nivå, och skriv en rikare beskrivning när den är tunn. Kräv inte ett separat TF-hot per tjänst. Avfärda inte TF bara för att tjänsten inte avser ideell organisation eller utlandsbetalning.
- Kopiera inte rakt av befintliga listor eller motiveringar. En lätt omskrivning räcker inte. Skriv om hot/sårbarheter/åtgärder med konkret mekanism utifrån byråquiz, utförandefrågor, statistik och kunskapsbas — även när listorna redan har poster.
- Tomma fält: skriv ditt förslag i huvudfälten.
- Ifyllda fält som skiljer sig från din analys: lägg en post i granskning.poster med andra=true. forslag är valfritt (servern lyfter innehållet från huvudfälten) — prioritera kommentar och andringar[].
- kommentar: 2–3 meningar om HELHETEN — vad analysen tillför och varför du föreslår ändringar (luckor, TF, S×K, källor). Skriv så att en kollega förstår utan att läsa hela listan.
- För listfält (hot, sarbarheter, atgarder): lägg OCKSÅ andringar[] med EN post per tillägg, redigering eller borttagning:
  { "titel": "samma titel som raden gäller", "typ": "lagg-till|redigera|ta-bort", "kommentar": "1–2 meningar: VARFÖR just denna ändring — koppla till tjänsten, TF, källor eller varför något ska bort." }
- Vid ta-bort: förklara uttryckligen varför faktorn inte behövs (dubblett, irrelevant, fel typ, redan täckt, svag koppling till tjänsten).
- Vid redigera: förklara vad som är bristfälligt i nuvarande text och vad ditt förslag förbättrar.
- Vid lagg-till: förklara varför faktorn saknas men behövs i analysen.
- andra=false bara om ditt förslag är identiskt med nuvarande innehåll efter en genuin omprövning.`;

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
      parts.push(`Tjänsten:\n${trimStr(o.tjanstebeskrivning)}`);
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
        return `${h.titel || ''} — ${h.beskrivning || ''}${kalla}`;
      }));
    }
    if (keys.includes('sarbarheter')) {
      parts.push('Sårbarheter:\n' + formatList(o.sarbarheter, (s) => (
        `${s.titel || ''} — ${s.beskrivning || ''}`
      )));
    }
    if (keys.includes('atgarder')) {
      parts.push('Åtgärder:\n' + formatList(o.atgarder, (a) => (
        `${a.titel || a.namn || ''} — ${a.beskrivning || ''}`
      )));
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
      const nuvarande = currentValueFor(key, befintligt);
      const andringar = (key === 'hot' || key === 'sarbarheter' || key === 'atgarder')
        ? normalizeAndringar(item.andringar || item.andring || item.listAndringar, key, nuvarande, parsed)
        : asList(item.andringar);
      if (!kommentar && !andra) return;
      poster.push({
        falt: key,
        etikett: catalog[key].etikett,
        kommentar,
        andringar,
        andra,
        forslag: andra ? parsed : (key === 'hot' || key === 'sarbarheter' || key === 'atgarder' ? [] : '')
      });
    });
    return poster;
  }

  function generatedValueFor(falt, generated) {
    const g = generated || {};
    if (falt === 'tjanstebeskrivning') return trimStr(g.tjanstebeskrivning || g.beskrivning);
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
        const title = item.titel || item.namn || '';
        const desc = item.beskrivning || '';
        return `${i + 1}. ${title}${desc ? ` — ${desc}` : ''}`;
      }).join('\n');
    }
    return trimStr(forslag);
  }

  function currentValueFor(falt, befintligt) {
    const o = befintligt || {};
    if (falt === 'tjanstebeskrivning') return trimStr(o.tjanstebeskrivning);
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

  const ANDRING_TYP = {
    'lagg-till': 'lagg-till',
    'lagg till': 'lagg-till',
    add: 'lagg-till',
    ny: 'lagg-till',
    redigera: 'redigera',
    andra: 'redigera',
    andring: 'redigera',
    update: 'redigera',
    'ta-bort': 'ta-bort',
    'ta bort': 'ta-bort',
    remove: 'ta-bort',
    stryk: 'ta-bort',
    bort: 'ta-bort'
  };

  function normalizeAndringTyp(raw) {
    const t = fold(raw);
    return ANDRING_TYP[t] || '';
  }

  function normalizeAndringar(raw, falt, nuvarande, forslag) {
    const out = [];
    asList(raw).forEach((row) => {
      if (!row || typeof row !== 'object') return;
      const typ = normalizeAndringTyp(row.typ || row.andring || row.action);
      const titel = trimStr(row.titel || row.namn || row.title);
      const kommentar = usefulComment(row.kommentar || row.comment || row.varfor);
      if (!typ || !titel || !kommentar) return;
      out.push({ typ, titel, kommentar });
    });
    if (falt !== 'hot' && falt !== 'sarbarheter' && falt !== 'atgarder') return out;
    const diff = listDiff(nuvarande, forslag);
    const have = new Set(out.map((row) => `${row.typ}:${fold(row.titel)}`));
    diff.added.forEach((item) => {
      const key = fold(itemTitle(item));
      if (!key || have.has(`lagg-till:${key}`)) return;
      out.push({ typ: 'lagg-till', titel: itemTitle(item), kommentar: buildFallbackItemComment(falt, 'lagg-till', null, item) });
    });
    diff.updated.forEach((row) => {
      const key = fold(itemTitle(row.forslag));
      if (!key || have.has(`redigera:${key}`)) return;
      out.push({
        typ: 'redigera',
        titel: itemTitle(row.forslag),
        kommentar: buildFallbackItemComment(falt, 'redigera', row.current, row.forslag)
      });
    });
    diff.removed.forEach((row) => {
      const key = fold(itemTitle(row.item));
      if (!key || have.has(`ta-bort:${key}`)) return;
      out.push({
        typ: 'ta-bort',
        titel: itemTitle(row.item),
        kommentar: buildFallbackItemComment(falt, 'ta-bort', row.item, null)
      });
    });
    return out;
  }

  function andringCommentMap(andringar) {
    const map = new Map();
    asList(andringar).forEach((row) => {
      const typ = normalizeAndringTyp(row.typ);
      const key = fold(row.titel);
      const comment = usefulComment(row.kommentar);
      if (typ && key && comment) map.set(`${typ}:${key}`, comment);
    });
    return map;
  }

  function listItemFieldChanges(falt, current, forslag) {
    const parts = [];
    if (!current || !forslag) return parts;
    if (fold(current.titel || current.namn) !== fold(forslag.titel || forslag.namn)) {
      parts.push('titeln');
    }
    if (fold(current.beskrivning) !== fold(forslag.beskrivning)) {
      parts.push('beskrivningen');
    }
    if (falt === 'hot' || falt === 'sarbarheter') {
      const curK = trimStr(current.kalla || current.källa);
      const nextK = trimStr(forslag.kalla || forslag.källa);
      if (fold(curK) !== fold(nextK)) {
        parts.push(curK ? 'källan' : 'källa läggs till');
      }
    }
    return parts;
  }

  function buildFallbackItemComment(falt, changeKind, current, forslag) {
    const title = itemTitle(forslag || current);
    if (changeKind === 'lagg-till') {
      if (falt === 'hot') {
        return `AI vill lägga till «${title}» eftersom hotet saknas i er lista men är relevant för tjänsten enligt analysen.`;
      }
      if (falt === 'sarbarheter') {
        return `AI vill lägga till sårbarheten «${title}» eftersom den saknas men påverkar hur hot kan realiseras.`;
      }
      return `AI vill lägga till «${title}» eftersom den saknas i er lista men behövs i den samlade analysen.`;
    }
    if (changeKind === 'ta-bort') {
      return `AI föreslår att ta bort «${title}» eftersom den inte ingår i den samlade analysen — den bedöms vara överflödig, svagt kopplad till tjänsten eller redan täckt av andra faktorer.`;
    }
    const fields = listItemFieldChanges(falt, current, forslag);
    if (fields.length) {
      return `AI föreslår att justera ${fields.join(', ')} för «${title}» så att kopplingen till tjänsten och AML/TF blir tydligare.`;
    }
    return `AI föreslår en justering av «${title}».`;
  }

  function getListItemComment(item, changeKind, current, forslag) {
    const map = item._andringMap || andringCommentMap(item.andringar);
    const key = fold(itemTitle(forslag || current));
    const fromMap = key ? map.get(`${changeKind}:${key}`) : '';
    if (fromMap) return fromMap;
    return buildFallbackItemComment(item.falt, changeKind, current, forslag);
  }

  function explainTextFieldChange(falt, current, forslag) {
    if (falt === 'sxk' || falt === 'residual') {
      const curObj = current && typeof current === 'object' ? current : {};
      const nextObj = forslag && typeof forslag === 'object' ? forslag : {};
      if (sameForslag(falt, curObj, nextObj)) return '';
      if (isEmptyCurrent(falt, curObj)) {
        return 'Fältet var tomt — AI föreslår S×K enligt analysen.';
      }
      const parts = [];
      if (scoreKey(curObj.sannolikhet) !== scoreKey(nextObj.sannolikhet)) {
        parts.push(`sannolikhet ${curObj.sannolikhet || '–'} → ${nextObj.sannolikhet || '–'}`);
      }
      if (scoreKey(curObj.konsekvens) !== scoreKey(nextObj.konsekvens)) {
        parts.push(`konsekvens ${curObj.konsekvens || '–'} → ${nextObj.konsekvens || '–'}`);
      }
      return parts.length
        ? `AI föreslår att ändra ${parts.join(' och ')} eftersom den bedömer risknivån annorlunda utifrån hot, sårbarheter och åtgärder.`
        : '';
    }
    const cur = trimStr(current);
    const next = trimStr(forslag);
    if (!cur || !next || fold(cur) === fold(next)) return '';
    if (isEmptyCurrent(falt, cur)) {
      return 'Fältet var tomt — AI föreslår att fylla i text enligt analysen.';
    }
    return 'AI föreslår att skriva om texten för att tydligare beskriva inneboende risk och koppling till AML/TF.';
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
    const andringar = (item.falt === 'hot' || item.falt === 'sarbarheter' || item.falt === 'atgarder')
      ? normalizeAndringar(item.andringar, item.falt, nuvarande, andra ? item.forslag : '')
      : asList(item.andringar);
    const fieldExplain = andra && item.falt !== 'hot' && item.falt !== 'sarbarheter' && item.falt !== 'atgarder'
      ? explainTextFieldChange(item.falt, nuvarande, item.forslag)
      : '';
    const kommentar = usefulComment(item.kommentar) || fieldExplain;
    return Object.assign({}, item, {
      nuvarande,
      andra,
      kommentar,
      andringar,
      _andringMap: andringCommentMap(andringar),
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
    const typ = (item && item.typ) || '';
    const descChanged = !isNew && prev && fold(prev.beskrivning) !== fold(item.beskrivning);
    const showKalla = falt === 'hot' || falt === 'sarbarheter';
    const kallaChanged = !isNew && prev && showKalla
      && fold(prev.kalla || prev.källa) !== fold(item.kalla || item.källa);
    return `
      <div class="ai-review-item"${isNew ? ' data-ai-new' : ''}${descChanged || kallaChanged ? ' data-ai-changed' : ''} data-ai-item${typ ? ` data-typ="${esc(typ)}"` : ''}>
        <div class="ai-review-item-head">
          ${isNew ? '<span class="ai-review-item-new">Ny</span>' : descChanged || kallaChanged ? '<span class="ai-review-item-changed">Ändrad</span>' : ''}
          <div class="ai-review-item-titel">
            <label class="ai-review-field-label">Titel</label>
            <input type="text" data-ai-titel value="${esc(item.titel || item.namn || '')}" placeholder="Titel">
          </div>
        </div>
        <div class="ai-review-item-besk">
          <label class="ai-review-field-label">Beskrivning</label>
          <textarea data-ai-beskrivning rows="3" placeholder="Beskrivning">${esc(item.beskrivning || '')}</textarea>
        </div>
        ${showKalla ? `<div class="ai-review-item-kalla">
          <label class="ai-review-field-label">Källa</label>
          <input type="text" data-ai-kalla value="${esc(item.kalla || item.källa || '')}" placeholder="Utgivare — dokument, kap. — https://…">
        </div>` : ''}
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
          const typ = (el.getAttribute('data-typ') || '').trim();
          if (typ) item.typ = typ;
          item.kalla = (el.querySelector('[data-ai-kalla]')?.value || '').trim();
        }
        if (falt === 'sarbarheter') {
          item.kalla = (el.querySelector('[data-ai-kalla]')?.value || '').trim();
        }
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
      const forslag = generatedValueFor(key, generated);
      // Lyft förslag även för tomma fält så banner/flikar listar alla sektioner
      // (inte bara Översikt). Tomma fält visas som AI-förslag i stället för tyst ifyllning.
      if (!hasForslag(key, forslag) || sameForslag(key, current, forslag)) return;
      const existing = list.find((item) => item && item.falt === key);
      const empty = isEmptyCurrent(key, current);
      upsertPoster(list, {
        falt: key,
        etikett: catalog[key].etikett,
        kommentar: (existing && existing.kommentar)
          || (empty
            ? 'Fältet var tomt — AI:s förslag efter en samlad analys av hela tjänsten.'
            : 'AI:s eget förslag efter en samlad analys. Jämför med nuvarande text.'),
        andra: true,
        forslag
      });
    });
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
    sxk: 'inneboende',
    motiveringInneboende: 'inneboende',
    hot: 'hot',
    sarbarheter: 'sarbarhet',
    atgarder: 'atgard',
    residual: 'residual',
    motiveringResidual: 'residual'
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
      const map = item._andringMap || andringCommentMap(item.andringar);
      const changes = listItemChanges(item.nuvarande, item.forslag);
      const points = [];
      changes.added.forEach((row) => {
        const key = fold(itemTitle(row));
        const why = map.get(`lagg-till:${key}`) || buildFallbackItemComment(item.falt, 'lagg-till', null, row);
        points.push(`Lägger till «${itemTitle(row)}»: ${why}`);
      });
      changes.changed.forEach((row) => {
        const key = fold(itemTitle(row.next));
        const why = map.get(`redigera:${key}`) || buildFallbackItemComment(item.falt, 'redigera', row.prev, row.next);
        points.push(`Ändrar «${itemTitle(row.next)}»: ${why}`);
      });
      changes.removed.forEach((row) => {
        const key = fold(itemTitle(row));
        const why = map.get(`ta-bort:${key}`) || buildFallbackItemComment(item.falt, 'ta-bort', row, null);
        points.push(`Tar bort «${itemTitle(row)}»: ${why}`);
      });
      return points;
    }
    if (item.falt === 'sxk' || item.falt === 'residual') {
      const explain = explainTextFieldChange(item.falt, item.nuvarande, item.forslag);
      return explain
        ? [`Föreslår ${formatForslagPreview(item.falt, item.forslag)}. ${explain}`]
        : [`Föreslår ${formatForslagPreview(item.falt, item.forslag)}.`];
    }
    if (isEmptyCurrent(item.falt, item.nuvarande)) return ['Fältet är tomt — det här är ett tillägg.'];
    const explain = explainTextFieldChange(item.falt, item.nuvarande, item.forslag);
    return explain ? [explain] : [];
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
        ${item.kommentar ? `<p class="ai-review-comment"><strong>Varför:</strong> ${esc(item.kommentar)}</p>` : ''}
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

  let reviewPromptRules = REVIEW_PROMPT_RULES;
  if (typeof require === 'function') {
    try {
      const { REDOVISNINGSBYRA_AI_RULES } = require('../../lib/redovisningsbyra-ai-kontext');
      reviewPromptRules = `${REDOVISNINGSBYRA_AI_RULES}\n\n${REVIEW_PROMPT_RULES}`;
    } catch (_) { /* browser */ }
  }

  const api = {
    TJANST_FALT,
    OVRIG_FALT,
    REVIEW_PROMPT_RULES: reviewPromptRules,
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
    normalizeAndringTyp,
    normalizeAndringar,
    andringCommentMap,
    getListItemComment,
    buildFallbackItemComment,
    listItemFieldChanges,
    explainTextFieldChange,
    decoratePoster,
    isVisibleReviewItem,
    readEditedForslag,
    fallbackPosters,
    ensureAnalysisPosters,
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
