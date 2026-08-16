# Dependency Matrix · BoardingPass

`A → B` = A depends on B (B must be ready first). No circular dependencies.

## Direct dependencies

| Story | Depends on | Enables / Feeds |
|-------|-----------|-----------------|
| US-014 Shell | — | ALL UI stories |
| US-001 Auth | US-014 | US-002,003,005,010,011,013,015,016 |
| US-002 Profile/Prefs | US-001, US-014 | US-015 (prefs), US-009 (delete/transfer link) |
| US-003 Create Trip | US-001, US-014 | US-004,005,006,007,008,009,013 |
| US-004 Flight Auto-fill | US-003 | — (enriches US-003/006) |
| US-005 My Trips | US-001, US-003, US-014 | hosts US-010 (friends tab) |
| US-006 Itinerary | US-003, US-009, US-014 | hosts US-007/008/013 tabs; consumes US-012,004 |
| US-007 Expenses | US-003, US-009, US-014 | US-013 (report), US-015 (reminders) |
| US-008 Tasks/Packing | US-003, US-009, US-014 | US-015 (reminders) |
| US-009 Members/Invites | US-003, US-001, US-014 | US-006,007,008,013; US-002/005 blockers; US-010,015 |
| US-010 Friends | US-001, US-014 | US-009 (invite friend), US-011 |
| US-011 Buddies | US-001, US-010, US-014 | US-015 (notify), US-016 (moderation); handoff US-003 |
| US-012 Explore | US-001, US-014 | US-006 (add-to-trip); US-016 (moderation) |
| US-013 Memories | US-003,006,007,009, US-014 | US-005 (past album/report link) |
| US-015 Notifications | US-001,002,014 | consumes events US-007,009,010,011 |
| US-016 Admin | US-001, roles(01), US-014 | consumes flags/audit ALL; notifies US-015 |

## Topological order (safe build sequence)

```
US-014 → US-001 → US-002
       → US-003 → US-009 → US-005 → US-006
                          → US-007 → US-013
                          → US-008
       → US-004 (after US-003)
       → US-010 → US-011
       → US-012
       → US-015 (after 001/002 + emitting stories)
       → US-016 (after 001 + moderation domains)
```

## Cross-cutting couplings (not blocking, but must agree on contracts)
- Progress % (US-005) reads completion from US-006/007/008/009 — shared formula (BR-005-001).
- Membership/role (US-009) is consumed by every trip-scoped story — one source of truth.
- Notification events (US-015) require event contracts from US-007/009/010/011.
- Audit schema (02 + US-016) shared by all sensitive-op stories.

## Circular-dependency check
None. US-006 ⇄ US-013 (tab host vs day reference) resolved as **one-directional**: US-013 depends on US-006 (days), US-006 only hosts the tab shell (no dependency back on US-013 logic). US-009 ⇄ US-010 resolved: US-010 feeds invite candidates; US-009 owns membership — no cycle.
