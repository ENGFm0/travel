namespace BoardingPass.Api.Endpoints;

/// <summary>
/// US-006-BE-001 itinerary: cities, days &amp; activities under a trip. All routes
/// are tenant-scoped to <c>tripId</c> and role-gated server-side: TRIP_MEMBER /
/// TRIP_OWNER may write, TRIP_VIEWER is read-only (BR-006-003). Business rules
/// enforced server-side (not the client): city order defines the route and
/// reorder re-derives it (BR-006-001), a day belongs to exactly one city with its
/// date in range (BR-006-002), and deleting a city cascades its days/activities
/// with a soft warning on linked expenses/memories (BR-006-004). Reorder and
/// cascade delete run in transactions; realtime reads are served by Firestore
/// snapshots guarded by security rules. This maps the endpoints + contracts.
/// </summary>
public static class ItineraryEndpoints
{
    public static IEndpointRouteBuilder MapItineraryEndpoints(this IEndpointRouteBuilder group)
    {
        var trip = group.MapGroup("/trips/{tripId}");

        // Full board (cities → days → activities). Any member (incl. viewer) reads.
        trip.MapGet("/itinerary", (string tripId) =>
            Results.Ok(new { tripId, cities = Array.Empty<object>() }))
            .WithName("GetItinerary")
            .WithSummary("Get the trip's cities/days/activities board.");

        // Cities. TODO(US-006-BE): validate (VR-006-001), assign order, audit.
        trip.MapPost("/cities", (string tripId, CityWriteRequest req) => Results.Created($"/api/v1/trips/{tripId}/cities", new { }))
            .WithName("AddCity");
        trip.MapPatch("/cities/{cityId}", (string tripId, string cityId, CityWriteRequest req) => Results.NoContent())
            .WithName("UpdateCity");
        trip.MapPatch("/cities/{cityId}/move", (string tripId, string cityId, MoveRequest req) => Results.NoContent())
            .WithName("MoveCity"); // reorder route (transactional)
        trip.MapDelete("/cities/{cityId}", (string tripId, string cityId) => Results.NoContent())
            .WithName("DeleteCity"); // cascades days/activities

        // Days. TODO(US-006-BE): validate (VR-006-002 date within city), audit.
        trip.MapPost("/cities/{cityId}/days", (string tripId, string cityId, DayWriteRequest req) => Results.Created($"/api/v1/trips/{tripId}/cities/{cityId}/days", new { }))
            .WithName("AddDay");
        trip.MapDelete("/cities/{cityId}/days/{dayId}", (string tripId, string cityId, string dayId) => Results.NoContent())
            .WithName("DeleteDay");

        // Activities. TODO(US-006-BE): validate (VR-006-003), audit.
        trip.MapPost("/cities/{cityId}/days/{dayId}/activities", (string tripId, string cityId, string dayId, ActivityWriteRequest req) => Results.Created($"/api/v1/trips/{tripId}/cities/{cityId}/days/{dayId}/activities", new { }))
            .WithName("AddActivity");
        trip.MapDelete("/cities/{cityId}/days/{dayId}/activities/{activityId}", (string tripId, string cityId, string dayId, string activityId) => Results.NoContent())
            .WithName("DeleteActivity");

        return group;
    }
}

public sealed record CityWriteRequest(string? Name, string? Flight, string? Hotel, string? DateFrom, string? DateTo);
public sealed record MoveRequest(int Dir); // -1 earlier, +1 later
public sealed record DayWriteRequest(string Title, string? Date);
public sealed record ActivityWriteRequest(string Title, string? Time);
