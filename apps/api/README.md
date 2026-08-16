# apps/api — BoardingPass Backend (US-014-BE-001 shell)

ASP.NET Core Web API (**.NET 10 LTS**, Clean Architecture) — this is the
**cross-cutting shell** that US-014 requires; feature logic arrives in later
stories (US-001 auth, US-003 trips, …).

## What this shell provides
- **Unified error contract** (`Common/ApiError.cs`) shared with Web/Mobile (architecture §8).
- **Centralized exception handling** → contract (no stack traces/secrets leaked).
- **Security headers** middleware (US-014-SEC-001).
- **Versioned API** surface (`/api/v1`) via route groups.
- **OpenAPI** (built-in .NET 10) at `/openapi/v1.json` (dev).
- **Health** (`/api/v1/health`) and public **config** (`/api/v1/config`, no secrets).
- **CORS** allow-list from configuration.

## Planned layering (added by feature stories)
```
BoardingPass.Domain          entities, value objects, domain rules
BoardingPass.Application      use-cases/services, DTOs, validators, interfaces
BoardingPass.Infrastructure   Firebase Admin repositories, external clients, FCM
BoardingPass.Api             thin controllers/minimal-APIs (this project)
BoardingPass.Tests           unit + integration (WebApplicationFactory<Program>)
```
Controllers stay thin (no business logic). AuthN = Firebase ID-token validation
(Admin SDK); AuthZ = policy handlers resolving global role + per-trip membership
(01-roles-and-permissions). Rate limiting, audit, and Firebase wiring come with
US-001 and the feature stories.

## Run (locally, once .NET 10 SDK is installed)
```bash
cd apps/api/BoardingPass.Api
dotnet restore
dotnet run
# GET http://localhost:5xxx/api/v1/health   -> Healthy
# GET http://localhost:5xxx/api/v1/config    -> { app, version, locales, ... }
# GET http://localhost:5xxx/openapi/v1.json  -> OpenAPI document (dev)
```

> ⚠️ **Sandbox note:** this scaffold was **authored but not compiled** in the
> build environment (no .NET SDK available there). It targets .NET 10 minimal
> APIs and is expected to `dotnet restore && dotnet run` on a machine with the
> .NET 10 SDK. Package versions (e.g. `Microsoft.AspNetCore.OpenApi`) may need a
> minor pin to the installed 10.x. No secrets are committed.
