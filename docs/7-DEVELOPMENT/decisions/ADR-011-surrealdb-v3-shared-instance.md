# ADR-011: SurrealDB v3 and the shared oute-surreal-db instance

- **Status**: Accepted
- **Date**: 2026-11

## Context

Production ran its own SurrealDB 2.6.5 next to the app. The maintainer's infrastructure moves app state to shared database platforms (oute-infra-ops ADR-0003): SurrealDB v3.3.0 (`surrealkv` engine) in `oute-surreal-db`, one namespace per app, **database-level users only** (`app_` OWNER, `rw_` EDITOR, `ro_` VIEWER). Upstream Open Notebook still pins SurrealDB v2, so the port is fork work.

Measured against a real v3.3.0 server, the v2 code breaks in these places:

- v2 index syntax (`SEARCH ANALYZER … BM25`) and `type::is::*` / `type::thing()` no longer parse;
- reading or updating a table that does not exist is an error (it returned nothing in v2), so a fresh database failed in migrations 1, 6 and 7 and the worker failed before the first job;
- a selected field that is neither grouped nor aggregated comes back as an array, so `fn::text_search` and `fn::vector_search` returned array titles, duplicate rows and empty `matches`;
- `SELECT VALUE count() … GROUP ALL` returns numbers (v2 ignored `VALUE`), which zeroed the source list's `insights_count`;
- obo and surreal-commands signed in as root-level users, which the shared instance does not issue;
- a subquery inside `UPDATE … SET` loses `$parent` when its filter hits an index, so migration 20 turned every speaker reference into NONE (`SELECT` subqueries are fine);
- `DEFINE INDEX … CONCURRENTLY` builds in the background; inserts in the same migration (7) then fail with a transaction write conflict;
- separately, the migration runner checked only the first statement of each file, so most failures passed silently.

## Decision

- Edit the old migrations only where v3 cannot parse or execute them on a fresh database (1, 5_down, 6, 7, 10, 18, 20, 21, 22; `$parent` updates rewritten as `FOR` loops; `CONCURRENTLY` dropped because those migrations only run on fresh, empty databases now). Behavior on databases that already applied them is unchanged.
- New migrations: 27 declares the `command` table; 28 redefines both search functions with v3 grouping semantics and the same output shape. Both also run on v2.
- `bump_version` binds the migration record id as a value (works on v2 and v3). The runner fails when any statement fails.
- `SURREAL_AUTH_LEVEL=database` makes obo **and surreal-commands** sign in with namespace + database. surreal-commands is not forked: obo wraps the SDK factories that library imported. Default `root` keeps local compose working.
- Keep the Python SDK `surrealdb` 1.0.8. It works against v3 for everything obo and surreal-commands use (signin with ns/db, query, RecordID, live queries). SDK 3.x changes `query()` (returns every statement, raises instead of returning error strings) and surreal-commands is written against the 1.x API: upgrading is a separate change.
- Local stacks (compose, single-container image, docs) use v3.3.0 with `surrealkv`, on a new store path so an old v2 store is never opened by v3.
- `tests/test_surrealdb_v3_integration.py` runs migrations from zero, all the way down and up again, plus the search functions and the surreal-commands signin, against a real v3 server with a database-level user. CI runs it.

## Consequences

- The code runs on v2 and v3, so it can deploy before the data moves; the database cutover is only configuration (`SURREAL_URL`, `SURREAL_DATABASE=prd`, `SURREAL_AUTH_LEVEL=database`, `app_prd` credentials).
- BM25 scores differ slightly between v2 and v3 and v3 clamps negative scores to 0; ranking within a result set is otherwise the same.
- A fresh database needs v3 (migration 1 uses the v3 index syntax); an existing v2 database keeps working and only applies 27 and 28.
- Local v2 stores need export/import to move to v3.
- When the wrapper for surreal-commands stops matching the library (new major version), the queue fails to authenticate in database mode: the integration test catches it.
