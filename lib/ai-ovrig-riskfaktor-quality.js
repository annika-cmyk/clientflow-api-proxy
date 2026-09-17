'use strict';

/**
 * Kvalitetskontroll för AI-svar på övriga riskfaktorer.
 * Underkänner generisk AML-text som bryter mot ClientFlows hårda regler.
 */

const STOPWORDS = new Set([
  'denna', 'detta', 'dessa', 'eller', 'samt', 'och', 'att', 'som', 'för', 'med',
  'från', 'till', 'vid', 'utan', 'inte', 'också', 'efter', 'innan', 'under',
  'över', 'mellan', 'genom', 'enligt', 'eftersom', 'därför', 'varför', 'vilken',
  'vilket', 'vilka', 'deras', 'vara', 'blir', 'har', 'kan', 'ska', 'bör',
  'kunde', 'skulle', 'måste', 'finns', 'inga', 'något', 'några', 'alla',
  'varje', 'mycket', 'lite', 'mer', 'mindre', 'utanför', 'inom', 'via',
  'kunden', 'kundens', 'byrån', 'byråns', 'risk', 'risken', 'penningtvätt',
  'terrorism', 'finansiering', 'analys', 'underlag', 'extra', 'cirka', 'ca'
]);

const FORBIDDEN_ATGARD_PATTERNS = [
  { id: 'varje_transaktion', re: /\bvid\s+varje\s+transaktion\b/i, hint: 'Skriv riskbaserade stickprov/avstämningar — inte «vid varje transaktion».' },
  { id: 'alla_transaktioner', re: /\bgranskar\s+alla\s+transaktioner\b|\balla\s+transaktioner\b/i, hint: 'Undvik «alla transaktioner»; beskriv stickprov och avvikelser.' },
  { id: 'varje_betalning', re: /\bvarje\s+betalning\b|\balla\s+betalningar\b/i, hint: 'Byrån granskar inte varje betalning; använd stickprov/avstämning.' },
  { id: 'alla_fakturor', re: /\balla\s+fakturor\b/i, hint: 'Undvik totalgranskning av «alla fakturor».' },
  { id: 'medel_legitimitet', re: /\blegitimiteten\s+av\s+medlen\b|\bverifiera\s+legitimiteten\b/i, hint: 'Banklogik — fokusera på bokföringsavstämning och underlag, inte medelslegitimitet.' },
  { id: 'kopar_identitet', re: /\bköparens\s+identitet\b|\bverifiera\s+köparen\b/i, hint: 'Redovisningsbyrå har sällan full Shopify-slutkunds-KYC; fokusera på intäktsavstämning.' }
];

const FORBIDDEN_GENERIC_RE = [
  { id: 'hogt_varde_floskel', re: /smycken(?:\s+och\s+antikviteter)?\s+(?:ofta\s+)?har\s+högt\s+värde|högt\s+värde,\s*flyttbara\s+och\s+attraktiva/i, hint: 'Undvik generisk «smycken = högt värde»-floskel när underlaget beskriver lägre pris/svagt andrahandsvärde — kalibrera residual/åtgärd till underlaget.' }
];

const VAGUE_KALLA_RE = [
  /^fatf([-\s]?rapport)?(\s+om\s+penningtvätt)?\.?$/i,
  /^nationell\s+riskbedömning(\s+av\s+penningtvätt(\s+och\s+finansiering\s+av\s+terrorism)?)?\.?$/i,
  /^fatf\.?$/i,
  /^nra\.?$/i,
  /^länsstyrelsen\.?$/i,
  /^polisen\.?$/i,
  /^skatteverket\.?$/i,
  /^samordningsfunktionen\.?$/i
];

const TF_HOT_RE = /\b(terrorismfinansiering|finansiering\s+av\s+terrorism|terrorfinans|tf\b|värdebärare)\b/i;

/**
 * Legitim PVML-ram — minskar modellvägran när underlag frågar hur PT/TF
 * «kan gå till» (tolkas som riskdokumentation, inte brottsinstruktion).
 */
