namespace BoardingPass.Api.Endpoints;

/// <summary>
/// US-008-BE-001 tasks &amp; packing. Tenant-scoped to <c>tripId</c>; any member may
/// create/toggle/delete (collaborative, BR-008-003), VIEWER is read-only, all
/// server-enforced. Invariants applied server-side: template apply dedupes by
/// (label, category) so it never creates duplicates (BR-008-002), and a task whose
/// assignee is no longer a member becomes unassigned rather than deleted
/// (BR-008-001). Completion state is shared in realtime (Firestore snapshots
/// guarded by rules). This maps the endpoints + contracts; dedupe, assignee
/// integrity, and audit live in the Application/Infrastructure layers.
/// </summary>
public static class TasksEndpoints
{
    public static IEndpointRouteBuilder MapTasksEndpoints(this IEndpointRouteBuilder group)
    {
        var trip = group.MapGroup("/trips/{tripId}");

        // Full board (tasks + packing + bookings checklist). Any member reads.
        trip.MapGet("/tasks-board", (string tripId) => Results.Ok(new { tripId }))
            .WithName("GetTasksBoard")
            .WithSummary("Get the trip's tasks, packing, and bookings checklist.");

        // Tasks. TODO(US-008-BE): validate title (VR-008-001), assignee ∈ members, audit.
        trip.MapPost("/tasks", (string tripId, TaskRequest req) => Results.Created($"/api/v1/trips/{tripId}/tasks", new { }))
            .WithName("AddTask");
        trip.MapPatch("/tasks/{id}/toggle", (string tripId, string id) => Results.NoContent()).WithName("ToggleTask");
        trip.MapDelete("/tasks/{id}", (string tripId, string id) => Results.NoContent()).WithName("DeleteTask");

        // Packing. Manual add + idempotent template apply (server dedupes, BR-008-002).
        trip.MapPost("/packing", (string tripId, PackRequest req) => Results.Created($"/api/v1/trips/{tripId}/packing", new { }))
            .WithName("AddPackingItem");
        trip.MapPatch("/packing/{id}/toggle", (string tripId, string id) => Results.NoContent()).WithName("TogglePackingItem");
        trip.MapDelete("/packing/{id}", (string tripId, string id) => Results.NoContent()).WithName("DeletePackingItem");
        trip.MapPost("/packing/template", (string tripId, TemplateRequest req) => Results.Ok(new { added = 0 }))
            .WithName("ApplyPackingTemplate")
            .WithSummary("Apply a packing template; server dedupes by label+category.");

        // Bookings checklist toggle.
        trip.MapPatch("/bookings/{id}/toggle", (string tripId, string id) => Results.NoContent()).WithName("ToggleBooking");

        return group;
    }
}

public sealed record TaskRequest(string Title, string? AssigneeUid);
public sealed record PackRequest(string Label, string Category); // CLOTHES|ELECTRONICS|MEDS|DOCS
public sealed record TemplateItem(string Label, string Category);
public sealed record TemplateRequest(TemplateItem[] Items);
