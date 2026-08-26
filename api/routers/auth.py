"""
Authentication router for Obo API.
Provides endpoints to check authentication status and, in Firebase mode,
complete first-time signup.
"""

from typing import Optional

from fastapi import APIRouter, Request

from api import invite_service
from api.auth import get_auth_mode
from api.models import InviteRedeemRequest
from obo.domain.tenant import Tenant, User
from obo.exceptions import AuthenticationError, InvalidInputError, NotFoundError
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
async def complete_signup(
    request: Request, payload: Optional[InviteRedeemRequest] = None
):
    """
    Provision a tenant for a first-time Firebase identity, or redeem an
    invite to join an existing tenant.

    FirebaseAuthMiddleware verifies the ID token and, for this path only,
    lets a request through even with no matching `user:` row - setting
    request.state.firebase_uid and firebase_email so this handler doesn't
    re-verify the token.

    An identity that already has a `user:` row just gets its existing
    tenant/user back (idempotent). New identities create their own tenant
    unless a pending, unexpired, unrevoked, unconsumed invite token is
    provided and the verified email matches the invite's email - then they
    join that invite's tenant as a member.
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

    email = getattr(request.state, "firebase_email", None)
    token = payload.invite_token if payload else None

    if token:
        try:
            user = await invite_service.redeem_invite(token, email or "", uid)
        except InvalidInputError as exc:
            # Let the frontend distinguish "bad/mismatched invite" from other
            # errors by returning a 400 with a clear message.
            raise InvalidInputError(str(exc)) from exc
        return {"user_id": user.id, "tenant_id": user.tenant, "created": True}

    tenant = Tenant()
    await tenant.save()
    assert tenant.id is not None

    user = await User.provision(uid, tenant.id, email=email)

    tenant.owner = user.id
    await tenant.save()

    return {"user_id": user.id, "tenant_id": tenant.id, "created": True}