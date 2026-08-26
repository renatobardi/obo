"""Tenant member management router for the owner."""

from fastapi import APIRouter

from api import invite_service
from api.models import MemberResponse

router = APIRouter(prefix="/tenants", tags=["tenants"])


@router.get("/members", response_model=list[MemberResponse])
async def list_members():
    members = await invite_service.list_members()
    return [{"id": u.id, "email": u.email} for u in members]


@router.delete("/members/{user_id}")
async def remove_member(user_id: str):
    await invite_service.remove_member(user_id)
    return {"ok": True}
