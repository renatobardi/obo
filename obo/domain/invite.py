"""
Invite domain model for link-based tenant membership (#29).

An invite is email-bound and scoped to a tenant. It carries a shareable token,
expires in 7 days, can be revoked by the owner before use, and is marked
consumed when a matching verified email completes signup.
"""

import secrets
from datetime import datetime, timedelta, timezone
from typing import Any, ClassVar, Dict, Optional

from obo.database.repository import ensure_record_id, repo_query
from obo.domain.base import ObjectModel
from obo.exceptions import NotFoundError


class Invite(ObjectModel):
    table_name: ClassVar[str] = "invite"
    scope: ClassVar = "tenant"
    nullable_fields: ClassVar[set[str]] = {
        "consumed_at",
        "consumed_by",
        "expires_at",
    }

    email: str = ""
    token: str = ""
    tenant: Optional[str] = None
    expires_at: Optional[datetime] = None
    revoked: bool = False
    consumed: bool = False
    consumed_at: Optional[datetime] = None
    consumed_by: Optional[str] = None

    def _prepare_save_data(self) -> Dict[str, Any]:
        data = super()._prepare_save_data()
        if data.get("tenant"):
            data["tenant"] = ensure_record_id(data["tenant"])
        if data.get("consumed_by"):
            data["consumed_by"] = ensure_record_id(data["consumed_by"])
        return data

    @property
    def is_pending(self) -> bool:
        if self.revoked or self.consumed:
            return False
        if self.expires_at is None:
            return True
        now = datetime.now(timezone.utc)
        expires = self.expires_at
        if expires.tzinfo is None:
            expires = expires.replace(tzinfo=timezone.utc)
        return expires > now

    @classmethod
    async def create_for_email(cls, email: str, tenant_id: str) -> "Invite":
        token = secrets.token_urlsafe(32)
        expires_at = datetime.now(timezone.utc) + timedelta(days=7)
        invite = cls(
            email=email.strip().lower(),
            token=token,
            tenant=tenant_id,
            expires_at=expires_at,
        )
        await invite.save()
        return invite

    @classmethod
    async def get_by_token(cls, token: str) -> "Invite":
        result = await repo_query(
            "SELECT * FROM invite WHERE token = $token;",
            {"token": token},
        )
        if not result:
            raise NotFoundError("Invite not found")
        return cls(**result[0])

    async def consume(self, user_id: str) -> None:
        self.consumed = True
        self.consumed_at = datetime.now(timezone.utc)
        self.consumed_by = user_id
        await self.save()
