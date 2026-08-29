# ADR-010: Production deploys are built and executed by GitHub Actions

- **Status**: Accepted
- **Date**: 2026-08

## Context

The maintainer production instance requires Firebase client configuration at image build time. Building that image manually inside the ARM64 production LXC made deployments slow, unauditable, architecture-sensitive, and dependent on local scripts that had drifted from the real environment.

## Decision

After all repository tests pass for a push to `main`, GitHub Actions builds a production-specific ARM64 image, pushes it under an immutable commit tag, and deploys its exact digest. A GitHub-hosted runner joins the private network through an ephemeral Tailscale `tag:ci` identity and uses a restricted SSH key whose forced command can only deploy Obo. The host pulls the image; it never builds application code. Deployment updates only the combined Obo API/frontend/worker service, checks internal and public health, and restores the previously tagged image on failure.

## Alternatives considered

- **Continue building inside production** — rejected because production is a poor build host and the result is not reproducible or auditable.
- **Use the public `v1-dev` image** — rejected because it intentionally has no deployment-specific Firebase client configuration.
- **Install a permanent self-hosted Actions runner** — rejected because it adds an always-on privileged agent and maintenance burden; ephemeral Tailscale access has a smaller operational surface.

## Consequences

- Production deploys become automatic after green `main` builds and serialized through one concurrency group.
- Tailscale must restrict `tag:ci` to SSH on `oute-server`, and the production GitHub environment owns the network and SSH credentials.
- Image rollback is reliable for application-only changes. Database migrations still require forward-compatible design because reverting the container does not revert an applied schema migration.
