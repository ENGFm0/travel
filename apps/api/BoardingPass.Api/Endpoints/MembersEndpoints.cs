namespace BoardingPass.Api.Endpoints;

/// <summary>
/// US-009-BE-001 members, roles &amp; invitations. All actions are tenant-scoped
/// to the trip and authorization is server-authoritative: only the trip owner
/// may invite, change roles, transfer ownership, or remove members; invitees act
/// only on their own invitation. Invariants enforced here (not in the client):
/// exactly one <c>OWNER</c> per trip (BR-009-001), owner cannot leave while other
/// members exist without transferring (BR-009-002), capability invite links
/// require authentication to join (BR-009-003), and removal revokes access +
/// unassigns tasks (BR-009-004). Firestore persistence, atomic ownership transfer
/// (transaction), token issuance/rotation/expiry, and audit live in the
/// Application/Infrastructure layers; this maps the endpoints + contracts.
/// </summary>
public static class MembersEndpoints
{
    public static IEndpointRouteBuilder MapMembersEndpoints(this IEndpointRouteBuilder group)
    {
        var trip = group.MapGroup("/trips/{tripId}");
        // .RequireAuthorization() once US-001 policy is wired; owner-only ops add
        // a per-trip ownership policy.

        // List members (active + pending). Any member may view.
        trip.MapGet("/members", (string tripId) =>
            Results.Ok(Array.Empty<MemberResponse>()))
            .WithName("ListMembers")
            .WithSummary("List trip members and pending invitations.");

        // Invite by friend id / phone (E.164) / username → pending membership.
        // Owner-only. TODO(US-009-BE): resolve invitee, dedupe (BR-009-007), audit.
        trip.MapPost("/invitations", (string tripId, InviteRequest req) =>
            Results.Created($"/api/v1/trips/{tripId}/members/pending",
                new MemberResponse("pending", req.Name, req.Handle, "MEMBER", "PENDING")))
            .WithName("InviteMember")
            .WithSummary("Invite someone to the trip (owner only).");

        trip.MapPost("/invitations/{uid}/accept", (string tripId, string uid) => Results.NoContent())
            .WithName("AcceptInvitation");
        trip.MapPost("/invitations/{uid}/decline", (string tripId, string uid) => Results.NoContent())
            .WithName("DeclineInvitation");

        // Issue/rotate an opaque, single-trip, expiring invite link (owner only).
        trip.MapPost("/invite-link", (string tripId) =>
            Results.Ok(new { url = $"https://boardingpass.app/join/{tripId}" }))
            .WithName("CreateInviteLink")
            .WithSummary("Create/rotate the trip invite link (owner only).");

        // Change role (MEMBER<->VIEWER) or transfer ownership. Owner-only.
        // TODO(US-009-BE): validate transition, run transfer atomically, audit.
        trip.MapPatch("/members/{uid}", (string tripId, string uid, MemberPatchRequest req) =>
            Results.NoContent())
            .WithName("UpdateMember")
            .WithSummary("Change a member's role or transfer ownership (owner only).");

        // Remove a member (owner) or leave (self). Owner-leave blocked unless the
        // trip is transferred first (BR-009-002).
        trip.MapDelete("/members/{uid}", (string tripId, string uid) => Results.NoContent())
            .WithName("RemoveOrLeaveMember")
            .WithSummary("Remove a member (owner) or leave the trip (self).");

        return group;
    }
}

public sealed record InviteRequest(string Name, string? Handle);

/// <param name="Role">MEMBER | VIEWER (role change)</param>
/// <param name="TransferOwnership">true to hand ownership to this member</param>
public sealed record MemberPatchRequest(string? Role, bool TransferOwnership = false);

public sealed record MemberResponse(
    string Uid,
    string DisplayName,
    string? Handle,
    string Role,    // OWNER | MEMBER | VIEWER
    string Status); // ACTIVE | PENDING | DECLINED
