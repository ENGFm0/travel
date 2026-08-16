# 03 — Story Map · BoardingPass

Feature map → user-flow map → story list → dependencies → implementation order.
Stories are **functional groupings**, not one-per-page (per Master Prompt §10).

---

## 1. Feature Map (backbone → activities)

```
ACCESS            PLAN                 COORDINATE            DISCOVER          REMEMBER          COMMUNITY        PLATFORM
─────────         ────────────         ─────────────         ─────────         ─────────         ──────────       ─────────
Auth/Account      Create Trip          Trip Dashboard        Explore           Memories Album    Friends&Groups   Navigation/i18n
Profile/Prefs     Flight Auto-fill     Itinerary(multi-city) Recommendations   Share/Export      Travel Buddies   Notifications
                  My Trips lifecycle   Expenses & Split      Add-to-trip       Report PDF                          Admin/Moderation
                                        Tasks & Packing
                                        Members & Roles
```

## 2. Story List (16 stories)

| ID | Title | Live-site source | Tenant-scoped? |
|----|-------|------------------|----------------|
| US-001 | Authentication & Account Access | index.html auth modal (email/Google/guest), login gate | No (global) |
| US-002 | User Profile & Preferences | profile.html, theme/lang toggles | No |
| US-003 | Trip Creation Wizard (single & multi-city) | planner.html 3-step modal | Creates tenant |
| US-004 | Flight Details Auto-Fill (AviationStack) | planner flight lookup block | Yes |
| US-005 | Trips Overview & Lifecycle (My Trips) | mytrips.html trips tab (upcoming/past, badges) | Yes |
| US-006 | Itinerary & Multi-City Timeline | trip.html timeline + Itinerary tab | Yes |
| US-007 | Expenses, Kitty & Settlement (dual currency) | trip Expenses tab + expenses.html | Yes |
| US-008 | Tasks & Packing | trip Tasks tab + prep.html + packing.html | Yes |
| US-009 | Trip Members, Roles & Invitations | trip Members tab, invite link | Yes |
| US-010 | Friends & Groups (social graph) | mytrips Friends tab | No |
| US-011 | Travel Buddies Discovery | buddies.html | Partly (buddy = mini-tenant) |
| US-012 | Explore & Recommendations | explore.html | No |
| US-013 | Memories & Community Album (+report) | memories.html + trip Memories tab | Yes |
| US-014 | Platform Navigation, Localization, Theming & A11y | responsive.js header/drawer/bottom-nav, dark mode | No (shell) |
| US-015 | Notifications & Reminders (FCM) | invite/friend/payment reminders (functional) | Mixed |
| US-016 | Admin & Moderation Console | platform operation (Assumption) | Global admin |

## 3. User-Flow Map (primary flows → stories)

```
F1 Onboarding:        Landing → Auth modal → App                         → US-001, US-014
F2 New Trip:          + New → Wizard(basics→destinations→invite)         → US-003 (→US-004 flight, →US-009 invite)
F3 Live a Trip:       My Trips → open Trip → [Itinerary|Expenses|Tasks|   → US-005 → US-006/007/008/009/013
                      Members|Memories]
F4 Money:             Expenses tab → kitty/side/personal/summary + FX     → US-007
F5 Discover:          Explore → place → add to trip                       → US-012 (→US-006)
F6 Buddies:           Buddies → filter → create/join request             → US-011 (→US-010 friends, →US-015 notify)
F7 Social:            My Trips → Friends → request/accept/invite          → US-010 (→US-009)
F8 Remember:          Trip → Memories → upload/group/share/export         → US-013
F9 Platform ops:      Admin → moderate users/content/buddies             → US-016
```

## 4. Dependency Graph (also in `matrices/dependency-matrix.dm`)

```
US-014 (shell/i18n/theme)  ─ enables ─▶ every UI story
US-001 (auth) ─▶ US-002, US-003, US-005, US-010, US-011, US-013, US-015
US-003 (create trip = tenant) ─▶ US-005, US-006, US-007, US-008, US-009, US-013
US-004 (flight) depends on US-003
US-009 (members/invite) depends on US-003; used by US-007 (payer/participants), US-010
US-010 (friends) depends on US-001; feeds US-009 (invite friend), US-011
US-007 depends on US-003, US-009
US-006/008/013 depend on US-003 (+US-009 for attribution)
US-012 (explore) depends on US-001 (rate); feeds US-006 (add-to-trip)
US-011 depends on US-001, US-010; feeds US-015
US-015 depends on US-001; consumes events from US-009/010/007/011
US-016 depends on US-001 (+roles from 01); reads across tenants w/ audit
```
**No circular dependencies detected.** (If a future change introduces one, halt & report — Master Prompt §26.)

## 5. Implementation Order (recommended waves)

- **Wave 0 — Foundations:** US-014 (shell/i18n/theme/a11y/responsive), US-001 (auth), US-002 (profile).
- **Wave 1 — Trip core:** US-003 (create), US-009 (members/invite), US-005 (my trips), US-006 (itinerary).
- **Wave 2 — Value features:** US-007 (expenses), US-008 (tasks/packing), US-013 (memories), US-004 (flight auto-fill).
- **Wave 3 — Community & discovery:** US-010 (friends), US-011 (buddies), US-012 (explore), US-015 (notifications).
- **Wave 4 — Operations:** US-016 (admin/moderation), analytics hardening, perf/a11y audits.

## 6. Story Sizing (relative)

| Size | Stories |
|------|---------|
| L (complex) | US-003, US-007, US-011, US-013 |
| M | US-001, US-005, US-006, US-008, US-009, US-010, US-012, US-014, US-016 |
| S | US-002, US-004, US-015 |

## 7. Status legend used in each US file
`DRAFT` → written; `READY` → passes Global DoR; `IN-PROGRESS`/`DONE` set at implementation time.
