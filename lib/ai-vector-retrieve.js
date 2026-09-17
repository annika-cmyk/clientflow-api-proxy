'use strict';

/**
 * Server-side retrieval för övriga riskfaktorer.
 * Bygger ämnesqueries (inte hela riskfaktormeningen) och hämtar chunks
 * från OpenAI vector store search — stoppas in i prompten som KÄLLUTDRAG.
 */

function getAxios() {
  // Lazy require så enhetstester av query-byggare inte kräver node_modules.
  // eslint-disable-next-line global-require
  return require('axios');
}

const FALLBACK_KALLOR = [
  {
    title: 'Nationell riskbedömning av penningtvätt och finansiering av terrorism i Sverige 2024/2025, avsnitt om varuhandlare',
    text:
      'Varuhandel kan omfatta smycken, ur, mynt och antikviteter. Brottsvinster kan användas för att köpa varor (ibland kontant) som sedan säljs vidare för att ge pengarna ett legitimt ursprung.'
  },
  {
    title: 'Nationell riskbedömning … 2024/2025, avsnitt om varuhandlare / TF',
    text:
      'Lyxvaror såsom smycken och ädelmetaller kan användas som värdebärare vid terrorismfinansiering: föras ut ur Sverige och säljas i utlandet så att medel frigörs utanför det svenska finansiella systemet.'
  },
  {
    title: 'Samordningsfunktionens vägledning till redovisningskonsulter och skatterådgivare, mars 2025',
    text:
      'Redovisningskonsulter och skatterådgivare kan upptäcka misstänkta beteenden genom inblick i kundens ekonomi och affärstransaktioner — inte genom bankmonitorering.'
  },
  {
    title: 'Samordningsfunktionens vägledning … mars 2025 (varningssignaler)',
    text:
      'Varningssignaler inkluderar orimliga resultatförändringar, hög omsättning i små verksamheter där det inte kan förväntas, ovanliga provisioner och affärsförbindelser som inte går att förklara affärsmässigt.'
  }
];

