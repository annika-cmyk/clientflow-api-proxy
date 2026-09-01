# ClientFlow – feature list for Tobias

This is an inventory of the **prototype** (live: `https://www.app.clientflow.se`). The goal is to show **what the product does today** and what a sellable application must cover — not to copy Airtable, the Render proxy, or the current frontend stack.

**ClientFlow** is an AML system for Swedish accounting firms (penningtvättslagen / PTL). The firm documents its general risk assessment, services and procedures, performs customer due diligence (KYC) and individual risk assessment, screens people, manages assignments/runs, and can export material for the County Administrative Board (Länsstyrelsen).

Minibok (bookkeeping) reads assignments and AML through this product. That interface must stay or be replaced with an agreed API.

Swedish UI names are kept in *italics* where they help you find things in the prototype.

---

## 1. Who uses it

Three roles:

| Role | What they can do |
|---|---|
| **Leader** (*Ledare*) | Everything at their own firm. Sees all customers. Manages users, access, catalogues, the general risk assessment and documentation. |
| **Employee** (*Anställd*) | Sees only customers they are assigned to (*Användare* / customer access). Once they have access: full work on that customer card. |
| **ClientFlowAdmin** | Platform admin. Sees all firms. |

Older data may use the role «Användare» — treat it as Employee.

**Customer access:** a Leader assigns one or more firm users to a customer (one at a time or in bulk from the firm page). An employee who is not assigned must not be able to open or change the customer.

---

## 2. Login and shell

- Email + password. Session via httpOnly cookie (JWT).
- Protected pages: not logged in → login.
- Sidebar search on company, org. no. and contact.
- Mobile: menu collapses; hamburger opens it.
- Feedback to `hej@clientflow.se`.
- Dashboard shows “what’s new” (product news).

---

## 3. Firm foundation data (must exist before customer work)

This is the firm’s PTL baseline. “Get started” on the dashboard walks through it in this order.

### 3.1 Firm services (*Byråns tjänster*, `riskbedomning-byra`)

Catalogue of services the firm sells. The customer may **only** pick services from here.

Per service:

- Name, description
- **Inherent risk** and **residual risk** as L×C (likelihood × consequence) on the scale Low / Normal / Elevated / High / Unacceptable (*Låg / Normal / Förhöjd / Hög / Oacceptabel*)
- **Threats** — classified as money laundering (PT), terrorist financing (TF), or both. A service can have both. TF coverage is required before the service counts as publishable.
- **Vulnerabilities**
- **Measures** — each measure is classified as:
  - **Firm routine** (*Byrårutin*) — always the firm’s responsibility, or
  - **Customer-dependent prerequisite** (*Kundberoende förutsättning*) — must be ticked Yes/No on every customer
- AI analysis against a knowledge base (authority guidance). Suggestions per tab (Overview, Threats, Vulnerabilities, Measures). Nothing is saved until the user chooses. Empty fields can be filled automatically; existing text is input, not the answer key.

### 3.2 Other risk factors (*Övriga riskfaktorer*, `ovriga-riskfaktorer`)

The firm’s templates for risk factors **outside services**, grouped into dimensions:

- Geographic risk factors
- Customer-related risk factors
- Distribution channels
- Business-specific risk factors

Plus a catalogue of **other warning flags** (severity: High-active / Contributes in combination / Informative). The firm can remove default flags; removed ones must stay removed.

Same L×C, threats (PT/TF), vulnerabilities, measures and AI support as on services. PT/TF is mandatory.

### 3.3 General firm risk assessment (*Allmän riskbedömning byrå*)

The document that justifies the firm’s risk-based approach (2017:630). Built from services, other risk factors and statistics. Includes risk appetite (editable policy). AI helps write sections. Refers to the source pages (Firm services / Other risk factors) instead of duplicating everything.

### 3.4 Firm procedures (*Byrårutiner*)

Internal procedures (ch. 4 § 3). Draft + AI from what the firm has already entered.

### 3.5 Firm details & users (*Uppgifter byrå & användare*)

Tabs:

- **Firm information** — name, org. no., logo, contact
- **Engagement letter** (*Uppdragsbrev*) — template + attachments
- **Users** — create/manage staff and roles
- **Training** — who has completed AML training
- **Access** — link users ↔ customers (including bulk)
- **Activity logs**
- Price list tied to services (+ free-text rows)

