# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- SurrealDB v3 support (tested on v3.3.0, still runs on v2): migrations parse on v3, search functions follow v3 grouping semantics, local stacks use v3.3.0 with `surrealkv` (ADR-011).
- `SURREAL_AUTH_LEVEL=database` signs the app and the job worker in with a database-level user.

### Fixed

- Migrations fail when any statement fails, not only the first.
- Source list `insights_count` on SurrealDB v3.

- Initial release.
