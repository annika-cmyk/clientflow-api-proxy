# ClientFlow — Designsystem

Referensdokument för design. Läs detta innan du ändrar UI. All färg och
typografi kommer från `clientflow-tokens.css` — hårdkoda aldrig hex-värden
i komponenter, använd alltid `var(--cf-*)`.

---

## 1. Grundprinciper

**En accentfärg, ägd.** ClientFlow använder petrol (`--cf-accent`, `#13505c`)
för allt interaktivt: aktiv navigation, primärknappar, länkar, fokus, valda
element. Den ska inte ersättas av generisk indigo/lila. Den är medvetet
blå-lutande så den aldrig krockar med grön (klar) eller röd (problem).

**Två temperaturer, ett system.** Interna byrå-vyer är *svala och täta* — en
cockpit man sitter i hela dagar. Kundvända ytor är *varma och lugna* — sällan-
användare som ska känna förtroende. Samma brand- och statusfärger, olika
neutralpalett. Varmt fås genom att lägga klassen `cf-warm` på en wrapper.

**Återhållsamhet.** Det här är ett compliance-verktyg, inte en leksak. Diskreta
skuggor, hårfina linjer, ingen färg utan funktion. Elegansen ligger i mellanrum
och hierarki, inte i effekter.

---

## 2. Färgsemantik — den viktigaste regeln

Färg betyder något. Använd aldrig en statusfärg dekorativt.

| Färg | Token | Betyder | Använd INTE för |
|------|-------|---------|-----------------|
| Röd | `--cf-danger` | Verkligt problem, hög risk, fel | "Inte gjort än" |
| Amber | `--cf-warn` | Ofullständig, behöver åtgärd, todo | Allmän info |
| Grön | `--cf-ok` | Klar, godkänd, klarmarkerad | Dekoration / accent |
| Petrol | `--cf-accent` | Varumärke, interaktion, navigation | Status |

**Konkreta fall som ska rättas i nuvarande system:**
- Flikarna "KYC-formulär" / "Uppdragsavtal" med röd ❗ som bara betyder *ej
  ifyllt* → ska vara **amber**, inte röd. Spara rött för faktiska problem.
- Felmeddelandet "kunde inte sparas — kontakta support" var stylat som lugn
  lila info → ett fel ska läsa som **varning/röd**, annars lär sig användaren
  ignorera färgerna.
- Åtgärdslistor får inte vara en heltäckande grön vägg. Vit rad + liten grön
  bock räcker; då behåller grönt sin signal.

---

## 3. Typografi

- **UI överallt:** Schibsted Grotesk (`--cf-font-ui`). En skandinavisk grotesk
  som knyter an till den feta ClientFlow-loggan.
- **Sidtitlar** (DASHBOARD, KUNDKORT, RISKBEDÖMNINGAR): versaler, vikt 800,
  letter-spacing `--cf-title-spacing`. Detta plockar upp loggans självförtroende.
- **Serif (Fraunces)** används BARA för stora display-rubriker på varma kund-
  ytor (t.ex. "Lämna underlag"). Aldrig i den interna appen — serif över
  hundratals datafält blir tröttsamt och långsamt att skanna.

Installera typsnitten (Vite):
```
npm i @fontsource/schibsted-grotesk @fontsource/fraunces
```
```ts
// main.tsx
import '@fontsource/schibsted-grotesk/400.css';
import '@fontsource/schibsted-grotesk/500.css';
import '@fontsource/schibsted-grotesk/600.css';
import '@fontsource/schibsted-grotesk/700.css';
import '@fontsource/schibsted-grotesk/800.css';
import '@fontsource/fraunces/500.css';   // endast om varma ytor används
import './clientflow-tokens.css';
```

---

## 4. Komponentmönster

Kärnmönstren, uttryckta i ren CSS med tokens. Anpassa till ert sätt att
styla (CSS-moduler, Tailwind `@apply`, eller styled). Logiken är densamma.

