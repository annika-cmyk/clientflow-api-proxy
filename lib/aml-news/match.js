/**
 * Layer 3: deterministic relevance matching mot byråprofil.
 * Ingen LLM. Returnerar score, tier och förklaringar.
 */

const INDUSTRY_ALIASES = {
  bygg: ['bygg', 'byggnad', 'construction', 'anlaggning', 'anläggning', 'entreprenad'],
  import_export: ['import', 'export', 'import_export', 'utrikeshandel', 'internationell handel'],
  jord_skog: ['jord', 'skog', 'jordbruk', 'skogsbruk', 'lantbruk', 'jord_skog'],
  restaurang: ['restaurang', 'cafe', 'café', 'hotell', 'besöksnäring', 'besoksnaring'],
  fastighet: ['fastighet', 'fastigheter', 'bostad'],
  handel: ['handel', 'detaljhandel', 'grossist', 'e-handel', 'ehandel'],
  tillverkning: ['tillverkning', 'industri', 'produktion'],
  transport: ['transport', 'åkeri', 'akeri', 'logistik'],
  vard: ['vård', 'vard', 'omsorg', 'hälsa', 'halsa'],
  finans: ['finans', 'försäkring', 'forsakring', 'kredit'],
  it: ['it', 'tech', 'programvar', 'saas'],
  kontant: ['kontant', 'cash', 'kontantintensiv']
};

const GEO_ALIASES = {
  se: ['se', 'sverige', 'sweden', 'svensk', 'stockholm', 'skåne', 'skane', 'västra götaland', 'vastra gotaland'],
  eu: ['eu', 'europeiska unionen', 'europe'],
  ru: ['ru', 'ryssland', 'russia'],
  ir: ['ir', 'iran'],
  kp: ['kp', 'nordkorea', 'dprk', 'korea'],
  mm: ['mm', 'myanmar', 'burma'],
  us: ['us', 'usa', 'förenta staterna', 'forenta staterna', 'united states'],
  gb: ['gb', 'uk', 'storbritannien', 'united kingdom'],
  cn: ['cn', 'kina', 'china']
};

function fold(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9åäö\s_-]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function pct(v) {
  const n = Number(String(v == null ? '' : v).replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

function tokenizeProfil(profil) {
  const p = profil || {};
  return fold([
    p.branscherKundstock,
    p.vanligasteBolagsformer,
    p.geografiskMarknad,
    p.leveranssatt,
    Array.isArray(p.tjanster) ? p.tjanster.join(' ') : p.tjanster
  ].filter(Boolean).join(' '));
}

function matchAliasSet(text, aliases) {
  const hay = fold(text);
  const hits = [];
  for (const [key, words] of Object.entries(aliases)) {
    if (words.some((w) => hay.includes(fold(w)))) hits.push(key);
  }
  return hits;
}

function firmIndustries(profil) {
  return matchAliasSet(tokenizeProfil(profil), INDUSTRY_ALIASES);
}

function firmGeography(profil) {
  const geos = matchAliasSet(`${tokenizeProfil(profil)} sverige`, GEO_ALIASES);
  if (!geos.includes('se')) geos.push('se');
  return geos;
}

function overlap(a, b) {
  const setB = new Set((b || []).map((x) => fold(x)));
  return (a || []).filter((x) => setB.has(fold(x)));
}

function matchNewsToProfil(item, profil) {
  const reasons = [];
  let score = 0;
  const p = profil || {};
  const industries = firmIndustries(p);
  const geos = firmGeography(p);
  const foreignShare = pct(p.andelInternationellHandel);
  const cashShare = pct(p.andelKontantintensiva);
  const hasBetalning = /betalningsuppdrag|betala räkning|betalning/i.test(tokenizeProfil(p));
  const category = item.category || 'ovrigt';
  const severity = item.severity || 'informativ';
  const itemInd = (item.affected_industries || []).map(fold).filter(Boolean);
  const itemGeo = (item.affected_geography || []).map(fold).filter(Boolean);

  if (category === 'lagandring') {
    score += 3;
    reasons.push('Lag- eller föreskriftsändring som alltid berör redovisningsbyråer');
  } else if (category === 'kundkannedom') {
    score += 3;
    reasons.push('Rör kundkännedom / KYC');
  } else if (category === 'rapporteringsrutiner') {
    score += 3;
    reasons.push('Rör rapporteringsrutiner (t.ex. misstankeanmälan)');
  } else if (category === 'hogriskstater') {
    score += 2;
    reasons.push('Rör högriskstater eller bevakade jurisdiktioner');
    if (foreignShare >= 5 || hasBetalning) {
      score += 2;
      reasons.push(hasBetalning
        ? 'Byrån utför betalningsuppdrag'
        : `Byrån har ${foreignShare}% kunder med internationell handel`);
    }
  } else if (category === 'branschspecifik') {
    score += 1;
    reasons.push('Branschspecifik vägledning');
  } else {
    score += 1;
    reasons.push('Allmän AML-information');
  }

  const indHits = overlap(itemInd, industries);
  if (indHits.length) {
    score += 3;
    reasons.push(`Matchar kundstockens bransch: ${indHits.join(', ')}`);
  } else if (itemInd.length && category === 'branschspecifik') {
    score -= 2;
    reasons.push('Gäller andra branscher än byråns kundstock');
  }

  const geoHits = overlap(itemGeo, geos);
  if (geoHits.length) {
    score += 2;
    reasons.push(`Matchar geografi: ${geoHits.join(', ')}`);
  } else if (category !== 'hogriskstater' && itemGeo.length && !itemGeo.includes('se') && !itemGeo.includes('eu') && foreignShare < 5) {
    score -= 1;
    reasons.push('Gäller andra länder och byrån har låg utlandshandel');
  }

  if (severity === 'kraver_atgard') {
    score += 2;
    reasons.push('Klassad som kräver åtgärd');
  }

  if (cashShare >= 15 && /kontant|cash/.test(`${item.summary_sv || ''} ${itemInd.join(' ')}`)) {
    score += 1;
    reasons.push(`Byrån har ${cashShare}% kontantintensiva kunder`);
  }

  if (score < 0) score = 0;
  let tier = 'low';
  if (score >= 6) tier = 'high';
  else if (score >= 3) tier = 'medium';

  return {
    firm_id: p.firmId || p.byraId || null,
    news_item_id: item.id || item.content_hash || null,
    relevance_score: score,
    relevance_tier: tier,
    reasons
  };
}

module.exports = {
  INDUSTRY_ALIASES,
  GEO_ALIASES,
  matchNewsToProfil,
  firmIndustries,
  firmGeography
};