Leaders see all users at the firm.

### 3.6 Risk-assessment statistics

Aggregated view of the firm’s customers: services, risk factors, residual levels. The same numbers must go into the Länsstyrelsen export and into AI text for the general risk assessment.

---

## 4. Scale and residual engine (core rules)

The same five-level scale everywhere: **Low · Normal · Elevated · High · Unacceptable**.

### Customer residual

- **Calculated residual** = machine starting point. Highest residual L×C among selected services and risk factors, plus warning flags and high-risk industry.
- **Assessed residual** = the firm’s active choice on the customer card. That is the one that counts.
- If assessed differs from calculated → **rationale required**. Same value needs no rationale.
- The rationale must **not** end with a conclusion sentence («the overall risk assessment is High»).
- Inherent risk is set on **service and risk factor**, not as a separate customer choice.

### Floors from warning flags

- **High-active** (`GOLV_HOG`) alone → calculated residual at least **High**.
- Two flags that **contribute in combination** → the same together.
- “None” (*Inga*) must not be ticked together with other flags.
- High floor **plus** at least two services/risk factors at Elevated or higher → **Unacceptable**.
- High residual requires a risk-appetite decision. Unacceptable exceeds appetite. Decision: continue with enhanced measures / terminate / decline new engagement (rationale, at least 20 characters).
- Warn if assessed residual is set lower than a selected high-risk service.

### Dimensions must be complete

Each customer needs at least one choice in every dimension the firm actually has templates for (geography, customer, distribution, business). Calculated residual is not shown until the file is complete.

### Customer-dependent prerequisites

On the customer risk assessment, each prerequisite is ticked **met / not met**.

- **Not met** raises calculated residual. The template’s low residual on the service is then not used — inherent risk is used until the firm sets a customer-specific residual.
- AI can suggest a complementary measure. The user must approve. Some measures can be placed on the assignment run.

---

## 5. Onboarding a customer

### Company search (dashboard)

Search by organisation number → Swedish Companies Registration Office (*Bolagsverket*) → save as lead/customer.

- Duplicate guard: the same org. no. + firm may exist only once.
- Fetches company data, representatives, beneficial owners (UBO), SNI, status (active/deregistered).
- SNI that matches a high-risk industry must show automatically on the customer card (not only as free text).

### Customer list

- List the firm’s customers (filtered by role/access).
- Customer status: **Lead / Active customer / Closed** (*Lead / Pågående kund / Avslutad*). Default filter: Lead + Active. A lead can be saved without Bolagsverket.
- Compliance tick when KYC, risk assessment and engagement agreement are all complete.
- Filter for customers that require a risk-appetite decision.
- A hidden customer does not appear here — the link is under Documentation → Hidden customers.

### Person register

Search representatives and beneficial owners across the firm’s customers. Show identity, links, companies, whether the customer is hidden/closed.

---

## 6. The customer card

One card per customer with status on each tab (complete / incomplete).

### 6.1 Company information

Company data from Bolagsverket (refresh button), contacts, customer status, customer description in four cards:

- Business
- Costs
- Revenue
- Bookkeeping

Plus accounting details (method, VAT period, financial year, bookkeeping software, bank, turnover) and **officers & roles** (representatives, beneficial owner, board) with PEP/sanctions per person. Screening of company and people (Dilisense in the prototype).

Business, Costs and Revenue also appear in KYC and save both ways.

Can hide the customer from the list without deleting the card.

### 6.2 KYC form

Sections:

1. Basic details (tax residence, TIN)
2. Representatives (multiple rows)
3. Beneficial owner (hidden for sole traders)
4. PEP
5. Purpose of the business relationship (business, costs, revenue)
6. International trade
7. Cash handling
8. Customer declaration

KYC status per subsection. Save, PDF, send for signing, or mark KYC outside ClientFlow + date.

### 6.3 Risk assessment (individual)

The heaviest flow.

**Services** — only from the firm catalogue. Warn if the link is missing from the catalogue (show names, not internal ids).

**Risk dimensions** (each card has its own choices + Save):

1. Geographic risk factors
2. Customer-related risk factors — including high-risk industry picker (fixed industries + SNI hits; SNI cannot be unchecked)
3. Distribution channels — e.g. in-person meeting, remote with BankID, remote without verification, via intermediary
4. Business-specific risk factors

**Warning flags in the same three category cards** (not an extra block):

