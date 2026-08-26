"""
Tests for POST /api/auth/complete-signup and the auth-mode field on
GET /api/auth/status (#27).

Built against a standalone FastAPI app carrying the real api.routers.auth
router plus a trivial test-only middleware that sets request.state.firebase_uid
(what api.auth.FirebaseAuthMiddleware would already have done - that
middleware's own behavior is covered by tests/test_firebase_auth_middleware.py,
so this file only exercises the endpoint logic).
"""

from unittest.mock import AsyncMock, patch

import pytest
from fastapi import FastAPI, Request
from fastapi.testclient import TestClient
from starlette.middleware.base import BaseHTTPMiddleware

from obo.exceptions import AuthenticationError, InvalidInputError, NotFoundError


class _FakeFirebaseUidMiddleware(BaseHTTPMiddleware):
    """Stand-in for FirebaseAuthMiddleware: copies test headers onto
    request.state.firebase_uid and firebase_email, so complete-signup sees
    what it would see downstream of the real middleware."""

    async def dispatch(self, request: Request, call_next):
        uid = request.headers.get("X-Test-Firebase-Uid")
        if uid:
            request.state.firebase_uid = uid
        email = request.headers.get("X-Test-Firebase-Email")
        if email:
            request.state.firebase_email = email
        return await call_next(request)


@pytest.fixture
def client():
    from api.routers import auth as auth_router

    app = FastAPI()
    app.add_middleware(_FakeFirebaseUidMiddleware)
    app.include_router(auth_router.router, prefix="/api")

    # Mirrors api/main.py's AuthenticationError -> 401 mapping; this
    # standalone app doesn't register the real app's global exception handlers.
    @app.exception_handler(AuthenticationError)
    async def _authentication_error_handler(request: Request, exc: AuthenticationError):
        from fastapi.responses import JSONResponse

        return JSONResponse(status_code=401, content={"detail": str(exc)})

    @app.exception_handler(InvalidInputError)
    async def _invalid_input_error_handler(request: Request, exc: InvalidInputError):
        from fastapi.responses import JSONResponse

        return JSONResponse(status_code=400, content={"detail": str(exc)})

    return TestClient(app)


class TestCompleteSignupRequiresFirebaseContext:
    def test_no_firebase_uid_in_state_returns_401(self, client):
        response = client.post("/api/auth/complete-signup")
        assert response.status_code == 401


class TestCompleteSignupNewIdentity:
    def test_creates_tenant_and_user_when_no_matching_row_exists(self, client):
        with (
            patch(
                "api.routers.auth.User.get",
                new=AsyncMock(side_effect=NotFoundError("no")),
            ),
            patch("api.routers.auth.Tenant") as MockTenant,
            patch(
                "api.routers.auth.User.provision",
                new=AsyncMock(
                    return_value=_fake_user("user:new-uid", "tenant:new-tenant")
                ),
            ) as mock_provision,
        ):
            tenant_instance = MockTenant.return_value
            tenant_instance.id = "tenant:new-tenant"
            tenant_instance.save = AsyncMock()

            response = client.post(
                "/api/auth/complete-signup",
                headers={"X-Test-Firebase-Uid": "new-uid"},
            )

        assert response.status_code == 200
        body = response.json()
        assert body["created"] is True
        assert body["tenant_id"] == "tenant:new-tenant"
        assert body["user_id"] == "user:new-uid"

        mock_provision.assert_awaited_once_with(
            "new-uid", "tenant:new-tenant", email=None
        )
        # Tenant saved twice: once to obtain an id, once to set owner.
        assert tenant_instance.save.await_count == 2
        assert tenant_instance.owner == "user:new-uid"


