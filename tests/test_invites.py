"""
Tests for invites and tenant-member management (#29).

Uses an in-memory fake SurrealDB so the domain and service layers can be
exercised without a live database. The fake supports the exact query shapes
that Invite, User, and Tenant generate.
"""

from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional
from unittest.mock import AsyncMock, patch

import pytest
from surrealdb import RecordID

from api import invite_service
from obo.domain.invite import Invite
from obo.domain.tenancy import current_tenant, current_user
from obo.domain.tenant import Tenant, User
from obo.exceptions import AuthenticationError, InvalidInputError, NotFoundError


class _FakeStore:
    """Minimal in-memory stand-in for the repository functions."""

    def __init__(self):
        self.rows: Dict[str, Dict[str, Any]] = {}
        self._n = 0

    @staticmethod
    def _stringify(row: Dict[str, Any]) -> Dict[str, Any]:
        return {
            key: str(value) if isinstance(value, RecordID) else value
            for key, value in row.items()
        }

    async def create(self, table: str, data: Dict[str, Any]):
        self._n += 1
        record_id = f"{table}:r{self._n}"
        row = self._stringify(data)
        row["id"] = record_id
        if "created" not in row:
            row["created"] = datetime.now(timezone.utc)
        if "updated" not in row:
            row["updated"] = datetime.now(timezone.utc)
        self.rows[record_id] = row
        return [dict(row)]

    async def update(self, table: str, record_id: Any, data: Dict[str, Any]):
        record_id = str(record_id)
        existing = self.rows.get(record_id)
        row = existing if existing is not None else {"id": record_id}
        if existing is not None and "created" in existing:
            data["created"] = existing["created"]
        else:
            data["created"] = datetime.now(timezone.utc)
        data["updated"] = datetime.now(timezone.utc)
        row.update(self._stringify(data))
        self.rows[record_id] = row
        return [dict(row)]

    async def delete(self, record_id: Any):
        self.rows.pop(str(record_id), None)
        return True

    async def query(self, query_str: str, bind_vars: Optional[Dict[str, Any]] = None):
        bind_vars = bind_vars or {}

        if query_str.startswith("UPSERT $target"):
            record_id = str(bind_vars["target"])
            data = self._stringify(bind_vars.get("data", {}))
            row = self.rows.setdefault(record_id, {"id": record_id})
            row.update(data)
            if "created" not in row:
                row["created"] = datetime.now(timezone.utc)
            row["updated"] = datetime.now(timezone.utc)
            return [dict(row)]

        if query_str.startswith("SELECT * FROM $id"):
            maybe_row: Optional[Dict[str, Any]] = self.rows.get(str(bind_vars.get("id")))
            candidates: List[Dict[str, Any]]
            if maybe_row is not None:
                row = maybe_row
                candidates = [row]
            else:
                candidates = []
            remainder = query_str[len("SELECT * FROM $id"):]
        else:
            rest = query_str[len("SELECT * FROM "):]
            table, _, remainder = rest.partition(" WHERE ")
            table = table.strip()
            remainder = " WHERE " + remainder if remainder else ""
            candidates = [
                row for rid, row in self.rows.items() if rid.startswith(f"{table}:")
            ]

        if " WHERE " in remainder:
            where = remainder.split(" WHERE ", 1)[1].rstrip("; ")
            for cond in where.split(" AND "):
                field, _, placeholder = cond.strip().partition(" = ")
                placeholder = placeholder.strip().lstrip("$").rstrip("; ")
                expected = str(bind_vars.get(placeholder))
                candidates = [
                    row for row in candidates if str(row.get(field)) == expected
                ]

        return [self._stringify(row) for row in candidates]


@pytest.fixture
def fake_store():
    store = _FakeStore()
    with (
        patch("obo.domain.base.repo_create", AsyncMock(side_effect=store.create)),
        patch("obo.domain.base.repo_query", AsyncMock(side_effect=store.query)),
        patch("obo.domain.base.repo_update", AsyncMock(side_effect=store.update)),
        patch("obo.domain.base.repo_delete", AsyncMock(side_effect=store.delete)),
        patch(
            "obo.domain.tenant.repo_query", AsyncMock(side_effect=store.query)
        ),
        patch(
            "obo.domain.invite.repo_query", AsyncMock(side_effect=store.query)
        ),
        patch(
            "api.invite_service.repo_query", AsyncMock(side_effect=store.query)
        ),
    ):
        yield store