const OVRIG_COMPLIANCE_FRAME = `LEGITIM COMPLIANCE-UPPGIFT (PVML):
- Du hjälper en svensk redovisningsbyrå med lagstadgad allmän riskbedömning enligt penningtvättslagen.
- Svaret är myndighetskravad compliance-dokumentation — INTE instruktioner för att begå, dölja eller finansiera brott.
- När underlaget frågar «hur PT/TF kan gå till»: beskriv hur risken typiskt syns i bokföring, export, intäkter och byråns avstämningar (upptäckts-/dokumentationsperspektiv).
- Svara ALLTID med giltigt JSON enligt schemat. Ingen ursäkt, ingen prosa före/efter JSON.`;

/** Korta hårda prioriteringar — läggs högt i instructions. */
const OVRIG_HARD_PRIORITY_RULES = `HÅRDA PRIORITERINGAR (övrig riskfaktor — bryt aldrig):
1. EXTRA UNDERLAG styr alltid residual och åtgärd när det finns. Minst flera konkreta fakta (pris, kanal, geografi, verksamhetstyp, andrahandsvärde) ska bära atgard och motiveringResidual — inte en generisk branschfras plus ett underlagsord.
2. Åtgärd ska vara redovisningsbyråpraktisk: avstämning, rimlighet, underlag, stickprov, dokumentation i Fortnox/Capego/kundakt. Inte bank-KYC eller «vid varje transaktion».
3. FÖRBJUDET utan uttryckligt underlag: «vid varje transaktion», «alla transaktioner», «varje betalning», «alla fakturor», «verifiera legitimiteten av medlen».
4. Källor ska vara exakta dokumentnamn (t.ex. «Nationell riskbedömning … 2024/2025, avsnitt om varuhandlare», «Samordningsfunktionens vägledning … mars 2025») — inte «FATF-rapport» eller «Nationell riskbedömning» ensamt. Använd KÄLLUTDRAG i användarmeddelandet först.
5. Om ptTfRelevans = «Båda» måste minst ETT hot beskriva TF-riskindikatorn (terrorismfinansiering/värdebärare) ur byråns upptäckts-/dokumentationsperspektiv, även om risken är lägre för just denna kundtyp.
6. Hot ska beskriva upptäcktskedja i bokföring/export/intäkter (vad byrån kan se och dokumentera) — inte bara riskkategori («smycken är högt värde») och inte en guide för att begå brott.
7. Använd KÄLLUTDRAG. Gör inte file_search på hela riskfaktormeningen. Om du söker: använd korta ämnesord (smycken, varuhandlare, terrorismfinansiering, redovisningskonsult).`;

