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

const VAGUE_KALLA_RE = [
  /^fatf[-\s]?rapport(\s+om\s+penningtvätt)?\.?$/i,
  /^nationell\s+riskbedömning(\s+av\s+penningtvätt)?\.?$/i,
  /^fatf\.?$/i,
  /^nra\.?$/i,
  /^länsstyrelsen\.?$/i,
  /^polisen\.?$/i
];

const TF_SIGNAL_RE = /\b(tf|terrorism|terrorfinans|finansiering\s+av\s+terrorism|terrorismfinansiering|värdebärare|lyxvaror?\s+föras\s+ut)\b/i;

/** Korta hårda prioriteringar — läggs högt i instructions. */
const OVRIG_HARD_PRIORITY_RULES = `HÅRDA PRIORITERINGAR (övrig riskfaktor — bryt aldrig):
1. EXTRA UNDERLAG styr alltid residual och åtgärd när det finns. Minst flera konkreta fakta (pris, kanal, geografi, verksamhetstyp, andrahandsvärde) ska bära atgard och motiveringResidual — inte en generisk branschfras plus ett underlagsord.
2. Åtgärd ska vara redovisningsbyråpraktisk: avstämning, rimlighet, underlag, stickprov, dokumentation i Fortnox/Capego/kundakt. Inte bank-KYC eller «vid varje transaktion».
3. FÖRBJUDET utan uttryckligt underlag: «vid varje transaktion», «alla transaktioner», «varje betalning», «alla fakturor», «verifiera legitimiteten av medlen».
4. Källor ska vara exakta dokumentnamn (t.ex. «Nationell riskbedömning … 2024/2025, avsnitt om varuhandlare», «Samordningsfunktionens vägledning … mars 2025») — inte «FATF-rapport» eller «Nationell riskbedömning» ensamt.
5. Om ptTfRelevans = «Båda» måste minst ett hot eller en motivering förklara TF-mekanismen (även om den är lägre för just denna kundtyp).
6. Hot ska beskriva modus steg för steg (hur upplägget fungerar via bokföring/export/intäkter) — inte bara riskkategori («smycken är högt värde»).
7. Ignorera irrelevanta file_search-träffar (robotik, AI-policing, bank-only, obemannade system). Använd bara myndighets-/AML-vägledning för redovisningskonsulter.`;

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
    .filter((t) => t.length >= 5)
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
  return out.slice(0, 24);
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
  return VAGUE_KALLA_RE.some((re) => re.test(t));
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
  const hot = Array.isArray(p.hot) ? p.hot : [];
  const extra = String(opts.extraUnderlag || '').trim();

  FORBIDDEN_ATGARD_PATTERNS.forEach((rule) => {
    if (rule.re.test(atgard) || rule.re.test(residual)) {
      violations.push({ id: rule.id, message: rule.hint });
    }
  });

  if (extra) {
    const tokens = extractUnderlagTokens(extra);
    const target = fold(`${atgard}\n${residual}`);
    const hits = tokens.filter((t) => target.includes(fold(t)));
    const need = Math.min(3, Math.max(2, Math.ceil(tokens.length * 0.25)));
    if (tokens.length >= 2 && hits.length < need) {
      violations.push({
        id: 'extra_underlag_saknas',
        message:
          `Extra underlag måste styra åtgärd och residual. Använd minst dessa fakta uttryckligen: ${tokens.slice(0, 8).join(', ')}. `
          + 'Bygg inte på generisk «smycken = högt värde»-fras om underlaget beskriver lägre pris, svagt andrahandsvärde eller spårbara kanaler.'
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

  const ptTf = String(p.ptTfRelevans || '').trim();
  if (/^båda$/i.test(ptTf) || /^bada$/i.test(fold(ptTf))) {
    const blob = joinedPayloadText(p);
    if (!TF_SIGNAL_RE.test(blob)) {
      violations.push({
        id: 'bada_utan_tf',
        message:
          'ptTfRelevans är Båda men TF förklaras inte. Lägg minst ett hot eller en motiveringsmening om terrorismfinansiering/värdebärare — även om risken är lägre för just denna kundtyp.'
      });
    }
  }

  const s = Number(opts.sannolikhet != null ? opts.sannolikhet : p.sannolikhet);
  const k = Number(opts.konsekvens != null ? opts.konsekvens : p.konsekvens);
  const product = (Number.isFinite(s) ? s : 0) * (Number.isFinite(k) ? k : 0);
  if (product >= 10 && hot.filter((h) => h && (h.titel || h.beskrivning)).length < 3) {
    violations.push({
      id: 'for_fa_hot',
      message:
        'Inneboende risk är Förhöjd/Hög (S×K ≥ 10) — minst 3 hot med modus krävs (t.ex. fiktiv webshopförsäljning, handelsbaserad PT via import/export, returer/rabatter, TF via värdebärare).'
    });
  }

  const repairHint = violations.length
    ? [
      'REPARERA JSON-SVARET (kvalitetskontroll underkände förra utkastet):',
      ...violations.map((v, i) => `${i + 1}. ${v.message}`),
      'Svara igen med komplett JSON. Behåll byrårealism. Extra underlag (om finns) ska bära atgard och motiveringResidual.'
    ].join('\n')
    : '';

  return {
    ok: violations.length === 0,
    violations,
    repairHint
  };
}

module.exports = {
  OVRIG_HARD_PRIORITY_RULES,
  validateOvrigAiPayload,
  extractUnderlagTokens,
  isVagueKalla,
  FORBIDDEN_ATGARD_PATTERNS
};
