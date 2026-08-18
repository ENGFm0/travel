namespace BoardingPass.Api.Endpoints;

/// <summary>
/// US-010-BE-001 friends &amp; groups (social graph). The graph is strictly
/// self-scoped: the caller reads only their own friends and incoming requests —
/// no user may read another's graph. Friendship is mutual and unique per pair;
/// accepting establishes it and duplicate requests are idempotent
/// (BR-010-001/002). Removing a friend does NOT affect shared trip membership
/// (that's US-009, BR-010-004). "Invite to trip" requires the caller to be the
/// trip OWNER and delegates to the US-009 invitation flow (BR-010-005). Request
/// sending is rate-limited (anti-spam). This maps the endpoints + contracts;
/// uniqueness, the owner check, throttling, and audit live in the Application
/// layer.
/// </summary>
public static class FriendsEndpoints
{
    public static IEndpointRouteBuilder MapFriendsEndpoints(this IEndpointRouteBuilder group)
    {
        var friends = group.MapGroup("/friends");

        // Self-scoped graph: friends + incoming requests.
        friends.MapGet("", () => Results.Ok(new { friends = Array.Empty<object>(), incoming = Array.Empty<object>() }))
            .WithName("GetFriends")
            .WithSummary("Get the caller's friends and incoming requests (self only).");

        // Send a friend request by username/phone. Idempotent; rejects self and
        // existing/pending pairs. TODO(US-010-BE): resolve target, dedupe, throttle, audit.
        friends.MapPost("/requests", (FriendRequestBody req) => Results.Created("/api/v1/friends/requests", new { }))
            .WithName("SendFriendRequest")
            .WithSummary("Send a friend request (idempotent, anti-spam).");

        // Accept/reject an incoming request.
        friends.MapPatch("/requests/{id}", (string id, FriendRequestAction body) => Results.NoContent())
            .WithName("RespondFriendRequest")
            .WithSummary("Accept or reject an incoming friend request.");

        // Remove a friend (does not touch trip membership).
        friends.MapDelete("/{id}", (string id) => Results.NoContent())
            .WithName("RemoveFriend")
            .WithSummary("Remove a friend (keeps shared trip membership).");

        // Invite a friend to a trip the caller owns → creates a US-009 invitation.
        friends.MapPost("/invite-to-trip", (InviteToTripBody body) => Results.Created("/api/v1/friends/invite-to-trip", new { }))
            .WithName("InviteFriendToTrip")
            .WithSummary("Invite a friend to an owned trip (delegates to US-009).");

        return group;
    }
}

public sealed record FriendRequestBody(string Handle); // username or phone
public sealed record FriendRequestAction(string Action); // accept | reject
public sealed record InviteToTripBody(string FriendId, string TripId);