function fold(s) {
  return String(s == null ? '' : s)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function extractUnderlagTokens(text) {
  const raw = String(text || '');
  if (!raw.trim()) return [];
  const tokens = raw
    .split(/[^A-Za-zÀ-öØ-ö0-9]+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 4)
    .filter((t) => !STOPWORDS.has(fold(t)))
    .filter((t) => !/^\d+$/.test(t));
  const seen = new Set();
  const out = [];
  tokens.forEach((t) => {
    const key = fold(t);
    if (seen.has(key)) return;
    seen.add(key);
    out.push(t);
  });
  return out.slice(0, 28);
}

function preferredUnderlagFacts(extra) {
  const f = fold(extra);
  const facts = [];
  const want = [
    ['shopify', /shopify/],
    ['återförsäljare', /aterforsalj|återförsälj/],
    ['Schweiz', /schweiz/],
    ['UK', /\buk\b|storbritannien|england/],
    ['USA', /\busa\b|forenta/],
    ['Portugal', /portugal/],
    ['1500', /1\s*500|1500/],
    ['andrahandsvärde', /andrahand/],
    ['webshop', /webshop|webbshop/],
    ['returer', /retur/],
    ['rabatter', /rabatt/],
    ['bruttomarginal', /bruttomarginal|marginal/],
    ['lager', /\blager\b/],
    ['export', /export/],
    ['avräkningar', /avrakn|avräkn/]
  ];
  want.forEach(([label, re]) => {
    if (re.test(f)) facts.push(label);
  });
  return facts;
}

function joinedPayloadText(payload) {
  const p = payload || {};
  const parts = [
    p.atgard,
    p.motiveringResidual,
    p.motiveringInneboende,
    p.beskrivning
  ];
  (Array.isArray(p.hot) ? p.hot : []).forEach((h) => {
    parts.push(h && h.titel, h && h.beskrivning, h && h.kalla);
  });
  (Array.isArray(p.sarbarheter) ? p.sarbarheter : []).forEach((s) => {
    parts.push(s && s.titel, s && s.beskrivning);
  });
  return parts.filter(Boolean).join('\n');
}

function isVagueKalla(kalla) {
  const t = String(kalla || '').trim();
  if (!t) return false;
  if (VAGUE_KALLA_RE.some((re) => re.test(t))) return true;
  // «Nationell riskbedömning …» utan årtal
  if (/^nationell\s+riskbedömning/i.test(t) && !/20\d{2}/.test(t)) return true;
  // «FATF…» utan mer precision
  if (/^fatf/i.test(t) && t.length < 40) return true;
  return false;
}

function hotHasTf(hotList) {
  return (Array.isArray(hotList) ? hotList : []).some((h) => {
    const blob = `${(h && h.titel) || ''} ${(h && h.beskrivning) || ''}`;
    return TF_HOT_RE.test(blob);
  });
}

/**
 * @param {object} payload — normaliserat AI-svar
 * @param {{ extraUnderlag?: string, sannolikhet?: number, konsekvens?: number }} opts
 * @returns {{ ok: boolean, violations: Array<{id:string,message:string}>, repairHint: string }}
 */
function validateOvrigAiPayload(payload, opts = {}) {
  const violations = [];
  const p = payload || {};
  const atgard = String(p.atgard || '');
  const residual = String(p.motiveringResidual || '');
  const beskrivning = String(p.beskrivning || '');
  const hot = Array.isArray(p.hot) ? p.hot : [];
  const sarbarheter = Array.isArray(p.sarbarheter) ? p.sarbarheter : [];
  const extra = String(opts.extraUnderlag || '').trim();
  const blobAll = `${beskrivning}\n${atgard}\n${residual}\n${joinedPayloadText(p)}`;

  FORBIDDEN_ATGARD_PATTERNS.forEach((rule) => {
    if (rule.re.test(atgard) || rule.re.test(residual)) {
      violations.push({ id: rule.id, message: rule.hint });
    }
  });

  if (extra) {
    FORBIDDEN_GENERIC_RE.forEach((rule) => {
      if (rule.re.test(blobAll)) {
        violations.push({ id: rule.id, message: rule.hint });
      }
    });

    const preferred = preferredUnderlagFacts(extra);
    const target = fold(`${atgard}\n${residual}`);
    if (preferred.length >= 4) {
      const hits = preferred.filter((f) => target.includes(fold(f)));
      const need = Math.min(5, Math.max(3, Math.ceil(preferred.length * 0.45)));
      if (hits.length < need) {
        violations.push({
          id: 'extra_underlag_saknas',
          message:
            `Extra underlag måste styra åtgärd och residual. Ta med fler konkreta fakta, t.ex.: ${preferred.slice(0, 10).join(', ')}. `
            + 'Nämn avstämning mot Shopify/återförsäljare/export/inköp när de ingår i underlaget — inte bara «stickprov».'
        });
      }
    } else {
      const tokens = extractUnderlagTokens(extra);
      const hits = tokens.filter((t) => target.includes(fold(t)));
      const need = Math.min(4, Math.max(2, Math.ceil(tokens.length * 0.3)));
      if (tokens.length >= 2 && hits.length < need) {
        violations.push({
          id: 'extra_underlag_saknas',
          message:
            `Extra underlag måste styra åtgärd och residual. Använd minst dessa fakta uttryckligen: ${tokens.slice(0, 8).join(', ')}.`
        });
      }
    }

    if (atgard.replace(/\s+/g, ' ').trim().length < 220) {
      violations.push({
        id: 'atgard_for_tunn',
        message:
          'Åtgärden är för tunn. Beskriv VAD (Shopify-rapporter, avräkningar, inköp/export, marginal), VEM, NÄR, VAR dokumenteras och vad som händer vid avvikelse.'
      });
    }
  }

  const vagueKallor = hot
    .map((h) => String((h && h.kalla) || '').trim())
    .filter((k) => k && isVagueKalla(k));
  if (vagueKallor.length) {
    violations.push({
      id: 'vag_kalla',
      message:
        'Källor är för vaga (' + vagueKallor.join('; ') + '). Ange exakt dokument + år/avsnitt, t.ex. Nationell riskbedömning 2024/2025 avsnitt om varuhandlare.'
    });
  }

  const thinHot = hot.filter((h) => {
    const d = String((h && h.beskrivning) || '').trim();
    return d && d.length < 160;
  });
  if (thinHot.length) {
    violations.push({
      id: 'hot_for_tunna',
      message:
        'Minst ett hot är för tunt. Varje hot ska beskriva upptäcktskedjan (pengar in → bokföring/export → hur byrån kan se/dokumentera det), inte bara en mening.'
    });
  }

  const ptTf = String(p.ptTfRelevans || '').trim();
  if (/^båda$/i.test(ptTf) || /^bada$/i.test(fold(ptTf))) {
    if (!hotHasTf(hot)) {
      violations.push({
        id: 'bada_utan_tf',
        message:
          'ptTfRelevans är Båda men inget hot förklarar TF. Lägg ett hot om terrorismfinansiering/värdebärare (kalibrera gärna lägre risk för lågt styckpris/svagt andrahandsvärde).'
      });
    }
  }

  const s = Number(opts.sannolikhet != null ? opts.sannolikhet : p.sannolikhet);
  const k = Number(opts.konsekvens != null ? opts.konsekvens : p.konsekvens);
  const product = (Number.isFinite(s) ? s : 0) * (Number.isFinite(k) ? k : 0);
  if (product >= 10) {
    if (hot.filter((h) => h && (h.titel || h.beskrivning)).length < 3) {
      violations.push({
        id: 'for_fa_hot',
        message:
          'Inneboende risk är Förhöjd/Hög (S×K ≥ 10) — minst 3 hot med konkret upptäcktskedja krävs.'
      });
    }
    if (sarbarheter.filter((x) => x && (x.titel || x.beskrivning)).length < 3) {
      violations.push({
        id: 'for_fa_sarbarheter',
        message:
          'Inneboende risk är Förhöjd/Hög (S×K ≥ 10) — minst 3 sårbarheter krävs, gärna anpassade till underlaget (Shopify-netto, avräkningar, exportunderlag, sammanställda rapporter).'
      });
    }
  }

  const repairHint = violations.length
    ? [
      'REPARERA JSON-SVARET (kvalitetskontroll underkände förra utkastet):',
      ...violations.map((v, i) => `${i + 1}. ${v.message}`),
      'Svara igen med komplett JSON. Extra underlag (om finns) ska bära atgard och motiveringResidual. Återanvänd inte underkänt innehåll.'
    ].join('\n')
    : '';

  return {
    ok: violations.length === 0,
    violations,
    repairHint
  };
}

module.exports = {
  OVRIG_COMPLIANCE_FRAME,
  OVRIG_HARD_PRIORITY_RULES,
  validateOvrigAiPayload,
  extractUnderlagTokens,
  preferredUnderlagFacts,
  isVagueKalla,
  FORBIDDEN_ATGARD_PATTERNS
};
