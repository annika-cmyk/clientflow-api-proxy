'use strict';

const KARTLAGGNING_FIELD = 'AR Kartläggning (JSON)';

const LANSSTYRELSEN_INFOTEXT = {
  kunder: 'Länsstyrelsens krav: Finns det omständigheter hos dina kunder, dina kunders verksamheter och branscher som kan innebära risker för din verksamhet? I penningtvättslagen (kapitel 2, paragraf 4 och 5) finns exempel på omständigheter som kan tyda på låg eller hög risk. Observera! Exemplen i de två lagparagraferna är inte heltäckande och du måste utgå från relevanta omständigheter hos kundtyperna i din verksamhet.',
  distribution: 'Länsstyrelsens krav: Erbjuder din verksamhet produkter och tjänster som gör det svårare för dig att överblicka hur och vad kunden använder produkter och tjänster till? Det handlar om vilken kontroll du har över din verksamhets produkter och tjänster när du tillhandahåller dem till kunden. Till exempel om tjänsten erbjuds på distans, genom en tredje part eller via ett webbaserat forum. Det kan vara så att du erbjuder en produkt som i sig innebär en låg risk, men ditt leveranssätt innebär en hög risk, vilket i kombination kan göra att risken för att produkten kan utnyttjas blir högre. Om du använder en extern tjänsteleverantör för olika delar av dina skyldigheter avseende bekämpning av penningtvätt och finansiering av terrorism kan det också innebära risker, och ett sådant system är inte en ersättning för personalens vaksamhet.',
  geografi: 'Länsstyrelsens krav: Du behöver ha kunskap om de länder och områden som du och dina kunder är verksamma eller bosatta i, eller har anknytning till, och relevanta förhållanden kopplade till dessa länder och områden som kan leda till att dina produkter och tjänster utnyttjas. Du kan erbjuda en tjänst som i sig innebär en låg risk, men risken för att tjänsten kan utnyttjas blir högre när du till exempel erbjuder tjänsten i ett land där det förekommer korruption, det saknas ett effektivt regelverk mot penningtvätt, eller som är ett högrisktredjeland enligt EU-kommissionen.',
  verksamhet: 'Länsstyrelsens krav: Finns det specifika omständigheter i din verksamhet? Det handlar alltså inte om sårbarheter i allmänhet, utan du behöver analysera din egen verksamhet. Till exempel din verksamhets storlek eller hur komplex organisationen är.'
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
  return JSON.stringify(out);
}

function formatNamedCounts(rows, emptyText) {
  const list = (Array.isArray(rows) ? rows : []).filter((r) => r && r.namn);
  if (!list.length) return emptyText || 'Inga uppgifter.';
  return list.map((r) => `${r.namn}: ${Number(r.antal) || 0} kunder`).join(', ');
}

function formatStatBlock(stat) {
  if (!stat || !stat.antalKunder) return 'Ingen kundstatistik tillgänglig.';
  const lines = [
    `Antal kunder: ${stat.antalKunder}`,
    `Risknivåer: Låg ${stat.riskniva?.Låg ?? 0}, Normal ${(stat.riskniva?.Normal ?? 0) + (stat.riskniva?.Medel ?? 0)}, Förhöjd ${stat.riskniva?.Förhöjd ?? 0}, Hög ${stat.riskniva?.Hög ?? 0}, Oacceptabel ${stat.riskniva?.Oacceptabel ?? 0}`,
    `PEP/sanktion: ${stat.antalPepEllerSanktion ?? 0} kunder`
  ];
  if (stat.bolagsform?.length) lines.push(`Bolagsformer: ${formatNamedCounts(stat.bolagsform)}`);
  if (stat.omsattning?.length) lines.push(`Omsättningsintervall (kundföretag): ${formatNamedCounts(stat.omsattning)}`);
  if (stat.högriskbransch?.length || stat.branscher?.length) {
    lines.push(`Branscher/högriskbransch: ${formatNamedCounts(stat.högriskbransch || stat.branscher)}`);
  }
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
  return `Du är en AML/KYC-specialist på en svensk redovisningsbyrå. Skriv avsnittet "${label}" i byråns allmänna riskbedömning (PVML).

Skriv på svenska, professionellt och konkret. Basera texten på den statistik och det underlag som ges. Referera till siffror där det är relevant. Ta hänsyn till Länsstyrelsens krav i infotexten men skriv inte ut infotexten ordagrant.

Ge endast den färdiga brödtexten utan rubrik eller inledning som "Här är...".`;
}

function buildAiUserPrompt(section, ctx) {
  const label = SECTION_LABELS[section] || section;
  const infotext = LANSSTYRELSEN_INFOTEXT[section] || '';
  const parts = [
    `Skriv avsnittet "${label}" för byråns allmänna riskbedömning.`,
    '',
    'STATISTIK OCH UNDERLAG:',
    ctx.statistikText || 'Ingen statistik.',
    ''
  ];
  if (ctx.byraProfil) {
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
  formatStatBlock,
  buildAiSystemPrompt,
  buildAiUserPrompt
};
