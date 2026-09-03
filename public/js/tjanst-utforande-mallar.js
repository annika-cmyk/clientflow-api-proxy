/**
 * Fördefinierad frågebank för hur byrån utför sina tjänster.
 * Svaren är faktaunderlag till AI — byrån ska inte själv bedöma hot eller residualrisk.
 */
(function (global) {
  function q(id, label, type, options, extra) {
    const row = { id: id, label: label, type: type };
    if (options) row.options = options;
    if (extra) Object.assign(row, extra);
    return row;
  }

  function foldName(value) {
    return String(value == null ? '' : value)
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  const HELP_TEXT =
    'Svara utifrån hur tjänsten normalt utförs. Du behöver inte själv bedöma penningtvättsrisken. AI:n analyserar risker, sårbarheter och åtgärder baserat på dina svar och systemets kunddata.';

  const BASE_QUESTIONS = [
    q('aterkommande', 'Utförs tjänsten återkommande eller vid behov?', 'single', [
      'Återkommande',
      'Vid behov',
      'Både återkommande och vid behov',
      'Varierar mellan kunder'
    ]),
    q('separatEllerIngår', 'Utförs tjänsten som en separat tjänst eller som del av ett annat uppdrag?', 'single', [
      'Separat tjänst',
      'Ingår normalt i annat uppdrag',
      'Både separat och som del av annat uppdrag',
      'Varierar mellan kunder'
    ], { helpText: 'Exempel: avstämningar kan ingå i löpande bokföring, medan kontrollbalansräkning ofta är ett separat uppdrag.' }),
    q('underlagFran', 'Vem lämnar eller skapar normalt det underlag som används i tjänsten?', 'single', [
      'Kunden lämnar huvudsakligen underlaget',
      'Byrån hämtar huvudsakligen underlaget från system',
      'Byrån skapar huvudsakligen underlaget',
      'Kunden och byrån gör detta tillsammans',
      'Annan part',
      'Varierar mellan kunder'
    ]),
    q('underlagKanal', 'Hur får byrån normalt tillgång till underlag eller information?', 'multi', [
      'Bokföringssystem',
      'Kundportal',
      'Uppladdning i kundmapp (utan BankID-inlogg)',
      'E-post',
      'Bankintegration',
      'Lönesystem',
      'Skatteverket/Bolagsverket eller annan myndighet',
      'Fysiskt material',
      'Telefon/möte/chatt',
      'Annat',
      'Varierar mellan kunder'
    ]),
    q('paverkarUppgifter', 'Kan byrån genom tjänsten registrera, ändra, skicka in eller påverka uppgifter för kundens räkning?', 'single', [
      'Ja',
      'Nej',
      'Delvis',
      'Varierar mellan kunder'
    ], { showCommentWhen: ['Ja', 'Delvis', 'Varierar mellan kunder'] }),
    q('kontrollInnanSlut', 'Finns någon praktisk kontroll innan tjänsten slutförs eller rapporteras till kunden, myndighet eller bank?', 'single', [
      'Ja, alltid',
      'Ja, vid större eller avvikande poster',
      'Ja, stickprovsvis',
      'Nej, normalt inte',
      'Varierar mellan kunder'
    ], { showCommentWhen: ['Ja, alltid', 'Ja, vid större eller avvikande poster', 'Ja, stickprovsvis', 'Varierar mellan kunder'] }),
    q('avvikelseHantering', 'Hur hanteras avvikelser, bristfälliga underlag eller oklarheter?', 'multi', [
      'Kunden kontaktas för komplettering eller förklaring',
      'Ärendet pausas tills underlag är komplett',
      'Ansvarig på byrån granskar',
      'Avvikelsen dokumenteras',
      'Uppdraget kan avböjas eller avslutas',
      'Ingen särskild rutin',
      'Annat'
    ])
  ];

  const EGEN_BESKRIVNING = q(
    'egenBeskrivning',
    'Beskriv den egna tjänsten och hur den utförs.',
    'text',
    null,
    { required: true, helpText: 'Beskriv vad som ingår och hur arbetet går till. Analysera inte penningtvättsrisken här.' }
  );

  const STATISTIK_QUESTIONS = [
    q('hamtaClientflowStatistik', 'Hämta statistik från Clientflow?', 'single', [
      'Ja',
      'Nej'
    ], {
      helpText: 'Vid Ja hämtas antal kunder med tjänsten plus riskindikatorer som kontanter, utlandstransaktioner, högriskbransch och PEP. Vid Nej används byråns angivna kundantal och ni fyller i ungefär hur många kunder som har tjänsten.'
    }),
    q('antalKunderTjanst', 'Ungefär hur många kunder har den här tjänsten?', 'number', null, {
      showWhen: { id: 'hamtaClientflowStatistik', any: ['Nej'] },
      helpText: 'En uppskattning räcker. Byråns totala kundantal från byråuppgifterna används som bakgrund.'
    })
  ];

  function spec(id, name, questions, extra) {
    return Object.assign({
      id: id,
      name: name,
      aiQuestionSupport: true,
      replaceBaseQuestions: true,
      questions: questions || []
    }, extra || {});
  }

  function omTjanstenUtfor(id, extra) {
    return Object.assign({ showWhen: { id: id, any: ['Ja', 'I vissa uppdrag'] } }, extra || {});
  }

  const SERVICE_TEMPLATES = [
    spec('rot-rut', 'ROT-/RUT-administration', [
      q('rotHjalper', 'Hjälper byrån kunden att hantera ROT-/RUT-underlag eller ansökningar?', 'single', [
        'Ja',
        'Nej',
        'I vissa uppdrag'
      ]),
      q('rotUppgifter', 'Vilka uppgifter hanterar byrån normalt inom ROT/RUT?', 'multi', [
        'Kundens personuppgifter',
        'Fastighets-/bostadsuppgifter',
        'Fakturaunderlag',
        'Arbetskostnad/materialkostnad',
        'Ansökan till Skatteverket',
        'Betalningsuppgifter',
        'Annat'
      ], omTjanstenUtfor('rotHjalper')),
      q('rotRimlighet', 'Kontrolleras att ROT-/RUT-underlaget verkar rimligt?', 'single', [
        'Ja, normalt',
        'Ja, vid avvikelser',
        'Nej, normalt inte'
      ], omTjanstenUtfor('rotHjalper')),
      q('rotOklar', 'Hanteras fall där arbetet, kunden eller betalningen verkar oklar?', 'multi', [
        'Kunden får komplettera',
        'Underlaget dokumenteras',
        'Byrån gör rimlighetsbedömning',
        'Ansvarig granskar',
        'Ingen särskild rutin'
      ], omTjanstenUtfor('rotHjalper'))
    ], { description: 'Administration av skattereduktioner för ROT och RUT.' }),
    spec('lopande-bokforing', 'Löpande bokföring', [
      q('bokfMaterialFran', 'Vem lämnar normalt det bokföringsmaterial som byrån bokför?', 'multi', [
        'Kunden',
        'Byrån hämtar från system/bank',
        'Annan part'
      ]),
      q('underlagKanal', 'Hur får byrån normalt materialet?', 'multi', [
        'Bokföringssystem/app',
        'Kundportal',
        'Uppladdning i kundmapp (utan BankID-inlogg)',
        'E-post',
        'Bankintegration',
        'Fysiskt material',
        'Annat'
      ]),
      q('bokfKontanter', 'Förekommer kontanta betalningar eller kontanta dagskassor hos kunder som använder tjänsten?', 'single', [
        'Ja, ofta',
        'Ja, ibland',
        'Nej, sällan',
        'Nej, normalt inte'
      ]),
      q('bokfSvartBedoma', 'Förekommer fakturor eller underlag som byrån inte enkelt kan bedöma rimligheten i?', 'single', [
        'Ja',
        'Nej',
        'I vissa uppdrag'
      ]),
      q('bokfOtydligt', 'Hur hanteras oklara eller avvikande transaktioner?', 'multi', [
        'Kunden får komplettera',
        'Transaktionen dokumenteras',
        'Byrån gör rimlighetsbedömning',
        'Ansvarig granskar',
        'Uppdraget eskaleras vid misstanke',
        'Ingen särskild rutin'
      ]),
      q('bokfUtland', 'Förekommer utlandsbetalningar eller utländska motparter i bokföringen?', 'single', [
        'Ja, ofta',
        'Ja, ibland',
        'Nej, sällan',
        'Nej, normalt inte'
      ])
    ]),
    spec('anlaggningsregister', 'Anläggningsregister och avskrivningar', [
      q('anlUpprattar', 'Upprättar eller uppdaterar byrån anläggningsregister åt kunden?', 'single', [
        'Ja',
        'Nej',
        'I vissa uppdrag'
      ]),
      q('anlTillgangar', 'Vilka typer av tillgångar hanteras normalt?', 'multi', [
        'Maskiner/inventarier',
        'Fordon',
        'Fastigheter/byggnader',
        'Immateriella tillgångar',
        'Tillgångar i lantbruk',
        'Annat'
      ], omTjanstenUtfor('anlUpprattar')),
      q('anlKunduppgifter', 'Behöver kunden normalt lämna uppgifter om inköp, försäljning eller utrangering av tillgångar?', 'single', [
        'Ja',
        'Nej',
        'I vissa uppdrag'
      ], omTjanstenUtfor('anlUpprattar')),
      q('anlUnderlag', 'Kontrolleras större inköp eller försäljningar av tillgångar mot underlag?', 'single', [
        'Ja, normalt',
        'Ja, vid större belopp',
        'Nej, normalt inte'
      ], omTjanstenUtfor('anlUpprattar')),
      q('anlNarstaende', 'Hanteras tillgångar med koppling till ägare, närstående eller koncernbolag?', 'single', [
        'Ja',
        'Nej',
        'I vissa uppdrag'
      ], omTjanstenUtfor('anlUpprattar'))
    ]),
    spec('kontoavstamningar', 'Kontoavstämningar och periodavstämningar', [
      q('avstVilka', 'Vilka konton/poster stämmer byrån normalt av?', 'multi', [
        'Bank',
        'Kassa',
        'Kundfordringar',
        'Leverantörsskulder',
        'Skattekonto',
        'Lån',
        'Ägarkonton',
        'Annat'
      ]),
      q('avstDifferensKontroll', 'Kontrolleras differenser eller poster utan tydligt underlag?', 'single', [
        'Ja, normalt',
        'Ja, vid större belopp',
        'Nej, normalt inte'
      ]),
      q('avstUtland', 'Förekommer avstämning av konton med utlandsbetalningar eller utländska motparter?', 'single', [
        'Ja',
        'Nej',
        'I vissa uppdrag'
      ]),
      q('avstDifferens', 'Hur hanteras oförklarade differenser?', 'multi', [
        'Kunden får komplettera',
        'Differensen dokumenteras',
        'Ansvarig granskar',
        'Posten rättas',
        'Ingen särskild rutin'
      ])
    ]),
    spec('kontrollbalansrakning', 'Kontrollbalansräkning', [
      q('kbrUpprattar', 'Upprättar byrån kontrollbalansräkning åt kunder?', 'single', [
        'Ja',
        'Nej',
        'I vissa uppdrag'
      ]),
      q('kbrUppgifterFran', 'Vem tar normalt fram uppgifterna som kontrollbalansräkningen bygger på?', 'multi', [
        'Byrån',
        'Kunden',
        'Annan redovisningsbyrå/konsult',
        'Revisor'
      ], omTjanstenUtfor('kbrUpprattar')),
      q('kbrKundvarden', 'Förekommer värderingar eller justeringar som bygger på kundens uppgifter?', 'single', [
        'Ja',
        'Nej',
        'I vissa uppdrag'
      ], omTjanstenUtfor('kbrUpprattar')),
      q('kbrKapital', 'Kontrolleras större kapitaltillskott, ägarinsättningar eller lån i samband med kontrollbalansräkning?', 'single', [
        'Ja, normalt',
        'Ja, vid större belopp',
        'Nej, normalt inte'
      ], omTjanstenUtfor('kbrUpprattar')),
      q('kbrOklar', 'Hur hanteras oklara uppgifter?', 'multi', [
        'Kunden får komplettera',
        'Underlag krävs',
        'Ansvarig granskar',
        'Uppgiften dokumenteras',
        'Ingen särskild rutin'
      ], omTjanstenUtfor('kbrUpprattar'))
    ]),
    spec('kundfakturering', 'Kundfakturering och kundreskontra', [
      q('kfHanterar', 'Hanterar byrån kundreskontra åt kunder?', 'single', [
        'Ja',
        'Nej',
        'I vissa uppdrag'
      ]),
      q('kfVad', 'Vilka moment ingår normalt?', 'multi', [
        'Registrera kundfakturor',
        'Matcha inbetalningar',
        'Påminnelser/krav',
        'Bedöma obetalda kundfordringar',
        'Annat'
      ], omTjanstenUtfor('kfHanterar')),
      q('kfKontantAnnan', 'Förekommer kontantbetalningar eller betalningar från annan än fakturamottagaren?', 'single', [
        'Ja',
        'Nej',
        'I vissa uppdrag'
      ], omTjanstenUtfor('kfHanterar')),
      q('kfOvanliga', 'Kontrolleras större eller ovanliga kundfakturor/inbetalningar?', 'single', [
        'Ja, normalt',
        'Ja, vid större belopp eller avvikelser',
        'Nej, normalt inte'
      ], omTjanstenUtfor('kfHanterar')),
      q('kfAvvikelse', 'Hur hanteras betalningar som inte stämmer med faktura eller kund?', 'multi', [
        'Kunden får förklara',
        'Underlag sparas',
        'Posten utreds',
        'Ansvarig granskar',
        'Ingen särskild rutin'
      ], omTjanstenUtfor('kfHanterar'))
    ]),
    spec('bokslut', 'Bokslut', [
      q('bsLopandeBokforing', 'Vem har normalt skött den löpande bokföringen som bokslutet bygger på?', 'multi', [
        'Byrån',
        'Kunden',
        'Annan redovisningsbyrå/konsult'
      ], { helpText: 'Avser vem som bokfört under året, inte vem som lämnar kvitton eller annat material.' }),
      q('bsAndraTjanster', 'Ingår andra tjänster normalt i samband med bokslutet?', 'multi', [
        'Deklaration',
        'Årsredovisning',
        'Genomgång/rådgivning med kund',
        'Underlag till bank eller annan extern part',
        'Nej, normalt inte'
      ]),
      // Samma id som basfrågan underlagKanal, så tidigare svar på Bokslut behålls.
      q('underlagKanal', 'Hur får byrån normalt tillgång till information inför bokslut?', 'multi', [
        'Bokföringssystem',
        'Kundportal',
        'Uppladdning i kundmapp (utan BankID-inlogg)',
        'E-post',
        'Bankintegration',
        'Fysiskt material',
        'Möte/telefon/chatt',
        'Annat'
      ]),
      q('bsKunduppgifter', 'Vilka uppgifter behöver kunden normalt lämna eller bekräfta inför bokslut?', 'multi', [
        'Inga särskilda uppgifter',
        'Lager',
        'Pågående arbeten',
        'Lån',
        'Kundfordringar som kan vara svåra att få betalt för',
        'Privata insättningar eller uttag',
        'Transaktioner med ägare eller närstående',
        'Större kostnader eller intäkter som ska periodiseras',
        'Annat'
      ], { helpText: 'Avser uppgifter som byrån normalt inte fullt ut kan ta fram själv från bokföringen eller system.' }),
      q('bsBokningar', 'Gör byrån normalt bokslutsbokningar eller justeringar i kundens bokföring?', 'single', [
        'Ja',
        'Nej',
        'I vissa uppdrag'
      ]),
      q('bsJusteringar', 'Kontrolleras större eller avvikande bokslutsposter?', 'single', [
        'Ja, normalt',
        'Ja, vid större belopp eller tydliga avvikelser',
        'Nej, ingen särskild kontroll'
      ], { helpText: 'Exempelvis större justeringar, ovanliga poster eller stora förändringar jämfört med tidigare år.' }),
      q('bsOverifierat', 'Hur hanteras uppgifter eller poster som är oklara?', 'multi', [
        'Kunden får komplettera',
        'Byrån gör rimlighetsbedömning',
        'Uppgiften/posten dokumenteras',
        'Posten tas inte med förrän den är utredd',
        'Ansvarig konsult/chef granskar',
        'Ingen särskild rutin'
      ]),
      q('bsAgarlan', 'Kontrolleras lån eller transaktioner med ägare, närstående eller koncernbolag?', 'single', [
        'Ja, normalt',
        'Ja, vid större belopp eller avvikelser',
        'Nej, normalt inte',
        'Ej relevant'
      ])
    ], { replaceBaseQuestions: true }),
    spec('momsredovisning', 'Momsredovisning', [
      q('momsGor', 'Upprättar eller lämnar byrån momsredovisning åt kunden?', 'single', [
        'Ja, upprättar',
        'Ja, lämnar in',
        'Nej',
        'I vissa uppdrag'
      ]),
      q('momsOvanliga', 'Kontrolleras större eller ovanliga momsbelopp?', 'single', [
        'Ja, normalt',
        'Ja, vid större belopp eller avvikelser',
        'Nej, normalt inte'
      ], { showWhen: { id: 'momsGor', any: ['Ja, upprättar', 'Ja, lämnar in', 'I vissa uppdrag'] } }),
      q('momsEu', 'Förekommer EU-handel, import/export eller omvänd skattskyldighet hos kunder som använder tjänsten?', 'single', [
        'Ja, ofta',
        'Ja, ibland',
        'Nej, sällan',
        'Nej, normalt inte'
      ], { showWhen: { id: 'momsGor', any: ['Ja, upprättar', 'Ja, lämnar in', 'I vissa uppdrag'] } }),
      q('momsAvdrag', 'Kontrolleras fakturor eller transaktioner som ger större momsavdrag?', 'single', [
        'Ja, normalt',
        'Ja, vid större belopp',
        'Nej, normalt inte'
      ], { showWhen: { id: 'momsGor', any: ['Ja, upprättar', 'Ja, lämnar in', 'I vissa uppdrag'] } }),
      q('momsOklar', 'Hur hanteras oklar momsbehandling?', 'multi', [
        'Kunden får komplettera',
        'Byrån gör rimlighetsbedömning',
        'Ansvarig granskar',
        'Fråga ställs till Skatteverket/extern expert',
        'Ingen särskild rutin'
      ], { showWhen: { id: 'momsGor', any: ['Ja, upprättar', 'Ja, lämnar in', 'I vissa uppdrag'] } })
    ]),
    spec('deklarationer', 'Deklarationer', [
      q('dekVilka', 'Vilka deklarationer hanterar byrån normalt?', 'multi', [
        'Inkomstdeklaration företag',
        'Inkomstdeklaration privatperson',
        'Momsdeklaration',
        'Arbetsgivardeklaration',
        'Annat'
      ]),
      q('dekLamnarIn', 'Lämnar byrån normalt in deklaration som ombud?', 'single', [
        'Ja',
        'Nej, kunden lämnar in själv',
        'I vissa uppdrag'
      ]),
      q('dekKunduppgifterKraver', 'Bygger deklarationen på uppgifter som kunden behöver lämna eller bekräfta?', 'single', [
        'Ja',
        'Nej',
        'I vissa uppdrag'
      ]),
      q('dekKunduppgifter', 'Vilka kunduppgifter förekommer normalt?', 'multi', [
        'Privata inkomster/utgifter',
        'Kapitalvinster/försäljningar',
        'Lån eller ränteuppgifter',
        'Utländska inkomster/tillgångar',
        'Avdrag',
        'Annat'
      ]),
      q('dekAvvikande', 'Kontrolleras större eller avvikande deklarationsposter?', 'single', [
        'Ja, normalt',
        'Ja, vid större belopp eller avvikelser',
        'Nej, normalt inte'
      ]),
      q('dekOklar', 'Hur hanteras uppgifter som inte kan styrkas?', 'multi', [
        'Kunden får komplettera',
        'Uppgiften dokumenteras',
        'Byrån gör rimlighetsbedömning',
        'Uppgiften tas inte med förrän den är utredd',
        'Ingen särskild rutin'
      ])
    ]),
    spec('leverantorsfakturor', 'Leverantörsfakturor och leverantörsreskontra', [
      q('lfHanterar', 'Hanterar byrån leverantörsreskontra åt kunder?', 'single', [
        'Ja',
        'Nej',
        'I vissa uppdrag'
      ]),
      q('lfVad', 'Vilka moment ingår normalt?', 'multi', [
        'Registrera leverantörsfakturor',
        'Matcha betalningar',
        'Kontrollera obetalda fakturor',
        'Förbereda betalningsunderlag',
        'Annat'
      ], omTjanstenUtfor('lfHanterar')),
      q('lfKontrollNy', 'Kontrolleras nya leverantörer eller ändrade betalningsuppgifter?', 'single', [
        'Ja, normalt',
        'Ja, vid avvikelser',
        'Nej, normalt inte'
      ], omTjanstenUtfor('lfHanterar')),
      q('lfUtland', 'Förekommer leverantörer i andra länder?', 'single', [
        'Ja, ofta',
        'Ja, ibland',
        'Nej, sällan',
        'Nej, normalt inte'
      ], omTjanstenUtfor('lfHanterar')),
      q('lfOvanligaBelopp', 'Kontrolleras större eller ovanliga leverantörsfakturor?', 'single', [
        'Ja, normalt',
        'Ja, vid större belopp eller avvikelser',
        'Nej, normalt inte'
      ], omTjanstenUtfor('lfHanterar')),
      q('lfOvanliga', 'Hur hanteras fakturor som verkar oklara eller ovanliga?', 'multi', [
        'Kunden får komplettera',
        'Fakturan dokumenteras',
        'Byrån gör rimlighetsbedömning',
        'Ansvarig granskar',
        'Betalning/registrering stoppas tills frågan är utredd',
        'Ingen särskild rutin'
      ], omTjanstenUtfor('lfHanterar'))
    ]),
    spec('arsredovisning', 'Årsredovisning', [
      q('arUpprattar', 'Upprättar byrån årsredovisningen?', 'single', [
        'Ja',
        'Nej',
        'I vissa uppdrag'
      ]),
      q('arInlamning', 'Hjälper byrån kunden med inlämning till Bolagsverket?', 'single', [
        'Ja',
        'Nej',
        'I vissa uppdrag'
      ]),
      q('arEgetBokslut', 'Bygger årsredovisningen normalt på bokslut som byrån själv har gjort?', 'single', [
        'Ja',
        'Nej',
        'I vissa uppdrag'
      ]),
      q('arAvvikande', 'Kontrolleras större eller avvikande poster innan årsredovisningen färdigställs?', 'single', [
        'Ja, normalt',
        'Ja, vid större belopp eller avvikelser',
        'Nej, normalt inte'
      ]),
      q('arNarstaende', 'Kontrolleras lån, ägartransaktioner eller närståendeposter?', 'single', [
        'Ja, normalt',
        'Ja, vid större belopp eller avvikelser',
        'Nej, normalt inte',
        'Ej relevant'
      ]),
      q('arExternPart', 'Hanteras uppgifter som ska lämnas till bank, investerare eller annan extern part?', 'single', [
        'Ja',
        'Nej',
        'I vissa uppdrag'
      ])
    ]),
    spec('lonehantering', 'Lönehantering', [
      q('lonHanterar', 'Hanterar byrån löner åt kunden?', 'single', [
        'Ja',
        'Nej',
        'I vissa uppdrag'
      ]),
      q('lonVad', 'Vilka moment ingår normalt?', 'multi', [
        'Beräkna lön',
        'Registrera nya anställda',
        'Hantera utlägg/förmåner',
        'Arbetsgivardeklaration',
        'Löneutbetalningsfil',
        'Annat'
      ], omTjanstenUtfor('lonHanterar')),
      q('lonUnderlag', 'Vem lämnar normalt uppgifter om arbetad tid, ersättningar och utlägg?', 'multi', [
        'Kunden',
        'Anställda',
        'Byrån hämtar från system',
        'Annan part'
      ], omTjanstenUtfor('lonHanterar')),
      q('lonOvanliga', 'Kontrolleras ovanliga löner, bonusar, utlägg eller ersättningar?', 'single', [
        'Ja, normalt',
        'Ja, vid större belopp eller avvikelser',
        'Nej, normalt inte'
      ], omTjanstenUtfor('lonHanterar')),
      q('lonAgarlon', 'Förekommer löner till ägare, närstående eller personer med oklar koppling till verksamheten?', 'single', [
        'Ja',
        'Nej',
        'I vissa uppdrag'
      ], omTjanstenUtfor('lonHanterar')),
      q('lonOklar', 'Hur hanteras oklara löneuppgifter eller utlägg?', 'multi', [
        'Kunden får komplettera',
        'Underlag krävs',
        'Ansvarig granskar',
        'Posten tas inte med förrän den är utredd',
        'Ingen särskild rutin'
      ], omTjanstenUtfor('lonHanterar'))
    ]),
    spec('lagerredovisning', 'Lagerredovisning och lagervärdering', [
      q('lagerHanterar', 'Hanterar byrån lageruppgifter åt kunden?', 'single', [
        'Ja',
        'Nej',
        'I vissa uppdrag'
      ]),
      q('lagerUnderlag', 'Vem lämnar normalt uppgifter om lagret?', 'multi', [
        'Kunden',
        'Byrån hämtar från system',
        'Annan part'
      ], omTjanstenUtfor('lagerHanterar')),
      q('lagerForandring', 'Kontrolleras större förändringar i lager jämfört med tidigare perioder?', 'single', [
        'Ja, normalt',
        'Ja, vid större avvikelser',
        'Nej, normalt inte'
      ], omTjanstenUtfor('lagerHanterar')),
      q('lagerHogrisk', 'Förekommer lager i branscher med högre risk, t.ex. kontanthandel, bygg, fordon, elektronik eller varor med högt värde?', 'single', [
        'Ja',
        'Nej',
        'I vissa uppdrag'
      ], omTjanstenUtfor('lagerHanterar')),
      q('lagerOsaker', 'Hur hanteras lageruppgifter som verkar osäkra?', 'multi', [
        'Kunden får komplettera',
        'Underlag/inventeringslista krävs',
        'Byrån gör rimlighetsbedömning',
        'Ansvarig granskar',
        'Ingen särskild rutin'
      ], omTjanstenUtfor('lagerHanterar'))
    ]),
    spec('betalningsuppdrag', 'Betalningsuppdrag och betalningshantering', [
      q('betUtfor', 'Utför byrån betalningar för kundens räkning?', 'single', [
        'Ja',
        'Nej',
        'I vissa uppdrag'
      ]),
      q('betVad', 'Vilka betalningar hanteras normalt?', 'multi', [
        'Leverantörsbetalningar',
        'Löner',
        'Skatter/avgifter',
        'Utlägg/ersättningar',
        'Betalningar till ägare/närstående',
        'Utlandsbetalningar',
        'Annat'
      ], omTjanstenUtfor('betUtfor')),
      q('betGodkannande', 'Krävs kundens godkännande innan betalning genomförs?', 'single', [
        'Ja, alltid',
        'Ja, vid större belopp',
        'Nej, normalt inte'
      ], omTjanstenUtfor('betUtfor')),
      q('betNya', 'Kontrolleras nya mottagare eller ändrade kontonummer?', 'single', [
        'Ja, normalt',
        'Ja, vid avvikelser',
        'Nej, normalt inte'
      ], omTjanstenUtfor('betUtfor')),
      q('betSarskild', 'Kontrolleras betalningar till ägare, närstående eller utlandet särskilt?', 'single', [
        'Ja, normalt',
        'Ja, vid större belopp eller avvikelser',
        'Nej, normalt inte',
        'Ej relevant'
      ], omTjanstenUtfor('betUtfor')),
      q('betOklar', 'Hur hanteras betalningar som verkar oklara eller avvikande?', 'multi', [
        'Kunden får komplettera',
        'Betalningen stoppas tills den är utredd',
        'Ansvarig granskar',
        'Underlag dokumenteras',
        'Misstanke eskaleras',
        'Ingen särskild rutin'
      ], omTjanstenUtfor('betUtfor'))
    ]),
    spec('radgivning', 'Rådgivning', [
      q('radTyp', 'Vilken typ av rådgivning lämnar byrån normalt?', 'multi', [
        'Skatt',
        'Finansiering/lån',
        'Utdelning/lön',
        'Förvärv/försäljning av bolag eller tillgångar',
        'Internationella frågor',
        'Allmän ekonomisk rådgivning',
        'Annat'
      ]),
      q('radAgar', 'Förekommer rådgivning om ägartransaktioner, lån eller kapitaltillskott?', 'single', [
        'Ja',
        'Nej',
        'I vissa uppdrag'
      ]),
      q('radUtland', 'Förekommer rådgivning med koppling till utlandet?', 'single', [
        'Ja, ofta',
        'Ja, ibland',
        'Nej, sällan',
        'Nej, normalt inte'
      ]),
      q('radDokumenteras', 'Dokumenteras syftet med rådgivningen vid större eller ovanliga upplägg?', 'single', [
        'Ja, normalt',
        'Ja, vid större/ovanliga upplägg',
        'Nej, normalt inte'
      ]),
      q('radRiskfylld', 'Hur hanteras rådgivning som kan framstå som ovanlig eller riskfylld?', 'multi', [
        'Ansvarig granskar',
        'Extern expert anlitas',
        'Rådgivningen dokumenteras',
        'Uppdraget avböjs',
        'Misstanke eskaleras',
        'Ingen särskild rutin'
      ])
    ], {
      helpText: 'Aktivera Rådgivning om byrån erbjuder fristående eller särskilt debiterad rådgivning som går utöver normal återkoppling inom bokföring, bokslut, moms, deklaration eller årsredovisning. Normal förklaring av rapporter, bokslut eller deklaration behöver inte anges som separat rådgivning.'
    })
  ];

  const ALIASES = {
    'rot rut': 'rot-rut',
    'rot/rut': 'rot-rut',
    'rot-rut': 'rot-rut',
    'rot rut hantering': 'rot-rut',
    'rot rut administration': 'rot-rut',
    'rot': 'rot-rut',
    'rut': 'rot-rut',
    'lopande bokforing': 'lopande-bokforing',
    'bokforing': 'lopande-bokforing',
    'anlaggningsregister': 'anlaggningsregister',
    'anlaggningsregister och avskrivningar': 'anlaggningsregister',
    'avskrivningar': 'anlaggningsregister',
    'kontoavstamningar': 'kontoavstamningar',
    'kontoavstamningar och periodavstamningar': 'kontoavstamningar',
    'periodavstamningar': 'kontoavstamningar',
    'avstamningar': 'kontoavstamningar',
    'kontrollbalansrakning': 'kontrollbalansrakning',
    'kontrollbalans': 'kontrollbalansrakning',
    'kundfakturering': 'kundfakturering',
    'kundfakturering och kundreskontra': 'kundfakturering',
    'kundreskontra': 'kundfakturering',
    'bokslut': 'bokslut',
    'arsbokslut': 'bokslut',
    'momsredovisning': 'momsredovisning',
    'moms': 'momsredovisning',
    'deklarationer': 'deklarationer',
    'deklaration': 'deklarationer',
    'inkomstdeklaration': 'deklarationer',
    'leverantorsfakturor': 'leverantorsfakturor',
    'leverantorsfakturor och leverantorsreskontra': 'leverantorsfakturor',
    'leverantorsreskontra': 'leverantorsfakturor',
    'arsredovisning': 'arsredovisning',
    'lonehantering': 'lonehantering',
    'lon': 'lonehantering',
    'loner': 'lonehantering',
    'lagerredovisning': 'lagerredovisning',
    'lagerredovisning och lagervardering': 'lagerredovisning',
    'lagervardering': 'lagerredovisning',
    'betalningsuppdrag': 'betalningsuppdrag',
    'betalningsuppdrag och betalningshantering': 'betalningsuppdrag',
    'betalningshantering': 'betalningsuppdrag',
    'radgivning': 'radgivning'
  };

  function isCustomId(id) {
    return String(id || '').indexOf('custom:') === 0;
  }

  function createCustomId() {
    return 'custom:' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function customTemplate(entry) {
    return {
      id: (entry && entry.id) || createCustomId(),
      name: (entry && entry.namn) || 'Egen tjänst',
      description: '',
      aiQuestionSupport: false,
      questions: [],
      extraQuestions: [EGEN_BESKRIVNING]
    };
  }

  function templateById(id) {
    if (!id) return null;
    if (isCustomId(id)) return customTemplate({ id: id });
    return SERVICE_TEMPLATES.find((t) => t.id === id) || null;
  }

  function resolveTemplateId(namn) {
    const folded = foldName(namn);
    if (!folded) return '';
    if (ALIASES[folded]) return ALIASES[folded];
    const exact = SERVICE_TEMPLATES.find((t) => foldName(t.name) === folded);
    if (exact) return exact.id;
    const partial = SERVICE_TEMPLATES.find((t) => {
      const fn = foldName(t.name);
      return folded.indexOf(fn) !== -1 || fn.indexOf(folded) !== -1;
    });
    return partial ? partial.id : '';
  }

  function resolveTemplate(namn) {
    const id = resolveTemplateId(namn);
    return id ? templateById(id) : null;
  }

  function tjanstNamesMatch(a, b) {
    const fa = foldName(a);
    const fb = foldName(b);
    if (!fa || !fb) return false;
    if (fa === fb) return true;
    const idA = resolveTemplateId(a);
    const idB = resolveTemplateId(b);
    return !!(idA && idB && idA === idB);
  }

  function extraQuestionsForTemplate(template) {
    if (!template) return [];
    return template.aiQuestionSupport === false
      ? (template.extraQuestions || [EGEN_BESKRIVNING])
      : (template.questions || []);
  }

  function selectedValues(raw) {
    if (Array.isArray(raw)) return raw.filter(Boolean);
    if (raw == null || raw === '') return [];
    return [String(raw)];
  }

  function questionIsVisible(question, answers) {
    const rule = question && question.showWhen;
    if (!rule || !rule.id) return true;
    const selected = selectedValues(answers && answers[rule.id]);
    if (Array.isArray(rule.any) && rule.any.length) {
      return rule.any.some((opt) => selected.indexOf(opt) !== -1);
    }
    return selected.length > 0;
  }

  function questionsForTemplate(template) {
    const extra = extraQuestionsForTemplate(template);
    const stats = STATISTIK_QUESTIONS.slice();
    if (template && template.replaceBaseQuestions) return stats.concat(extra);
    return stats.concat(BASE_QUESTIONS, extra);
  }

  function groupQuestionsForTemplate(template) {
    const extra = extraQuestionsForTemplate(template);
    const stats = STATISTIK_QUESTIONS.slice();
    if (template && template.replaceBaseQuestions) {
      return { stats: stats, base: extra.slice(), extra: [] };
    }
    return {
      stats: stats,
      base: BASE_QUESTIONS.slice(),
      extra: extra
    };
  }

  function wantsClientflowStatistik(entry) {
    return selectedValues(entry && entry.answers && entry.answers.hamtaClientflowStatistik).indexOf('Ja') !== -1;
  }

  function emptyState() {
    return { version: 1, tjanster: {} };
  }

  function parseState(raw) {
    if (!raw) return emptyState();
    if (typeof raw === 'object' && raw.tjanster && typeof raw.tjanster === 'object') {
      return { version: Number(raw.version) || 1, tjanster: raw.tjanster };
    }
    try {
      const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (parsed && parsed.tjanster && typeof parsed.tjanster === 'object') {
        return { version: Number(parsed.version) || 1, tjanster: parsed.tjanster };
      }
    } catch (_) { /* ignore */ }
    return emptyState();
  }

  function emptyEntry(mallId, extra) {
    return Object.assign({
      id: mallId,
      aktiv: false,
      answers: {},
      kommentarer: {}
    }, extra || {});
  }

  function getEntry(state, mallId) {
    const parsed = parseState(state);
    return parsed.tjanster[mallId] || emptyEntry(mallId);
  }

  function upsertEntry(state, mallId, patch) {
    const parsed = parseState(state);
    const prev = parsed.tjanster[mallId] || emptyEntry(mallId);
    parsed.tjanster[mallId] = Object.assign({}, prev, patch, { id: mallId });
    return parsed;
  }

  function addCustomService(state, namn) {
    const id = createCustomId();
    return {
      state: upsertEntry(state, id, { aktiv: true, namn: String(namn || 'Egen tjänst').trim(), answers: {}, kommentarer: {} }),
      id: id
    };
  }

  function listCatalogCards(state) {
    const parsed = parseState(state);
    const cards = SERVICE_TEMPLATES.map((t) => {
      const entry = parsed.tjanster[t.id] || emptyEntry(t.id);
      return { template: t, entry: entry };
    });
    Object.keys(parsed.tjanster).forEach((id) => {
      if (!isCustomId(id)) return;
      const entry = parsed.tjanster[id];
      cards.push({ template: customTemplate({ id: id, namn: entry.namn }), entry: entry });
    });
    return cards;
  }

  function formatAnswerValue(value) {
    if (Array.isArray(value)) return value.filter(Boolean).join(', ');
    if (value == null) return '';
    return String(value).trim();
  }

  function formatAnswersForAi(template, entry) {
    const questions = questionsForTemplate(template);
    const answers = (entry && entry.answers) || {};
    const comments = (entry && entry.kommentarer) || {};
    const rows = [];
    const unanswered = [];
    questions.forEach((question) => {
      if (!questionIsVisible(question, answers)) return;
      const raw = answers[question.id];
      const text = formatAnswerValue(raw);
      const comment = formatAnswerValue(comments[question.id]);
      if (!text && question.type !== 'text' && question.type !== 'number') {
        unanswered.push(question.label);
        return;
      }
      if ((question.type === 'text' || question.type === 'number') && !text) {
        unanswered.push(question.label);
        return;
      }
      rows.push({
        id: question.id,
        label: question.label,
        svar: text || 'uppgift saknas',
        kommentar: comment
      });
    });
    return { rows: rows, unanswered: unanswered };
  }

  function findEntryForNamn(state, namn) {
    const parsed = parseState(state);
    const mallId = resolveTemplateId(namn);
    if (mallId && parsed.tjanster[mallId]) return { mallId: mallId, entry: parsed.tjanster[mallId] };
    const folded = foldName(namn);
    const customId = Object.keys(parsed.tjanster).find((id) => {
      if (!isCustomId(id)) return false;
      return foldName(parsed.tjanster[id].namn) === folded;
    });
    if (customId) return { mallId: customId, entry: parsed.tjanster[customId] };
    if (mallId) return { mallId: mallId, entry: emptyEntry(mallId) };
    return null;
  }

  const api = {
    HELP_TEXT: HELP_TEXT,
    BASE_QUESTIONS: BASE_QUESTIONS,
    STATISTIK_QUESTIONS: STATISTIK_QUESTIONS,
    EGEN_BESKRIVNING: EGEN_BESKRIVNING,
    SERVICE_TEMPLATES: SERVICE_TEMPLATES,
    foldName: foldName,
    isCustomId: isCustomId,
    createCustomId: createCustomId,
    customTemplate: customTemplate,
    templateById: templateById,
    resolveTemplateId: resolveTemplateId,
    resolveTemplate: resolveTemplate,
    tjanstNamesMatch: tjanstNamesMatch,
    extraQuestionsForTemplate: extraQuestionsForTemplate,
    questionIsVisible: questionIsVisible,
    wantsClientflowStatistik: wantsClientflowStatistik,
    questionsForTemplate: questionsForTemplate,
    groupQuestionsForTemplate: groupQuestionsForTemplate,
    emptyState: emptyState,
    parseState: parseState,
    emptyEntry: emptyEntry,
    getEntry: getEntry,
    upsertEntry: upsertEntry,
    addCustomService: addCustomService,
    listCatalogCards: listCatalogCards,
    formatAnswersForAi: formatAnswersForAi,
    findEntryForNamn: findEntryForNamn
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  global.TjanstUtforandeMallar = api;
})(typeof window !== 'undefined' ? window : globalThis);
