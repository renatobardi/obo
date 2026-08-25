"""
Tests for the tenant/owner scoping foundation (#26, PDR-003).

ObjectModel.save()/get_all()/get() (obo/domain/base.py) stamp and filter by
tenant/owner using contextvars (obo/domain/tenancy.py), defaulting to the
tenant:default/user:default sentinel when no request context is set. These
tests exercise the mechanism directly against local scoped models (not the
real domain models) plus an in-memory fake repository, so they run without a
live SurrealDB - the mechanism itself is what's under test, not any one
table's query text.
"""

from typing import Any, ClassVar, Dict, Literal, Optional
from unittest.mock import AsyncMock, patch

import pytest
from surrealdb import RecordID

from obo.domain.base import ObjectModel, RecordModel
from obo.domain.tenancy import (
    DEFAULT_TENANT_ID,
    DEFAULT_USER_ID,
    current_tenant,
    current_user,
)
from obo.exceptions import NotFoundError


class _TenantOnlyThing(ObjectModel):
    table_name: ClassVar[str] = "tenant_only_thing"
    scope: ClassVar[Literal["tenant"]] = "tenant"
    label: str = ""


class _OwnerThing(ObjectModel):
    table_name: ClassVar[str] = "owner_thing"
    scope: ClassVar[Literal["owner"]] = "owner"
    label: str = ""


class _UnscopedThing(ObjectModel):
    table_name: ClassVar[str] = "unscoped_thing"
    label: str = ""


class _FakeStore:
    """Minimal in-memory stand-in for repo_create/repo_query.

    Only understands the exact query shapes ObjectModel.save()/get_all()/
    get() generate: "SELECT * FROM <table> [WHERE f = $v AND ...]" and
    "SELECT * FROM $id [WHERE f = $v AND ...]".
    """

    def __init__(self):
        self.rows: Dict[str, Dict[str, Any]] = {}
        self._n = 0

    @staticmethod
    def _stringify(row: Dict[str, Any]) -> Dict[str, Any]:
        # Mirrors repository.parse_record_ids(), which the real
        # repo_create/repo_query always run results through.
        return {
            key: str(value) if isinstance(value, RecordID) else value
            for key, value in row.items()
        }

    async def create(self, table: str, data: Dict[str, Any]):
        self._n += 1
        # A non-numeric-looking id: RecordID stringifies a purely numeric id
        # part as "table:⟨1⟩" (angle-bracket quoted), which would silently
        # break this fake's plain string dict-key lookups.
        record_id = f"{table}:r{self._n}"
        row = self._stringify(data)
        row["id"] = record_id
        self.rows[record_id] = row
        return [dict(row)]

    async def update(self, table: str, record_id: Any, data: Dict[str, Any]):
        record_id = str(record_id)
        row = self.rows.setdefault(record_id, {"id": record_id})
        row.update(self._stringify(data))
        return [dict(row)]

    async def query(self, query_str: str, bind_vars: Optional[Dict[str, Any]] = None):
        bind_vars = bind_vars or {}
        if query_str.startswith("SELECT * FROM $id"):
            row = self.rows.get(str(bind_vars.get("id")))
            candidates = [row] if row is not None else []
            remainder = query_str[len("SELECT * FROM $id") :]
        else:
            rest = query_str[len("SELECT * FROM ") :]
            table, _, remainder = rest.partition(" WHERE ")
            table = table.strip()
            remainder = " WHERE " + remainder if remainder else ""
            candidates = [
                row for rid, row in self.rows.items() if rid.startswith(f"{table}:")
            ]

        if " WHERE " in remainder:
            where = remainder.split(" WHERE ", 1)[1]
            for cond in where.split(" AND "):
                field, _, placeholder = cond.strip().partition(" = ")
                placeholder = placeholder.strip().lstrip("$")
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
    ):
        yield store


class _tenant_context:
    """Context manager that sets current_tenant/current_user for the block."""

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


class TestScopeConditions:
    """Test suite for ObjectModel._scope_conditions()."""

    def test_none_scope_has_no_conditions(self):
        conditions, bind_vars = _UnscopedThing._scope_conditions()
        assert conditions == []
        assert bind_vars == {}

    def test_tenant_scope_filters_by_tenant_only(self):
        with _tenant_context("tenant:a"):
            conditions, bind_vars = _TenantOnlyThing._scope_conditions()
        assert conditions == ["tenant = $__tenant"]
        assert str(bind_vars["__tenant"]) == "tenant:a"

    def test_owner_scope_filters_by_tenant_and_owner(self):
        with _tenant_context("tenant:a", "user:a1"):
            conditions, bind_vars = _OwnerThing._scope_conditions()
        assert conditions == ["tenant = $__tenant", "owner = $__owner"]
        assert str(bind_vars["__tenant"]) == "tenant:a"
        assert str(bind_vars["__owner"]) == "user:a1"

    def test_defaults_to_sentinel_with_no_context_set(self):
        conditions, bind_vars = _OwnerThing._scope_conditions()
        assert str(bind_vars["__tenant"]) == DEFAULT_TENANT_ID
        assert str(bind_vars["__owner"]) == DEFAULT_USER_ID


