"""
Tenant/owner scoping context for the multitenant prefactor (issue #26, PDR-003).

A later ticket wires a request-scoped auth middleware that sets these
ContextVars from the verified Firebase token (or the password-mode default).
Until then - and for background commands/workers, which run in their own
process and never inherit a request's context - every read/write falls back
to the fixed `tenant:default`/`user:default` sentinel created by migration 24,
so password-mode installs keep behaving exactly as before.
"""

import contextvars

DEFAULT_TENANT_ID = "tenant:default"
DEFAULT_USER_ID = "user:default"

current_tenant: contextvars.ContextVar[str] = contextvars.ContextVar(
    "current_tenant", default=DEFAULT_TENANT_ID
)
current_user: contextvars.ContextVar[str] = contextvars.ContextVar(
    "current_user", default=DEFAULT_USER_ID
)


def get_current_tenant() -> str:
    """Return the current request's tenant id, or the default sentinel."""
    return current_tenant.get()


def get_current_user() -> str:
    """Return the current request's user id, or the default sentinel."""
    return current_user.get()


def scoped_record_id(base_record_id: str, tenant: str) -> str:
    """Compute a RecordModel singleton's actual DB record id for a tenant.

    The default tenant keeps the historical unsuffixed id, so existing
    singleton rows (content_settings, default_models, ...) from password-mode
    installs need no data migration - they simply become "the default
    tenant's" row. Any other tenant gets its own row via an id suffix.
    """
    if tenant == DEFAULT_TENANT_ID:
        return base_record_id
    tenant_suffix = tenant.split(":", 1)[-1]
    return f"{base_record_id}_{tenant_suffix}"
