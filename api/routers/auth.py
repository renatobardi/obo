"""
Authentication router for Obo API.
Provides endpoints to check authentication status and, in Firebase mode,
complete first-time signup.
"""

from fastapi import APIRouter, Request

from api.auth import get_auth_mode
from obo.domain.tenant import Tenant, User
from obo.exceptions import AuthenticationError, NotFoundError
from obo.utils.encryption import get_secret_from_env

router = APIRouter(prefix="/auth", tags=["auth"])


@router.get("/status")
async def get_auth_status():
    """
    Report which auth mode is active and whether it's currently enforced.

    Password mode: "auth_enabled" reflects whether OBO_PASSWORD is set
    (Docker secrets via OBO_PASSWORD_FILE supported). Firebase mode is
    always enforced once selected.
    """
    mode = get_auth_mode()
    if mode == "firebase":
        return {
            "auth_enabled": True,
            "mode": "firebase",
            "message": "Firebase authentication is required",
        }

    auth_enabled = bool(get_secret_from_env("OBO_PASSWORD"))
    return {
        "auth_enabled": auth_enabled,
        "mode": "password",
        "message": "Authentication is required"
        if auth_enabled
        else "Authentication is disabled",
    }


@router.post("/complete-signup")
async def complete_signup(request: Request):
    """
    Provision a tenant for a first-time Firebase identity.

    FirebaseAuthMiddleware verifies the ID token and, for this path only,
    lets a request through even with no matching `user:` row - setting
    request.state.firebase_uid so this handler doesn't re-verify the token.
    An identity that already has a `user:` row just gets its existing
    tenant/user back (idempotent - the frontend can call this unconditionally
    on first load without creating a second tenant on a page refresh).

    Invite matching (join an existing tenant instead of creating one) is not
    implemented yet - that's a separate ticket in the multitenant epic - so
    every new identity self-serves a new tenant, per PDR-003 ("creating a new
    tenant is free and self-serve").
    """
    uid = getattr(request.state, "firebase_uid", None)
    if not uid:
        raise AuthenticationError(
            "This endpoint requires Firebase authentication mode"
        )

    try:
        user = await User.get(f"user:{uid}")
        return {"user_id": user.id, "tenant_id": user.tenant, "created": False}
    except NotFoundError:
        pass

    tenant = Tenant()
    await tenant.save()
    assert tenant.id is not None

    user = await User.provision(uid, tenant.id)

    tenant.owner = user.id
    await tenant.save()

    return {"user_id": user.id, "tenant_id": tenant.id, "created": True}