class TestSaveStamping:
    """Test suite for ObjectModel.save() stamping owner/tenant on create."""

    @pytest.mark.asyncio
    async def test_create_stamps_tenant_and_owner_from_context(self, fake_store):
        with _tenant_context("tenant:a", "user:a1"):
            thing = _OwnerThing(label="mine")
            await thing.save()
        assert thing.tenant == "tenant:a"
        assert thing.owner == "user:a1"

    @pytest.mark.asyncio
    async def test_create_defaults_to_sentinel_with_no_context(self, fake_store):
        thing = _OwnerThing(label="password-mode")
        await thing.save()
        assert thing.tenant == DEFAULT_TENANT_ID
        assert thing.owner == DEFAULT_USER_ID

    @pytest.mark.asyncio
    async def test_tenant_only_scope_never_stamps_owner(self, fake_store):
        with _tenant_context("tenant:a", "user:a1"):
            thing = _TenantOnlyThing(label="shared")
            await thing.save()
        assert thing.tenant == "tenant:a"
        assert thing.owner is None

    @pytest.mark.asyncio
    async def test_update_does_not_reassign_ownership(self, fake_store):
        with _tenant_context("tenant:a", "user:a1"):
            thing = _OwnerThing(label="mine")
            await thing.save()

        # A later save() in a different context (e.g. a background task
        # running under the default sentinel) must not steal ownership.
        thing.label = "edited"
        await thing.save()
        assert thing.tenant == "tenant:a"
        assert thing.owner == "user:a1"


class TestIsolation:
    """Test suite proving a write scoped to one tenant/owner is invisible
    to a read scoped to another."""

    @pytest.mark.asyncio
    async def test_write_in_tenant_a_invisible_to_tenant_b(self, fake_store):
        with _tenant_context("tenant:a", "user:a1"):
            thing = _OwnerThing(label="secret")
            await thing.save()
            assert thing.id is not None
            created_id = thing.id

        with _tenant_context("tenant:a", "user:a1"):
            visible = await _OwnerThing.get_all()
            assert [t.label for t in visible] == ["secret"]
            fetched = await _OwnerThing.get(created_id)
            assert fetched.label == "secret"

        with _tenant_context("tenant:b", "user:b1"):
            assert await _OwnerThing.get_all() == []
            with pytest.raises(NotFoundError):
                await _OwnerThing.get(created_id)

    @pytest.mark.asyncio
    async def test_owner_isolation_within_same_tenant(self, fake_store):
        with _tenant_context("tenant:a", "user:a1"):
            thing = _OwnerThing(label="a1-only")
            await thing.save()

        # Same tenant, different member: must not see another member's data.
        with _tenant_context("tenant:a", "user:a2"):
            assert await _OwnerThing.get_all() == []

    @pytest.mark.asyncio
    async def test_tenant_scoped_entity_is_shared_across_owners_in_tenant(
        self, fake_store
    ):
        with _tenant_context("tenant:a", "user:a1"):
            thing = _TenantOnlyThing(label="shared-credential")
            await thing.save()

        # A different member of the SAME tenant can see tenant-shared data.
        with _tenant_context("tenant:a", "user:a2"):
            visible = await _TenantOnlyThing.get_all()
            assert [t.label for t in visible] == ["shared-credential"]

    @pytest.mark.asyncio
    async def test_no_context_falls_back_to_default_sentinel(self, fake_store):
        # Simulates password-mode / a background command with no request
        # context: write and read both fall back to the same sentinel.
        thing = _OwnerThing(label="password-mode")
        await thing.save()

        visible = await _OwnerThing.get_all()
        assert [t.label for t in visible] == ["password-mode"]


class TestRecordModelPerTenantSingleton:
    """Extends TestRecordModelSingleton (tests/test_domain.py) for the
    per-(class, tenant) singleton key."""

    def test_different_tenants_get_different_instances(self):
        class _TenantRecord(RecordModel):
            record_id: ClassVar[str] = "obo:tenant_record_test"
            value: int = 0

        with _tenant_context("tenant:a"):
            _TenantRecord.clear_instance()
            instance_a = _TenantRecord(value=1)

        with _tenant_context("tenant:b"):
            _TenantRecord.clear_instance()
            instance_b = _TenantRecord(value=2)

        assert instance_a is not instance_b
        assert instance_a.value == 1
        assert instance_b.value == 2

        with _tenant_context("tenant:a"):
            _TenantRecord.clear_instance()
        with _tenant_context("tenant:b"):
            _TenantRecord.clear_instance()

    def test_same_tenant_reuses_the_same_instance(self):
        class _TenantRecord2(RecordModel):
            record_id: ClassVar[str] = "obo:tenant_record_test_2"
            value: int = 0

        with _tenant_context("tenant:a"):
            _TenantRecord2.clear_instance()
            instance1 = _TenantRecord2(value=1)
            instance2 = _TenantRecord2(value=2)
            assert instance1 is instance2
            assert instance2.value == 2
            _TenantRecord2.clear_instance()

    def test_default_tenant_keeps_unsuffixed_scoped_id(self):
        class _TenantRecord3(RecordModel):
            record_id: ClassVar[str] = "obo:tenant_record_test_3"
            value: int = 0

        assert _TenantRecord3._current_scoped_id() == "obo:tenant_record_test_3"
        with _tenant_context("tenant:acme"):
            assert (
                _TenantRecord3._current_scoped_id()
                == "obo:tenant_record_test_3_acme"
            )
