'use strict';

const KARTLAGGNING_FIELD = 'AR Kartläggning (JSON)';

const LANSSTYRELSEN_INFOTEXT = {
  kunder: 'Länsstyrelsens krav: Finns det omständigheter hos dina kunder, dina kunders verksamheter och branscher som kan innebära risker för din verksamhet? I penningtvättslagen (kapitel 2, paragraf 4 och 5) finns exempel på omständigheter som kan tyda på låg eller hög risk. Observera! Exemplen i de två lagparagraferna är inte heltäckande och du måste utgå från relevanta omständigheter hos kundtyperna i din verksamhet.',
  distribution: 'Länsstyrelsens krav: Erbjuder din verksamhet produkter och tjänster som gör det svårare för dig att överblicka hur och vad kunden använder produkter och tjänster till? Det handlar om vilken kontroll du har över din verksamhets produkter och tjänster när du tillhandahåller dem till kunden. Till exempel om tjänsten erbjuds på distans, genom en tredje part eller via ett webbaserat forum. Det kan vara så att du erbjuder en produkt som i sig innebär en låg risk, men ditt leveranssätt innebär en hög risk, vilket i kombination kan göra att risken för att produkten kan utnyttjas blir högre. Om du använder en extern tjänsteleverantör för olika delar av dina skyldigheter avseende bekämpning av penningtvätt och finansiering av terrorism kan det också innebära risker, och ett sådant system är inte en ersättning för personalens vaksamhet.',
  geografi: 'Länsstyrelsens krav: Du behöver ha kunskap om de länder och områden som du och dina kunder är verksamma eller bosatta i, eller har anknytning till, och relevanta förhållanden kopplade till dessa länder och områden som kan leda till att dina produkter och tjänster utnyttjas. Du kan erbjuda en tjänst som i sig innebär en låg risk, men risken för att tjänsten kan utnyttjas blir högre när du till exempel erbjuder tjänsten i ett land där det förekommer korruption, det saknas ett effektivt regelverk mot penningtvätt, eller som är ett högrisktredjeland enligt EU-kommissionen.',
  verksamhet: 'Länsstyrelsens krav: Finns det specifika omständigheter i din verksamhet? Det handlar alltså inte om sårbarheter i allmänhet, utan du behöver analysera din egen verksamhet. Till exempel din verksamhets storlek eller hur komplex organisationen är.\n\nStäll dig frågan: Hur kan byråns organisation, arbetssätt, kompetens eller kontrollmiljö göra det lättare eller svårare att upptäcka att en redovisningstjänst utnyttjas för penningtvätt eller finansiering av terrorism?'
};

const BANKID_KYC_TEXT = 'I ClientFlow gör vi identifiering av kunden med BankID. Saknas möjlighet till BankID tas kopia av körkort eller pass och sparas i ClientFlow. För distanskunder begär vi vidimerad kopia av motsvarande handlingar.';

const SECTION_LABELS = {
  kunder: '2.1.2 Kunder',
  distribution: '2.1.3 Distributionskanaler',
  geografi: '2.1.4 Geografiska förhållanden',
  verksamhet: '2.1.5 Verksamhetsspecifika omständigheter'
};

function trimStr(v) {
  return String(v == null ? '' : v).trim();
}

