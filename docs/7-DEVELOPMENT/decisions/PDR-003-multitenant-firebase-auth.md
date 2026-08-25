# PDR-003: Multitenant with Firebase Auth (Google + email)

- **Status**: Accepted
- **Date**: 2026-08
- **Related**: [PDR-001](PDR-001-single-user-first.md) (superseded), [VISION.md](../../../VISION.md) (Current Posture), [wayfinder map #14](https://github.com/renatobardi/obo/issues/14)

## Context

PDR-001 kept Obo single-user "for now," directional rather than a verdict, pending the multi-user vision call — auth, data scoping, and what "multi-user" means for a privacy-first self-hosted tool. Wanting multitenancy plus Google/email login via Firebase is that vision call being made. It was explored breadth-first as a [wayfinder map](https://github.com/renatobardi/obo/issues/14) — nine resolved decision tickets covering the tenant model, data isolation, auth-mode coexistence, schema, backend integration, and invite delivery; each ticket holds the full reasoning, this record states the rule.

## Decision

- **Tenant = an account with N users.** One model serves both a household/team self-host and an operator hosting multiple clients — no separate SaaS-org concept.
- Within a tenant: AI-provider credentials and app config (`Credential`, `ContentSettings`, `DefaultModels`) are **tenant-scoped and shared**; notebooks, sources, and notes are **user-scoped and isolated**. `owner`/`tenant` are denormalized onto every scoped entity.
- **Firebase Auth is required only for multitenant mode.** The existing single-password mode is untouched and keeps working with no Google dependency. One instance runs exactly one mode, chosen at deploy time — never both at once.
- Every deployment's schema gains `tenant_id`/`owner_id` **unconditionally** (one schema, not two); password-mode installs get a fixed `tenant:default`/`user:default` sentinel via migration.
- Creating a tenant is free and self-serve; joining an existing one is **invite-only** by its owner (link-based, email-bound, 7-day expiry, revocable — no SMTP dependency). A user belongs to exactly one tenant; each tenant has one owner and N members.
- The backend verifies Firebase ID tokens in a middleware (same shape as today's `PasswordAuthMiddleware`), propagates tenant/user context via a `contextvars.ContextVar` read by the domain base classes (no per-route signature changes), and provisions first-time logins through a dedicated `complete-signup` endpoint rather than inline in the middleware.

## Alternatives considered

- **SaaS multi-org as a distinct concept from household** — rejected; one tenant model covers both without forcing a monetization decision now.
- **Pluggable auth providers** (Firebase as one of several) — rejected as premature abstraction; Firebase is mandatory for multitenant mode specifically because the password mode already covers the no-Google-dependency case.
- **Credentials shared across all tenants, or per-user instead of per-tenant** — rejected; scoping stops at the tenant boundary, and within a tenant credentials stay shared (household model) rather than per-member.
- **Obo-hosted AI provider / billing** — explicitly out of scope for this record; deferred to a future effort once the core model works.

## Consequences

- This moves the VISION.md Horizon's "Multi-user" cluster from considered to decided — see the paired Current Posture edit.
- `RecordModel` (today's global-singleton pattern) must evolve to support one instance per tenant — a breaking change to that base class, left to the spec phase.
- Self-hosters who opt into multitenant mode take on a Firebase/Google Cloud dependency; those who don't are unaffected — the privacy-first, no-hard-cloud-dependency promise holds for the password-mode path.
- Nearly every write-path route gains implicit tenant/owner scoping via context propagation instead of explicit parameters — a route that forgets to scope is no longer a bug category, but the mechanism is less traceable by reading a route in isolation.
