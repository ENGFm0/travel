# Permission Matrix · BoardingPass

Authoritative RBAC × PBAC grid. **Server-enforced.** Frontend uses this for hide/disable only.
Legend: ✔ allowed · ⓞ trip-owner only · ⓜ own record only · △ conditional (note) · — denied.
Trip-scoped roles (MEMBER/OWNER/VIEWER) apply **per `tripId`** via membership resolution.

## Global roles

| Permission | GUEST | USER | ADMIN | SUPER_ADMIN | Story |
|---|---|---|---|---|---|
| auth.login/register/guest | ✔ | ✔ | ✔ | ✔ | US-001 |
| auth.logout | ✔ | ✔ | ✔ | ✔ | US-001 |
| account.read/update self | — | ✔ⓜ | ✔ⓜ | ✔ | US-002 |
| account.delete self | — | ✔ⓜ△ | — | ✔ | US-002 |
| trip.create | — | ✔ | ✔ | ✔ | US-003 |
| trip.list own | — | ✔ⓜ | ✔ | ✔ | US-005 |
| friend.* (self graph) | — | ✔ⓜ | — | — | US-010 |
| buddy.browse | ✔△ | ✔ | ✔ | ✔ | US-011 |
| buddy.create/join | — | ✔ | — | — | US-011 |
| explore.browse/search | ✔ | ✔ | ✔ | ✔ | US-012 |
| explore.rate | — | ✔ⓜ | — | — | US-012 |
| flight.lookup | — | ✔△ | ✔ | ✔ | US-004 |
| notify.read own | — | ✔ⓜ | ✔ⓜ | ✔ⓜ | US-015 |
| admin.users/moderate/audit | — | — | ✔ | ✔ | US-016 |
| admin.config | — | — | ✔△ | ✔ | US-016 |
| roles.manage | — | — | — | ✔ | US-016 |

△ notes: guest buddy browse = limited preview (Assumption); flight.lookup rate-limited; account.delete blocked if sole owner of active trip w/ members; admin.config limited scope for ADMIN.

## Trip-scoped permissions (per tripId)

| Permission | VIEWER | MEMBER | OWNER(Amir) | ADMIN† | Story |
|---|---|---|---|---|---|
| trip.read | ✔ | ✔ | ✔ | △ | US-005/006 |
| trip.update/archive/delete | — | — | ✔ⓞ | △ | US-005 |
| member.list | ✔ | ✔ | ✔ | △ | US-009 |
| member.invite/remove/change_role | — | — | ✔ⓞ | △ | US-009 |
| member.leave | — | ✔ | ✔ⓞ△ | — | US-009 |
| ownership.transfer | — | — | ✔ⓞ | △ | US-009 |
| itinerary.read | ✔ | ✔ | ✔ | △ | US-006 |
| itinerary.write (city/day/activity) | — | ✔ | ✔ | — | US-006 |
| expense.read log/summary(own) | ✔△ | ✔ | ✔ | △ | US-007 |
| expense.add group/side | — | ✔ | ✔ | — | US-007 |
| expense.edit/delete | — | ✔ⓜ | ✔ | — | US-007 |
| kitty.mark_paid | — | — | ✔ⓞ | — | US-007 |
| expense.personal read/write | — | ✔ⓜ | ✔ⓜ | — | US-007 |
| currency.refresh_rate | — | — | ✔ⓞ | — | US-007 |
| task.read | ✔ | ✔ | ✔ | — | US-008 |
| task.create/assign/complete/delete | — | ✔ | ✔ | — | US-008 |
| packing.read | ✔ | ✔ | ✔ | — | US-008 |
| packing.write/template | — | ✔ | ✔ | — | US-008 |
| memory.view | ✔△ | ✔ | ✔ | △ | US-013 |
| memory.upload | — | ✔ | ✔ | — | US-013 |
| memory.delete own / any | — | ✔ⓜ / — | ✔ / ✔ⓞ | △ | US-013 |
| trip.share/revoke_link | — | — | ✔ⓞ | — | US-013 |
| report.export | ✔ | ✔ | ✔ | — | US-013 |

† ADMIN △ = only via moderation/support flow, **always audited**, never silent (US-016 BR-016-003). VIEWER expense/memory read only when trip is shared to them.

## Enforcement notes
- Membership+role loaded server-side per request from `trips/{tripId}/members/{uid}`.
- Firebase Security Rules mirror this grid for any direct Firestore/Storage access.
- Personal expenses are strictly `ⓜ` — not visible to OWNER or ADMIN.
- Audit log read is ADMIN/SUPER only and itself audited.
