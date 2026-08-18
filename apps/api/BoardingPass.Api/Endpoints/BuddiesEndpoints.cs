namespace BoardingPass.Api.Endpoints;

/// <summary>
/// US-011-BE-001 travel buddies discovery. A buddy request is a mini-tenant owned
/// by its creator, who is a participant by default (BR-011-003) and the only one
/// who may edit/close/delete it (BR-011-001). Browsing/filtering is open to
/// authenticated users (guests get limited previews); joining requires auth
/// (BR-011-004). Capacity is enforced atomically (transaction) so concurrent joins
/// never over-fill a request (BR-011-002). The description is sanitized against XSS
/// and create/flag are rate-limited (anti-abuse). Flagged requests enter moderation
/// (US-016, BR-011-005). This maps the endpoints + contracts; filtering/paging,
/// the atomic capacity check, owner checks, sanitization, and audit live in the
/// Application/Infrastructure layers.
/// </summary>
public static class BuddiesEndpoints
{
    public static IEndpointRouteBuilder MapBuddiesEndpoints(this IEndpointRouteBuilder group)
    {
        var buddies = group.MapGroup("/buddies");

        // Filtered + paged discovery (kind, city, category, budget, cursor).
        buddies.MapGet("", (string? kind, string? city, string? category, string? budget, string? cursor) =>
            Results.Ok(new { items = Array.Empty<object>(), nextCursor = (string?)null }))
            .WithName("ListBuddies")
            .WithSummary("Browse buddy requests (filtered + paged).");

        // Create a request; the caller becomes owner + first participant.
        // TODO(US-011-BE): validate (VR-011-*), sanitize description, throttle, audit.
        buddies.MapPost("", (BuddyCreateRequest req) => Results.Created("/api/v1/buddies", new { }))
            .WithName("CreateBuddy")
            .WithSummary("Post a buddy request (auth required).");

        buddies.MapGet("/{id}", (string id) => Results.Ok(new { id }))
            .WithName("GetBuddy");
        buddies.MapPatch("/{id}", (string id, BuddyPatchRequest req) => Results.NoContent())
            .WithName("UpdateBuddy"); // owner only (edit/close)
        buddies.MapDelete("/{id}", (string id) => Results.NoContent())
            .WithName("DeleteBuddy"); // owner only

        // Atomic join/leave (capacity race-safe, BR-011-002).
        buddies.MapPost("/{id}/join", (string id) => Results.NoContent()).WithName("JoinBuddy");
        buddies.MapPost("/{id}/leave", (string id) => Results.NoContent()).WithName("LeaveBuddy");

        // Flag for moderation (→ US-016).
        buddies.MapPost("/{id}/flag", (string id, FlagRequest req) => Results.Accepted())
            .WithName("FlagBuddy")
            .WithSummary("Report a request for moderation.");

        return group;
    }
}

public sealed record BuddyCreateRequest(
    string Kind,        // FULL_TRIP | MEETUP
    string Title,
    string City,
    string DateFrom,
    string DateTo,
    string Category,    // GENERAL | YOUTH | WOMEN | FAMILIES
    string Budget,      // LOW | MEDIUM | HIGH
    int Capacity,
    string Description);

public sealed record BuddyPatchRequest(string? Title, string? Description, bool? Closed);
public sealed record FlagRequest(string? Reason);
