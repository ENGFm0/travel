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
                Status: "ACTIVE",
                Progress: 0)))
            .WithName("CreateTrip")
            .WithSummary("Create a trip; the authenticated caller becomes its owner.");

        // List the caller's trips, membership-filtered, split by lifecycle scope.
        // TODO(US-005-BE-001): query Firestore by membership, compute progress
        // (BR-005-001), paginate.
        trips.MapGet("", (string? scope) =>
            Results.Ok(Array.Empty<TripResponse>()))
            .WithName("ListTrips")
            .WithSummary("List the caller's trips (scope: upcoming|past|archived|all).");

        // Archive/restore (status change). Owner-only; enforced server-side.
        // TODO(US-005-BE-001): validate transition (ACTIVE<->ARCHIVED), authorize
        // owner, audit TRIP_ARCHIVE/RESTORE.
        trips.MapPatch("/{id}/status", (string id, UpdateStatusRequest req) =>
            Results.Ok(new { id, status = req.Status }))
            .WithName("UpdateTripStatus")
            .WithSummary("Archive or restore a trip (owner only).");

        // Soft-delete. Owner-only; members lose access immediately (BR-005-003).
        // TODO(US-005-BE-001): authorize owner, set status=DELETED, audit.
        trips.MapDelete("/{id}", (string id) => Results.NoContent())
            .WithName("DeleteTrip")
            .WithSummary("Soft-delete a trip (owner only).");

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

public sealed record UpdateStatusRequest(string Status); // ARCHIVED | ACTIVE

public sealed record TripResponse(
    string Id,
    string Title,
    string Type,
    string DateFrom,
    string? DateTo,
    TripCityDto[] Cities,
    string OwnerUid,
    string Status,
    int Progress);
