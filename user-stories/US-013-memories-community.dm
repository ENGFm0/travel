# US-013 — Memories & Community Album (+ Report)
Status: DRAFT · Size: L · Tenant-scoped: Yes

## 1. Story ID & Title
**US-013 — Memories & Community Album**: upload photos/videos, group by day or place, view album, share trip, export trip report (PDF/link).

## 2. User Story
**As a** trip member, **I want** to upload and browse trip media grouped by day or place and share/export a trip report, **so that** the group can collect and revisit memories.

## 3. Business Goal
Preserve & share the journey (G5); increase retention and virality via shareable reports.

## 4. Scope
**In:** Upload from camera or gallery; media grouped by Day or Place (toggle); album grid; per-trip album (Memories tab) + cross-trip/community album (Memories section); delete own media (owner can delete any); share trip (link, login-gated) ; export trip report as PDF or shareable link.
**Out:** Advanced editing/filters, face recognition/auto-tagging (future), public social feed/comments (Assumption/future).

## 5. Functional Requirements
- **FR-013-001** Upload image/video via camera or gallery (mobile native; web file input).
- **FR-013-002** Toggle grouping: by Day / by Place.
- **FR-013-003** Album grid with lazy-loaded thumbnails; open viewer.
- **FR-013-004** Delete own media; owner deletes any.
- **FR-013-005** Share trip via link (opening requires login/authorized viewer).
- **FR-013-006** Export trip report (itinerary + finance summary + highlights) to PDF and/or share link.
- **FR-013-007** Empty/loading/error/success states; upload progress.

## 6. Business Rules
- **BR-013-001** Media stored in Firebase Storage under `memories/{tripId}/...`; access requires trip membership (or authorized viewer for shared).
- **BR-013-002** A member may delete own uploads; `TRIP_OWNER` may delete any; admin via moderation.
- **BR-013-003** Media persists until trip deletion + retention window (mirrors "الذكريات محفوظة حتى بعد انتهاء الرحلة").
- **BR-013-004** Uploads validated (type/size), EXIF-stripped, virus-scanned; signed URLs for access.
- **BR-013-005** Shared report link is capability-bearing but scoped & revocable; viewer role read-only.
- **BR-013-006** Video length/size capped (documented limits).

## 7. Operation Rules
- **Create:** upload → signed-URL flow `POST /trips/{id}/memories` (metadata) + Storage put. **Update:** re-group metadata (dayId/placeId). **Delete & Blockers:** delete media (own/owner); blocker: none. **Activate/Deactivate:** share link enable/revoke. **Import/Export:** **export report** (PDF/link) is core here.

## 8. Validation Rules
- **VR-013-001** MIME∈{image/*,video/*} allowlist; size ≤ limits; content sniff. **VR-013-002** dayId/placeId∈trip. **VR-013-003** Report request valid trip + member. Server-authoritative; Storage Rules enforce path/membership.

## 9. Permissions & Access Control
| Action | VIEWER(shared) | TRIP_MEMBER | TRIP_OWNER | ADMIN |
|---|---|---|---|---|
| view album | ✔(if shared) | ✔ | ✔ | support(audit) |
| upload | — | ✔ | ✔ | — |
| delete own | — | ✔ⓜ | ✔ | — |
| delete any | — | — | ✔ⓞ | ✔(moderation) |
| share/revoke link | — | — | ✔ⓞ | — |
| export report | ✔(read) | ✔ | ✔ | — |

## 10. Audit Requirements
`MEMORY_UPLOAD(mediaId,type)`, `MEMORY_DELETE(mediaId, own|any)`, `TRIP_SHARE_LINK_CREATE/REVOKE`, `REPORT_EXPORT(format)`. Actor, tenant, entity, ts, result. Store paths, not media.

## 11. Acceptance Criteria
- **AC1** Given I upload 3 photos to Day 1, When done, Then they appear in the Day grouping for all members (realtime), with progress shown during upload.
- **AC2** Given grouping toggle, When I switch to Place, Then media regroups by place.
- **AC3** Given someone else's photo, When I try to delete it as a member, Then it's blocked; the owner can delete it.
- **AC4** Given a shared report link, When an unauthenticated user opens it, Then they must authenticate (or use scoped viewer token) and get read-only access.
- **AC5** Given a trip, When I export the report, Then a PDF (and/or link) with itinerary + finance summary is produced.
- **AC6** Given an invalid/oversized file, When uploading, Then it's rejected with a localized message.
- **AC7** AR/EN + 4 breakpoints + accessible (alt text prompts, keyboard viewer).

## 12. Dependencies
Depends on: US-003, US-006 (days), US-009 (membership), US-007 (finance for report), US-012 (places), US-014. Storage + report service (architecture).

## 13. Product Subtasks
- **US-013-UX-001** Memories UX: upload (camera/gallery), grouping toggle (days/place), grid + viewer, delete controls, share modal, export report; states + upload progress; RTL; responsive (masonry → columns); a11y (alt text, focus in viewer, reduced-motion); UX AC=AC1–AC7; DoD.
- **US-013-FE-001** Memories module: uploader (signed URL flow), grid/viewer, grouping, delete, share, export trigger; web file input + RN camera/gallery; i18n; DoD tests. (Replaces prototype's placeholder upload.)
- **US-013-BE-001** Endpoints `/trips/{id}/memories` (POST metadata + signed URL, GET, DELETE), `/trips/{id}/share` (create/revoke viewer token), `/trips/{id}/report` (generate PDF/link); Storage rules; upload pipeline (validate/EXIF-strip/scan); report composition (itinerary+finance); audit; validation; unit tests; DoD.
- **US-013-SEC-001** Secure file upload (type/size/sniff/scan/EXIF), signed URLs, membership-scoped Storage Rules, capability-link scoped/revocable (BR-013-005), tenant isolation, OWASP A01/A05/A08, audit; DoD.
- **US-013-QA-001** Functional AC1–AC7; BR-013-*; validation (file types/size); permission (member can't delete others'; unauth share blocked); security (malicious file rejected, path traversal, link revoke); RTL/responsive; regression (report reflects itinerary+finance); evidence; DoD.

## 14. Definition of Ready
US-003/006/007/009 ready; Storage rules & upload pipeline agreed; report contents/format defined; share-link security model. ✅

## 15. Definition of Done
Global DoD + AC1–AC7; secure validated uploads; membership-scoped access; grouping; revocable share; report export; audit; AR/EN + breakpoints + a11y; tests green.
