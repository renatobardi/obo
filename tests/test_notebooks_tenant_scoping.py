"""
Regression tests for #27: GET /notebooks and GET /notebooks/{id} built their
own raw SurrealQL (to add source_count/note_count) instead of delegating to
Notebook.get_all()/get(), so they never picked up the tenant/owner scoping
from #26's ObjectModel base - any signed-in user could list or fetch another
tenant's notebooks by id. Confirmed as a real cross-tenant leak against a
live SurrealDB before this fix; these tests pin the fix at the unit level
(mocked repo_query) so it can't silently regress.
"""

from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from obo.domain.tenancy import current_tenant, current_user


@pytest.fixture
def client():
    from api.main import app

    return TestClient(app)


class TestNotebookListIsTenantScoped:
    @pytest.mark.asyncio
    async def test_list_query_includes_tenant_and_owner_conditions(self, client):
        captured = {}

        async def fake_repo_query(query, bind_vars=None):
            captured["query"] = query
            captured["bind_vars"] = bind_vars
            return []

        tenant_token = current_tenant.set("tenant:acme")
        user_token = current_user.set("user:alice")
        try:
            with patch(
                "api.routers.notebooks.repo_query", new=AsyncMock(side_effect=fake_repo_query)
            ):
                response = client.get("/api/notebooks")
        finally:
            current_tenant.reset(tenant_token)
            current_user.reset(user_token)

        assert response.status_code == 200
        assert "tenant = $__tenant" in captured["query"]
        assert "owner = $__owner" in captured["query"]
        assert str(captured["bind_vars"]["__tenant"]) == "tenant:acme"
        assert str(captured["bind_vars"]["__owner"]) == "user:alice"


class TestNotebookDetailIsTenantScoped:
    @pytest.mark.asyncio
    async def test_detail_query_includes_tenant_and_owner_conditions(self, client):
        captured = {}

        async def fake_repo_query(query, bind_vars=None):
            captured["query"] = query
            captured["bind_vars"] = bind_vars
            return []

        tenant_token = current_tenant.set("tenant:acme")
        user_token = current_user.set("user:alice")
        try:
            with patch(
                "api.routers.notebooks.repo_query", new=AsyncMock(side_effect=fake_repo_query)
            ):
                response = client.get("/api/notebooks/notebook:someid")
        finally:
            current_tenant.reset(tenant_token)
            current_user.reset(user_token)

        assert response.status_code == 404  # empty result -> not found
        assert "tenant = $__tenant" in captured["query"]
        assert "owner = $__owner" in captured["query"]
        assert str(captured["bind_vars"]["__tenant"]) == "tenant:acme"
        assert str(captured["bind_vars"]["__owner"]) == "user:alice"
