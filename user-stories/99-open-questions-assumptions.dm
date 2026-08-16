# 99 — Open Questions & Assumptions · BoardingPass

Anything not explicitly certain from the live site is recorded here as an **Assumption** (used to keep stories actionable) or an **Open Question** (needs your decision before or during the relevant story). Nothing here is treated as confirmed requirement.

## A. Assumptions (proceeding unless you say otherwise)

| ID | Assumption | Used by | Impact if wrong |
|----|-----------|---------|-----------------|
| AS-01 | Settlement ("برق") is **record-and-notify**, not real money movement (no PSP). | US-007, US-015 | Adds a payments story + PSP + compliance. |
| AS-02 | Kitty due is split **equally** by default; custom shares are future. | US-007 | Rework split logic + UI. |
| AS-03 | "Domestic" trip = destinations in the user's home country (soft warning only). | US-003, US-005 | Stricter validation / country model. |
| AS-04 | Guests may **browse limited** buddy/explore previews; all writes require auth. | US-011, US-012 | Tighten to auth-only browse. |
| AS-05 | Timezone for upcoming/past + times = **user locale tz** (trip tz later). | US-005, US-006 | Per-trip tz handling. |
| AS-06 | Places are **curated/read-mostly**; no provider self-service now. | US-012 | Adds Provider role + marketplace stories. |
| AS-07 | Admin/Moderation (US-016) is required to operate the platform though not in the prototype UI. | US-016 | Drop/limit admin scope. |
| AS-08 | Personal expenses are **private** (invisible to owner/admin). | US-007 | Change privacy model + rules. |
| AS-09 | Task edit/delete allowed to **any member** (collaborative), audited. | US-008 | Restrict to creator/owner. |
| AS-10 | Report export = itinerary + finance summary + media highlights as **PDF and/or link**. | US-013 | Scope report contents. |
| AS-11 | Firebase is primary store **behind** the ASP.NET Core API (API-mediated), with narrow direct-Firestore realtime reads. | 02, all BE | Pure client-Firestore or pure SQL alternative. |
| AS-12 | Exchange rate fetched at trip creation, refreshable by owner; amounts stored in a base currency. | US-007 | Live per-view FX or multi-base. |
| AS-13 | AviationStack replaced by **server proxy** (free tier http/mixed-content + exposed key issues). | US-004 | Different flight provider. |
| AS-14 | Anonymous/guest uses Firebase Anonymous Auth; upgrade path to full account later. | US-001 | Different guest model. |
| AS-15 | Web uses TanStack Query + Zustand + RHF + Zod (state split per §16). | 02, all FE | Different state stack. |

## B. Open Questions (please decide)

| ID | Question | Blocks | Options |
|----|----------|--------|---------|
| OQ-01 | Is real **payment/settlement** ever in scope (PSP, wallets)? | US-007 (major) | (a) record-only [AS-01] (b) add PSP story now (c) later phase |
| OQ-02 | Do we need a **Service Provider / Merchant** marketplace (paid listings, bookings)? | US-012, roles | (a) no (N/A) (b) yes → new epic + Provider role + tenant model |
| OQ-03 | **Custom expense shares** (unequal splits, weights) required at launch? | US-007 | (a) equal only [AS-02] (b) custom shares |
| OQ-04 | In-app **chat/messaging** for buddies & groups? | US-011/015 | (a) no now (b) yes → messaging epic |
| OQ-05 | **KYC/identity verification** for buddy safety? | US-011, US-016 | (a) no (b) light (email/phone verified) (c) full KYC |
| OQ-06 | Email channel via which provider (Firebase ext / SendGrid) for notifications? | US-015 | (a) push+in-app only (b) +email provider |
| OQ-07 | Data **residency/compliance** target (GDPR/Saudi PDPL)? affects retention/audit/export. | 02, US-002/016 | specify jurisdictions |
| OQ-08 | Offline support depth on mobile (read-only cache vs full offline writes)? | US-006/007/008 | (a) read cache (b) full offline sync |
| OQ-09 | Maps/Places provider (Google vs alternative) + budget for keys? | US-012 | choose provider |
| OQ-10 | Multi-currency: how many currencies, and rounding/settlement currency? | US-007 | define currency set + rules |
| OQ-11 | Are **Trip Viewer** (read-only shared) links a launch feature or later? | US-013/009 | (a) launch (b) later |
| OQ-12 | Should a **buddy request** be convertible into a real Trip (auto tenant creation)? | US-011→003 | (a) manual handoff (b) auto-create |

