namespace BoardingPass.Api.Endpoints;

/// <summary>
/// US-012-BE-001 explore &amp; recommendations. Place data comes from a Maps/Places
/// provider through a SERVER-SIDE proxy: the provider key lives only on the server
/// and responses are cached (BR-012-004) — no key is ever exposed to the client
/// (AC6). Places are curated/read-mostly; ratings aggregate user experiences
/// (BR-012-001). A user may rate a place once and update it (1–5, BR-012-002);
/// review text is sanitized against XSS (VR-012-002) and abusive reviews are
/// moderated (US-016). "Add to trip" requires the caller to be a member of the
/// target trip and delegates to the US-006 itinerary (BR-012-003). This maps the
/// endpoints + contracts; the proxy/cache, aggregation, sanitization, membership
/// check, and audit live in the Application/Infrastructure layers.
/// </summary>
public static class PlacesEndpoints
{
    public static IEndpointRouteBuilder MapPlacesEndpoints(this IEndpointRouteBuilder group)
    {
        var places = group.MapGroup("/places");

        // Browse/search via the cached provider proxy (filtered + paged).
        places.MapGet("", (string? category, string? q, string? cursor) =>
            Results.Ok(new { items = Array.Empty<object>(), nextCursor = (string?)null }))
            .WithName("ListPlaces")
            .WithSummary("Browse/search curated places (server proxy, cached).");

        places.MapGet("/{id}", (string id) => Results.Ok(new { id }))
            .WithName("GetPlace")
            .WithSummary("Place detail: photos, rating, reviews (cached proxy).");

        // Rate/review a place (auth). Idempotent per user — creates or updates the
        // caller's single review. TODO(US-012-BE): validate 1..5, sanitize, aggregate, audit.
        places.MapPost("/{id}/reviews", (string id, ReviewRequest req) =>
            Results.Ok(new { id }))
            .WithName("AddOrUpdateReview")
            .WithSummary("Rate/review a place (auth; one review per user).");
        places.MapDelete("/{id}/reviews/me", (string id) => Results.NoContent())
            .WithName("DeleteMyReview");

        // Add a place to a trip's itinerary as an activity (member of target only).
        places.MapPost("/{id}/add-to-trip", (string id, AddToTripBody body) =>
            Results.Accepted())
            .WithName("AddPlaceToTrip")
            .WithSummary("Add a place to a trip's itinerary (member only → US-006).");

        return group;
    }
}

public sealed record ReviewRequest(int Rating, string? Text); // Rating 1..5
public sealed record AddToTripBody(string TripId, string City, string? Day);