function parseKartlaggningJson(raw) {
  if (!raw) return {};
  if (typeof raw === 'object' && !Array.isArray(raw)) return { ...raw };
  try {
    const parsed = JSON.parse(String(raw));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch (_) {
    return {};
  }
}

function serializeKartlaggningJson(obj) {
  const out = {};
  ['kunder', 'distribution', 'geografi', 'verksamhet'].forEach((key) => {
    const v = trimStr(obj && obj[key]);
    if (v) out[key] = v;
  });
  const layout = obj && obj.layout && typeof obj.layout === 'object' ? obj.layout : null;
  if (layout) {
    const titles = layout.titles && typeof layout.titles === 'object' ? layout.titles : {};
    const hidden = Array.isArray(layout.hidden) ? layout.hidden.filter(Boolean) : [];
    if (Object.keys(titles).length || hidden.length) {
      out.layout = { titles, hidden };
    }
  }
  return JSON.stringify(out);
}

function extractArLayout(obj) {
  const layout = obj && obj.layout && typeof obj.layout === 'object' ? obj.layout : {};
  return {
    titles: layout.titles && typeof layout.titles === 'object' ? { ...layout.titles } : {},
    hidden: Array.isArray(layout.hidden) ? layout.hidden.filter(Boolean) : []
  };
}

function formatNamedCounts(rows, emptyText) {
  const list = (Array.isArray(rows) ? rows : []).filter((r) => r && r.namn);
  if (!list.length) return emptyText || 'Inga uppgifter.';
  return list.map((r) => `${r.namn}: ${Number(r.antal) || 0} kunder`).join(', ');
}

function percentOf(antal, total) {
  const n = Number(antal) || 0;
  const t = Number(total) || 0;
  if (!t) return 0;
  return Math.round((n / t) * 100);
}

function formatBranschKategorier(stat) {
  const total = Number(stat && stat.antalKunder) || 0;
  if (!total) return 'Ingen branschstatistik tillgänglig.';
  const hogriskAntal = Number(stat.antalKunderHogriskbransch) || 0;
  const cats = Array.isArray(stat.branschKategorier) ? stat.branschKategorier : [];
  const parts = [];
  if (hogriskAntal) {
    parts.push(`${hogriskAntal} av ${total} kunder (${percentOf(hogriskAntal, total)} %) verkar i högriskbransch.`);
    const hogriskCats = cats.filter((c) => c.hogrisk).slice(0, 8);
    if (hogriskCats.length) {
      parts.push(`Högriskbranscher: ${hogriskCats.map((c) => `${c.namn} (${c.antal})`).join(', ')}.`);
    }
  } else {
    parts.push('Inga kunder är klassade i högriskbransch enligt SNI och högrisklista.');
  }
  const otherCats = cats.filter((c) => !c.hogrisk).slice(0, 6);
  if (otherCats.length) {
    parts.push(`Övriga branschkategorier: ${otherCats.map((c) => `${c.namn} (${c.antal})`).join(', ')}.`);
  }
  return parts.join(' ');
}

function formatOmsattningAnstalldaNarrative(stat) {
  const total = Number(stat && stat.antalKunder) || 0;
  const profil = Array.isArray(stat.omsattningAnstalldaProfil) ? stat.omsattningAnstalldaProfil : [];
  if (!total || !profil.length) return '';
  const sentences = profil.slice(0, 4).map((row) => {
    const pct = percentOf(row.antal, total);
    const oms = String(row.omsattning || '').toLowerCase();
    const ans = String(row.anstallda || '').toLowerCase();
    return `${row.antal} kunder (${pct} %) har ${oms} och ${ans}`;
  });
  let outlierText = '';
  const highOms = profil.find((row) => /över 10 milj/i.test(String(row.omsattning || '')));
  const manyEmp = profil.filter((row) => /5 eller fler/i.test(String(row.anstallda || '')));
  const manyEmpTotal = manyEmp.reduce((sum, row) => sum + (Number(row.antal) || 0), 0);
  if (highOms || manyEmpTotal) {
    const bits = [];
    if (highOms) {
      bits.push(highOms.antal === 1
        ? 'ett företag som omsätter över 10 miljoner kr'
        : `${highOms.antal} företag som omsätter över 10 miljoner kr`);
    }
    if (manyEmpTotal) {
      const sameAsHigh = highOms && highOms.antal === manyEmpTotal && manyEmp.length === 1;
      if (!sameAsHigh) {
        bits.push(manyEmpTotal === 1
          ? 'ett annat med 5 eller fler anställda'
          : `${manyEmpTotal} företag med 5 eller fler anställda`);
      }
    }
    if (bits.length) outlierText = ` Det finns ${bits.join(' och ')} som sticker ut.`;
  }
  return `Gällande omsättning och antal anställda: ${sentences.join('; ')}.${outlierText}`;
}

function formatByraVerksamhetBlock(stat, byraFields) {
  const f = byraFields || {};
  const antalAnstallda = trimStr(f['Antal anställda']);
  const omsattning = trimStr(f['Omsättning']);
  const antalKundforetag = trimStr(f['Antal kundföretag']);
  const antalKunder = Number(stat && stat.antalKunder) || 0;
  const tjanster = (stat && (stat.tjänster || stat.tjanster)) || [];
  const branschKategorier = Array.isArray(stat && stat.branschKategorier) ? stat.branschKategorier : [];

  const lines = [];
  if (antalAnstallda) lines.push(`Byråns antal anställda: ${antalAnstallda}`);
  if (omsattning) lines.push(`Byråns omsättning: ${omsattning} SEK`);
  if (antalKundforetag) lines.push(`Antal kundföretag (byråuppgift): ${antalKundforetag}`);
  if (antalKunder) lines.push(`Antal aktiva kunder i ClientFlow: ${antalKunder}`);
  if (tjanster.length) {
    const namn = tjanster.map((t) => t.namn).filter(Boolean).slice(0, 10);
    lines.push(`Antal olika tjänstetyper byrån erbjuder: ${tjanster.length}${namn.length ? ` (${namn.join(', ')})` : ''}`);
  }
  if (branschKategorier.length) {
    lines.push(`Antal olika branschkategorier i kundstocken: ${branschKategorier.length} (mångfald byrån ska ha överblick över)`);
  }
  const ansN = Number(antalAnstallda);
  if (ansN > 0 && antalKunder) {
    lines.push(`Kunder per anställd (ungefär): ${Math.round(antalKunder / ansN)}`);
  }
  return lines.length ? lines.join('\n') : 'Ingen byrådata tillgänglig.';
}

function formatStatBlock(stat) {
  if (!stat || !stat.antalKunder) return 'Ingen kundstatistik tillgänglig.';
  const lines = [
    `Antal kunder: ${stat.antalKunder}`,
    `Risknivåer: Låg ${stat.riskniva?.Låg ?? 0}, Normal ${(stat.riskniva?.Normal ?? 0) + (stat.riskniva?.Medel ?? 0)}, Förhöjd ${stat.riskniva?.Förhöjd ?? 0}, Hög ${stat.riskniva?.Hög ?? 0}, Oacceptabel ${stat.riskniva?.Oacceptabel ?? 0}`,
    `PEP eller anhörig till PEP (KYC): ${stat.antalPepEllerSanktion ?? 0} kunder`
  ];
  if (stat.bolagsform?.length) lines.push(`Bolagsformer: ${formatNamedCounts(stat.bolagsform)}`);
  if (stat.anstallda?.length) lines.push(`Antal anställda (kundföretag): ${formatNamedCounts(stat.anstallda)}`);
  const branschText = formatBranschKategorier(stat);
  if (branschText) lines.push(`Branscher: ${branschText}`);
  const omsText = formatOmsattningAnstalldaNarrative(stat);
  if (omsText) lines.push(omsText);
  if (stat.risksankande?.length) lines.push(`Risksänkande faktorer: ${formatNamedCounts(stat.risksankande)}`);
  if (stat.varningsflaggor?.length) lines.push(`Varningsflaggor: ${formatNamedCounts(stat.varningsflaggor)}`);
  if (stat.hemvist?.length) lines.push(`Skatterättslig hemvist: ${formatNamedCounts(stat.hemvist)}`);
  if (stat.handelslander?.length) lines.push(`Handelsländer (KYC avsnitt 6): ${formatNamedCounts(stat.handelslander)}`);
  if (stat.tjänster?.length || stat.tjanster?.length) {
    lines.push(`Tjänster: ${formatNamedCounts(stat.tjänster || stat.tjanster)}`);
  }
  const dist = (stat.riskfaktorerPerTyp || []).find((g) => /distribution/i.test(String(g.typ || '')));
  if (dist && dist.riskfaktorer?.length) {
    lines.push(`Distributionskanaler: ${formatNamedCounts(dist.riskfaktorer)}`);
  }
  const verk = (stat.riskfaktorerPerTyp || []).find((g) => /verksamhet/i.test(String(g.typ || '')));
  if (verk && verk.riskfaktorer?.length) {
    lines.push(`Verksamhetsspecifika faktorer: ${formatNamedCounts(verk.riskfaktorer)}`);
  }
  return lines.join('\n');
}

function buildAiSystemPrompt(section) {
  const label = SECTION_LABELS[section] || section;
  let prompt = `Du är en AML/KYC-specialist på en svensk redovisningsbyrå. Skriv avsnittet "${label}" i byråns allmänna riskbedömning (PVML).

Skriv på svenska, professionellt och konkret. Basera texten på den statistik och det underlag som ges. Referera till siffror där det är relevant. Ta hänsyn till Länsstyrelsens krav i infotexten men skriv inte ut infotexten ordagrant.

Ge endast den färdiga brödtexten utan rubrik eller inledning som "Här är...".`;
  if (section === 'kunder') {
    prompt += `

För kundavsnittet ska du särskilt:
- Beskriva branscher i breda kategorier (inte lista alla SNI-koder).
- Nämn uttryckligen hur många kunder som verkar i högriskbransch och vilka typer det gäller.
- Beskriv omsättning och antal anställda i löpande text med ungefärliga andelar (t.ex. "de flesta", "cirka hälften", procent).
- Lyft fram avvikande exempel som sticker ut (mycket hög omsättning eller fler anställda).`;
  }
  if (section === 'verksamhet') {
    prompt += `

För verksamhetsspecifika omständigheter ska du ENDAST beskriva byråns egna förhållanden – inte kundernas risknivåer, PEP-status, bolagsformer, branschrisker, varningsflaggor eller andra kundegenskaper (det hör hemma i avsnitt 2.1.2).

Fokusera på:
- Byråns storlek och struktur (antal anställda, enmansbyrå vs flera kollegor, omsättning)
- Hur komplex verksamheten är att överblicka med befintliga resurser (många kunder per anställd, brett tjänsteutbud, många branscher att ha koll på)
- Sårbarheter kopplade till byrån (t.ex. begränsad intern kontroll, ingen kollega att bolla med, hög arbetsbelastning)
- Styrkor kopplade till byrån (t.ex. kort beslutsväg, full insyn i små team)
- Hur organisation, arbetssätt, kompetens och kontrollmiljö gör det lättare eller svårare att upptäcka att en redovisningstjänst utnyttjas för penningtvätt eller finansiering av terrorism

Använd kundantal, tjänsteutbud och branschmångfald endast som mått på byråns arbetsmängd och komplexitet – beskriv inte kunderna i sig.`;
  }
  return prompt;
}

function buildAiUserPrompt(section, ctx) {
  const label = SECTION_LABELS[section] || section;
  const infotext = LANSSTYRELSEN_INFOTEXT[section] || '';
  const parts = [
    `Skriv avsnittet "${label}" för byråns allmänna riskbedömning.`,
    '',
    section === 'verksamhet' ? 'BYRÅDATA (endast byråns egna omständigheter):' : 'STATISTIK OCH UNDERLAG:',
    ctx.statistikText || (section === 'verksamhet' ? 'Ingen byrådata.' : 'Ingen statistik.'),
    ''
  ];
  if (ctx.byraProfil && section !== 'verksamhet') {
    parts.push('BYRÅPROFIL:', ctx.byraProfil, '');
  }
  if (ctx.befintligText) {
    parts.push('BEFINTLIG TEXT (förfina/uppdatera om relevant):', ctx.befintligText.slice(0, 2000), '');
  }
  if (section === 'geografi') {
    parts.push('IDENTIFIERING (ska nämnas i texten):', BANKID_KYC_TEXT, '');
  }
  if (infotext) {
    parts.push('LÄNSSTYRELSENS KRAV (vägledning, skriv inte ordagrant):', infotext);
  }
  return parts.join('\n');
}

module.exports = {
  KARTLAGGNING_FIELD,
  LANSSTYRELSEN_INFOTEXT,
  BANKID_KYC_TEXT,
  SECTION_LABELS,
  parseKartlaggningJson,
  serializeKartlaggningJson,
  extractArLayout,
  formatStatBlock,
  formatByraVerksamhetBlock,
  formatBranschKategorier,
  formatOmsattningAnstalldaNarrative,
  buildAiSystemPrompt,
  buildAiUserPrompt
};