## C. Decisions log (recommended defaults — locked unless you override)

| Date | OQ/AS | Decision | Rationale | Affected |
|------|-------|----------|-----------|----------|
| 2026-08-16 | OQ-01 | **Record-and-notify only** for launch (no PSP/money movement). Data model built to add PSP in phase 2. | Real money = PCI/PSP/AML + licensing; the value (fair, transparent split + manual transfer "برق") works without it. | US-007, US-015 |
| 2026-08-16 | OQ-02 | **No provider/merchant marketplace** at launch (Explore stays curated/read-mostly). Documented as future epic. | No provider surface in product; marketplace = separate tenant model, verification, payments. | US-012, roles |
| 2026-08-16 | OQ-03 | **Equal split at launch**, with participant **inclusion/exclusion** (already possible via side-kitty participant selection). Weighted/custom amounts = fast-follow; store a `shares` map now so it's additive. | Covers the common "didn't join dinner" case cheaply; full custom later. | US-007 |
| 2026-08-16 | OQ-04 | **No in-app chat** at launch. Coordination via notifications + external share (WhatsApp affordance). Chat = phase 2 epic. | Chat is a large epic (realtime, moderation, storage); not core to MVP value. | US-011, US-015 |
| 2026-08-16 | OQ-05 | **Light verification**: verified **email + phone** required to create/join buddy requests + report/block + moderation (US-016). Full KYC deferred. | Safety without heavy friction/cost. | US-011, US-016 |
| 2026-08-16 | OQ-06 | **Push + in-app** primary; **minimal transactional email** (invites, reminders, password reset) via Firebase "Trigger Email"/SendGrid. No marketing email. | Reliability for critical events; low ops overhead. | US-015, US-001 |
| 2026-08-16 | OQ-07 | Design **PDPL (Saudi) + GDPR-aligned**: consent, retention windows, data export & delete (US-002/016), audit. Pick a supported Firestore region at provisioning (location is permanent). | Gulf-first audience + possible EU users; compliance is cheaper by-design. | 02, US-002, US-016 |
| 2026-08-16 | OQ-08 | **Read-only offline cache** on mobile (Firestore offline persistence). Full offline writes/conflict-resolution deferred. | Avoids conflict-merge complexity for shared trip data. | US-006/007/008 |
| 2026-08-16 | OQ-09 | **Google Places (New)** behind backend proxy + restricted key + budget cap/monitoring. Mapbox/OSM as fallback if cost spikes. | Best coverage/ratings; matches prototype intent; proxy keeps key server-side. | US-012 |
| 2026-08-16 | OQ-10 | **2 currencies/trip** (home + destination). Store amounts in **base = home currency** (integer minor units); round **half-up 2dp**; remainder absorbed by last participant. Display currency selectable; net computed in base. | Deterministic money math; matches prototype dual-currency. | US-007 |
| 2026-08-16 | OQ-11 | **Trip Viewer read-only share link = launch feature** (scoped + revocable). | Shareable report drives virality (G5); already modeled in US-013. | US-013, US-009 |
| 2026-08-16 | OQ-12 | **Manual handoff**: "ابدأ رحلة من هذا" opens the create-trip wizard **prefilled** from the buddy request. No auto tenant creation. | Keeps ownership/consent explicit; avoids accidental tenants. | US-011 → US-003 |

### Assumption refinements from decisions
- **AS-02 → refined:** equal split **+ participant exclusion** at launch; `shares` map stored for future weighting (OQ-03).
- **AS-01 confirmed:** settlement record-only (OQ-01).
- **AS-06 confirmed:** no provider marketplace (OQ-02).
- **New AS-16:** buddy create/join requires **verified email+phone** (OQ-05).
- **New AS-17:** money base currency = trip home currency, minor-unit integers, half-up 2dp (OQ-10).
- **New AS-18:** minimal transactional email channel enabled (OQ-06).

> Per Master Prompt §32: these are **recommended defaults** acting as PM/Architect. They are locked into the backlog for actionability; override any and I'll update only its affected stories.