- In Distribution channels: identity, contact, evasive behaviour, time pressure
- In Customer-related: ownership structure, criminal history, nominee/front, changed accountant, board changes
- In Business-specific: remote customers, transactions without purpose, bookkeeping routines, unclear business model

Remote, intermediary, PEP, high-risk industry and cash are chosen **only** as the formal dimension choices — not as duplicates among the flags.

**Customer risk-assessment card:** assessed residual, calculated residual as reference, rationale, measures, prerequisites Yes/No, deviation rationale if needed.

**Risk-reducing factors** and **comment**.

**Engagement can be accepted** + agreement date.

**Document risk assessment** → PDF (risk + assessment points + service list without the firm’s service analyses + KYC as appendix) saved on the Documentation tab. Can be sent for BankID signing.

### 6.4 Engagement agreement (*Uppdragsavtal*)

Create/send an engagement agreement for signing, or mark that the agreement was signed outside ClientFlow (with date).

### 6.5 Assignments (*Uppdrag*)

Assignment types:

- Payroll / payroll current period / payroll in arrears
- VAT reporting
- Year-end accounts
- Tax return
- Custom assignment (free name)

Frequency per type (monthly, quarterly, yearly, weekly, one-off, …). The system generates **runs** (*körningar*) with deadline, period key and work window.

On the run:

- Mark complete
- Note
- Measures from the customer risk assessment must be ticked before complete
- Overdue / deadline within 5 days is highlighted
- Responsible person on the run
- Some runs show/hide depending on type and period

Firm overview: `uppdrag-oversikt.html` — board per type (payroll/VAT/year-end/tax/other), filter Mine/Firm, deadline/open, done/not done.

### 6.6 Notes

Free notes on the customer.

### 6.7 Deviations (*Avvikelser*)

Register and follow deviations on the customer. Also exists as a firm page and a dashboard card.

### 6.8 Documentation (on the customer)

Uploaded files in several categories, KYC PDF, signed agreements, risk-assessment PDF. Multiple files per category. Drag-and-drop.

### 6.9 Collaboration (*Samarbete*)

Requests to other parties (e.g. previous firm). Replies land on the dashboard (“New replies”). External reply page: `samarbete-svar.html`.

---

## 7. Screening and people

- **PEP / RCA** is High-active and raises residual.
- Sanctions screening of the company (entity screening) with date of last run.
- Number of PEP/sanctions hits is logged.
- History of representatives and beneficial owners (personal/org. no., roles, from/to).
- The person register merges people across customers.

---

## 8. Signing and receipts

Via Inleed / Docsign + BankID.

Documents that can be signed:

- KYC
- Engagement agreement
- Firm risk assessment + procedures (Länsstyrelsen PDF)
- The customer’s documented risk assessment

**Receipt** must go to the firm that sent the document and to the person who signed — not to a shared Inleed account. PDF attached. Signed document is stored. Approval date = signing date.

A plain PDF export of the firm document is **not** saved automatically. “Send for signing and approval” is the official path.

---

## 9. Documentation at the firm

- Display of firm procedures + final general risk assessment
- Approved (signed) documents
- Hidden customers
- Audit log (append-only, at least five years): risk changes, AI content, screening, deviations. Filter by actor, entity, time. Each firm sees only its own records.
- Export: PDF, ZIP of all documents
- Länsstyrelsen export: general risk assessment + procedures + statistics

---

## 10. Dashboard (to-do)

- Get-started flow (5 steps, checkable)
- Company search
- AML news (SV/EN, summaries, filtered to the firm’s profile)
- Self-test (AML basics course) until the user has completed it
- My tasks
- New collaboration replies
- Customers without a risk assessment
- Customers that require a risk-appetite decision
- Residual differs from calculated level
- Customers missing an engagement agreement
- Deviations
- System status

---

## 11. Training and news

- **AML basics course:** six questions (“the 6 absolute musts”), right/wrong with explanation, register completed training.
- **AML news:** own page + card on the dashboard. Language SV/EN.

---

## 12. AI (PTL-AI)

- Sidebar chat with a knowledge base (uploaded authority guidance).
- Analysis of services and other risk factors (own proposals, not only language review).
- Suggestions for the customer residual rationale (must not choose the level itself or invent a deviation).
- Suggestion for a complementary measure when a prerequisite is not met.
- Field review / help text on KYC and description cards.
- Sources must show subpage and path.
- AI content must be auditable.
- **AI usage** (`ai-usage.html`): log per user. AML news summaries have a cost cap so ingest cannot run away.

