# 01 — Roles & Permissions · BoardingPass

Roles are derived from the live site's behavior (amir/member/friend/guest) plus the minimum platform roles required to operate a real multi-user product. Nothing is invented beyond operational necessity; speculative roles are marked **(Assumption)** and cross-listed in `99-open-questions-assumptions.dm`.

---

## 1. Role Catalog

| Role | Code | Origin in site | Description |
|------|------|----------------|-------------|
| Guest / Visitor | `GUEST` | Login gate, "دخول كضيف" | Unauthenticated or guest-session user. Read-only public surfaces; cannot own data. |
| Traveler (User) | `USER` | Authenticated app user | Registered account. Can create trips, join trips, be a friend, discover buddies. Baseline authenticated role. |
| Trip Owner (Amir) | `TRIP_OWNER` | "أمير الرحلة" | Per-trip role. The creator/owner of a trip. Elevated rights **scoped to that trip** (see Tenant model). |
| Trip Member | `TRIP_MEMBER` | Trip group members | Per-trip role. Invited & joined a trip. Limited rights scoped to that trip. |
| Trip Viewer | `TRIP_VIEWER` | Shared read link (Assumption) | Per-trip, read-only via share link / report. |
| Admin | `ADMIN` | Platform operation (Assumption) | Moderates users, buddy requests, reported content; support. Not a tenant member. |
| Super Admin | `SUPER_ADMIN` | Platform operation (Assumption) | Full platform administration, role/permission management, config, audit access. |

**Note on "Service Provider / Merchant":** the live *Explore* content is curated/read-only (no provider self-service). A provider marketplace role is **Not Applicable** now; documented as future in Open Questions.

## 2. The "Trip" is the Tenant (multi-tenant model)

BoardingPass is **trip-scoped multi-tenant**: a **Trip** is the isolation boundary. `TRIP_OWNER`, `TRIP_MEMBER`, `TRIP_VIEWER` are *membership roles within a specific trip*, not global roles. Every trip-scoped API call MUST resolve the caller's membership+role for `tripId` server-side. A user with no membership in `tripId` gets `403/404` — no cross-trip data access ever. `USER`, `ADMIN`, `SUPER_ADMIN` are **global** roles.

- A user is `TRIP_OWNER` of trips they created, `TRIP_MEMBER` of trips they joined — simultaneously and independently per trip.
- Friends/Group are **social graph** objects owned by a `USER`, independent of any single trip.

## 3. Permission Domains (PBAC on top of RBAC)

Permissions are fine-grained (`permission-based`), grouped by domain; roles are bundles of permissions. Server is the sole authority.

```
auth.*          login, logout, refresh, link_provider
account.*       read_self, update_self, delete_self, manage_preferences
trip.*          create, read, update, delete, archive, restore, invite, list_own
member.*        list, add, remove, change_role, leave
itinerary.*     read, add_city, update_city, reorder, add_day, add_activity, delete
expense.*       read, add_expense, update_expense, delete_expense,
                kitty_read, kitty_collect, mark_paid(owner-only), remind,
                side_create, side_update, side_delete, side_settle,
                personal_read, personal_write, summary_read, currency_toggle
task.*          read, create, update, complete, assign, delete
packing.*       read, add, toggle, delete, apply_template
memory.*        read, upload, delete_own, delete_any(owner), share, export_report
friend.*        list, request_send, request_accept, request_reject, remove, invite_to_trip
buddy.*         browse, filter, create_request, update_own, delete_own, join, leave
explore.*       browse, search, view_place, rate_place, add_to_trip
flight.*        lookup (rate-limited)
notify.*        read, mark_read, manage_prefs
admin.*         users_read, users_suspend, content_moderate, buddy_moderate,
                audit_read, config_manage, roles_manage(super)
```

## 4. Permission Matrix (summary — full grid in `matrices/permission-matrix.dm`)

Legend: ✔ allowed · ✔ⓞ trip-owner only · ✔ⓜ own record only · — denied.

| Domain / Action | GUEST | USER | TRIP_MEMBER | TRIP_OWNER | ADMIN | SUPER_ADMIN |
|---|---|---|---|---|---|---|
| auth.login/register | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| account.read/update self | — | ✔ | ✔ | ✔ | ✔ | ✔ |
| trip.create | — | ✔ | ✔ | ✔ | ✔ | ✔ |
| trip.read | — | ✔ⓜ | ✔ | ✔ | ✔ | ✔ |
| trip.update/archive | — | — | — | ✔ⓞ | — | ✔ |
| trip.delete | — | — | — | ✔ⓞ | — | ✔ |
| member.invite | — | — | — | ✔ⓞ | — | ✔ |
| member.remove/change_role | — | — | — | ✔ⓞ | — | ✔ |
| member.leave | — | — | ✔ | ✔ⓞ¹ | — | — |
| itinerary.read | — | — | ✔ | ✔ | ✔² | ✔ |
| itinerary.write | — | — | ✔ | ✔ | — | ✔ |
| expense.add/read log | — | — | ✔ | ✔ | — | ✔ |
| expense.mark_paid (kitty) | — | — | — | ✔ⓞ | — | ✔ |
| expense.side_create/settle | — | — | ✔ | ✔ | — | ✔ |
| expense.personal_write | — | — | ✔ⓜ | ✔ⓜ | — | — |
| task.create/assign | — | — | ✔ | ✔ | — | ✔ |
| packing.write | — | — | ✔ | ✔ | — | ✔ |
| memory.upload | — | — | ✔ | ✔ | — | ✔ |
| memory.delete_any | — | — | — | ✔ⓞ | ✔ | ✔ |
| friend.request/accept | — | ✔ | ✔ | ✔ | — | — |
| buddy.browse/filter | ✔³ | ✔ | ✔ | ✔ | ✔ | ✔ |
| buddy.create_request | — | ✔ | ✔ | ✔ | — | — |
| buddy.join | — | ✔ | ✔ | ✔ | — | — |
| explore.browse/search | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| explore.rate_place | — | ✔ | ✔ | ✔ | — | — |
| flight.lookup | — | ✔ | ✔ | ✔ | ✔ | ✔ |
| admin.* | — | — | — | — | ✔ | ✔ |
| roles.manage | — | — | — | — | — | ✔ |

¹ Owner leaving triggers ownership-transfer or trip archival (BR in US-009). ² Admin read only via moderation/support with audit. ³ Guest may browse limited public buddy listings (Assumption; else USER+).

## 5. Enforcement Rules

- **RULE-SEC-1:** Every permission above is enforced **server-side** in ASP.NET Core authorization handlers; Firebase Security Rules mirror them for any direct-Firestore/Storage access.
- **RULE-SEC-2:** Frontend permission checks are **UX only** (hide/disable); never the security boundary.
- **RULE-SEC-3:** Trip-scoped actions require `(userId ∈ trip.members) ∧ role∈allowed` resolved from the trip membership record, not from client claims.
- **RULE-SEC-4:** `ADMIN`/`SUPER_ADMIN` actions on tenant data are logged with actor, target tenant, reason (Audit).
- **RULE-SEC-5:** Role/permission changes (`roles.manage`) are `SUPER_ADMIN`-only and fully audited.

## 6. Auth ↔ Role source

Roles/claims are minted by the backend after Firebase ID-token validation (custom claims for global role; trip membership/role read from Firestore per request). Client never self-asserts role.
