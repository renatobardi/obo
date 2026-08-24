# ADR-008: The frontend defaults to same-origin API calls, never guesses a host from request headers

- **Status**: Accepted
- **Date**: 2026-08
- **Related**: #11

## Context

The frontend's `/config` endpoint told the browser where to reach the API. When `API_URL`/`NEXT_PUBLIC_API_URL` wasn't set, it guessed `${proto}://${hostname}:5055` from the incoming request's `Host`/`X-Forwarded-Proto` headers — both client-controlled. That guess broke the documented single-exposed-port reverse-proxy deployment (only the frontend's port is public; `5055` isn't reachable directly), and required a page of hostname/IPv6 validation to keep the guess from becoming a redirect-to-attacker-host vector, since the resulting URL is what the browser then fetches with its auth bearer token.

## Decision

**When no explicit `API_URL`/`NEXT_PUBLIC_API_URL` is set, the frontend calls `/api/*` same-origin. There is no header-based auto-detection of any kind.** `next.config.ts`'s existing rewrite (`INTERNAL_API_URL`, default `http://localhost:5055`) already forwards same-origin `/api/*` calls to the backend server-side, for every deployment shape this project documents — plain `docker compose up`, single-container, and single-port-behind-a-reverse-proxy. `API_URL` is now only for the genuine exception: a split-origin deployment, or a reverse proxy that routes `/api/*` to the API port directly instead of letting the frontend's rewrite handle it.

## Alternatives considered

- **Keep auto-detection, prefer same-origin only as a secondary guess** — rejected: still means trusting `Host` to build a URL in some code path, keeping the validation surface alive for a case (guessing a *different* port than the one the browser already connected on) that no documented deployment needs.
- **Keep auto-detection for backward compatibility** — rejected: it was actively wrong for the recommended reverse-proxy deployment, not just imperfect: it broke a real production install (#8) that had a healthy backend the whole time.

## Consequences

- One less place in the codebase that trusts a client-controlled header to construct a URL the client will then fetch.
- Anyone relying on the old auto-detected `:5055` guess (e.g. depending on it to reach the API on a different port without setting anything) now needs `API_URL` set explicitly. Documented across `docs/5-CONFIGURATION/`.
- `frontend/src/app/config/route.ts` shrank from ~115 lines (hostname/IPv6 validation, header parsing) to a 3-line handler; `frontend/src/lib/config.ts`'s own same-origin smart default (already written, previously unreachable) is now the effective behavior whenever no env var is set.
