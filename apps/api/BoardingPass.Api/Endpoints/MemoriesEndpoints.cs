namespace BoardingPass.Api.Endpoints;

/// <summary>
/// US-013-BE-001 memories, sharing &amp; report export. Media lives in Firebase
/// Storage under <c>memories/{tripId}/…</c> and access requires trip membership
/// (or an authorized viewer token for a shared trip), enforced by Storage Rules
/// and server authorization (BR-013-001). Uploads go through a signed-URL flow and
/// are validated by MIME allowlist + size caps, EXIF-stripped, and virus-scanned
/// (BR-013-004); a member may delete their own media and the owner may delete any
/// (BR-013-002). Share links are capability-bearing but scoped and revocable
/// (BR-013-005). The report composes itinerary + finance summary into a PDF and/or
/// shareable link. This maps the endpoints + contracts; the upload pipeline, report
/// composition, and audit live in the Application/Infrastructure layers.
/// </summary>
public static class MemoriesEndpoints
{
    public static IEndpointRouteBuilder MapMemoriesEndpoints(this IEndpointRouteBuilder group)
    {
        var trip = group.MapGroup("/trips/{tripId}");

        // List media (membership- or shared-viewer-scoped). Signed URLs returned.
        trip.MapGet("/memories", (string tripId) => Results.Ok(Array.Empty<MemoryResponse>()))
            .WithName("ListMemories")
            .WithSummary("List trip media (signed URLs).");

        // Register uploaded media metadata after the signed-URL PUT completes.
        // TODO(US-013-BE): validate MIME/size/scan, EXIF-strip, audit.
        trip.MapPost("/memories", (string tripId, MemoryRequest req) =>
            Results.Created($"/api/v1/trips/{tripId}/memories", new { }))
            .WithName("AddMemory")
            .WithSummary("Register uploaded media metadata (member+).");

        trip.MapDelete("/memories/{id}", (string tripId, string id) => Results.NoContent())
            .WithName("DeleteMemory")
            .WithSummary("Delete media (own; owner deletes any).");

        // Create/rotate a scoped, revocable viewer share token (owner only).
        trip.MapPost("/share", (string tripId) =>
            Results.Ok(new { url = $"https://boardingpass.app/shared/{tripId}" }))
            .WithName("CreateShareLink")
            .WithSummary("Create a scoped, revocable share link (owner only).");
        trip.MapDelete("/share", (string tripId) => Results.NoContent())
            .WithName("RevokeShareLink");

        // Compose the trip report (itinerary + finance summary) as PDF and/or link.
        trip.MapPost("/report", (string tripId, ReportRequest req) =>
            Results.Ok(new { format = req.Format, url = (string?)null }))
            .WithName("ExportReport")
            .WithSummary("Export the trip report (PDF or shareable link).");

        return group;
    }
}

public sealed record MemoryRequest(string Type, string Name, string Day, string Place); // type: image|video
public sealed record MemoryResponse(string Id, string Type, string Url, string Name, string UploaderUid, string Day, string Place);
public sealed record ReportRequest(string Format); // PDF | LINK
