namespace BoardingPass.Api.Endpoints;

/// <summary>
/// US-003-BE-001 trip-creation surface. The authenticated caller becomes the
/// trip's TRIP_OWNER; the server writes trips/{tripId} plus the owner membership
/// document and (optionally) invitation records — all under Firestore security
/// rules and server-side authorization. Auth, validation, ownership assignment,
/// and persistence live in the Application/Infrastructure layers; this maps the
/// endpoint + request/response contract that the web/mobile clients call.
/// </summary>
public static class TripsEndpoints
{
    public static IEndpointRouteBuilder MapTripsEndpoints(this IEndpointRouteBuilder group)
    {
        var trips = group.MapGroup("/trips");
        // .RequireAuthorization() once the auth policy from US-001 is wired.

        // Create a trip. Server assigns Id/OwnerUid/Status authoritatively and
        // ignores any client-supplied values for those fields.
        // TODO(US-003-BE-001): validate payload, persist, assign creator as TRIP_OWNER.
        trips.MapPost("", (CreateTripRequest req) =>
            Results.Created($"/api/v1/trips/{Guid.Empty}", new TripResponse(
                Id: Guid.Empty.ToString(),
                Title: req.Title,
                Type: req.Type,
                DateFrom: req.DateFrom,
                DateTo: req.DateTo,
                Cities: req.Cities,
                OwnerUid: "me",
                Status: "ACTIVE")))
            .WithName("CreateTrip")
            .WithSummary("Create a trip; the authenticated caller becomes its owner.");

        return group;
    }
}

public sealed record TripCityDto(string Name, string? DateFrom, string? DateTo);

public sealed record CreateTripRequest(
    string Title,
    string Type,               // DOMESTIC | INTERNATIONAL
    string DateFrom,
    string? DateTo,
    TripCityDto[] Cities,
    string[]? Invitees);

public sealed record TripResponse(
    string Id,
    string Title,
    string Type,
    string DateFrom,
    string? DateTo,
    TripCityDto[] Cities,
    string OwnerUid,
    string Status);
