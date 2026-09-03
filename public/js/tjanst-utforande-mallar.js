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

  function spec(id, name, questions, extra) {
    return Object.assign({
      id: id,
      name: name,
      aiQuestionSupport: true,
      questions: questions || []
    }, extra || {});
  }

  const SERVICE_TEMPLATES = [
    spec('rot-rut', 'ROT-/RUT-administration', [
      q('rotVad', 'Vad gör byrån normalt i ROT-/RUT-processen?', 'multi', [
        'Kontrollerar kundens underlag',
        'Beräknar ROT/RUT-belopp',
        'Upprättar ansökan',
        'Skickar in ansökan',
        'Följer upp beslut/utbetalning',
        'Hjälper till vid korrigering eller avslag',
        'Annat'
      ]),
      q('rotBedomerKrav', 'Vem bedömer normalt om arbetet uppfyller ROT-/RUT-kraven?', 'single', [
        'Kunden',
        'Byrån',
        'Kunden och byrån tillsammans',
        'Annan part',
        'Varierar mellan kunder'
      ]),
      q('rotStammerOverens', 'Kontrollerar byrån att faktura, betalning och underlag stämmer överens innan ansökan skickas?', 'single', [
        'Ja, alltid',
        'Ja, vid större eller avvikande ärenden',
        'Ja, stickprovsvis',
        'Nej, kunden ansvarar för detta',
        'Varierar mellan kunder'
      ]),
      q('rotUtanVerifiering', 'Förekommer det att byrån skickar in ROT-/RUT-ansökningar baserat på uppgifter som kunden lämnat utan att byrån kan verifiera dem?', 'single', [
        'Ja',
        'Nej',
        'I vissa fall',
        'Vet ej'
      ]),
      q('rotAvslag', 'Hur hanteras avslag, återkrav eller korrigeringar från Skatteverket?', 'multi', [
        'Kunden hanterar detta själv',
        'Byrån hjälper till att rätta',
        'Byrån utreder orsaken innan ny ansökan',
        'Det finns ingen särskild rutin',
        'Har inte förekommit',
        'Annat'
      ])
    ], { description: 'Administration av skattereduktioner för ROT och RUT.' }),
    spec('lopande-bokforing', 'Löpande bokföring', [
      q('bokfDelar', 'Vilka delar ingår normalt i den löpande bokföringen?', 'multi', [
        'Kundfakturor',
        'Leverantörsfakturor',
        'Kvitton och utlägg',
        'Bankhändelser',
        'Moms',
        'Lönerelaterade bokningar',
        'Periodiseringar',
        'Avstämningar',
        'Annat'
      ]),
      q('bokfUnderlagKund', 'Bokför byrån normalt utifrån underlag som kunden själv laddar upp eller skickar in?', 'single', [
        'Ja, huvudsakligen',
        'Nej, byrån hämtar mest från system/integrationer',
        'Både och',
        'Varierar mellan kunder'
      ]),
      q('bokfOtydligt', 'Hur hanteras underlag som är otydliga, saknas eller inte verkar höra till verksamheten?', 'multi', [
        'Kunden kontaktas',
        'Underlaget bokförs inte förrän det är utrett',
        'Ansvarig konsult granskar',
        'Avvikelsen dokumenteras',
        'Det hanteras från fall till fall',
        'Ingen särskild rutin'
      ]),
      q('bokfOvanliga', 'Kontrolleras större, ovanliga eller verksamhetsfrämmande transaktioner innan de bokförs?', 'single', [
        'Ja, normalt',
        'Ja, vid högriskkunder eller större belopp',
        'Ibland',
        'Nej, normalt inte',
        'Varierar mellan kunder'
      ]),
      q('bokfKontanter', 'Förekommer kunder där byrån bokför kontanta intäkter, dagskassor eller många manuella underlag?', 'single', [
        'Ja',
        'Nej',
        'I vissa fall',
        'Vet ej/systemdata används'
      ])
    ]),
    spec('anlaggningsregister', 'Anläggningsregister och avskrivningar', [
      q('anlVad', 'Vad ingår normalt?', 'multi', [
        'Registrera nya anläggningstillgångar',
        'Beräkna avskrivningar',
        'Stämma av anläggningsregister mot bokföring',
        'Hantera försäljning/utrangering',
        'Bedöma nedskrivningsbehov',
        'Annat'
      ]),
      q('anlInfo', 'Vem lämnar normalt information om inköp, försäljning eller utrangering av tillgångar?', 'single', [
        'Kunden',
        'Byrån utifrån bokföringen',
        'Kunden och byrån tillsammans',
        'Annan part',
        'Varierar mellan kunder'
      ]),
      q('anlUnderlag', 'Kontrollerar byrån större inköp av tillgångar mot faktura, avtal eller annat underlag?', 'single', [
        'Ja, normalt',
        'Ja, vid större belopp',
        'Stickprovsvis',
        'Nej, normalt inte',
        'Varierar mellan kunder'
      ]),
      q('anlRimlighet', 'Kontrolleras att större tillgångar verkar rimliga i förhållande till kundens verksamhet?', 'single', [
        'Ja',
        'Nej',
        'I vissa fall',
        'Varierar mellan kunder'
      ])
    ]),
    spec('kontoavstamningar', 'Kontoavstämningar och periodavstämningar', [
      q('avstVilka', 'Vilka avstämningar gör byrån normalt?', 'multi', [
        'Bank',
        'Skattekonto',
        'Moms',
        'Kundreskontra',
        'Leverantörsreskontra',
        'Löner',
        'Kassa',
        'Balanskonton',
        'Annat'
      ]),
      q('avstHurOfta', 'Hur ofta görs avstämningar normalt?', 'single', [
        'Månadsvis',
        'Kvartalsvis',
        'Årligen',
        'Vid bokslut',
        'Vid behov',
        'Varierar mellan kunder'
      ]),
      q('avstDifferens', 'Hur hanteras differenser eller poster som inte går att stämma av?', 'multi', [
        'Kunden kontaktas',
        'Differensen utreds av byrån',
        'Differensen bokas om efter bedömning',
        'Ansvarig konsult granskar',
        'Dokumenteras i arbetsmaterial',
        'Ingen särskild rutin',
        'Annat'
      ]),
      q('avstGrans', 'Finns beloppsgräns eller annan praktisk gräns för när differenser måste utredas vidare?', 'single', [
        'Ja',
        'Nej',
        'Informellt/från fall till fall',
        'Varierar mellan kunder'
      ])
    ]),
    spec('kontrollbalansrakning', 'Kontrollbalansräkning', [
      q('kbrNar', 'När upprättar byrån normalt kontrollbalansräkning?', 'multi', [
        'När kunden begär det',
        'När byrån uppmärksammar kapitalbrist',
        'Efter dialog med revisor',
        'Vid rekonstruktion/ekonomiska problem',
        'Annat'
      ]),
      q('kbrUnderlag', 'Vilket underlag används normalt?', 'multi', [
        'Kundens löpande bokföring',
        'Bokslutsunderlag',
        'Kundens egna värderingar',
        'Värderingsintyg',
        'Avtal eller externa handlingar',
        'Annat'
      ]),
      q('kbrEgnaVarden', 'Förekommer det att kunden lämnar egna uppskattningar eller värderingar som byrån inte kan verifiera fullt ut?', 'single', [
        'Ja',
        'Nej',
        'I vissa fall',
        'Vet ej'
      ]),
      q('kbrJusteringar', 'Hur hanteras större värderingar eller justeringar i kontrollbalansräkningen?', 'multi', [
        'Kunden får lämna skriftlig förklaring',
        'Externt underlag begärs',
        'Ansvarig konsult granskar',
        'Byrån avstår om underlaget är otillräckligt',
        'Det hanteras från fall till fall',
        'Ingen särskild rutin'
      ]),
      q('kbrExtra', 'Sker extra granskning innan kontrollbalansräkningen lämnas till kunden?', 'single', [
        'Ja, alltid',
        'Ja, vid större eller osäkra värden',
        'Nej',
        'Varierar mellan kunder'
      ])
    ]),
    spec('kundfakturering', 'Kundfakturering och kundreskontra', [
      q('kfVad', 'Vad gör byrån normalt?', 'multi', [
        'Skapar kundfakturor',
        'Skickar kundfakturor',
        'Bokför kundfakturor',
        'Följer upp betalningar',
        'Skickar påminnelser',
        'Stämmer av kundreskontra',
        'Hanterar kreditfakturor',
        'Annat'
      ]),
      q('kfBestammer', 'Vem bestämmer normalt vad som ska faktureras, till vem och med vilket belopp?', 'single', [
        'Kunden',
        'Byrån utifrån avtal/tidrapporter/underlag',
        'Kunden och byrån tillsammans',
        'Annan part',
        'Varierar mellan kunder'
      ]),
      q('kfUtanGodkannande', 'Kan byrån skapa eller ändra kundfakturor utan att kunden godkänner varje faktura?', 'single', [
        'Ja',
        'Nej',
        'I vissa fall',
        'Varierar mellan kunder'
      ]),
      q('kfKredit', 'Kontrolleras kreditfakturor, makuleringar eller ovanligt stora fakturor särskilt?', 'single', [
        'Ja, normalt',
        'Ja, vid större belopp eller avvikelse',
        'Nej, normalt inte',
        'Varierar mellan kunder'
      ]),
      q('kfUtland', 'Förekommer fakturering till utlandet eller till närstående bolag inom tjänsten?', 'single', [
        'Ja',
        'Nej',
        'I vissa fall',
        'Vet ej/systemdata används'
      ])
    ]),
    spec('bokslut', 'Bokslut', [
      q('bsEgenBokforing', 'Bygger bokslutet normalt på bokföring som byrån själv har skött under året?', 'single', [
        'Ja, huvudsakligen',
        'Nej, kunden/annan part har gjort bokföringen',
        'Både och',
        'Varierar mellan kunder'
      ]),
      q('bsMoment', 'Vilka moment ingår normalt i bokslutsarbetet?', 'multi', [
        'Avstämningar',
        'Bokslutsbilagor',
        'Periodiseringar',
        'Skatteberäkning',
        'Värdering av lager/tillgångar/fordringar',
        'Kontroll av ägarlån/närstående',
        'Genomgång med kund',
        'Annat'
      ]),
      q('bsJusteringar', 'Kontrolleras större bokslutsjusteringar, manuella bokningar eller poster som avviker från tidigare år?', 'single', [
        'Ja, normalt',
        'Ja, vid väsentliga belopp eller avvikelse',
        'Nej, normalt inte',
        'Varierar mellan kunder'
      ]),
      q('bsOverifierat', 'Hur hanteras uppgifter som kunden lämnar inför bokslut och som byrån inte kan verifiera fullt ut?', 'multi', [
        'Kundens uppgift dokumenteras',
        'Kunden får lämna kompletterande underlag',
        'Ansvarig konsult gör rimlighetsbedömning',
        'Posten tas inte med förrän den är utredd',
        'Det hanteras från fall till fall',
        'Ingen särskild rutin'
      ]),
      q('bsAgarlan', 'Kontrolleras lån till/från ägare, närstående eller koncernbolag när sådana poster finns?', 'single', [
        'Ja, normalt',
        'Ja, vid större belopp',
        'Nej, normalt inte',
        'Ej relevant',
        'Varierar mellan kunder'
      ])
    ]),
    spec('momsredovisning', 'Momsredovisning', [
      q('momsVad', 'Vad gör byrån normalt i momsredovisningen?', 'multi', [
        'Tar fram momsrapport',
        'Kontrollerar momsrapport',
        'Lämnar in momsdeklaration',
        'Hanterar rättelser',
        'Hanterar EU-handel/import/export',
        'Hanterar omvänd moms',
        'Annat'
      ]),
      q('momsAvdrag', 'Kontrolleras större momsavdrag eller ovanliga momsposter innan redovisning?', 'single', [
        'Ja, normalt',
        'Ja, vid större belopp eller avvikelse',
        'Stickprovsvis',
        'Nej, normalt inte',
        'Varierar mellan kunder'
      ]),
      q('momsEu', 'Förekommer kunder med EU-handel, import/export eller omvänd skattskyldighet?', 'single', [
        'Ja',
        'Nej',
        'I vissa fall',
        'Vet ej/systemdata används'
      ]),
      q('momsDifferens', 'Hur hanteras differenser mellan bokföring, momsrapport och tidigare perioder?', 'multi', [
        'Differensen utreds',
        'Kunden kontaktas',
        'Rättelse görs vid behov',
        'Ansvarig konsult granskar',
        'Det hanteras från fall till fall',
        'Ingen särskild rutin'
      ])
    ]),
    spec('deklarationer', 'Deklarationer', [
      q('dekVilka', 'Vilka deklarationer hjälper byrån normalt till med?', 'multi', [
        'Inkomstdeklaration aktiebolag',
        'Inkomstdeklaration enskild firma',
        'Inkomstdeklaration fysisk person/företagare',
        'K10',
        'NE-bilaga',
        'Skattebilagor',
        'Annat'
      ]),
      q('dekEgetUnderlag', 'Bygger deklarationen normalt på bokföring/bokslut som byrån själv har tagit fram?', 'single', [
        'Ja, huvudsakligen',
        'Nej, kunden/annan part lämnar huvudsakligen uppgifter',
        'Både och',
        'Varierar mellan kunder'
      ]),
      q('dekAvdrag', 'Kontrolleras större avdrag, skattemässiga justeringar eller ovanliga uppgifter särskilt?', 'single', [
        'Ja, normalt',
        'Ja, vid större belopp eller avvikelse',
        'Nej, normalt inte',
        'Varierar mellan kunder'
      ]),
      q('dekLamnarIn', 'Lämnar byrån normalt in deklarationen åt kunden?', 'single', [
        'Ja',
        'Nej',
        'I vissa fall',
        'Varierar mellan kunder'
      ]),
      q('dekUtland', 'Förekommer deklarationer med utländska inkomster, tillgångar eller transaktioner?', 'single', [
        'Ja',
        'Nej',
        'I vissa fall',
        'Vet ej/systemdata används'
      ])
    ]),
    spec('leverantorsfakturor', 'Leverantörsfakturor och leverantörsreskontra', [
      q('lfVad', 'Vad gör byrån normalt?', 'multi', [
        'Tar emot leverantörsfakturor',
        'Registrerar leverantörsfakturor',
        'Konterar leverantörsfakturor',
        'Skapar betalningsförslag',
        'Stämmer av leverantörsreskontra',
        'Följer upp obetalda fakturor',
        'Hanterar kreditfakturor',
        'Annat'
      ]),
      q('lfGodkannande', 'Vem godkänner normalt leverantörsfakturor innan betalning eller bokföring?', 'single', [
        'Kunden',
        'Byrån',
        'Kunden och byrån tillsammans',
        'Annan part',
        'Varierar mellan kunder'
      ]),
      q('lfNyaLeverantorer', 'Kan byrån lägga upp nya leverantörer eller ändra leverantörers bankkonton i kundens system?', 'single', [
        'Ja',
        'Nej',
        'I vissa fall',
        'Varierar mellan kunder'
      ]),
      q('lfKontrollNy', 'Kontrolleras nya leverantörer, ändrade bankkonton eller ovanliga betalningsmottagare särskilt?', 'single', [
        'Ja, normalt',
        'Ja, vid avvikelse eller större belopp',
        'Nej, normalt inte',
        'Varierar mellan kunder'
      ]),
      q('lfOvanliga', 'Hur hanteras leverantörsfakturor som verkar ovanliga, oklara eller saknar tillräckligt underlag?', 'multi', [
        'Kunden kontaktas',
        'Fakturan stoppas/pausas',
        'Ansvarig konsult granskar',
        'Avvikelsen dokumenteras',
        'Det hanteras från fall till fall',
        'Ingen särskild rutin'
      ])
    ]),
    spec('arsredovisning', 'Årsredovisning', [
      q('arVad', 'Vad ingår normalt i tjänsten?', 'multi', [
        'Upprättande av årsredovisning',
        'Digital inlämning',
        'Fastställelseintyg',
        'Dialog med revisor',
        'Genomgång med kund',
        'Annat'
      ]),
      q('arEgetBokslut', 'Bygger årsredovisningen normalt på bokslut som byrån själv har upprättat?', 'single', [
        'Ja, huvudsakligen',
        'Nej',
        'Både och',
        'Varierar mellan kunder'
      ]),
      q('arStammer', 'Kontrolleras att årsredovisningen stämmer mot bokslut och huvudbok innan den lämnas till kund eller skickas in?', 'single', [
        'Ja, normalt',
        'Ja, vid vissa uppdrag',
        'Nej, normalt inte',
        'Varierar mellan kunder'
      ]),
      q('arGodkannande', 'Vem ansvarar normalt för att godkänna årsredovisningen innan eventuell inlämning?', 'single', [
        'Kunden/styrelsen',
        'Byrån',
        'Kunden och byrån tillsammans',
        'Revisor',
        'Varierar mellan kunder'
      ]),
      q('arDigital', 'Hanterar byrån digital inlämning till Bolagsverket?', 'single', [
        'Ja',
        'Nej',
        'I vissa fall',
        'Varierar mellan kunder'
      ])
    ]),
    spec('lonehantering', 'Lönehantering', [
      q('lonVad', 'Vad ingår normalt i lönehanteringen?', 'multi', [
        'Löneberedning',
        'Lönebesked',
        'Arbetsgivardeklaration',
        'Semesterhantering',
        'Förmåner',
        'Utlägg/traktamenten',
        'Löneutbetalningsfil',
        'Annat'
      ]),
      q('lonUnderlag', 'Vem lämnar normalt löneunderlag, exempelvis timmar, frånvaro, bonusar och ersättningar?', 'single', [
        'Kunden',
        'Byrån',
        'Kunden och byrån tillsammans',
        'Annan part',
        'Varierar mellan kunder'
      ]),
      q('lonAndra', 'Kan byrån lägga upp nya anställda eller ändra lön, förmåner eller bankkonto i lönesystemet?', 'single', [
        'Ja',
        'Nej',
        'I vissa fall',
        'Varierar mellan kunder'
      ]),
      q('lonGodkannande', 'Vem godkänner normalt lönerna innan de rapporteras eller betalas ut?', 'single', [
        'Kunden',
        'Byrån',
        'Kunden och byrån tillsammans',
        'Annan part',
        'Varierar mellan kunder'
      ]),
      q('lonOvanliga', 'Kontrolleras ovanliga löner, bonusar, utlägg, traktamenten eller förändrade bankkonton särskilt?', 'single', [
        'Ja, normalt',
        'Ja, vid större belopp eller avvikelse',
        'Nej, normalt inte',
        'Varierar mellan kunder'
      ])
    ]),
    spec('lagerredovisning', 'Lagerredovisning och lagervärdering', [
      q('lagerVad', 'Vad gör byrån normalt kopplat till lager?', 'multi', [
        'Bokför lagerförändring',
        'Stämmer av lager mot underlag',
        'Hjälper till med lagervärdering',
        'Bedömer inkurans',
        'Bokför bokslutsjusteringar',
        'Annat'
      ]),
      q('lagerUnderlag', 'Vem lämnar normalt lagerlistor eller uppgifter om lagervärde?', 'single', [
        'Kunden',
        'Extern part',
        'Byrån utifrån system',
        'Kunden och byrån tillsammans',
        'Varierar mellan kunder'
      ]),
      q('lagerRimlighet', 'Gör byrån rimlighetsbedömning av lagerlistor eller lagervärden?', 'single', [
        'Ja, normalt',
        'Ja, vid större belopp eller avvikelse',
        'Nej, normalt inte',
        'Varierar mellan kunder'
      ]),
      q('lagerJustering', 'Hur hanteras större lagerjusteringar, nedskrivningar eller inkuransbedömningar?', 'multi', [
        'Kunden får lämna förklaring',
        'Underlag begärs in',
        'Ansvarig konsult granskar',
        'Bedömningen dokumenteras',
        'Det hanteras från fall till fall',
        'Ingen särskild rutin'
      ])
    ]),
    spec('betalningsuppdrag', 'Betalningsuppdrag och betalningshantering', [
      q('betVad', 'Vad gör byrån inom betalningshantering?', 'multi', [
        'Förbereder betalningar',
        'Skapar betalningsfil',
        'Skickar betalningsfil till bank',
        'Godkänner betalningar',
        'Hanterar lönebetalningar',
        'Följer upp genomförda betalningar',
        'Annat'
      ]),
      q('betGodkannande', 'Vem godkänner normalt betalningar slutligt?', 'single', [
        'Kunden godkänner alltid',
        'Byrån kan godkänna',
        'Kunden och byrån godkänner tillsammans',
        'Varierar mellan kunder'
      ]),
      q('betAndra', 'Kan byrån ändra betalningsmottagare, belopp eller bankkonto innan betalning skickas?', 'single', [
        'Ja',
        'Nej',
        'I vissa fall',
        'Varierar mellan kunder'
      ]),
      q('betTvasteg', 'Finns tvåstegsgodkännande eller annan praktisk kontroll innan betalning genomförs?', 'single', [
        'Ja, alltid',
        'Ja, vid större belopp eller nya mottagare',
        'Nej',
        'Varierar mellan kunder'
      ]),
      q('betNya', 'Kontrolleras nya betalningsmottagare, ändrade bankkonton eller betalningar till utlandet särskilt?', 'single', [
        'Ja, normalt',
        'Ja, vid större belopp eller avvikelse',
        'Nej, normalt inte',
        'Varierar mellan kunder'
      ]),
      q('betBradskande', 'Hur hanteras brådskande betalningar eller betalningar utanför ordinarie rutin?', 'multi', [
        'Kunden måste godkänna skriftligt',
        'Ansvarig på byrån granskar',
        'Betalningen pausas vid oklarhet',
        'Avvikelsen dokumenteras',
        'Ingen särskild rutin',
        'Förekommer normalt inte'
      ])
    ]),
    spec('radgivning', 'Rådgivning', [
      q('radTyp', 'Vilken typ av rådgivning förekommer normalt när denna tjänst är aktiv?', 'multi', [
        'Ekonomisk rådgivning/budget/prognos',
        'Skatterådgivning',
        'Ägarfrågor/utdelning/lön',
        'Momsfrågor',
        'Bolagsstruktur eller ombildning',
        'Stöd vid myndighetskontakt',
        'Finansieringsunderlag',
        'Företagsöverlåtelse eller generationsskifte',
        'Annat'
      ]),
      q('radKoppling', 'Är rådgivningen normalt fristående eller kopplad till andra tjänster?', 'single', [
        'Fristående uppdrag',
        'Kopplad till bokföring/bokslut/deklaration',
        'Både och',
        'Varierar mellan kunder'
      ]),
      q('radDokumenteras', 'Dokumenteras råd, bedömningar och kundens beslut?', 'single', [
        'Ja, normalt',
        'Ja, vid större eller mer komplexa frågor',
        'Nej, normalt inte',
        'Varierar mellan kunder'
      ]),
      q('radKomplex', 'Förekommer rådgivning kring större transaktioner, bolagsstrukturer, närstående eller internationella frågor?', 'single', [
        'Ja',
        'Nej',
        'I vissa fall',
        'Vet ej'
      ]),
      q('radExtra', 'Sker extra granskning eller intern avstämning vid mer komplex rådgivning?', 'single', [
        'Ja, normalt',
        'Ja, vid behov',
        'Nej',
        'Ej relevant, byrån är liten/ensam',
        'Varierar mellan kunder'
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

  function extraQuestionsForTemplate(template) {
    if (!template) return [];
    return template.aiQuestionSupport === false
      ? (template.extraQuestions || [EGEN_BESKRIVNING])
      : (template.questions || []);
  }

  function questionsForTemplate(template) {
    return BASE_QUESTIONS.concat(extraQuestionsForTemplate(template));
  }

  function groupQuestionsForTemplate(template) {
    return {
      base: BASE_QUESTIONS.slice(),
      extra: extraQuestionsForTemplate(template)
    };
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
      const raw = answers[question.id];
      const text = formatAnswerValue(raw);
      const comment = formatAnswerValue(comments[question.id]);
      if (!text && question.type !== 'text') {
        unanswered.push(question.label);
        return;
      }
      if (question.type === 'text' && !text) {
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
    EGEN_BESKRIVNING: EGEN_BESKRIVNING,
    SERVICE_TEMPLATES: SERVICE_TEMPLATES,
    foldName: foldName,
    isCustomId: isCustomId,
    createCustomId: createCustomId,
    customTemplate: customTemplate,
    templateById: templateById,
    resolveTemplateId: resolveTemplateId,
    resolveTemplate: resolveTemplate,
    extraQuestionsForTemplate: extraQuestionsForTemplate,
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
