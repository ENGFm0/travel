# Feature Coverage Matrix · BoardingPass

Every feature/idea observed in the live site → mapped to a Story + confirmation that UX/FE/BE/SEC/QA subtasks exist. Goal: no feature lost. ✔ = covered by that discipline's subtask(s); N/A = not applicable with reason.

| # | Feature (source: live site) | Source page | Story | UX | FE | BE | SEC | QA |
|---|------------------------------|-------------|-------|----|----|----|-----|----|
| 1 | Login/Register (email/Google/guest), email-routing, forgot-pw | index auth modal | US-001 | ✔ | ✔ | ✔ | ✔ | ✔ |
| 2 | Auth-gated access / profile icon opens login (`?auth=1`) | all (header) | US-001/014 | ✔ | ✔ | ✔ | ✔ | ✔ |
| 3 | Profile & account | profile.html | US-002 | ✔ | ✔ | ✔ | ✔ | ✔ |
| 4 | Language toggle AR/EN | header | US-014(+002) | ✔ | ✔ | ✔ | ✔ | ✔ |
| 5 | Dark/light theme toggle | header | US-014(+002) | ✔ | ✔ | ✔ | ✔ | ✔ |
| 6 | Unified header + footer + bottom nav (5) | responsive.js | US-014 | ✔ | ✔ | ✔ | ✔ | ✔ |
| 7 | 3-step create-trip wizard (basics/type/dates) | planner modal | US-003 | ✔ | ✔ | ✔ | ✔ | ✔ |
| 8 | Single & multi-city destinations w/ per-city dates | planner step2 | US-003 | ✔ | ✔ | ✔ | ✔ | ✔ |
| 9 | Invite friends in wizard | planner step3 | US-003/009/010 | ✔ | ✔ | ✔ | ✔ | ✔ |
| 10 | Flight number auto-fill (AviationStack) | planner | US-004 | ✔ | ✔ | ✔ | ✔ | ✔ |
| 11 | My Trips list, upcoming/past filter | mytrips | US-005 | ✔ | ✔ | ✔ | ✔ | ✔ |
| 12 | Domestic/International badges | mytrips | US-005 | ✔ | ✔ | ✔ | ✔ | ✔ |
| 13 | Trip planning-progress % | mytrips/planner | US-005 | ✔ | ✔ | ✔ | ✔ | ✔ |
| 14 | Trip dashboard shell + 5 tabs | trip.html | US-006 | ✔ | ✔ | ✔ | ✔ | ✔ |
| 15 | Multi-city interactive timeline | trip.html | US-006 | ✔ | ✔ | ✔ | ✔ | ✔ |
| 16 | Itinerary: flight/hotel/weather/days/activities | trip.html | US-006 | ✔ | ✔ | ✔ | ✔ | ✔ |
| 17 | Group kitty (قطة): total/collect/pay-status/distribution/log | trip expenses | US-007 | ✔ | ✔ | ✔ | ✔ | ✔ |
| 18 | Owner-only payment confirmation | trip expenses | US-007 | ✔ | ✔ | ✔ | ✔ | ✔ |
| 19 | Side kitties (2+ people) split + settle "برق" | trip expenses | US-007 | ✔ | ✔ | ✔ | ✔ | ✔ |
| 20 | Personal expenses (private) | trip expenses | US-007 | ✔ | ✔ | ✔ | ✔ | ✔ |
| 21 | My financial summary / analysis | trip expenses | US-007 | ✔ | ✔ | ✔ | ✔ | ✔ |
| 22 | Dual-currency toggle + conversion | trip expenses | US-007 | ✔ | ✔ | ✔ | ✔ | ✔ |
| 23 | Task manager (create/assign/complete) | trip tasks / prep | US-008 | ✔ | ✔ | ✔ | ✔ | ✔ |
| 24 | Bookings checklist (visa/passport/currency/SIM) | prep.html | US-008 | ✔ | ✔ | ✔ | ✔ | ✔ |
| 25 | Packing list categorized + templates | trip tasks / packing | US-008 | ✔ | ✔ | ✔ | ✔ | ✔ |
| 26 | Trip members + roles (Amir/Member) | trip members | US-009 | ✔ | ✔ | ✔ | ✔ | ✔ |
| 27 | Invite link (login-gated) + copy | trip/mytrips | US-009 | ✔ | ✔ | ✔ | ✔ | ✔ |
| 28 | Friend requests + friends list + search | mytrips friends | US-010 | ✔ | ✔ | ✔ | ✔ | ✔ |
| 29 | Current group card + invite | mytrips friends | US-010/009 | ✔ | ✔ | ✔ | ✔ | ✔ |
| 30 | Travel buddies: full trips vs meetups | buddies | US-011 | ✔ | ✔ | ✔ | ✔ | ✔ |
| 31 | Buddies filters (city/date/category/budget) | buddies | US-011 | ✔ | ✔ | ✔ | ✔ | ✔ |
| 32 | Create buddy/meetup request + join | buddies | US-011 | ✔ | ✔ | ✔ | ✔ | ✔ |
| 33 | Explore destinations by category | explore | US-012 | ✔ | ✔ | ✔ | ✔ | ✔ |
| 34 | Place ratings/photos/reviews | explore | US-012 | ✔ | ✔ | ✔ | ✔ | ✔ |
| 35 | Add place to trip | explore→trip | US-012/006 | ✔ | ✔ | ✔ | ✔ | ✔ |
| 36 | Memories album (camera/gallery) | memories/trip | US-013 | ✔ | ✔ | ✔ | ✔ | ✔ |
| 37 | Group by day / place | memories/trip | US-013 | ✔ | ✔ | ✔ | ✔ | ✔ |
| 38 | Share trip / export report (PDF/link) | memories | US-013 | ✔ | ✔ | ✔ | ✔ | ✔ |
| 39 | Responsive (mobile-first) + no horizontal overflow | all | US-014 | ✔ | ✔ | ✔ | ✔ | ✔ |
| 40 | RTL/LTR mirroring | all | US-014 | ✔ | ✔ | ✔ | ✔ | ✔ |
| 41 | Notifications/reminders (invite/friend/payment/buddy) | functional | US-015 | ✔ | ✔ | ✔ | ✔ | ✔ |
| 42 | Platform admin/moderation | (Assumption) | US-016 | ✔ | ✔ | ✔ | ✔ | ✔ |

## Items intentionally NOT converted (with reason)
- **Static logo/brand image, footer copyright text** → design tokens/asset in US-014, not a standalone feature.
- **wa.me WhatsApp share links** (prototype) → **N/A as system feature**; re-modeled as US-015 notifications (in-app/push/email). Manual share remains a UX affordance.
- **Client-side AviationStack key / http call** → **explicitly removed**; re-modeled as secure backend proxy (US-004). Documented as a security fix, not a feature.
- **localStorage persistence** (tasks/packing/side/personal in prototype) → replaced by API+Firestore across US-007/008; not carried as-is.
- **Service Provider / Merchant marketplace** → **Not Applicable now** (no provider surface in site); future — see Open Questions.

**Coverage result:** 42/42 observed features mapped; 5 items documented as re-modeled/N/A. No feature lost.