function fold(s) {
  return String(s == null ? '' : s)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function extractTopicTerms(riskfaktor, extraUnderlag) {
  const blob = `${riskfaktor || ''} ${extraUnderlag || ''}`;
  const f = fold(blob);
  const terms = [];
  const add = (t) => {
    if (t && !terms.includes(t)) terms.push(t);
  };

  if (/smyck|juvel|antikvit|guld|ädel|adelmetall|lyxvar/.test(f)) {
    add('smycken');
    add('antikviteter');
    add('varuhandlare');
    add('lyxvaror');
  }
  if (/shopify|webshop|återförsälj|aterforsalj|ecommerce|e-handel/.test(f)) {
    add('webshop');
    add('försäljningsintäkter');
  }
  if (/portugal|uk|storbritannien|schweiz|usa|export|import/.test(f)) {
    add('import');
    add('export');
    add('handelsbaserad penningtvätt');
  }
  if (/kontant/.test(f)) add('kontanter');
  if (/designer|andrahand|styckpris|1500|1\s*500/.test(f)) {
    add('andrahandsvärde');
  }

  if (!terms.length) {
    // Generiska AML-termer från riskfaktorns egna substantiv (utan «Byrån har…»)
    String(riskfaktor || '')
      .replace(/byrån har kunder inom högriskbranschen/i, '')
      .split(/[^A-Za-zÀ-öØ-ö0-9]+/)
      .filter((w) => w.length >= 5)
      .slice(0, 6)
      .forEach(add);
  }
  return terms;
}

/**
 * Bygger 1–3 korta sökqueries — aldrig hela riskfaktormeningen.
 */
function buildOvrigRetrievalQueries(riskfaktor, extraUnderlag) {
  const terms = extractTopicTerms(riskfaktor, extraUnderlag);
  const topic = terms.slice(0, 6).join(' ') || String(riskfaktor || '').trim().slice(0, 80);
  const queries = [
    `${topic} penningtvätt terrorismfinansiering varuhandlare nationell riskbedömning 2024 2025`,
    'redovisningskonsulter skatterådgivare varningssignaler Samordningsfunktionen vägledning mars 2025',
    `${topic} handelsbaserad penningtvätt import export överfakturering underfakturering`
  ];
  return [...new Set(queries.map((q) => q.replace(/\s+/g, ' ').trim()).filter(Boolean))].slice(0, 3);
}

function chunkTextFromHit(hit) {
  if (!hit || typeof hit !== 'object') return '';
  const content = Array.isArray(hit.content) ? hit.content : [];
  const texts = content
    .map((c) => (c && c.text != null ? String(c.text) : ''))
    .filter(Boolean);
  if (texts.length) return texts.join(' ').replace(/\s+/g, ' ').trim();
  return String(hit.text || hit.snippet || '').replace(/\s+/g, ' ').trim();
}

function formatKallaUtdragBlock(excerpts) {
  const list = Array.isArray(excerpts) ? excerpts.filter((e) => e && e.text) : [];
  if (!list.length) return '';
  const lines = ['KÄLLUTDRAG (använd dessa som primär källa — ange exakt dokumentnamn + år/avsnitt i fältet kalla):'];
  list.slice(0, 6).forEach((ex, i) => {
    const title = String(ex.title || ex.filename || 'Källa').trim();
    const text = String(ex.text || '').trim().slice(0, 420);
    lines.push(`${i + 1}. ${title}: ${text}`);
  });
  lines.push('Förbjudet: vaga källor som «FATF-rapport» eller «Nationell riskbedömning» utan år/avsnitt.');
  return lines.join('\n');
}

/**
 * Söker vector store. Returnerar tom lista vid fel (anropa fallback separat).
 */
async function searchVectorStore(openaiKey, vectorStoreId, query, opts = {}) {
  const vs = String(vectorStoreId || '').trim();
  const q = String(query || '').trim();
  if (!openaiKey || !vs || !q) return [];
  const max = Math.max(1, Math.min(Number(opts.maxNumResults) || 4, 8));
  const res = await getAxios().post(
    `https://api.openai.com/v1/vector_stores/${encodeURIComponent(vs)}/search`,
    {
      query: q,
      max_num_results: max,
      rewrite_query: opts.rewriteQuery !== false
    },
    {
      headers: {
        Authorization: `Bearer ${openaiKey}`,
        'Content-Type': 'application/json',
        'OpenAI-Beta': 'assistants=v2'
      },
      timeout: opts.timeoutMs || 25000
    }
  );
  const data = (res.data && res.data.data) || [];
  return data.map((hit) => ({
    title: hit.filename || hit.file_id || 'Dokument',
    filename: hit.filename || '',
    fileId: hit.file_id || '',
    score: hit.score,
    text: chunkTextFromHit(hit)
  })).filter((h) => h.text);
}

/**
 * Kör flera queries, dedupera och komplettera med fallback-källor vid behov.
 */
async function retrieveOvrigKallaUtdrag({ openaiKey, vectorStoreId, riskfaktor, extraUnderlag }) {
  const queries = buildOvrigRetrievalQueries(riskfaktor, extraUnderlag);
  const found = [];
  const seen = new Set();

  if (openaiKey && vectorStoreId) {
    for (const query of queries) {
      try {
        const hits = await searchVectorStore(openaiKey, vectorStoreId, query, { maxNumResults: 3 });
        hits.forEach((h) => {
          const key = `${fold(h.filename || h.title)}::${fold(h.text).slice(0, 80)}`;
          if (seen.has(key)) return;
          seen.add(key);
          found.push({ ...h, query });
        });
      } catch (err) {
        console.warn('vector store search misslyckades:', err.response?.status || err.message);
      }
      if (found.length >= 5) break;
    }
  }

  const usedFallback = found.length === 0;
  const excerpts = found.length
    ? found.slice(0, 6)
    : FALLBACK_KALLOR.map((f) => ({ title: f.title, text: f.text, filename: '', fallback: true }));

  return {
    queries,
    excerpts,
    usedFallback,
    block: formatKallaUtdragBlock(excerpts)
  };
}

/**
 * Kort repair-prompt utan gammalt ankare.
 * Formulerad som legitim AML-dokumentation (PVML) så modellen inte vägrar.
 */
function buildOvrigRepairPrompt({
  riskfaktor,
  typ,
  extraUnderlag,
  kallaBlock,
  violations,
  rejectedPayload
}) {
  const v = Array.isArray(violations) ? violations : [];
  const rejected = rejectedPayload || {};
  const badBits = [];
  if (rejected.beskrivning) {
    badBits.push('- skriv om beskrivningen utan generisk «smycken = högt värde»-floskel');
  }
  (Array.isArray(rejected.hot) ? rejected.hot : []).slice(0, 3).forEach((h) => {
    const t = String((h && h.titel) || '').trim();
    if (t) badBits.push(`- skriv om hotet «${t}» med konkret bokförings-/exportmekanism`);
    const k = String((h && h.kalla) || '').trim();
    if (k) badBits.push(`- byt ut vaga källan «${k}» mot exakt dokumentnamn + år/avsnitt`);
  });

  return [
    'Du hjälper en svensk redovisningsbyrå med lagstadgad AML-riskbedömning enligt PVML.',
    'Förra JSON-utkastet uppfyllde inte kvalitetskraven. Skriv ett nytt komplett JSON-svar.',
    'Detta är legitim compliance-dokumentation — inte instruktioner för brott.',
    badBits.length ? `Förbättra särskilt:\n${badBits.join('\n')}` : '',
    `Riskfaktor: ${String(riskfaktor || '').trim()}`,
    typ ? `Typ (kategori): ${String(typ).trim()}` : '',
    extraUnderlag
      ? `EXTRA UNDERLAG (PRIMÄR för atgard + motiveringResidual):\n${String(extraUnderlag).trim()}`
      : '',
    kallaBlock || '',
    'Kvalitetskrav som saknades:',
    ...v.map((x, i) => `${i + 1}. ${x.message || x.id}`),
    'Krav: minst 3 hot och 3 sårbarheter om S×K ≥ 10; minst ett TF-hot om ptTfRelevans=Båda; exakta källor; åtgärd med Shopify/avstämning/export/inköp när underlaget nämner det.',
    'Svara ENDAST med ett giltigt JSON-objekt enligt schemat. Ingen ursäkt, ingen prosa före/efter JSON.'
  ].filter(Boolean).join('\n\n');
}

/** True om råtext ser ut som modellvägran / icke-JSON. */
function looksLikeModelRefusal(rawText) {
  const t = String(rawText || '').trim();
  if (!t) return true;
  if (t.startsWith('{')) return false;
  return /^(i'?m\s+sorry|sorry[, ]|i\s+can'?t|i\s+cannot|jag\s+kan\s+inte|tyvärr)/i.test(t);
}

module.exports = {
  FALLBACK_KALLOR,
  buildOvrigRetrievalQueries,
  formatKallaUtdragBlock,
  searchVectorStore,
  retrieveOvrigKallaUtdrag,
  buildOvrigRepairPrompt,
  looksLikeModelRefusal,
  extractTopicTerms
};