class TestCompleteSignupExistingIdentity:
    def test_returns_existing_tenant_without_creating_a_new_one(self, client):
        with (
            patch(
                "api.routers.auth.User.get",
                new=AsyncMock(
                    return_value=_fake_user("user:existing-uid", "tenant:existing")
                ),
            ),
            patch("api.routers.auth.Tenant") as MockTenant,
            patch("api.routers.auth.User.provision", new=AsyncMock()) as mock_provision,
        ):
            response = client.post(
                "/api/auth/complete-signup",
                headers={"X-Test-Firebase-Uid": "existing-uid"},
            )

        assert response.status_code == 200
        body = response.json()
        assert body["created"] is False
        assert body["tenant_id"] == "tenant:existing"
        assert body["user_id"] == "user:existing-uid"

        MockTenant.assert_not_called()
        mock_provision.assert_not_awaited()


class TestAuthStatusReportsMode:
    def test_reports_password_mode_by_default(self, client, monkeypatch):
        monkeypatch.delenv("OBO_AUTH_MODE", raising=False)
        response = client.get("/api/auth/status")
        assert response.status_code == 200
        assert response.json()["mode"] == "password"

    def test_reports_firebase_mode_when_configured(self, client, monkeypatch):
        monkeypatch.setenv("OBO_AUTH_MODE", "firebase")
        response = client.get("/api/auth/status")
        assert response.status_code == 200
        body = response.json()
        assert body["mode"] == "firebase"
        assert body["auth_enabled"] is True


def _fake_user(id_: str, tenant_id: str, email: str = ""):
    from obo.domain.tenant import User

    return User(id=id_, tenant=tenant_id, email=email)


class TestCompleteSignupInviteRedemption:
    def test_redeeming_invite_joins_existing_tenant(self, client):
        with (
            patch(
                "api.routers.auth.User.get",
                new=AsyncMock(side_effect=NotFoundError("no")),
            ),
            patch(
                "api.routers.auth.invite_service.redeem_invite",
                new=AsyncMock(
                    return_value=_fake_user("user:new-uid", "tenant:invited")
                ),
            ) as mock_redeem,
        ):
            response = client.post(
                "/api/auth/complete-signup",
                json={"invite_token": "some-token"},
                headers={
                    "X-Test-Firebase-Uid": "new-uid",
                    "X-Test-Firebase-Email": "new@example.com",
                },
            )

        assert response.status_code == 200
        body = response.json()
        assert body["created"] is True
        assert body["user_id"] == "user:new-uid"
        assert body["tenant_id"] == "tenant:invited"
        mock_redeem.assert_awaited_once_with("some-token", "new@example.com", "new-uid")

    def test_redeeming_invite_with_mismatched_email_returns_400(self, client):
        with (
            patch(
                "api.routers.auth.User.get",
                new=AsyncMock(side_effect=NotFoundError("no")),
            ),
            patch(
                "api.routers.auth.invite_service.redeem_invite",
                new=AsyncMock(side_effect=InvalidInputError("Email does not match")),
            ),
        ):
            response = client.post(
                "/api/auth/complete-signup",
                json={"invite_token": "some-token"},
                headers={
                    "X-Test-Firebase-Uid": "new-uid",
                    "X-Test-Firebase-Email": "wrong@example.com",
                },
            )

        assert response.status_code == 400

    def test_no_invite_token_still_creates_new_tenant(self, client):
        with (
            patch(
                "api.routers.auth.User.get",
                new=AsyncMock(side_effect=NotFoundError("no")),
            ),
            patch("api.routers.auth.Tenant") as MockTenant,
            patch(
                "api.routers.auth.User.provision",
                new=AsyncMock(
                    return_value=_fake_user("user:new-uid", "tenant:new-tenant")
                ),
            ),
            patch("api.routers.auth.invite_service.redeem_invite", new=AsyncMock()) as mock_redeem,
        ):
            tenant_instance = MockTenant.return_value
            tenant_instance.id = "tenant:new-tenant"
            tenant_instance.save = AsyncMock()

            response = client.post(
                "/api/auth/complete-signup",
                headers={"X-Test-Firebase-Uid": "new-uid"},
            )

        assert response.status_code == 200
        assert response.json()["created"] is True
        mock_redeem.assert_not_awaited()