---

## 13. Integrations the product needs

| Integration | Used for |
|---|---|
| **Bolagsverket** | Company search, company data, representatives, UBO, SNI, active status |
| **BankID / Inleed (Docsign)** | Signing KYC, agreements, risk documents |
| **Email (SMTP)** | Receipts and mail to the correct firm + signer |
| **Sanctions/PEP screening** | Companies and people (Dilisense in the prototype) |
| **OpenAI + vector store** | PTL-AI chat and analyses against the knowledge base |
| **Minibok** | API/proxy: assignments, runs, AML data. Changes Minibok needs must be live. |

The prototype stores data in **Airtable**. A sellable app should have its own database. Think “firm → users → customer → services/risks/documents/assignments” — not Airtable tables.

---

## 14. Prototype pages (map)

| Page | Contents |
|---|---|
| `login.html` | Login |
| `index.html` | Dashboard |
| `kundlista.html` | Customer list |
| `kundkort.html` | Customer card (all tabs) |
| `personregister.html` | Representatives / UBO across customers |
| `avvikelser.html` | Deviations firm overview |
| `riskbedomning-byra.html` | Firm service catalogue |
| `ovriga-riskfaktorer.html` | Risk-factor templates + warning flags |
| `statistik-riskbedomning.html` | Statistics |
| `allman-riskbedomning-byra.html` | General risk assessment |
| `byrarutiner.html` | Firm procedures |
| `amla-nyheter.html` | AML news |
| `ai-usage.html` | AI usage per user |
| `byra-anvandare.html` | Firm, users, access, logs |
| `utbildning.html` | AML basics course |
| `dokumentation.html` | Firm documents, hidden customers, audit, export |
| `uppdrag-oversikt.html` | All assignments/runs |
| `kyc.html` | Older standalone KYC (primary path is the customer card) |
| `samarbete-svar.html` | Public customer page: submit supporting documents without login |
| `welcome.html` | Older welcome page |
| `allman-riskbedomning.html` | Legacy/demo, not firm-specific |

---

## 15. Important product rules (checklist)

- [ ] Services and risk factors are chosen only from the firm catalogue
- [ ] At least one choice per dimension the firm has templates for
- [ ] Calculated residual is not shown until the file is complete
- [ ] Assessed residual is the firm’s choice; deviation requires a rationale
- [ ] High-active / two “contribute” / Unacceptable floor per section 4
- [ ] High-risk industry (choice + SNI) is included in residual
- [ ] Unmet prerequisite drops the template’s low residual
- [ ] PT/TF on other risk factors and service threats
- [ ] Employee sees only assigned customers; leader sees the whole firm
- [ ] One customer per org. no. and firm
- [ ] Signing receipt to sending firm + signer
- [ ] Länsstyrelsen PDF uses the same statistics as the statistics page
- [ ] Audit log append-only, firm-isolated, long retention
- [ ] Minibok can read assignments and AML

---

## 16. Suggested build order

Build in this order so each step can be sold and tested:

1. **Account, firm, roles, customer access**
2. **Service catalogue + risk-factor catalogue + the scale**
3. **Customer + Bolagsverket + customer card (company info)**
4. **KYC + dimensions + warning flags + residual engine**
5. **Prerequisites, measures, document/PDF**
6. **Assignments + runs** (Minibok API here)
7. **Signing + receipts**
8. **General risk assessment, procedures, Länsstyrelsen export**
9. **Dashboard queues, deviations, person register, collaboration**
10. **AI and knowledge base** (can be parallelised late; the product must work without it)
11. **Training, news, audit log**

---

## 17. Prototype vs product

Do **not** treat these as requirements:

- Airtable as datastore or source of truth
- Cache-busting with `?v=` on every JS file
- A shared Inleed account across firms (a bug we already fixed in receipts — build it right: one sender per firm)
- Hard-coded test passwords in old setup docs

Do **take** these, even if the code is messy:

- The residual engine and floor rules
- Catalogue constraint (no free-text services/risks on the customer)
- Role + customer access
- Signing with the correct receipt recipients
- Minibok API for assignments/AML
- That the Länsstyrelsen document mirrors the same data as in the app
