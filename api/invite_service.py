"""
Invite and tenant-member management (#29).

All owner-only functions load the current tenant and verify the current user
matches `tenant.owner` before acting. Invite redemption is intentionally
separate from owner flows and is called by `complete-signup`.
"""

from typing import List

from obo.database.repository import repo_query
from obo.domain.invite import Invite
from obo.domain.tenancy import get_current_tenant, get_current_user
from obo.domain.tenant import Tenant, User
from obo.exceptions import AuthenticationError, InvalidInputError, NotFoundError


def _normalise_email(email: str) -> str:
    return email.strip().lower()


async def _require_owner(tenant_id: str, user_id: str) -> None:
    tenant = await Tenant.get(tenant_id)
    if str(tenant.owner) != user_id:
        raise AuthenticationError("Only the tenant owner can manage invites")


async def create_invite(email: str) -> Invite:
    """Owner-only: create a pending invite for an email address."""
    tenant_id = get_current_tenant()
    user_id = get_current_user()
    await _require_owner(tenant_id, user_id)

    normalised = _normalise_email(email)
    if "@" not in normalised or "." not in normalised.split("@")[-1]:
        raise InvalidInputError("A valid email address is required")

    return await Invite.create_for_email(normalised, tenant_id)


async def list_pending_invites() -> List[Invite]:
    """Owner-only: list pending, unexpired, unrevoked invites for the tenant."""
    tenant_id = get_current_tenant()
    user_id = get_current_user()
    await _require_owner(tenant_id, user_id)

    invites = await Invite.get_all()
    return [i for i in invites if i.is_pending]


async def revoke_invite(token: str) -> Invite:
    """Owner-only: mark an invite as revoked."""
    tenant_id = get_current_tenant()
    user_id = get_current_user()
    await _require_owner(tenant_id, user_id)

    invite = await Invite.get_by_token(token)
    if str(invite.tenant) != tenant_id:
        raise NotFoundError("Invite not found")

    invite.revoked = True
    await invite.save()
    return invite


async def preview_invite(token: str) -> Invite:
    """Public: read an invite by token for the landing page."""
    invite = await Invite.get_by_token(token)
    if not invite.is_pending:
        raise InvalidInputError("Invite is no longer valid")
    return invite


async def list_members() -> List[User]:
    """Owner-only: list users in the current tenant."""
    tenant_id = get_current_tenant()
    user_id = get_current_user()
    await _require_owner(tenant_id, user_id)

    result = await repo_query(
        "SELECT * FROM user WHERE tenant = $tenant;",
        {"tenant": tenant_id},
    )
    return [User(**row) for row in result]


async def remove_member(user_id: str) -> None:
    """Owner-only: remove a user from the tenant."""
    tenant_id = get_current_tenant()
    actor_id = get_current_user()
    await _require_owner(tenant_id, actor_id)

    if user_id == actor_id:
        raise InvalidInputError("Owners cannot remove themselves")

    user = await User.get(user_id)
    if str(user.tenant) != tenant_id:
        raise NotFoundError("Member not found")

    tenant = await Tenant.get(tenant_id)
    if user_id == str(tenant.owner):
        raise InvalidInputError("Owners cannot remove themselves")

    await user.delete()


async def redeem_invite(token: str, email: str, uid: str) -> User:
    """Redeem a pending invite for a verified Firebase email and UID.

    The invite is looked up by token, validated as pending, and the invite's
    email must match the verified email from Firebase. On success the user is
    provisioned into the invite's tenant and the invite is marked consumed.
    """
    if not email:
        raise InvalidInputError("A verified email is required to redeem an invite")

    invite = await Invite.get_by_token(token)
    if not invite.is_pending:
        raise InvalidInputError("Invite is no longer valid")

    if _normalise_email(email) != invite.email:
        raise InvalidInputError("Invite email does not match the signed-in account")

    assert invite.tenant is not None, "Invite is missing a tenant"
    user = await User.provision(uid, invite.tenant, email=email)
    assert user.id is not None, "User provisioning did not return an id"
    await invite.consume(user.id)
    return user