class _tenant_context:
    def __init__(self, tenant: str, user: Optional[str] = None):
        self.tenant = tenant
        self.user = user

    def __enter__(self):
        self._tenant_token = current_tenant.set(self.tenant)
        if self.user is not None:
            self._user_token = current_user.set(self.user)
        return self

    def __exit__(self, *exc):
        current_tenant.reset(self._tenant_token)
        if self.user is not None:
            current_user.reset(self._user_token)


async def _seed_owner_tenant(fake_store):
    tenant = Tenant(id="tenant:acme", owner="user:owner")
    await tenant.save()
    owner = User(id="user:owner", tenant="tenant:acme", email="owner@example.com")
    await owner.save()
    return tenant, owner


@pytest.mark.asyncio
class TestInviteDomain:
    async def test_create_invite_for_email_sets_token_and_expiry(self, fake_store):
        with _tenant_context("tenant:acme", "user:owner"):
            invite = await Invite.create_for_email(" invitee@Example.COM ", "tenant:acme")

        assert invite.id is not None
        assert invite.email == "invitee@example.com"
        assert invite.token
        assert invite.tenant == "tenant:acme"
        assert invite.expires_at is not None
        assert invite.expires_at > datetime.now(timezone.utc)
        assert invite.expires_at < datetime.now(timezone.utc) + timedelta(days=8)

    async def test_get_by_token_returns_invite(self, fake_store):
        with _tenant_context("tenant:acme", "user:owner"):
            created = await Invite.create_for_email("invitee@example.com", "tenant:acme")

        fetched = await Invite.get_by_token(created.token)
        assert fetched.id == created.id

    async def test_fresh_invite_is_pending(self, fake_store):
        with _tenant_context("tenant:acme", "user:owner"):
            invite = await Invite.create_for_email("invitee@example.com", "tenant:acme")
        assert invite.is_pending is True

    async def test_expired_invite_is_not_pending(self, fake_store):
        with _tenant_context("tenant:acme", "user:owner"):
            invite = Invite(
                email="invitee@example.com",
                token="token-expired",
                tenant="tenant:acme",
                expires_at=datetime.now(timezone.utc) - timedelta(days=1),
            )
            await invite.save()
        assert invite.is_pending is False

    async def test_revoked_invite_is_not_pending(self, fake_store):
        with _tenant_context("tenant:acme", "user:owner"):
            invite = await Invite.create_for_email("invitee@example.com", "tenant:acme")
            invite.revoked = True
            await invite.save()
        assert invite.is_pending is False

    async def test_consumed_invite_is_not_pending(self, fake_store):
        with _tenant_context("tenant:acme", "user:owner"):
            invite = await Invite.create_for_email("invitee@example.com", "tenant:acme")
            await invite.consume("user:new")
        assert invite.is_pending is False
        assert invite.consumed is True
        assert invite.consumed_by == "user:new"


