"""Invite management router for tenant owners and public preview."""

from fastapi import APIRouter

from api import invite_service
from api.models import CreateInviteRequest, CreateInviteResponse, InviteResponse

router = APIRouter(prefix="/invites", tags=["invites"])


def _format_invite(invite) -> dict:
    return {
        "id": invite.id,
        "email": invite.email,
        "token": invite.token,
        "expires_at": (
            invite.expires_at.isoformat() if invite.expires_at else ""
        ),
        "revoked": invite.revoked,
        "consumed": invite.consumed,
    }


@router.post("", response_model=CreateInviteResponse)
async def create_invite(body: CreateInviteRequest):
    invite = await invite_service.create_invite(body.email)
    return _format_invite(invite)


@router.get("", response_model=list[InviteResponse])
async def list_invites():
    invites = await invite_service.list_pending_invites()
    return [_format_invite(i) for i in invites]


@router.delete("/{token}", response_model=InviteResponse)
async def revoke_invite(token: str):
    invite = await invite_service.revoke_invite(token)
    return _format_invite(invite)


@router.get("/preview/{token}", response_model=InviteResponse)
async def preview_invite(token: str):
    invite = await invite_service.preview_invite(token)
    return _format_invite(invite)