### Primärknapp
```css
.cf-btn-primary {
  font-family: var(--cf-font-ui);
  font-size: 13.5px; font-weight: var(--cf-weight-semibold);
  color: #fff; background: var(--cf-accent);
  border: none; border-radius: var(--cf-radius-sm);
  padding: 9px 16px; cursor: pointer;
  display: inline-flex; align-items: center; gap: 7px;
  box-shadow: 0 1px 2px rgba(13,58,67,.2);
  transition: .15s;
}
.cf-btn-primary:hover { background: var(--cf-accent-deep); }
```

### Sekundär / ikonknapp
```css
.cf-btn {
  font: inherit; font-weight: 600; font-size: 13px;
  color: var(--cf-ink-2); background: var(--cf-panel);
  border: 1px solid var(--cf-line-2); border-radius: var(--cf-radius-sm);
  padding: 8px 13px; cursor: pointer; transition: .15s;
}
.cf-btn:hover { background: var(--cf-panel-2); border-color: var(--cf-ink-3); }
```

### Kort / panel
```css
.cf-card {
  background: var(--cf-panel);
  border: 1px solid var(--cf-line);
  border-radius: var(--cf-radius);
  box-shadow: var(--cf-shadow-sm);
}
```

### Navigation — aktiv state (petrol, ej lila)
```css
.cf-nav-item { color: var(--cf-ink-2); border-radius: 9px; padding: 9px 12px; }
.cf-nav-item:hover { background: #f3f4f6; color: var(--cf-ink); }
.cf-nav-item.active {
  background: var(--cf-accent-tint);
  color: var(--cf-accent-deep);
  font-weight: 600;
}
/* liten petrol-stapel i vänsterkanten på aktiv rad */
.cf-nav-item.active::before {
  content:""; position:absolute; left:-12px; top:7px; bottom:7px;
  width:3px; border-radius:0 3px 3px 0; background: var(--cf-accent);
}
```

### Statusbadge / risknivå
```css
.cf-badge       { font-size:11px; font-weight:700; padding:3px 9px; border-radius:5px; text-transform:uppercase; letter-spacing:.05em; }
.cf-badge--hog  { background: var(--cf-danger-tint); color: var(--cf-danger); }
.cf-badge--medel{ background: var(--cf-warn-tint);   color: var(--cf-warn); }
.cf-badge--klar { background: var(--cf-ok-tint);     color: var(--cf-ok); }
```

### Räknar-pill i listor (dra ögat dit det finns att göra)
```css
.cf-count       { font-size:11.5px; font-weight:700; padding:2px 8px; border-radius:20px;
                  background: var(--cf-accent-tint); color: var(--cf-accent-deep); }
.cf-count--warn { background: var(--cf-warn-tint); color: var(--cf-warn); }  /* öppna ärenden */
.cf-count--zero { background: var(--cf-ok-tint);   color: var(--cf-ok); }    /* allt klart */
```

### Checkbox (petrol vid ikryssad)
```css
.cf-check input:checked + .box { background: var(--cf-accent); border-color: var(--cf-accent); }
.cf-check .box { width:17px; height:17px; border:1.5px solid var(--cf-line-2);
                 border-radius:5px; background:#fff; }
```

### Input + fokus
```css
.cf-input { border:1px solid var(--cf-line-2); border-radius:9px; padding:11px 14px;
            font:inherit; background:#fff; }
.cf-input:focus { outline:none; border-color: var(--cf-accent); box-shadow: var(--cf-focus); }
```

---

## 5. Att göra / inte göra

**Gör:**
- Referera tokens (`var(--cf-*)`) — aldrig råa hex-värden i komponenter.
- Ge listrader en räknare/badge när det finns något att åtgärda.
- Ge varje menyrad en ikon (snabbare att skanna).
- Håll interna vyer svala och täta; varma bara på kundytor via `.cf-warm`.

**Gör inte:**
- Använd inte generisk indigo/lila som accent.
- Använd inte röd för "ej gjort" — det är amber.
- Måla inte hela listor gröna — grönt ska betyda "klar".
- Använd inte serif i den interna appen.
- Byt inte ut ClientFlow-loggan (den feta svarta Client/Flow-stacken är
  varumärkets bästa tillgång — den behålls).