@pytest.mark.asyncio
class TestInviteService:
    async def test_create_invite_is_owner_only(self, fake_store):
        await _seed_owner_tenant(fake_store)
        with _tenant_context("tenant:acme", "user:owner"):
            invite = await invite_service.create_invite("invitee@example.com")
        assert invite.email == "invitee@example.com"

    async def test_create_invite_rejects_non_owner(self, fake_store):
        await _seed_owner_tenant(fake_store)
        with _tenant_context("tenant:acme", "user:intruder"):
            with pytest.raises(AuthenticationError):
                await invite_service.create_invite("invitee@example.com")

    async def test_create_invite_rejects_invalid_email(self, fake_store):
        await _seed_owner_tenant(fake_store)
        with _tenant_context("tenant:acme", "user:owner"):
            with pytest.raises(InvalidInputError):
                await invite_service.create_invite("not-an-email")

    async def test_list_pending_invites(self, fake_store):
        await _seed_owner_tenant(fake_store)
        with _tenant_context("tenant:acme", "user:owner"):
            await invite_service.create_invite("a@example.com")
            await invite_service.create_invite("b@example.com")
            pending = await invite_service.list_pending_invites()
        assert len(pending) == 2

    async def test_revoke_invite_marks_revoked(self, fake_store):
        await _seed_owner_tenant(fake_store)
        with _tenant_context("tenant:acme", "user:owner"):
            invite = await invite_service.create_invite("a@example.com")
            revoked = await invite_service.revoke_invite(invite.token)
        assert revoked.revoked is True

    async def test_revoked_invite_not_in_pending_list(self, fake_store):
        await _seed_owner_tenant(fake_store)
        with _tenant_context("tenant:acme", "user:owner"):
            invite = await invite_service.create_invite("a@example.com")
            await invite_service.revoke_invite(invite.token)
            pending = await invite_service.list_pending_invites()
        assert len(pending) == 0

    async def test_redeem_invite_joins_tenant_and_consumes(self, fake_store):
        await _seed_owner_tenant(fake_store)
        with _tenant_context("tenant:acme", "user:owner"):
            invite = await invite_service.create_invite("invitee@example.com")

        user = await invite_service.redeem_invite(
            invite.token, "Invitee@Example.COM", "newuid"
        )

        assert user.id == "user:newuid"
        assert user.tenant == "tenant:acme"
        assert user.email == "invitee@example.com"

        fetched = await Invite.get_by_token(invite.token)
        assert fetched.consumed is True

    async def test_redeem_invite_with_non_matching_email_fails(self, fake_store):
        await _seed_owner_tenant(fake_store)
        with _tenant_context("tenant:acme", "user:owner"):
            invite = await invite_service.create_invite("invitee@example.com")

        with pytest.raises(InvalidInputError):
            await invite_service.redeem_invite(
                invite.token, "other@example.com", "newuid"
            )

    async def test_redeem_expired_invite_fails(self, fake_store):
        await _seed_owner_tenant(fake_store)
        with _tenant_context("tenant:acme", "user:owner"):
            invite = Invite(
                email="invitee@example.com",
                token="expired-token",
                tenant="tenant:acme",
                expires_at=datetime.now(timezone.utc) - timedelta(days=1),
            )
            await invite.save()

        with pytest.raises(InvalidInputError):
            await invite_service.redeem_invite(
                invite.token, "invitee@example.com", "newuid"
            )

    async def test_redeem_consumed_invite_fails(self, fake_store):
        await _seed_owner_tenant(fake_store)
        with _tenant_context("tenant:acme", "user:owner"):
            invite = await invite_service.create_invite("invitee@example.com")
            await invite_service.redeem_invite(
                invite.token, "invitee@example.com", "newuid"
            )

        with pytest.raises(InvalidInputError):
            await invite_service.redeem_invite(
                invite.token, "invitee@example.com", "anotheruid"
            )

    async def test_list_members(self, fake_store):
        await _seed_owner_tenant(fake_store)
        member = User(id="user:member", tenant="tenant:acme", email="member@example.com")
        await member.save()

        with _tenant_context("tenant:acme", "user:owner"):
            members = await invite_service.list_members()

        assert any(str(m.id) == "user:member" for m in members)

    async def test_remove_member(self, fake_store):
        await _seed_owner_tenant(fake_store)
        member = User(id="user:member", tenant="tenant:acme", email="member@example.com")
        await member.save()

        with _tenant_context("tenant:acme", "user:owner"):
            await invite_service.remove_member("user:member")

        with pytest.raises(NotFoundError):
            await User.get("user:member")

    async def test_remove_self_fails(self, fake_store):
        await _seed_owner_tenant(fake_store)
        with _tenant_context("tenant:acme", "user:owner"):
            with pytest.raises(InvalidInputError):
                await invite_service.remove_member("user:owner")


@pytest.mark.asyncio
class TestInvitePublicPreview:
    async def test_preview_returns_email_for_pending_invite(self, fake_store):
        await _seed_owner_tenant(fake_store)
        with _tenant_context("tenant:acme", "user:owner"):
            invite = await invite_service.create_invite("invitee@example.com")

        preview = await invite_service.preview_invite(invite.token)
        assert preview.email == "invitee@example.com"

    async def test_preview_expired_invite_fails(self, fake_store):
        await _seed_owner_tenant(fake_store)
        with _tenant_context("tenant:acme", "user:owner"):
            invite = Invite(
                email="invitee@example.com",
                token="expired-token",
                tenant="tenant:acme",
                expires_at=datetime.now(timezone.utc) - timedelta(days=1),
            )
            await invite.save()

        with pytest.raises(InvalidInputError):
            await invite_service.preview_invite(invite.token)
